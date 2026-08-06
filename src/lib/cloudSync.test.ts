import { describe, expect, it } from "vitest";
import { mergeCloudState } from "./cloudSync";
import { createDefaultState } from "./storage";

describe("cloud state merge", () => {
  it("keeps progress, error history, and the largest page timer", () => {
    const local = createDefaultState();
    local.elapsedSecondsByPage = { "jian21:jian21:1:1": 42 };
    local.progress.word = {
      attempted: true,
      mastered: false,
      attempts: 1,
      firstAttemptCorrect: false,
      lastAnsweredAt: "2026-08-06T01:00:00.000Z",
    };
    local.wrongBook.word = {
      addedAt: "2026-08-06T01:00:00.000Z",
      wrongCount: 1,
      errorTimestamps: ["2026-08-06T01:00:00.000Z"],
      correctStreak: 1,
    };

    const remote = createDefaultState();
    remote.elapsedSecondsByPage = { "jian21:jian21:1:1": 75, "jian21:jian21:2:1": 18 };
    remote.progress.word = {
      attempted: true,
      mastered: true,
      attempts: 3,
      firstAttemptCorrect: true,
      lastAnsweredAt: "2026-08-06T02:00:00.000Z",
    };
    remote.wrongBook.word = {
      addedAt: "2026-08-06T01:30:00.000Z",
      wrongCount: 2,
      errorTimestamps: ["2026-08-06T01:30:00.000Z"],
      correctStreak: 2,
    };

    const merged = mergeCloudState(local, remote);
    expect(merged.progress.word).toMatchObject({ attempts: 3, mastered: true });
    expect(merged.progress.word?.firstAttemptCorrect).toBe(false);
    expect(merged.wrongBook.word?.errorTimestamps).toHaveLength(2);
    expect(merged.wrongBook.word?.wrongCount).toBe(2);
    expect(merged.elapsedSecondsByPage).toEqual({
      "jian21:jian21:1:1": 75,
      "jian21:jian21:2:1": 18,
    });
  });
});
