/** Digital forms: field types, starter templates, answer checking, and when a form is needed. */

export type FieldType = "heading" | "text" | "long" | "yesno" | "choice" | "multi" | "date" | "agree";

export interface FormField {
  id: string;
  type: FieldType;
  label: string;
  help?: string;
  required?: boolean;
  /** choice / multi */
  options?: string[];
  /** yesno: ask for details when the answer is yes */
  detailsIfYes?: string;
}

export type Answer = string | string[] | boolean | { yes: boolean; details?: string };
export type Answers = Record<string, Answer>;

export type Ask = "new_client" | "chemical" | "manual";

export const ASK_LABEL: Record<Ask, string> = {
  new_client: "New clients, before their first visit",
  chemical: "Before color and chemical services",
  manual: "Only when you send it",
};

export const FIELD_LABEL: Record<FieldType, string> = {
  heading: "Section heading",
  text: "Short answer",
  long: "Long answer",
  yesno: "Yes / no",
  choice: "Pick one",
  multi: "Pick any",
  date: "Date",
  agree: "Must agree (checkbox)",
};

export interface StarterForm {
  key: string;
  name: string;
  intro: string;
  ask: Ask;
  renewMonths: number | null;
  needsSignature: boolean;
  fields: FormField[];
}

const yesno = (id: string, label: string, detailsIfYes?: string, required = true): FormField => ({ id, type: "yesno", label, ...(required ? { required } : {}), ...(detailsIfYes ? { detailsIfYes } : {}) });

/** Starting points a salon can turn on and edit. Not legal advice: salons should review the wording. */
export const STARTER_FORMS: StarterForm[] = [
  {
    key: "intake",
    name: "New client form",
    intro: "Welcome! A few questions so we can take great care of you.",
    ask: "new_client",
    renewMonths: null,
    needsSignature: false,
    fields: [
      { id: "birthday", type: "date", label: "Birthday (optional, for a birthday treat)" },
      { id: "referral", type: "choice", label: "How did you hear about us?", options: ["Friend or family", "Instagram", "Facebook", "Google", "Walked by", "Other"] },
      { id: "hair_type", type: "choice", label: "Your hair texture", options: ["Straight", "Wavy", "Curly", "Coily", "Not sure"] },
      { id: "goals", type: "long", label: "What would you like from your visits?" },
      yesno("allergies", "Do you have any allergies or skin sensitivities?", "Please tell us what they are"),
      yesno("medical", "Any medical conditions or medications we should know about (for example pregnancy, scalp conditions, or medication that affects hair)?", "Please describe"),
      { id: "contact", type: "multi", label: "Best ways to reach you", options: ["Text", "Phone call", "Email"] },
    ],
  },
  {
    key: "color_consult",
    name: "Color consultation",
    intro: "Your color history helps us plan the right formula and avoid surprises.",
    ask: "chemical",
    renewMonths: 12,
    needsSignature: false,
    fields: [
      { id: "last_color", type: "choice", label: "When was your hair last colored?", options: ["Never", "Less than 6 weeks ago", "6 weeks to 6 months ago", "More than 6 months ago"], required: true },
      { id: "color_kind", type: "multi", label: "What's on your hair now?", options: ["Box / at-home color", "Salon color", "Highlights or balayage", "Henna", "Gloss or toner", "Nothing"] },
      yesno("lightened", "Has your hair been lightened or bleached in the last two years?"),
      yesno("chemical", "Any perms, relaxers, keratin or smoothing treatments in the last year?", "What and when?"),
      yesno("reaction", "Have you ever had a reaction to hair color?", "Please describe what happened"),
      { id: "goal", type: "long", label: "Describe the color you'd like", help: "Bring or send inspiration photos too." },
    ],
  },
  {
    key: "color_consent",
    name: "Patch test & color consent",
    intro: "Hair color can cause allergic reactions, even in people who've used it before. Please read and sign.",
    ask: "chemical",
    renewMonths: 6,
    needsSignature: true,
    fields: [
      { id: "h1", type: "heading", label: "Patch test" },
      { id: "patch", type: "choice", label: "Skin (patch) test", options: ["I had a patch test 48 hours before this visit", "I decline a patch test"], required: true },
      yesno("pregnant", "Are you pregnant or nursing?", undefined, false),
      { id: "h2", type: "heading", label: "Consent" },
      { id: "agree_risks", type: "agree", label: "I understand hair color and chemical services can cause allergic reactions, irritation, or results that differ from what was planned, especially on previously colored or treated hair.", required: true },
      { id: "agree_truth", type: "agree", label: "The information I've given about my hair and health is true and complete, and I'll tell the salon if anything changes.", required: true },
      { id: "agree_stop", type: "agree", label: "I'll tell my stylist right away if I feel burning, itching, or discomfort during the service.", required: true },
    ],
  },
];

const MAX_FIELDS = 40;

