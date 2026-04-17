import { describe, it, expect } from "vitest";
import { COPY } from "@/lib/copy";

describe("copy", () => {
  it("every key is non-empty string", () => {
    for (const [k, v] of Object.entries(COPY)) {
      expect(typeof v).toBe("string");
      expect(v.trim().length, k).toBeGreaterThan(10);
    }
  });
  it("never uses the word 'bot' in headline copy (hedged framing)", () => {
    expect(COPY.disclaimerShort.toLowerCase()).not.toContain("bot ");
    expect(COPY.aboutIntro.toLowerCase()).not.toContain(" bots ");
  });
});
