import { describe, expect, it } from "vitest";
import { clientRows, dayPreviewText, payLine, stylistRow, type SalonInfo } from "./outbox";
import { configuredSender, toE164 } from "./provider";
import { DEFAULT_NOTIFICATIONS as s } from "./settings";

const salon: SalonInfo = { id: "b1", name: "Intensity Salon", timezone: "America/Chicago", siteUrl: "https://chairvana.app", paymentMethods: { methods: [{ key: "venmo_direct", enabled: true, handle: "@Intensity" }] } };
const appt = { id: "a1", start: new Date("2026-12-01T16:30:00Z"), services: ["All Over Color", "Style"], depositDue: 5000 };
const to = { clientId: "c1", firstName: "Jamie", phone: "(256) 555-0101", email: "jamie@example.com", smsOptIn: true };

describe("outbox rows", () => {
  it("renders one row per channel with times in salon time", () => {
    const rows = clientRows({ salon, settings: s, to, appt, template: "reminder", channels: ["sms", "email"], key: "k1", sendAfter: new Date("2026-11-29T16:30:00Z") });
    expect(rows.map((r) => [r.channel, r.to_address, r.status])).toEqual([["sms", "(256) 555-0101", "queued"], ["email", "jamie@example.com", "queued"]]);
    expect(rows[0].body).toBe("Hi Jamie! Reminder: All Over Color, Style at Intensity Salon on Tue, Dec 1 at 10:30 AM CST. Need to change it? https://chairvana.app/me");
  });

  it("skips texts without consent or a number, with the reason", () => {
    const rows = clientRows({ salon, settings: s, to: { ...to, smsOptIn: false, email: null }, appt, template: "reminder", channels: ["sms", "email"], key: "k", sendAfter: new Date() });
    expect(rows.map((r) => [r.status, r.error])).toEqual([["skipped", "Client hasn't agreed to texts"], ["skipped", "No email on file"]]);
  });

  it("includes where to pay a deposit", () => {
    expect(payLine(salon.paymentMethods, 5000, "Deposit")).toContain("venmo.com/");
    expect(payLine(null, 5000, "Deposit")).toBe("contact the salon");
    const [row] = clientRows({ salon, settings: s, to, appt, template: "depositRequest", channels: ["sms"], key: null, sendAfter: new Date() });
    expect(row.body).toMatch(/send your \$50 deposit: https:\/\/venmo\.com\//);
  });

  it("adds the opt-out footer to marketing texts only", () => {
    const review = clientRows({ salon, settings: s, to, appt: null, template: "rebookNudge", channels: ["sms"], key: null, sendAfter: new Date(), extra: { weeks: 6 } });
    expect(review[0].body.endsWith("Reply STOP to opt out.")).toBe(true);
  });

  it("sends stylist alerts by text, else email, else skips", () => {
    const base = { salon, template: "t", body: "b", apptId: null, key: null, sendAfter: new Date() };
    expect(stylistRow({ ...base, staff: { phone: "2565550100", email: "k@x.com" } }).channel).toBe("sms");
    expect(stylistRow({ ...base, staff: { phone: null, email: "k@x.com" } }).channel).toBe("email");
    expect(stylistRow({ ...base, staff: { phone: null, email: null } }).status).toBe("skipped");
  });

  it("writes the day preview", () => {
    const text = dayPreviewText(salon, "2026-12-01", [{ start: appt.start, clientName: "Jamie Rivers", services: appt.services, depositDue: 0, flagged: true }]);
    expect(text).toBe("Tuesday, Dec 1, 1 appointment:\n10:30 AM CST Jamie Rivers: All Over Color, Style (flagged)\nhttps://chairvana.app/today?date=2026-12-01");
  });
});

describe("sender", () => {
  it("formats US numbers", () => {
    expect(toE164("(256) 555-0101")).toBe("+12565550101");
    expect(toE164("1-256-555-0101")).toBe("+12565550101");
    expect(toE164("555-0101")).toBeNull();
  });

  it("is off until keys are set, then calls Twilio", async () => {
    const saved = { ...process.env };
    try {
      for (const k of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM", "TWILIO_MESSAGING_SERVICE_SID", "RESEND_API_KEY", "EMAIL_FROM"]) delete process.env[k];
      expect(configuredSender()).toEqual({ sms: null, email: null });

      Object.assign(process.env, { TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "tok", TWILIO_FROM: "+12565550000" });
      const calls: { url: string; body: string }[] = [];
      const fake = (async (url: string, init: RequestInit) => {
        calls.push({ url, body: String(init.body) });
        return new Response(JSON.stringify({ sid: "SM1" }), { status: 201 });
      }) as unknown as typeof fetch;
      const r = await configuredSender(fake).sms!("(256) 555-0101", "Hi");
      expect(r).toEqual({ ok: true, id: "SM1" });
      expect(calls[0].url).toBe("https://api.twilio.com/2010-04-01/Accounts/AC1/Messages.json");
      expect(calls[0].body).toBe("To=%2B12565550101&Body=Hi&From=%2B12565550000");

      const busy = (async () => new Response(JSON.stringify({ code: 20429, message: "Too many" }), { status: 429 })) as unknown as typeof fetch;
      expect(await configuredSender(busy).sms!("2565550101", "Hi")).toMatchObject({ ok: false, retry: true });
    } finally {
      process.env = saved;
    }
  });
});

describe("receipt", () => {
  it("lists services, tip, deposit and payment", async () => {
    const { receiptDetails } = await import("./outbox");
    const r = receiptDetails({ lines: [{ name: "All Over Color", cents: 9025 }, { name: "Style", cents: 3325 }], tip: 2500, depositApplied: 5000, paid: 9850, method: "Venmo", balance: 0 });
    expect(r.total).toBe("$148.50");
    expect(r.details).toBe("All Over Color $90.25\nStyle $33.25\nTip $25\nTotal $148.50\nDeposit applied $50\nPaid today $98.50 (Venmo)");
    const [row] = clientRows({ salon, settings: s, to, appt, template: "receipt", channels: ["email"], key: null, sendAfter: new Date(), extra: r });
    expect(row.body).toBe(`Thank you, Jamie! Your Intensity Salon receipt for Tue, Dec 1:\n${r.details}`);
  });
});
