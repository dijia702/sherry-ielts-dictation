import { describe, expect, it } from "vitest";
import {
  createDefaultState,
  isPersistedState,
  loadState,
  parseImportedState,
  saveState,
  STORAGE_KEY,
} from "./storage";

describe("local progress storage", () => {
  it("round-trips versioned state", () => {
    const state = createDefaultState();
    state.settings.autoPlay = false;
    saveState(state);
    expect(loadState()).toEqual(state);
  });

  it("falls back when persisted JSON is invalid", () => {
    localStorage.setItem(STORAGE_KEY, "not-json");
    expect(loadState()).toEqual(createDefaultState());
    expect(isPersistedState({ schemaVersion: 2 })).toBe(false);
  });

  it("migrates older v1 progress without page selections", () => {
    const legacyState = createDefaultState();
    delete legacyState.pageSelections;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(legacyState));
    expect(loadState().pageSelections).toEqual({
      jian21: "all",
      jijing_supplement: "all",
      xiahua_p1p4: "all",
      all: "all",
    });
  });

  it("migrates legacy wrong entries with their original added time", () => {
    const legacyState = createDefaultState();
    legacyState.wrongBook["jian21:1"] = {
      addedAt: "2026-07-28T01:00:00.000Z",
      wrongCount: 2,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(legacyState));

    expect(loadState().wrongBook["jian21:1"].errorTimestamps).toEqual([
      "2026-07-28T01:00:00.000Z",
    ]);
    expect(loadState().wrongBook["jian21:1"].correctStreak).toBe(0);
    expect(loadState().starredWords).toEqual({});
  });

  it("rejects malformed nested progress data", () => {
    const state = createDefaultState();
    state.progress["jian21:1"] = {
      attempted: true,
      mastered: false,
      attempts: -1,
      firstAttemptCorrect: null,
      lastAnsweredAt: "2026-01-01T00:00:00.000Z",
    };
    expect(isPersistedState(state)).toBe(false);
  });

  it("rejects imports that reference unknown questions", async () => {
    const state = createDefaultState();
    state.wrongBook["unknown:1"] = { addedAt: "2026-01-01T00:00:00.000Z", wrongCount: 1 };
    const file = { text: async () => JSON.stringify(state) } as File;
    await expect(parseImportedState(file, new Set(["jian21:1"]))).rejects.toThrow(
      "进度文件包含当前词库中不存在的题目",
    );
  });
});
