import { describe, expect, it } from "vitest";
import {
  getErrorTimestamps,
  latestWrongTimestamp,
  recordCorrectWrongPractice,
  recordWrongEvent,
} from "./wrongBook";

describe("wrong-book event history", () => {
  it("records every error in chronological order", () => {
    const first = recordWrongEvent(undefined, "2026-07-28T01:00:00.000Z");
    const second = recordWrongEvent(first, "2026-07-28T02:00:00.000Z");

    expect(second.wrongCount).toBe(2);
    expect(second.correctStreak).toBe(0);
    expect(getErrorTimestamps(second)).toEqual([
      "2026-07-28T01:00:00.000Z",
      "2026-07-28T02:00:00.000Z",
    ]);
    expect(latestWrongTimestamp(second)).toBe("2026-07-28T02:00:00.000Z");
  });

  it("increments a correct streak and resets it on the next error", () => {
    const entry = {
      addedAt: "2026-07-28T01:00:00.000Z",
      wrongCount: 1,
      correctStreak: 1,
    };

    const correct = recordCorrectWrongPractice(entry);
    expect(correct.correctStreak).toBe(2);
    expect(recordWrongEvent(correct, "2026-07-28T02:00:00.000Z").correctStreak).toBe(0);
  });

  it("falls back to the original added time for legacy entries", () => {
    const legacy = { addedAt: "2026-07-28T01:00:00.000Z", wrongCount: 3 };
    expect(getErrorTimestamps(legacy)).toEqual(["2026-07-28T01:00:00.000Z"]);
  });
});
