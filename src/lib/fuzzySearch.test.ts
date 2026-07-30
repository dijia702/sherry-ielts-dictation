import { describe, expect, it } from "vitest";
import { fuzzySearchMatch } from "./fuzzySearch";

describe("fuzzy wrong-book search", () => {
  const values = ["theatre", "theater", "n.", "剧院"];

  it("matches partial text, variants, parts of speech, and Chinese meanings", () => {
    expect(fuzzySearchMatch("theat", values)).toBe(true);
    expect(fuzzySearchMatch("theater", values)).toBe(true);
    expect(fuzzySearchMatch("n.", values)).toBe(true);
    expect(fuzzySearchMatch("剧", values)).toBe(true);
  });

  it("allows a small English spelling error but rejects unrelated words", () => {
    expect(fuzzySearchMatch("thetre", values)).toBe(true);
    expect(fuzzySearchMatch("banana", values)).toBe(false);
  });

  it("ignores hyphen and space differences", () => {
    expect(fuzzySearchMatch("bar code", ["barcode", "bar-code"])).toBe(true);
  });
});
