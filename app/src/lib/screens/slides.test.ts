import { describe, expect, it } from "vitest";
import { cleanPlaylist, cleanSettings, fromTemplate, liveSlides, SLIDES, TEMPLATES } from "./slides";

describe("screen playlists", () => {
  it("templates only use slides their audience may see", () => {
    for (const t of TEMPLATES) {
      if (t.audience === "public") for (const s of t.slides) expect(SLIDES[s].audience, `${t.key}: ${s}`).toBe("public");
      expect(cleanPlaylist(fromTemplate(t), t.audience)).toHaveLength(t.slides.length);
    }
  });

  it("never keeps staff slides on a public screen", () => {
    const raw = [{ type: "today", seconds: 30 }, { type: "hours", seconds: 20 }, { type: "clientcard" }];
    expect(cleanPlaylist(raw, "public").map((s) => s.type)).toEqual(["hours"]);
    expect(cleanPlaylist(raw, "staff").map((s) => s.type)).toEqual(["today", "hours", "clientcard"]);
  });

  it("cleans times, text and references", () => {
    const [m, i] = cleanPlaylist(
      [
        { type: "message", seconds: 1, title: "  Holiday hours  ", body: "x".repeat(900), until: "2026-12-26", staffId: "nope" },
        { type: "image", mediaId: "00000000-0000-0000-0000-000000000001", seconds: 9999 },
        { type: "image" },
        { type: "message" },
        { type: "bogus" },
        "junk",
      ],
      "public",
    );
    expect(m).toMatchObject({ type: "message", seconds: 5, title: "Holiday hours", until: "2026-12-26" });
    expect(m.body).toHaveLength(400);
    expect(m.staffId).toBeUndefined();
    expect(i).toMatchObject({ type: "image", seconds: 600 });
    expect(cleanPlaylist("nope", "public")).toEqual([]);
  });

  it("drops slides whose end date has passed", () => {
    const p = cleanPlaylist([{ type: "message", title: "Closed Thanksgiving", until: "2026-11-26" }, { type: "hours" }], "public");
    expect(liveSlides(p, "2026-11-27").map((s) => s.type)).toEqual(["hours"]);
    expect(liveSlides(p, "2026-11-26")).toHaveLength(2);
  });

  it("reads settings", () => {
    expect(cleanSettings({ touch: true })).toEqual({ touch: true, header: true });
    expect(cleanSettings(null)).toEqual({ touch: false, header: true });
  });
});
