import { describe, expect, it } from "vitest";
import { buildWrongBookReport } from "./wrongBookReport";
import { createDefaultState } from "./storage";
import type { QuizData } from "../types";

const data: QuizData = {
  schemaVersion: 1,
  generatedAt: "2026-07-28T00:00:00.000Z",
  voices: { "en-GB": "gb", "en-US": "us" },
  totals: { questions: 1, britishAudioAssets: 1, usVariantAudioAssets: 0 },
  collections: [{ id: "jian21", label: "剑21词库", questionCount: 1, questionIds: ["jian21:1"] }],
  questions: [{
    id: "jian21:1", collectionId: "jian21", entryIndex: 1, page: 2, number: 1,
    sourceHeadword: "sea", canonicalAnswer: "sea", acceptedAnswers: ["sea"], partOfSpeech: "n.", meaningZh: "海洋",
    audioSequence: [{ accent: "en-GB", label: "英音", text: "sea", src: "sea.mp3" }],
  }],
};

describe("wrong-book report", () => {
  it("includes the wrong-word totals, source, and latest error record", () => {
    const state = createDefaultState();
    state.wrongBook["jian21:1"] = {
      addedAt: "2026-07-28T01:00:00.000Z",
      wrongCount: 3,
      errorTimestamps: ["2026-07-28T01:00:00.000Z", "2026-07-28T02:00:00.000Z"],
    };

    const report = buildWrongBookReport(data, state);

    expect(report).toMatchObject({ totalEntries: 1, totalErrors: 3, highestWrongCount: 3 });
    expect(report.rows).toEqual([
      expect.objectContaining({ word: "sea", meaning: "n. 海洋", source: "剑21词库 · Page 2", wrongCount: 3 }),
    ]);
    expect(report.rows[0].latestWrongAt).toContain("2026/07/28");
  });
});