/** Clean a template's fields as saved from the editor. Returns an error message or the fields. */
export function cleanFields(raw: unknown): { ok: true; fields: FormField[] } | { ok: false; error: string } {
  if (!Array.isArray(raw) || !raw.length) return { ok: false, error: "Add at least one question." };
  if (raw.length > MAX_FIELDS) return { ok: false, error: `Keep it to ${MAX_FIELDS} questions or fewer.` };
  const out: FormField[] = [];
  const ids = new Set<string>();
  for (const f of raw as Partial<FormField>[]) {
    const type = f?.type;
    if (!type || !(type in FIELD_LABEL)) return { ok: false, error: "Unknown question type." };
    const label = typeof f.label === "string" ? f.label.trim().slice(0, 500) : "";
    if (!label) return { ok: false, error: "Every question needs wording." };
    let id = typeof f.id === "string" && /^[a-z0-9_]{1,40}$/.test(f.id) ? f.id : "";
    if (!id || ids.has(id)) {
      let n = out.length + 1;
      while (ids.has(`q${n}`)) n++;
      id = `q${n}`;
    }
    ids.add(id);
    const field: FormField = { id, type, label };
    const help = typeof f.help === "string" ? f.help.trim().slice(0, 300) : "";
    if (help) field.help = help;
    if (type !== "heading" && f.required) field.required = true;
    if (type === "choice" || type === "multi") {
      const options = (Array.isArray(f.options) ? f.options : []).map((o) => (typeof o === "string" ? o.trim().slice(0, 120) : "")).filter(Boolean);
      if (options.length < 2) return { ok: false, error: `“${label.slice(0, 40)}” needs at least two choices.` };
      field.options = [...new Set(options)].slice(0, 20);
    }
    if (type === "yesno" && typeof f.detailsIfYes === "string" && f.detailsIfYes.trim()) field.detailsIfYes = f.detailsIfYes.trim().slice(0, 200);
    out.push(field);
  }
  if (!out.some((f) => f.type !== "heading")) return { ok: false, error: "Add at least one question." };
  return { ok: true, fields: out };
}

const short = (s: string) => (s.length > 60 ? `${s.slice(0, 57)}…` : s);

/** Check a client's answers against the form. Unknown keys are dropped. */
export function checkAnswers(fields: FormField[], raw: unknown): { ok: true; answers: Answers } | { ok: false; error: string; field: string } {
  const given = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: Answers = {};
  for (const f of fields) {
    if (f.type === "heading") continue;
    const v = given[f.id];
    const missing = () => ({ ok: false as const, error: `Please answer: ${short(f.label)}`, field: f.id });
    switch (f.type) {
      case "text":
      case "long": {
        const s = typeof v === "string" ? v.trim().slice(0, f.type === "text" ? 300 : 3000) : "";
        if (!s && f.required) return missing();
        if (s) out[f.id] = s;
        break;
      }
      case "date": {
        const s = typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
        if (!s && f.required) return missing();
        if (s) out[f.id] = s;
        break;
      }
      case "choice": {
        const s = typeof v === "string" && f.options?.includes(v) ? v : "";
        if (!s && f.required) return missing();
        if (s) out[f.id] = s;
        break;
      }
      case "multi": {
        const list = Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!f.options?.includes(x)) : [];
        if (!list.length && f.required) return missing();
        if (list.length) out[f.id] = [...new Set(list)];
        break;
      }
      case "yesno": {
        const o = v && typeof v === "object" ? (v as { yes?: unknown; details?: unknown }) : null;
        if (!o || typeof o.yes !== "boolean") {
          if (f.required) return missing();
          break;
        }
        const details = o.yes && typeof o.details === "string" ? o.details.trim().slice(0, 1000) : "";
        if (o.yes && f.detailsIfYes && !details) return { ok: false, error: `${f.detailsIfYes}: ${short(f.label)}`, field: f.id };
        out[f.id] = details ? { yes: o.yes, details } : { yes: o.yes };
        break;
      }
      case "agree": {
        if (v !== true && f.required) return { ok: false, error: `Please tick to agree: ${short(f.label)}`, field: f.id };
        if (v === true) out[f.id] = true;
        break;
      }
    }
  }
  return { ok: true, answers: out };
}

/** An answer as text, for the salon's view and printouts. */
export function answerText(f: FormField, a: Answer | undefined): string {
  if (a === undefined) return "—";
  if (f.type === "yesno" && typeof a === "object" && !Array.isArray(a)) return a.yes ? `Yes${a.details ? `: ${a.details}` : ""}` : "No";
  if (f.type === "agree") return a === true ? "Agreed" : "—";
  if (Array.isArray(a)) return a.join(", ");
  if (f.type === "date" && typeof a === "string") {
    const [y, m, d] = a.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
  }
  return String(a);
}

/** Yes answers worth a stylist's attention (allergies, reactions…), as short lines. */
export function flagsFrom(fields: FormField[], answers: Answers): string[] {
  return fields.filter((f) => f.type === "yesno").flatMap((f) => {
    const a = answers[f.id];
    return a && typeof a === "object" && !Array.isArray(a) && a.yes ? [`${short(f.label)}${a.details ? ` — ${a.details}` : " — yes"}`] : [];
  });
}

export interface NeedInput {
  ask: Ask;
  renewMonths: number | null;
  /** Client has no completed visits yet. */
  newClient: boolean;
  /** Stages of the services being booked (e.g. "chemical", "cut"). */
  stages: string[];
  /** When the client last completed this form, if ever. */
  lastCompleted: Date | null;
  /** A pending copy already waits to be filled in. */
  pending: boolean;
}

/** Does this booking call for this form? */
export function formNeeded(n: NeedInput, now: Date): boolean {
  if (n.pending || n.ask === "manual") return false;
  if (n.ask === "new_client" && !n.newClient) return false;
  if (n.ask === "chemical" && !n.stages.includes("chemical")) return false;
  if (!n.lastCompleted) return true;
  if (n.renewMonths === null) return false;
  const due = new Date(n.lastCompleted);
  due.setUTCMonth(due.getUTCMonth() + n.renewMonths);
  return now >= due;
}
