import { describe, expect, it } from "vitest";
import type { PersistedState, QuizQuestion } from "../types";
import {
  buildPageGroups,
  buildQueue,
  isAnswerCorrect,
  normalizeAnswer,
  randomOrderKey,
  scopeQuestionIds,
  shuffleIds,
} from "./quiz";
import { createDefaultState } from "./storage";

const questions = [
  { id: "jian21:1", collectionId: "jian21" },
  { id: "jian21:2", collectionId: "jian21" },
  { id: "jijing_supplement:1", collectionId: "jijing_supplement" },
] as QuizQuestion[];

describe("answer normalization", () => {
  it("ignores case, edge whitespace, repeated spaces, and hyphen/space differences", () => {
    expect(normalizeAnswer("  Door--TO   Door ")).toBe("door to door");
    expect(isAnswerCorrect("THEATER", ["theatre", "theater"])).toBe(true);
    expect(isAnswerCorrect("bar-code", ["barcode", "bar code"])).toBe(true);
  });

  it("does not allow genuine spelling errors", () => {
    expect(isAnswerCorrect("thetre", ["theatre", "theater"])).toBe(false);
  });
});

describe("queue construction", () => {
  const pagedQuestions = Array.from({ length: 27 }, (_, index) => {
    const number = index + 1;
    return {
      id: `jian21:page42:${number}`,
      collectionId: "jian21",
      entryIndex: number,
      page: 42,
      number,
      sourceHeadword: `word-${number}`,
      canonicalAnswer: `word-${number}`,
      acceptedAnswers: [`word-${number}`],
      partOfSpeech: "n.",
      meaningZh: `释义 ${number}`,
      audioSequence: [],
    } as QuizQuestion;
  });

  it("splits source pages into selectable groups of at most 25 words", () => {
    const groups = buildPageGroups(pagedQuestions, "jian21");
    expect(groups.map((group) => [group.key, group.questions.length])).toEqual([
      ["jian21:42:1", 25],
      ["jian21:42:2", 2],
    ]);
    expect(scopeQuestionIds(pagedQuestions, "jian21", "jian21:42:2")).toEqual([
      "jian21:page42:26",
      "jian21:page42:27",
    ]);
  });

  it("filters by collection and wrong-book membership", () => {
    const state: PersistedState = {
      ...createDefaultState(),
      wrongBook: { "jian21:2": { addedAt: "2026-01-01", wrongCount: 1 } },
    };
    expect(buildQueue(questions, "jian21", "sequential", state)).toEqual([
      "jian21:1",
      "jian21:2",
    ]);
    expect(buildQueue(questions, "all", "wrong", state)).toEqual(["jian21:2"]);
  });

  it("retains a stored random order and appends new scoped ids", () => {
    const state: PersistedState = {
      ...createDefaultState(),
      randomOrders: { jian21: ["jian21:2"] },
    };
    expect(buildQueue(questions, "jian21", "random", state)).toEqual([
      "jian21:2",
      "jian21:1",
    ]);
  });

  it("keeps a stable random order for each selected page", () => {
    const selection = "jian21:42:2";
    const state: PersistedState = {
      ...createDefaultState(),
      randomOrders: {
        [randomOrderKey("jian21", selection)]: ["jian21:page42:27"],
      },
    };
    expect(buildQueue(pagedQuestions, "jian21", "random", state, selection)).toEqual([
      "jian21:page42:27",
      "jian21:page42:26",
    ]);
  });

  it("supports deterministic shuffling for tests", () => {
    expect(shuffleIds(["a", "b", "c"], () => 0)).toEqual(["b", "c", "a"]);
  });
});
