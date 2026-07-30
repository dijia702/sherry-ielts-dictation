import { describe, expect, it } from "vitest";
import { buildProgressReport } from "./progressReport";
import { createDefaultState } from "./storage";
import type { QuizData } from "../types";

const data: QuizData = {
  schemaVersion: 1,
  generatedAt: "2026-07-28T00:00:00.000Z",
  voices: { "en-GB": "gb", "en-US": "us" },
  totals: { questions: 2, britishAudioAssets: 2, usVariantAudioAssets: 0 },
  collections: [{ id: "jian21", label: "剑21词库", questionCount: 2, questionIds: ["jian21:1", "jian21:2"] }],
  questions: [
    {
      id: "jian21:1", collectionId: "jian21", entryIndex: 1, page: 1, number: 1,
      sourceHeadword: "sea", canonicalAnswer: "sea", acceptedAnswers: ["sea"], partOfSpeech: "n.", meaningZh: "海洋",
      audioSequence: [{ accent: "en-GB", label: "英音", text: "sea", src: "sea.mp3" }],
    },
    {
      id: "jian21:2", collectionId: "jian21", entryIndex: 2, page: 1, number: 2,
      sourceHeadword: "tree", canonicalAnswer: "tree", acceptedAnswers: ["tree"], partOfSpeech: "n.", meaningZh: "树木",
      audioSequence: [{ accent: "en-GB", label: "英音", text: "tree", src: "tree.mp3" }],
    },
  ],
};

describe("progress report", () => {
  it("summarizes the selected word bank without including another page", () => {
    const state = createDefaultState();
    state.progress["jian21:1"] = {
      attempted: true, mastered: true, attempts: 1, firstAttemptCorrect: true, lastAnsweredAt: "2026-07-28T00:00:00.000Z",
    };
    state.progress["jian21:2"] = {
      attempted: true, mastered: false, attempts: 2, firstAttemptCorrect: false, lastAnsweredAt: "2026-07-28T00:00:00.000Z",
    };
    state.wrongBook["jian21:2"] = { addedAt: "2026-07-28T00:00:00.000Z", wrongCount: 1 };

    const report = buildProgressReport(data, state, "jian21", "jian21:1:1", 125);

    expect(report).toMatchObject({ total: 2, attempted: 2, mastered: 1, wrong: 1, accuracy: 50, elapsedSeconds: 125 });
    expect(report.rows.map((row) => row.status)).toEqual(["已掌握", "待复习"]);
  });
});
