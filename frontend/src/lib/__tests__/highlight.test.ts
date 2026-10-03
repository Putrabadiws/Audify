import { describe, expect, it } from "vitest";

import { splitHighlight } from "../highlight";

describe("splitHighlight", () => {
  it("marks every case-insensitive occurrence, keeping original casing", () => {
    expect(splitHighlight("Chitato naik, chitato laris", "CHITATO")).toEqual([
      { text: "Chitato", isMatch: true },
      { text: " naik, ", isMatch: false },
      { text: "chitato", isMatch: true },
      { text: " laris", isMatch: false },
    ]);
  });

  it("treats regex metacharacters literally", () => {
    expect(splitHighlight("naik 100% (Q4)", "(q4)")).toEqual([
      { text: "naik 100% ", isMatch: false },
      { text: "(Q4)", isMatch: true },
    ]);
    expect(splitHighlight("abc", ".*")).toEqual([{ text: "abc", isMatch: false }]);
  });

  it("returns the whole text unmarked for a blank query or no hit", () => {
    expect(splitHighlight("hello", "  ")).toEqual([{ text: "hello", isMatch: false }]);
    expect(splitHighlight("hello", "xyz")).toEqual([{ text: "hello", isMatch: false }]);
  });

  it("handles a match at both ends", () => {
    expect(splitHighlight("aXa", "a")).toEqual([
      { text: "a", isMatch: true },
      { text: "X", isMatch: false },
      { text: "a", isMatch: true },
    ]);
  });
});
