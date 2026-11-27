import { describe, expect, it } from "vitest";
import { cleanPin, newKey, normalizeCode, pairCode, sha256, showCode } from "./pairing";

describe("TV pairing", () => {
  it("makes readable 6-character codes", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const c = pairCode();
      expect(c).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
      seen.add(c);
    }
    expect(seen.size).toBeGreaterThan(190);
  });

  it("reads codes typed loosely", () => {
    expect(normalizeCode("k7m-4qx ")).toBe("K7M4QX");
    expect(normalizeCode("K7M 4QX")).toBe("K7M4QX");
    expect(normalizeCode("K7M4Q")).toBeNull();
    expect(normalizeCode("K7M4Q0")).toBeNull(); // 0 is never used
    expect(showCode("K7M4QX")).toBe("K7M 4QX");
  });

  it("makes long keys and hashes them", async () => {
    expect(newKey()).toMatch(/^[0-9a-f]{64}$/);
    expect(newKey()).not.toBe(newKey());
    expect(await sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("checks exit PINs", () => {
    expect(cleanPin("1234")).toBe("1234");
    expect(cleanPin("123")).toBeNull();
    expect(cleanPin("12ab")).toBeNull();
    expect(cleanPin(undefined)).toBeNull();
  });
});
