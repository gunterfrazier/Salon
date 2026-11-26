/**
 * Gift cards and packages against a real Postgres with all migrations applied.
 * Runs only when TEST_DATABASE_URL is set.
 */
import pg from "pg";
import { describe, expect, it } from "vitest";
import policyJson from "../../../seed/policies.json";
import rulesJson from "../../../seed/pricing-rules.json";
import { buildBooking, type BookableService } from "../booking/build";
import { servicesByKey } from "../menu";
import type { PolicySettings } from "../policy/types";
import type { BundleRule } from "../pricing/discounts";
import { checkoutTotals, splitGift } from "./settle";

const url = process.env.TEST_DATABASE_URL;
const policy = policyJson as unknown as PolicySettings;
const rules = rulesJson.bundles as BundleRule[];
const client = { onTimeVisits: [], priorVisitCount: 3, flags: [], depositOverride: null, outstandingBalance: 0 };

describe.skipIf(!url)("gift cards and packages", () => {
  it("sells, redeems at checkout with a split payment, uses package visits, and refuses overspending", async () => {
    const db = new pg.Client({ connectionString: url });
    await db.connect();
    const q = async (sql: string, v: unknown[] = []) => (await db.query(sql, v)).rows;
    const fails = async (sql: string, v: unknown[], code: string) => {
      await db.query("savepoint s");
      await expect(q(sql, v)).rejects.toMatchObject({ code });
      await db.query("rollback to savepoint s");
    };
    try {
      await db.query("begin");
      const [b] = await q(`insert into businesses(name, policy_settings) values ('T','{}') returning id`);
      const [st] = await q(`insert into staff(business_id, display_name) values ($1,'S') returning id`, [b.id]);
      const [cat] = await q(`insert into service_categories(business_id, key, name) values ($1,'c','C') returning id`, [b.id]);
      const [cl] = await q(`insert into clients(business_id, first_name) values ($1,'Ana') returning id`, [b.id]);
      const s = servicesByKey.womens_cut;
      const [row] = await q(`insert into services(business_id, category_id, key, name, price_type, price_cents, active_min) values ($1,$2,'womens_cut',$3,'fixed',5000,45) returning id`, [b.id, cat.id, s.name]);
      const svc: BookableService = { ...s, id: row.id };
      const book = async (start: string) => {
        const r = buildBooking({ services: [svc], start: new Date(start), rules, policy, client, now: new Date("2026-11-26T00:00:00Z") });
        const [x] = await q(`select book_appointment($1::jsonb) id`, [JSON.stringify({ ...r.payload, business_id: b.id, client_id: cl.id, staff_id: st.id })]);
        return x.id as string;
      };

      // --- Sell a $60 gift card by cash.
      const [{ g }] = await q(`select sell_gift_card($1::jsonb) g`, [JSON.stringify({ business_id: b.id, amount_cents: 6000, recipient_name: "Mia", method: "cash" })]);
      expect(g.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
      expect(await q(`select kind, method, amount_cents from payments where business_id=$1`, [b.id])).toEqual([{ kind: "gift_card", method: "cash", amount_cents: 6000 }]);

      // --- Checkout $50 cut + $10 tip = $60, $40 from the gift card, $20 Venmo.
      const a1 = await book("2026-12-01T21:30:00Z");
      const [l1] = await q(`select id from appointment_services where appointment_id=$1`, [a1]);
      const t = checkoutTotals({ prices: [5000], tip: 1000, depositPaid: 0, paid: 6000 });
      const sp = splitGift(t, 4000);
      await q(`select checkout_appointment($1::jsonb)`, [JSON.stringify({
        appointment_id: a1, lines: [{ id: l1.id, price_cents: 5000 }], tip_cents: 1000,
        gift: { card_id: g.id, service_cents: sp.gift.service, retail_cents: sp.gift.retail, tip_cents: sp.gift.tip },
        payment: { method: "venmo_direct", amount_cents: sp.other.amount, tip_cents: sp.other.tipPaid, retail_cents: sp.other.retailPaid },
        balance_cents: 0, refund_cents: 0,
      })]);
      expect(await q(`select kind, method, amount_cents from payments where appointment_id=$1 order by method, kind`, [a1])).toEqual([
        { kind: "service", method: "venmo_direct", amount_cents: 1000 },
        { kind: "tip", method: "venmo_direct", amount_cents: 1000 },
        { kind: "service", method: "gift_card", amount_cents: 4000 },
      ]);
      expect((await q(`select balance_cents from gift_cards where id=$1`, [g.id]))[0].balance_cents).toBe(2000);

      // --- Overspending the card is refused and nothing changes.
      const a2 = await book("2026-12-02T21:30:00Z");
      const [l2] = await q(`select id from appointment_services where appointment_id=$1`, [a2]);
      await fails(`select checkout_appointment($1::jsonb)`, [JSON.stringify({ appointment_id: a2, lines: [{ id: l2.id, price_cents: 5000 }], gift: { card_id: g.id, service_cents: 5000 }, payment: null })], "22023");
      expect((await q(`select status from appointments where id=$1`, [a2]))[0].status).not.toBe("completed");

      // --- Quick sale: $25 product, $20 from the card, $5 cash.
      const [p] = await q(`insert into products(business_id, kind, brand, name, unit, on_hand, price_cents) values ($1,'retail','Kenra','Shampoo','each',3,2500) returning id`, [b.id]);
      await q(`select quick_sale($1::jsonb)`, [JSON.stringify({ business_id: b.id, items: [{ product_id: p.id, qty: 1, price_cents: 2500 }], payment: { method: "cash" }, gift: { card_id: g.id, amount_cents: 2000 } })]);
      expect((await q(`select balance_cents from gift_cards where id=$1`, [g.id]))[0].balance_cents).toBe(0);
      expect((await q(`select coalesce(sum(change_cents),0)::int n from gift_card_moves where card_id=$1`, [g.id]))[0].n).toBe(0);

      // --- Package: 2 cuts for $90. Use one at checkout (line priced 0).
      const [tpl] = await q(`insert into package_templates(business_id, name, service_id, visits, price_cents) values ($1,'2 cuts',$2,2,9000) returning id`, [b.id, row.id]);
      const [{ cp }] = await q(`select sell_package($1::jsonb) cp`, [JSON.stringify({ business_id: b.id, client_id: cl.id, template_id: tpl.id, method: "zelle" })]);
      await q(`select checkout_appointment($1::jsonb)`, [JSON.stringify({ appointment_id: a2, lines: [{ id: l2.id, price_cents: 5000 }], package_uses: [{ client_package_id: cp, appointment_service_id: l2.id }], payment: null, balance_cents: 0 })]);
      expect((await q(`select price_quoted_cents from appointment_services where id=$1`, [l2.id]))[0].price_quoted_cents).toBe(0);
      expect((await q(`select visits_used from client_packages where id=$1`, [cp]))[0].visits_used).toBe(1);

      // Second use OK, third refused (only 2 visits).
      const a3 = await book("2026-12-03T21:30:00Z");
      const [l3] = await q(`select id from appointment_services where appointment_id=$1`, [a3]);
      await q(`select checkout_appointment($1::jsonb)`, [JSON.stringify({ appointment_id: a3, lines: [{ id: l3.id, price_cents: 5000 }], package_uses: [{ client_package_id: cp, appointment_service_id: l3.id }] })]);
      const a4 = await book("2026-12-04T21:30:00Z");
      const [l4] = await q(`select id from appointment_services where appointment_id=$1`, [a4]);
      await fails(`select checkout_appointment($1::jsonb)`, [JSON.stringify({ appointment_id: a4, lines: [{ id: l4.id, price_cents: 5000 }], package_uses: [{ client_package_id: cp, appointment_service_id: l4.id }] })], "22023");
    } finally {
      await db.query("rollback");
      await db.end();
    }
  });
});
