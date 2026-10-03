import { describe, expect, it } from "vitest";

import { findActiveSegmentIndex, formatDuration, formatTime } from "../time";

describe("formatTime", () => {
  it.each([
    [0, "00:00"],
    [65.4, "01:05"],
    [599.99, "09:59"],
    [3661, "1:01:01"],
    [-5, "00:00"],
    [Number.NaN, "00:00"],
  ])("formats %s as %s", (input, expected) => {
    expect(formatTime(input)).toBe(expected);
  });
});

describe("formatDuration", () => {
  it("shows a dash for unknown duration", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(90)).toBe("01:30");
  });
});

describe("findActiveSegmentIndex", () => {
  const segments = [
    { start: 0, end: 2 },
    { start: 2, end: 5 },
    { start: 8, end: 10 },
  ];

  it("finds the segment containing the time", () => {
    expect(findActiveSegmentIndex(segments, 0)).toBe(0);
    expect(findActiveSegmentIndex(segments, 3)).toBe(1);
    expect(findActiveSegmentIndex(segments, 9.5)).toBe(2);
  });

  it("keeps the previous segment during a silence gap", () => {
    expect(findActiveSegmentIndex(segments, 6)).toBe(1);
  });

  it("returns -1 before the first segment or for an empty list", () => {
    expect(findActiveSegmentIndex([{ start: 1, end: 2 }], 0.5)).toBe(-1);
    expect(findActiveSegmentIndex([], 3)).toBe(-1);
  });

  it("stays on the last segment after the end", () => {
    expect(findActiveSegmentIndex(segments, 99)).toBe(2);
  });
});
