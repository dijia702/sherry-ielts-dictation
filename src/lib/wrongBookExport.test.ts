import { describe, expect, it } from "vitest";
import type { QuizData } from "../types";
import { createDefaultState } from "./storage";
import { buildWrongBookExport } from "./wrongBookExport";

const data: QuizData = {
  schemaVersion: 1,
  generatedAt: "2026-07-28T00:00:00.000Z",
  voices: { "en-GB": "gb", "en-US": "us" },
  totals: { questions: 1, britishAudioAssets: 1, usVariantAudioAssets: 0 },
  collections: [
    {
      id: "jian21",
      label: "剑21版词表",
      questionCount: 1,
      questionIds: ["jian21:1"],
    },
  ],
  questions: [
    {
      id: "jian21:1",
      collectionId: "jian21",
      entryIndex: 1,
      page: 1,
      number: 1,
      sourceHeadword: "sea",
      canonicalAnswer: "sea",
      acceptedAnswers: ["sea"],
      partOfSpeech: "n.",
      meaningZh: "海洋",
      audioSequence: [
        { accent: "en-GB", label: "英音", text: "sea", src: "audio/sea.mp3" },
      ],
    },
  ],
};

describe("wrong-book export", () => {
  it("exports full word metadata and every recorded error time", () => {
    const state = createDefaultState();
    state.wrongBook["jian21:1"] = {
      addedAt: "2026-07-28T01:00:00.000Z",
      wrongCount: 2,
      errorTimestamps: [
        "2026-07-28T01:00:00.000Z",
        "2026-07-28T02:00:00.000Z",
      ],
    };

    const payload = buildWrongBookExport(data, state);

    expect(payload.fileType).toBe("sherry-wrong-book");
    expect(payload.totalEntries).toBe(1);
    expect(payload.totalErrorEvents).toBe(2);
    expect(payload.entries[0]).toMatchObject({
      canonicalAnswer: "sea",
      partOfSpeech: "n.",
      meaningZh: "海洋",
      collectionLabel: "剑21版词表",
      page: 1,
      wrongCount: 2,
      errorTimestamps: [
        "2026-07-28T01:00:00.000Z",
        "2026-07-28T02:00:00.000Z",
      ],
      audioSequence: [{ src: "audio/sea.mp3" }],
    });
  });
});
