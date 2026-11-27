import { describe, expect, it } from "vitest";
import { looksLikeTest } from "./test-guess";

describe("looksLikeTest", () => {
  it("spots practice clients", () => {
    expect(looksLikeTest({ name: "Test Client" })).toBe(true);
    expect(looksLikeTest({ name: "Demo" })).toBe(true);
    expect(looksLikeTest({ name: "Jane Doe" })).toBe(true);
    expect(looksLikeTest({ name: "Amy Lee", email: "amy@example.com" })).toBe(true);
    expect(looksLikeTest({ name: "Amy Lee", contact: "(256) 555-0142" })).toBe(true);
    expect(looksLikeTest({ name: "Amy Lee", email: "test2@gmail.com" })).toBe(true);
  });
  it("leaves real-looking clients alone", () => {
    expect(looksLikeTest({ name: "Testa Rossi", email: "testa@gmail.com" })).toBe(false);
    expect(looksLikeTest({ name: "Morgan Tate", email: "morgan@gmail.com", contact: "(256) 555-2142" })).toBe(false);
  });
});
