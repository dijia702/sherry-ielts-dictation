import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CollectionId, QuizData, QuizQuestion } from "../types";
import LibraryView from "./LibraryView";

function makeQuestion(collectionId: CollectionId, page: number, number: number): QuizQuestion {
  const prefix = {
    jian21: "word",
    jijing_supplement: "supplement",
    xiahua_p1p4: "xiahua",
  }[collectionId];
  const answer = `${prefix}-${number}`;
  return {
    id: `${collectionId}:${number}`,
    collectionId,
    entryIndex: number,
    page,
    number,
    sourceHeadword: answer,
    canonicalAnswer: answer,
    acceptedAnswers: [answer],
    partOfSpeech: "n.",
    meaningZh: `释义 ${number}`,
    audioSequence: [{ accent: "en-GB", label: "英音", text: answer, src: `audio/${answer}.mp3` }],
  };
}

const questions = [
  ...Array.from({ length: 27 }, (_, index) => makeQuestion("jian21", 42, index + 1)),
  ...Array.from({ length: 10 }, (_, index) =>
    makeQuestion("jijing_supplement", 16, index + 1),
  ),
  ...Array.from({ length: 17 }, (_, index) => makeQuestion("xiahua_p1p4", 14, index + 1)),
];

const fixture: QuizData = {
  schemaVersion: 1,
  generatedAt: "2026-01-01",
  voices: { "en-GB": "gb", "en-US": "us" },
  totals: { questions: 54, britishAudioAssets: 54, usVariantAudioAssets: 0 },
  collections: [
    {
      id: "jian21",
      label: "剑21版词表",
      questionCount: 27,
      questionIds: questions.filter((item) => item.collectionId === "jian21").map((item) => item.id),
    },
    {
      id: "jijing_supplement",
      label: "高频补充机经词",
      questionCount: 10,
      questionIds: questions
        .filter((item) => item.collectionId === "jijing_supplement")
        .map((item) => item.id),
    },
    {
      id: "xiahua_p1p4",
      label: "虾滑P1/P4答案词",
      questionCount: 17,
      questionIds: questions
        .filter((item) => item.collectionId === "xiahua_p1p4")
        .map((item) => item.id),
    },
  ],
  questions,
};

describe("library view", () => {
  it("groups a source page into chunks of at most 25 words", async () => {
    const user = userEvent.setup();
    const onPlay = vi.fn();
    const onResetCollectionProgress = vi.fn();
    render(
      <LibraryView
        data={fixture}
        initialScope="jian21"
        onPlay={onPlay}
        onResetCollectionProgress={onResetCollectionProgress}
      />,
    );

    expect(screen.getByTestId("library-group-jian21-42-1").children).toHaveLength(25);
    expect(screen.getByTestId("library-group-jian21-42-2").children).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "播放 word-1" }));
    expect(onPlay).toHaveBeenCalledWith(questions[0]);

    const scopeControl = screen.getByLabelText("选择浏览词库");
    await user.click(within(scopeControl).getByRole("button", { name: "补充机经" }));
    expect(screen.getByTestId("library-group-jijing_supplement-16-1").children).toHaveLength(10);
    await user.click(screen.getByRole("button", { name: "重置本词库进度" }));
    expect(onResetCollectionProgress).toHaveBeenCalledWith("jijing_supplement");

    await user.click(within(scopeControl).getByRole("button", { name: "虾滑P1/P4" }));
    expect(screen.getByTestId("library-group-xiahua_p1p4-14-1").children).toHaveLength(17);
    await user.click(screen.getByRole("button", { name: "重置本词库进度" }));
    expect(onResetCollectionProgress).toHaveBeenCalledWith("xiahua_p1p4");

    await user.click(within(scopeControl).getByRole("button", { name: "全部" }));
    expect(screen.queryByRole("button", { name: "重置本词库进度" })).not.toBeInTheDocument();
  });
});
