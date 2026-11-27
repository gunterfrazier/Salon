/**
 * Texts coming back from clients, via Twilio: STOP / START / HELP. Twilio
 * itself blocks texts to numbers that replied STOP and answers STOP and HELP;
 * this keeps Chairvana's "OK to text" in step with that.
 */

/** Twilio's request signature: base64 HMAC-SHA1 of the URL followed by each POST field (sorted) name+value. */
export async function twilioSignature(authToken: string, url: string, params: Record<string, string>): Promise<string> {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(authToken), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
  let bin = "";
  for (const b of sig) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Compare without leaking timing. */
export function sameSignature(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const STOP = new Set(["STOP", "STOPALL", "STOP ALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "OPTOUT", "OPT OUT", "REVOKE"]);
const START = new Set(["START", "UNSTOP", "YES", "OPTIN", "OPT IN"]);
const HELP = new Set(["HELP", "INFO"]);

export type Keyword = "stop" | "start" | "help";

/**
 * What a reply means. Twilio's own reading (OptOutType, sent when its opt-out
 * handling is on) wins; otherwise the whole message must be the keyword.
 */
export function replyKeyword(body: string, optOutType?: string | null): Keyword | null {
  const t = (optOutType ?? "").toUpperCase();
  if (t === "STOP") return "stop";
  if (t === "START") return "start";
  if (t === "HELP") return "help";
  const w = body.trim().toUpperCase().replace(/[.!]+$/, "");
  if (STOP.has(w)) return "stop";
  if (START.has(w)) return "start";
  if (HELP.has(w)) return "help";
  return null;
}

/** Twilio's error when texting a number that replied STOP. */
export const OPTED_OUT_ERROR = /Twilio 21610\b/;
