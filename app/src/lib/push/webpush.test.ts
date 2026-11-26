import { describe, expect, it } from "vitest";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { b64url, encryptPayload, generateVapidKeys, sendPush, vapidAuth } from "./webpush";

const enc = new TextEncoder();
const cat = (...p: Uint8Array[]): Uint8Array<ArrayBuffer> => {
  const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0));
  let i = 0;
  for (const x of p) {
    o.set(x, i);
    i += x.length;
  }
  return o;
};
const hmac = async (k: any, d: any): Promise<Uint8Array<ArrayBuffer>> =>
  new Uint8Array(await crypto.subtle.sign("HMAC", await crypto.subtle.importKey("raw", k, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]), d));

/** The browser's side of RFC 8291: decrypt what the server sent. */
async function decrypt(body: Uint8Array<ArrayBuffer>, ua: CryptoKeyPair, auth: Uint8Array<ArrayBuffer>): Promise<string> {
  const salt = body.slice(0, 16);
  const idlen = body[20];
  const asPublic = body.slice(21, 21 + idlen);
  const cipher = body.slice(21 + idlen);
  const uaPublic = new Uint8Array(await crypto.subtle.exportKey("raw", ua.publicKey));
  const asKey = await crypto.subtle.importKey("raw", asPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: asKey }, ua.privateKey, 256));
  const ikm = await hmac(await hmac(auth, ecdh), cat(enc.encode("WebPush: info\0"), uaPublic, asPublic, new Uint8Array([1])));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, cat(enc.encode("Content-Encoding: aes128gcm\0"), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, cat(enc.encode("Content-Encoding: nonce\0"), new Uint8Array([1])))).slice(0, 12);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]), cipher));
  expect(plain[plain.length - 1]).toBe(2); // last-record delimiter
  return new TextDecoder().decode(plain.slice(0, -1));
}

describe("web push", () => {
  it("encrypts so the subscriber can decrypt", async () => {
    const ua = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
    const auth = crypto.getRandomValues(new Uint8Array(16));
    const sub = { p256dh: b64url.encode(await crypto.subtle.exportKey("raw", ua.publicKey)), auth: b64url.encode(auth) };
    const msg = JSON.stringify({ title: "New online booking", body: "Jamie Rivers, Tue 10:30 AM CST 💇" });
    const body = await encryptPayload(msg, sub);
    expect([...body.slice(16, 20)]).toEqual([0, 0, 16, 0]);
    expect(await decrypt(body, ua, auth)).toBe(msg);
  });

  it("signs a VAPID token the push service can verify", async () => {
    const keys = await generateVapidKeys();
    const header = await vapidAuth("https://fcm.googleapis.com/fcm/send/abc", keys, "https://chairvana.app", Date.UTC(2026, 10, 26));
    const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header)!;
    expect(m[4]).toBe(keys.publicKey);
    expect(JSON.parse(new TextDecoder().decode(b64url.decode(m[2])))).toEqual({ aud: "https://fcm.googleapis.com", exp: Date.UTC(2026, 10, 26) / 1000 + 43200, sub: "https://chairvana.app" });
    const pub = await crypto.subtle.importKey("raw", b64url.decode(keys.publicKey), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    expect(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, b64url.decode(m[3]), enc.encode(`${m[1]}.${m[2]}`))).toBe(true);
  });

  it("reports expired subscriptions as gone", async () => {
    const ua = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
    const sub = { endpoint: "https://push.example/x", p256dh: b64url.encode(await crypto.subtle.exportKey("raw", ua.publicKey)), auth: b64url.encode(new Uint8Array(16)) };
    const keys = await generateVapidKeys();
    const gone = (async () => new Response("", { status: 410 })) as unknown as typeof fetch;
    expect(await sendPush(sub, "hi", keys, "https://chairvana.app", gone)).toMatchObject({ ok: false, gone: true });
    const ok = (async () => new Response("", { status: 201 })) as unknown as typeof fetch;
    expect(await sendPush(sub, "hi", keys, "https://chairvana.app", ok)).toMatchObject({ ok: true, gone: false });
  });
});

describe("RFC 8291 Appendix A", () => {
  it("produces exactly the published example output", async () => {
    const asPublic = b64url.decode("BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8");
    const jwk = { kty: "EC", crv: "P-256", d: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw", x: b64url.encode(asPublic.slice(1, 33)), y: b64url.encode(asPublic.slice(33, 65)), ext: true };
    const serverKeys = {
      privateKey: await crypto.subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]),
      publicKey: await crypto.subtle.importKey("raw", asPublic, { name: "ECDH", namedCurve: "P-256" }, true, []),
    } as CryptoKeyPair;
    const body = await encryptPayload(
      new TextDecoder().decode(b64url.decode("V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24")),
      { p256dh: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", auth: "BTBZMqHH6r4Tts7J_aSIgg" },
      { salt: b64url.decode("DGv6ra1nlYgDCS1FRnbzlw"), serverKeys },
    );
    const header = "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8";
    const cipher = "8pfeW0KbunFT06SuDKoJH9Ql87S1QUrdirN6GcG7sFz1y1sqLgVi1VhjVkHsUoEsbI_0LpXMuGvnzQ";
    expect(b64url.encode(body)).toBe(b64url.encode(new Uint8Array([...b64url.decode(header), ...b64url.decode(cipher)])));
  });
});
