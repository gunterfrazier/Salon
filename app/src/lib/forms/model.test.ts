import { describe, expect, it } from "vitest";
import { answerText, checkAnswers, cleanFields, flagsFrom, formNeeded, STARTER_FORMS, type FormField } from "./model";

const consent = STARTER_FORMS.find((f) => f.key === "color_consent")!;
const consult = STARTER_FORMS.find((f) => f.key === "color_consult")!;
const now = new Date("2026-11-26T12:00:00Z");

describe("starter forms", () => {
  it("are valid templates", () => {
    for (const f of STARTER_FORMS) expect(cleanFields(f.fields)).toEqual({ ok: true, fields: f.fields });
  });
});

describe("cleanFields", () => {
  it("fills in missing or duplicate ids and drops junk", () => {
    const r = cleanFields([{ type: "text", label: " Name " }, { id: "x", type: "yesno", label: "Q", required: true, detailsIfYes: " Why? " }, { id: "x", type: "heading", label: "H", required: true }]);
    expect(r).toEqual({ ok: true, fields: [{ id: "q1", type: "text", label: "Name" }, { id: "x", type: "yesno", label: "Q", required: true, detailsIfYes: "Why?" }, { id: "q3", type: "heading", label: "H" }] });
  });
  it("rejects bad templates", () => {
    expect(cleanFields([]).ok).toBe(false);
    expect(cleanFields([{ type: "heading", label: "Only a heading" }]).ok).toBe(false);
    expect(cleanFields([{ type: "choice", label: "Pick", options: ["One"] }]).ok).toBe(false);
    expect(cleanFields([{ type: "nope", label: "?" }]).ok).toBe(false);
    expect(cleanFields([{ type: "text", label: "  " }]).ok).toBe(false);
  });
});

describe("checkAnswers", () => {
  it("requires required answers and agreements", () => {
    const r = checkAnswers(consent.fields, { patch: "I decline a patch test", agree_risks: true, agree_truth: true });
    expect(r).toMatchObject({ ok: false, field: "agree_stop" });
    const ok = checkAnswers(consent.fields, { patch: "I decline a patch test", agree_risks: true, agree_truth: true, agree_stop: true, pregnant: { yes: false }, junk: 1 });
    expect(ok).toEqual({ ok: true, answers: { patch: "I decline a patch test", agree_risks: true, agree_truth: true, agree_stop: true, pregnant: { yes: false } } });
  });
  it("only accepts listed choices, and asks for details on yes", () => {
    expect(checkAnswers(consult.fields, { last_color: "Yesterday", lightened: { yes: false }, chemical: { yes: false }, reaction: { yes: false } })).toMatchObject({ ok: false, field: "last_color" });
    expect(checkAnswers(consult.fields, { last_color: "Never", lightened: { yes: false }, chemical: { yes: false }, reaction: { yes: true } })).toMatchObject({ ok: false, field: "reaction" });
    const r = checkAnswers(consult.fields, { last_color: "Never", color_kind: ["Henna", "Bogus"], lightened: { yes: false }, chemical: { yes: false }, reaction: { yes: true, details: "Itchy scalp" } });
    expect(r.ok && r.answers.color_kind).toEqual(["Henna"]);
    expect(r.ok && flagsFrom(consult.fields, r.answers)).toEqual(["Have you ever had a reaction to hair color? — Itchy scalp"]);
  });
});

describe("answerText", () => {
  const f = (type: FormField["type"]): FormField => ({ id: "a", type, label: "A" });
  it("formats each kind", () => {
    expect(answerText(f("yesno"), { yes: true, details: "Latex" })).toBe("Yes: Latex");
    expect(answerText(f("yesno"), { yes: false })).toBe("No");
    expect(answerText(f("agree"), true)).toBe("Agreed");
    expect(answerText(f("multi"), ["Text", "Email"])).toBe("Text, Email");
    expect(answerText(f("date"), "1990-04-09")).toBe("Apr 9, 1990");
    expect(answerText(f("text"), undefined)).toBe("—");
  });
});

describe("formNeeded", () => {
  const base = { ask: "chemical" as const, renewMonths: 6, newClient: false, stages: ["chemical", "cut"], lastCompleted: null, pending: false };
  it("asks for chemical forms only for chemical services", () => {
    expect(formNeeded(base, now)).toBe(true);
    expect(formNeeded({ ...base, stages: ["cut"] }, now)).toBe(false);
  });
  it("asks again once the renewal period passes", () => {
    expect(formNeeded({ ...base, lastCompleted: new Date("2026-07-01T00:00:00Z") }, now)).toBe(false);
    expect(formNeeded({ ...base, lastCompleted: new Date("2026-05-01T00:00:00Z") }, now)).toBe(true);
    expect(formNeeded({ ...base, renewMonths: null, lastCompleted: new Date("2020-01-01T00:00:00Z") }, now)).toBe(false);
  });
  it("new-client forms, manual forms, and pending copies", () => {
    expect(formNeeded({ ...base, ask: "new_client", newClient: true, stages: [] }, now)).toBe(true);
    expect(formNeeded({ ...base, ask: "new_client", newClient: false }, now)).toBe(false);
    expect(formNeeded({ ...base, ask: "manual" }, now)).toBe(false);
    expect(formNeeded({ ...base, pending: true }, now)).toBe(false);
  });
});
