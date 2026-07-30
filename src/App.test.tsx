import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { createDefaultState, saveState } from "./lib/storage";
import type { QuizData } from "./types";

const fixture: QuizData = {
  schemaVersion: 1,
  generatedAt: "2026-01-01",
  voices: { "en-GB": "gb", "en-US": "us" },
  totals: { questions: 2, britishAudioAssets: 3, usVariantAudioAssets: 1 },
  collections: [
    { id: "jian21", label: "剑21版词表", questionCount: 2, questionIds: ["jian21:1", "jian21:2"] },
  ],
  questions: [
    {
      id: "jian21:1",
      collectionId: "jian21",
      entryIndex: 1,
      page: 1,
      number: 1,
      sourceHeadword: "theater/theatre",
      canonicalAnswer: "theatre",
      acceptedAnswers: ["theater", "theatre"],
      partOfSpeech: "n.",
      meaningZh: "剧院",
      audioSequence: [
        { accent: "en-GB", label: "英音", text: "theatre", src: "audio/gb.mp3" },
        { accent: "en-US", label: "美音", text: "theatre", src: "audio/us.mp3" },
      ],
    },
    {
      id: "jian21:2",
      collectionId: "jian21",
      entryIndex: 2,
      page: 2,
      number: 2,
      sourceHeadword: "trees",
      canonicalAnswer: "trees",
      acceptedAnswers: ["trees"],
      partOfSpeech: "n.",
      meaningZh: "树",
      audioSequence: [{ accent: "en-GB", label: "英音", text: "trees", src: "audio/trees.mp3" }],
    },
  ],
};

const fixtureWithSupplement: QuizData = {
  ...fixture,
  totals: { ...fixture.totals, questions: 3 },
  collections: [
    ...fixture.collections,
    {
      id: "jijing_supplement",
      label: "补充机经",
      questionCount: 1,
      questionIds: ["jijing_supplement:1"],
    },
  ],
  questions: [
    ...fixture.questions,
    {
      id: "jijing_supplement:1",
      collectionId: "jijing_supplement",
      entryIndex: 1,
      page: 1,
      number: 1,
      sourceHeadword: "supplement",
      canonicalAnswer: "supplement",
      acceptedAnswers: ["supplement"],
      partOfSpeech: "n.",
      meaningZh: "补充",
      audioSequence: [{ accent: "en-GB", label: "英音", text: "supplement", src: "audio/supplement.mp3" }],
    },
  ],
};

const fixtureWithXiahua: QuizData = {
  ...fixture,
  totals: { ...fixture.totals, questions: 3, britishAudioAssets: 4 },
  collections: [
    ...fixture.collections,
    {
      id: "xiahua_p1p4",
      label: "虾滑P1/P4答案词",
      questionCount: 1,
      questionIds: ["xiahua_p1p4:1"],
    },
  ],
  questions: [
    ...fixture.questions,
    {
      id: "xiahua_p1p4:1",
      collectionId: "xiahua_p1p4",
      entryIndex: 1,
      page: 1,
      number: 1,
      sourceHeadword: "DRESSLER",
      canonicalAnswer: "DRESSLER",
      acceptedAnswers: ["DRESSLER"],
      partOfSpeech: "n.",
      meaningZh: "人名",
      audioSequence: [
        { accent: "en-GB", label: "英音", text: "DRESSLER", src: "audio/dressler.mp3" },
      ],
    },
  ],
};

describe("dictation workflow", () => {
  beforeEach(() => {
    const state = createDefaultState();
    saveState(state);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
  });

  it("adds a wrong answer to the wrong book and allows retry", async () => {
    const user = userEvent.setup();
    render(<App data={fixture} />);
    const input = screen.getByLabelText("听写答案");
    await user.type(input, "thetre");
    await user.click(screen.getByRole("button", { name: "核对" }));
    expect(screen.getByText("拼写不正确，再试一次")).toBeInTheDocument();
    expect(screen.getByText("❌")).toBeInTheDocument();
    expect(screen.getByTestId("answer-reveal")).toHaveClass("answer-reveal-wrong");
    expect(screen.getByTestId("answer-reveal")).toHaveTextContent("n.");
    expect(screen.getByTestId("answer-reveal")).toHaveTextContent("剧院");
    expect(screen.getByRole("button", { name: /错题本/ })).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: "下一词" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "继续拼写" }));
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
    expect(screen.queryByTestId("answer-reveal")).not.toBeInTheDocument();
    await user.type(input, "THEATER");
    await user.click(screen.getByRole("button", { name: "核对" }));
    expect(screen.getByText("✅")).toBeInTheDocument();
    expect(screen.getByTestId("answer-reveal")).toHaveTextContent("theatre");
    expect(screen.getByTestId("answer-reveal")).toHaveTextContent("剧院");
  });

  it("keeps a wrong item and moves forward when the user chooses the next word", async () => {
    const user = userEvent.setup();
    render(<App data={fixture} />);

    await user.type(screen.getByLabelText("听写答案"), "thetre");
    await user.click(screen.getByRole("button", { name: "核对" }));
    await user.click(screen.getByRole("button", { name: "下一词" }));

    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem("sherry-dictation:v1") ?? "{}");
      expect(saved.wrongBook["jian21:1"]).toBeTruthy();
      expect(saved.progress["jian21:1"].mastered).toBe(false);
    });
  });

  it("removes a wrong-practice word after its third consecutive correct answer", async () => {
    const state = createDefaultState();
    state.practiceMode = "wrong";
    state.wrongBook = {
      "jian21:1": {
        addedAt: "2026-07-28T01:00:00.000Z",
        wrongCount: 1,
        correctStreak: 2,
      },
    };
    saveState(state);

    const user = userEvent.setup();
    render(<App data={fixture} />);
    await user.type(screen.getByLabelText("听写答案"), "theatre");
    await user.click(screen.getByRole("button", { name: "核对" }));

    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem("sherry-dictation:v1") ?? "{}");
      expect(saved.wrongBook["jian21:1"]).toBeUndefined();
    });
    expect(screen.getByText("错题本是空的")).toBeInTheDocument();
  });

  it("keeps wrong-practice progress separate from normal dictation progress", async () => {
    const state = createDefaultState();
    state.practiceMode = "wrong";
    state.progress = {
      "jian21:1": {
        attempted: true,
        mastered: true,
        attempts: 1,
        firstAttemptCorrect: true,
        lastAnsweredAt: "2026-07-28T01:00:00.000Z",
      },
      "jian21:2": {
        attempted: true,
        mastered: true,
        attempts: 1,
        firstAttemptCorrect: true,
        lastAnsweredAt: "2026-07-28T02:00:00.000Z",
      },
    };
    state.wrongPracticeProgress = {
      "jian21:2": {
        attempted: true,
        mastered: false,
        attempts: 1,
        firstAttemptCorrect: false,
        lastAnsweredAt: "2026-07-28T03:00:00.000Z",
      },
    };
    state.wrongBook = {
      "jian21:1": { addedAt: "2026-07-28T01:00:00.000Z", wrongCount: 1 },
      "jian21:2": { addedAt: "2026-07-28T02:00:00.000Z", wrongCount: 1 },
    };
    saveState(state);

    const user = userEvent.setup();
    render(<App data={fixture} />);
    const progress = screen.getByLabelText("错题练习进度");
    expect(within(progress).getByText("1 / 2")).toBeInTheDocument();
    expect(within(progress).getByText("1/2")).toBeInTheDocument();

    await user.type(screen.getByLabelText("听写答案"), "theatre");
    await user.click(screen.getByRole("button", { name: "核对" }));

    await waitFor(() => {
      expect(within(progress).getByText("2 / 2")).toBeInTheDocument();
      const saved = JSON.parse(localStorage.getItem("sherry-dictation:v1") ?? "{}");
      expect(saved.wrongPracticeProgress["jian21:1"].attempted).toBe(true);
      expect(saved.progress["jian21:1"].attempts).toBe(1);
    });
  });

  it("reveals an answer and persists it as an unmastered wrong item", async () => {
    const user = userEvent.setup();
    render(<App data={fixture} />);
    await user.click(screen.getByRole("button", { name: "显示答案" }));
    expect(screen.getByText("👀")).toBeInTheDocument();
    expect(screen.getByTestId("answer-reveal")).toHaveTextContent("剧院");
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem("sherry-dictation:v1") ?? "{}");
      expect(saved.wrongBook["jian21:1"]).toBeTruthy();
      expect(saved.progress["jian21:1"].mastered).toBe(false);
      expect(saved.progress["jian21:1"].firstAttemptCorrect).toBe(null);
    });
  });

  it("uses the first submitted answer for accuracy after a reveal", async () => {
    const user = userEvent.setup();
    render(<App data={fixture} />);
    await user.click(screen.getByRole("button", { name: "显示答案" }));

    const input = screen.getByLabelText("听写答案");
    await user.type(input, "theatre");
    await user.click(screen.getByRole("button", { name: "核对" }));

    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem("sherry-dictation:v1") ?? "{}");
      expect(saved.progress["jian21:1"].firstAttemptCorrect).toBe(true);
    });
  });

  it("automatically plays on load and again after moving to the next word", async () => {
    const user = userEvent.setup();
    render(<App data={fixture} />);

    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1));
    const desktopNavigation = screen.getByRole("navigation", { name: "题目导航" });
    await user.click(within(desktopNavigation).getByRole("button", { name: "下一题" }));
    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2));
  });

  it("replays the current word with one Space while the answer input is focused", async () => {
    const user = userEvent.setup();
    render(<App data={fixture} />);

    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1));
    await user.keyboard(" ");
    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText("听写答案")).toHaveValue("");
  });

  it("inserts one phrase space with double Space while keeping one-key replay", async () => {
    const user = userEvent.setup();
    render(<App data={fixture} />);

    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1));
    const answerInput = screen.getByLabelText("听写答案");
    await user.type(answerInput, "in");
    await user.keyboard("  ");
    await user.type(answerInput, "advance");

    expect(answerInput).toHaveValue("in advance");
    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2));
  });

  it("keeps the revealed result visible until the user moves to the next word", async () => {
    const user = userEvent.setup();
    render(<App data={fixture} />);

    const input = screen.getByLabelText("听写答案");
    await user.type(input, "theatre");
    await user.keyboard("{Enter}");
    await new Promise((resolve) => window.setTimeout(resolve, 800));

    expect(screen.getByTestId("answer-reveal")).toHaveTextContent("theatre");
    expect(screen.getByTestId("question-position")).toHaveTextContent("1 / 2");

    await user.keyboard("{Enter}");
    expect(screen.getByTestId("question-position")).toHaveTextContent("2 / 2");
  });

  it("navigates between words with the left and right arrow keys", async () => {
    const user = userEvent.setup();
    render(<App data={fixture} />);

    expect(screen.getByTestId("question-stage")).not.toHaveClass("question-enter-forward");
    await user.keyboard("{ArrowRight}");
    expect(screen.getByTestId("question-position")).toHaveTextContent("2 / 2");
    expect(screen.getByTestId("question-stage")).toHaveClass("question-enter-forward");
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByTestId("question-position")).toHaveTextContent("1 / 2");
    expect(screen.getByTestId("question-stage")).toHaveClass("question-enter-backward");
  });

  it("reveals the current answer with the down arrow key", async () => {
    const user = userEvent.setup();
    render(<App data={fixture} />);

    await user.keyboard("{ArrowDown}");

    expect(screen.getByText("👀")).toBeInTheDocument();
    expect(screen.getByTestId("answer-reveal")).toHaveTextContent("theatre");
    expect(screen.getByTestId("question-position")).toHaveTextContent("1 / 2");
  });

  it("filters dictation to a selected source page", async () => {
    const user = userEvent.setup();
    render(<App data={fixture} />);

    const pageSelect = screen.getByLabelText("选择听写页码");
    await user.selectOptions(pageSelect, "jian21:2:1");

    expect(pageSelect).toHaveValue("jian21:2:1");
    expect(screen.getByTestId("question-position")).toHaveTextContent("1 / 1");
    expect(screen.getByRole("region", { name: "学习进度" })).toHaveTextContent("答题进度0/1");
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem("sherry-dictation:v1") ?? "{}");
      expect(saved.pageSelections.jian21).toBe("jian21:2:1");
    });
  });

  it("moves between selected pages with down and left at page boundaries", async () => {
    const user = userEvent.setup();
    render(<App data={fixture} />);

    const pageSelect = screen.getByLabelText("选择听写页码");
    await user.selectOptions(pageSelect, "jian21:1:1");
    await user.type(screen.getByLabelText("听写答案"), "theatre");
    await user.keyboard("{Enter}");
    expect(screen.getByTestId("question-position")).toHaveTextContent("1 / 1");

    await user.keyboard("{ArrowDown}");
    expect(pageSelect).toHaveValue("jian21:2:1");
    expect(screen.getByTestId("question-position")).toHaveTextContent("1 / 1");

    await user.keyboard("{ArrowLeft}");
    expect(pageSelect).toHaveValue("jian21:1:1");
  });

  it("moves to the next page with Enter after the final answer", async () => {
    const user = userEvent.setup();
    render(<App data={fixture} />);

    const pageSelect = screen.getByLabelText("选择听写页码");
    await user.selectOptions(pageSelect, "jian21:1:1");
    const input = screen.getByLabelText("听写答案");
    await user.type(input, "theatre");
    await user.keyboard("{Enter}");
    expect(pageSelect).toHaveValue("jian21:1:1");

    await user.keyboard("{Enter}");
    expect(pageSelect).toHaveValue("jian21:2:1");
  });

  it("shows compact answered progress and remaining word counts", async () => {
    const user = userEvent.setup();
    render(<App data={fixture} />);
    const progress = screen.getByRole("region", { name: "学习进度" });

    expect(progress).toHaveTextContent("答对题目0");
    expect(progress).toHaveTextContent("答题进度0/2");
    expect(progress).toHaveTextContent("剩余词2");

    await user.type(screen.getByLabelText("听写答案"), "thetre");
    await user.keyboard("{Enter}");
    expect(progress).toHaveTextContent("答题进度1/2");
    expect(progress).toHaveTextContent("剩余词1");
  });

  it("shows concise usage instructions in a collapsible section", async () => {
    const user = userEvent.setup();
    render(<App data={fixture} />);

    const summary = screen.getByText("使用说明").closest("summary");
    const guide = summary?.closest("details");
    expect(summary).toBeInTheDocument();
    expect(guide).not.toHaveAttribute("open");

    await user.click(summary!);

    expect(guide).toHaveAttribute("open");
    expect(guide).toHaveTextContent("Enter");
    expect(guide).toHaveTextContent("↓");
    expect(guide).toHaveTextContent("错题本");
  });

  it("updates only the elapsed clock without rewriting the full app state every second", () => {
    vi.useFakeTimers();
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    try {
      render(<App data={fixture} />);
      const writesAfterMount = setItem.mock.calls.length;

      act(() => vi.advanceTimersByTime(5000));

      expect(screen.getByText("00:05")).toBeInTheDocument();
      expect(setItem).toHaveBeenCalledTimes(writesAfterMount);
    } finally {
      vi.useRealTimers();
    }
  });

  it("records every error time and supports fuzzy wrong-book search", async () => {
    const state = createDefaultState();
    state.wrongBook = {
      "jian21:1": {
        addedAt: "2026-07-28T01:00:00.000Z",
        wrongCount: 2,
        errorTimestamps: [
          "2026-07-28T01:00:00.000Z",
          "2026-07-28T02:00:00.000Z",
        ],
      },
      "jian21:2": {
        addedAt: "2026-07-28T03:00:00.000Z",
        wrongCount: 1,
        errorTimestamps: ["2026-07-28T03:00:00.000Z"],
      },
    };
    saveState(state);

    const user = userEvent.setup();
    render(<App data={fixture} />);
    await user.click(screen.getByRole("button", { name: /错题本/ }));
    const drawer = screen.getByRole("region", { name: "错题本" });
    expect(within(drawer).getByRole("button", { name: "导出全部错题" })).toBeEnabled();

    const playsBeforeWordClick = vi.mocked(HTMLMediaElement.prototype.play).mock.calls.length;
    await user.click(within(drawer).getByRole("button", { name: "播放单词 trees" }));
    await waitFor(() =>
      expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(playsBeforeWordClick + 1),
    );

    await user.type(within(drawer).getByLabelText("模糊搜索错题"), "treess");

    expect(within(drawer).getAllByText("trees").length).toBeGreaterThan(0);
    expect(within(drawer).queryByText("theatre")).not.toBeInTheDocument();
    expect(within(drawer).getByText("找到 1 个匹配词条")).toBeInTheDocument();

    await user.clear(within(drawer).getByLabelText("模糊搜索错题"));
    const historySummary = within(drawer).getByText(/错误 2 次/).closest("summary");
    const history = historySummary?.closest("details");
    await user.click(historySummary!);
    expect(history?.querySelectorAll("time")).toHaveLength(2);
  });

  it("filters the wrong book by the selected page and shows page summaries", async () => {
    const state = createDefaultState();
    state.wrongBook = {
      "jian21:1": { addedAt: "2026-07-28T01:00:00.000Z", wrongCount: 1 },
      "jian21:2": { addedAt: "2026-07-28T02:00:00.000Z", wrongCount: 1 },
    };
    saveState(state);

    const user = userEvent.setup();
    render(<App data={fixture} />);
    await user.selectOptions(screen.getByLabelText("选择听写页码"), "jian21:2:1");
    await user.click(screen.getByRole("button", { name: /错题本/ }));

    const drawer = screen.getByRole("region", { name: "错题本" });
    expect(within(drawer).getByRole("tab", { name: "当前 Page · 1" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(within(drawer).getAllByText("trees").length).toBeGreaterThan(0);
    expect(drawer.querySelector(".wrong-list")?.textContent).not.toContain("theatre");
    await user.click(within(drawer).getByRole("tab", { name: "按 Page 汇总 · 2" }));
    expect(within(drawer).getByText("按 Page 汇总")).toBeInTheDocument();
    expect(within(drawer).getByText("Page 1")).toBeInTheDocument();
    expect(within(drawer).getByText("Page 2")).toBeInTheDocument();

    const page1Summary = within(drawer).getByText("Page 1").closest("summary");
    await user.click(page1Summary!);
    await user.click(
      page1Summary!.parentElement!.querySelector(".wrong-page-practice-button") as HTMLElement,
    );
    expect(screen.getByLabelText("选择听写页码")).toHaveValue("jian21:1:1");
    expect(screen.getByRole("button", { name: "错题" })).toHaveClass("is-active");

    await user.click(screen.getByRole("button", { name: /错题本/ }));
    const reopenedDrawer = screen.getByRole("region", { name: "错题本" });

    await user.click(within(reopenedDrawer).getByRole("tab", { name: "当前词库全部 · 2" }));
    expect(within(reopenedDrawer).getAllByText("theatre").length).toBeGreaterThan(0);
    expect(within(reopenedDrawer).getAllByText("trees").length).toBeGreaterThan(0);
  });

  it("groups wrong words by every day they were answered incorrectly", async () => {
    const state = createDefaultState();
    state.wrongBook = {
      "jian21:1": {
        addedAt: "2026-07-27T01:00:00.000Z",
        wrongCount: 2,
        errorTimestamps: ["2026-07-27T01:00:00.000Z", "2026-07-28T02:00:00.000Z"],
      },
      "jian21:2": {
        addedAt: "2026-07-28T03:00:00.000Z",
        wrongCount: 1,
        errorTimestamps: ["2026-07-28T03:00:00.000Z"],
      },
    };
    saveState(state);

    const user = userEvent.setup();
    render(<App data={fixture} />);
    await user.click(screen.getByRole("button", { name: /错题本/ }));
    const wrongBook = screen.getByRole("region", { name: "错题本" });

    await user.click(within(wrongBook).getByRole("tab", { name: "按日期汇总 · 2" }));
    expect(within(wrongBook).getByText("按日期汇总")).toBeInTheDocument();
    expect(within(wrongBook).getByText("2026-07-28")).toBeInTheDocument();
    expect(within(wrongBook).getByText("2026-07-27")).toBeInTheDocument();
    expect(within(wrongBook).getByText("2 词 · 2 次")).toBeInTheDocument();

    const latestDay = within(wrongBook).getByText("2026-07-28").closest("summary");
    await user.click(latestDay!);
    expect(within(wrongBook).getAllByText("当日错误 1 次")).toHaveLength(3);
  });

  it("opens aggregate wrong-word practice from the wrong-book page", async () => {
    const state = createDefaultState();
    state.wrongBook = {
      "jian21:1": { addedAt: "2026-07-28T01:00:00.000Z", wrongCount: 1 },
      "jian21:2": { addedAt: "2026-07-28T02:00:00.000Z", wrongCount: 1 },
    };
    saveState(state);

    const user = userEvent.setup();
    render(<App data={fixture} />);
    await user.click(screen.getByRole("button", { name: /错题本/ }));
    const wrongBook = screen.getByRole("region", { name: "错题本" });
    await user.click(within(wrongBook).getByRole("button", { name: "练习汇总错题" }));

    expect(screen.getByLabelText("选择听写页码")).toHaveValue("all");
    expect(screen.getByRole("button", { name: "错题" })).toHaveClass("is-active");
    expect(screen.getByTestId("question-position")).toHaveTextContent("1 / 2");
  });

  it("reveals and plays wrong-word flashcards with space and navigates with arrows", async () => {
    const state = createDefaultState();
    state.wrongBook = {
      "jian21:1": { addedAt: "2026-07-28T01:00:00.000Z", wrongCount: 1 },
      "jian21:2": { addedAt: "2026-07-28T02:00:00.000Z", wrongCount: 1 },
    };
    saveState(state);

    const user = userEvent.setup();
    render(<App data={fixture} />);
    await user.click(screen.getByRole("button", { name: /错题本/ }));
    await user.click(screen.getByRole("button", { name: "刷错词卡" }));

    expect(screen.getByRole("heading", { name: "错词刷词" })).toBeInTheDocument();
    expect(screen.getByText("trees")).toBeInTheDocument();
    expect(screen.queryByText("树")).not.toBeInTheDocument();
    expect(screen.getByLabelText("错词刷词进度")).toHaveTextContent("1/2");

    const playsBeforeReveal = vi.mocked(HTMLMediaElement.prototype.play).mock.calls.length;
    await user.keyboard(" ");
    expect(screen.getByText("树")).toBeInTheDocument();
    await waitFor(() =>
      expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(playsBeforeReveal + 1),
    );

    await user.keyboard("{ArrowRight}");
    expect(screen.getByText("theatre")).toBeInTheDocument();
    expect(screen.queryByText("剧院")).not.toBeInTheDocument();
    expect(screen.getByLabelText("错词刷词进度")).toHaveTextContent("2/2");
  });

  it("manually saves a wrong-word flashcard to the key-word book with Shift or the star button", async () => {
    const state = createDefaultState();
    state.wrongBook = {
      "jian21:1": { addedAt: "2026-07-28T01:00:00.000Z", wrongCount: 1 },
      "jian21:2": { addedAt: "2026-07-28T02:00:00.000Z", wrongCount: 1 },
    };
    saveState(state);

    const user = userEvent.setup();
    render(<App data={fixture} />);
    await user.click(screen.getByRole("button", { name: /错题本/ }));
    await user.click(screen.getByRole("button", { name: "刷错词卡" }));

    await user.keyboard("{Shift}");
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem("sherry-dictation:v1") ?? "{}");
      expect(saved.starredWords["jian21:2"]).toBeTruthy();
    });

    await user.click(screen.getByRole("button", { name: "取消收藏 trees" }));
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem("sherry-dictation:v1") ?? "{}");
      expect(saved.starredWords["jian21:2"]).toBeUndefined();
    });

    await user.click(screen.getByRole("button", { name: "收藏 trees 到重点词本" }));
    await user.click(screen.getByRole("button", { name: "返回错题本" }));
    await user.click(screen.getByRole("tab", { name: "收藏词本 · 1" }));

    expect(screen.getByText("trees")).toBeInTheDocument();
    expect(screen.getByText("树")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "刷收藏词卡" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "听写收藏词" })).toBeEnabled();
  });

  it("keeps saved-word dictation progress separate from normal and wrong-word practice", async () => {
    const state = createDefaultState();
    state.practiceMode = "starred";
    state.starredWords = {
      "jian21:1": { addedAt: "2026-07-28T01:00:00.000Z" },
      "jian21:2": { addedAt: "2026-07-28T02:00:00.000Z" },
    };
    state.progress = {
      "jian21:1": {
        attempted: true,
        mastered: false,
        attempts: 1,
        firstAttemptCorrect: false,
        lastAnsweredAt: "2026-07-28T00:00:00.000Z",
      },
    };
    saveState(state);

    const user = userEvent.setup();
    render(<App data={fixture} />);
    const progress = screen.getByLabelText("收藏词听写进度");
    expect(progress).toHaveTextContent("0 / 2");

    await user.type(screen.getByLabelText("听写答案"), "theatre");
    await user.click(screen.getByRole("button", { name: "核对" }));

    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem("sherry-dictation:v1") ?? "{}");
      expect(saved.starredPracticeProgress["jian21:1"].mastered).toBe(true);
      expect(saved.progress["jian21:1"].attempts).toBe(1);
      expect(saved.wrongPracticeProgress["jian21:1"]).toBeUndefined();
    });
  });

  it("starts wrong-word flashcards from a selected word within the active scope", async () => {
    const state = createDefaultState();
    state.wrongBook = {
      "jian21:1": { addedAt: "2026-07-28T01:00:00.000Z", wrongCount: 1 },
      "jian21:2": { addedAt: "2026-07-28T02:00:00.000Z", wrongCount: 1 },
    };
    saveState(state);

    const user = userEvent.setup();
    render(<App data={fixture} />);
    await user.click(screen.getByRole("button", { name: /错题本/ }));
    await user.click(screen.getByRole("button", { name: "刷错词卡" }));

    const startSelect = screen.getByLabelText("选择错词起始词");
    await user.selectOptions(startSelect, "jian21:1");

    expect(screen.getByText("theatre")).toBeInTheDocument();
    expect(screen.queryByText("剧院")).not.toBeInTheDocument();
    expect(screen.getByLabelText("错词刷词进度")).toHaveTextContent("2/2");
  });

  it("filters wrong-word flashcards by error date and restores aggregate practice", async () => {
    const state = createDefaultState();
    state.wrongBook = {
      "jian21:1": {
        addedAt: "2026-07-27T01:00:00.000Z",
        wrongCount: 2,
        errorTimestamps: ["2026-07-27T01:00:00.000Z", "2026-07-28T02:00:00.000Z"],
      },
      "jian21:2": {
        addedAt: "2026-07-28T03:00:00.000Z",
        wrongCount: 1,
        errorTimestamps: ["2026-07-28T03:00:00.000Z"],
      },
    };
    saveState(state);

    const user = userEvent.setup();
    render(<App data={fixture} />);
    await user.click(screen.getByRole("button", { name: /错题本/ }));
    await user.click(screen.getByRole("button", { name: "刷错词卡" }));

    expect(screen.getByRole("button", { name: "汇总错词" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("错词刷词进度")).toHaveTextContent("1/2");

    await user.click(screen.getByRole("button", { name: "按日期刷词" }));
    const dateSelect = screen.getByLabelText("选择错词日期");
    expect(dateSelect).toHaveValue("2026-07-28");
    const startSelect = screen.getByLabelText("选择错词起始词");
    await user.selectOptions(startSelect, "jian21:1");
    expect(screen.getByText("theatre")).toBeInTheDocument();
    expect(screen.getByLabelText("错词刷词进度")).toHaveTextContent("2/2");

    await user.selectOptions(dateSelect, "2026-07-27");

    expect(screen.getByText("theatre")).toBeInTheDocument();
    expect(screen.getByLabelText("选择错词起始词")).toHaveValue("jian21:1");
    expect(screen.getByLabelText("错词刷词进度")).toHaveTextContent("1/1");

    await user.click(screen.getByRole("button", { name: "汇总错词" }));
    expect(screen.getByLabelText("错词刷词进度")).toHaveTextContent("1/2");
  });

  it("reveals a wrong-word flashcard on the first Enter and advances on the second", async () => {
    const state = createDefaultState();
    state.wrongBook = {
      "jian21:1": { addedAt: "2026-07-28T01:00:00.000Z", wrongCount: 1 },
      "jian21:2": { addedAt: "2026-07-28T02:00:00.000Z", wrongCount: 1 },
    };
    saveState(state);

    const user = userEvent.setup();
    render(<App data={fixture} />);
    await user.click(screen.getByRole("button", { name: /错题本/ }));
    await user.click(screen.getByRole("button", { name: "刷错词卡" }));

    await user.keyboard("{Enter}");
    expect(screen.getByText("trees")).toBeInTheDocument();
    expect(screen.getByText("树")).toBeInTheDocument();
    expect(screen.getByLabelText("错词刷词进度")).toHaveTextContent("1/2");

    await user.keyboard("{Enter}");
    expect(screen.getByText("theatre")).toBeInTheDocument();
    expect(screen.queryByText("剧院")).not.toBeInTheDocument();
    expect(screen.getByLabelText("错词刷词进度")).toHaveTextContent("2/2");
  });

  it("resets only the active collection and keeps the other collection progress", async () => {
    const state = createDefaultState();
    state.progress = {
      "jian21:1": {
        attempted: true,
        mastered: true,
        attempts: 1,
        firstAttemptCorrect: true,
        lastAnsweredAt: "2026-07-28T01:00:00.000Z",
      },
      "jijing_supplement:1": {
        attempted: true,
        mastered: false,
        attempts: 2,
        firstAttemptCorrect: false,
        lastAnsweredAt: "2026-07-28T02:00:00.000Z",
      },
    };
    state.wrongBook = {
      "jian21:1": { addedAt: "2026-07-28T01:00:00.000Z", wrongCount: 1 },
      "jijing_supplement:1": { addedAt: "2026-07-28T02:00:00.000Z", wrongCount: 1 },
    };
    state.positions = { "jian21:sequential": 1, "jijing_supplement:sequential": 0 };
    state.randomOrders = {
      jian21: ["jian21:1"],
      jijing_supplement: ["jijing_supplement:1"],
    };
    saveState(state);

    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    render(<App data={fixtureWithSupplement} />);
    await user.click(screen.getByRole("button", { name: "重置剑21进度" }));

    const saved = JSON.parse(localStorage.getItem("sherry-dictation:v1") ?? "{}");
    expect(confirm).toHaveBeenCalledWith("确定重置“剑21”词库的答题进度和错题吗？");
    expect(saved.progress["jian21:1"]).toBeUndefined();
    expect(saved.wrongBook["jian21:1"]).toBeUndefined();
    expect(saved.positions["jian21:sequential"]).toBeUndefined();
    expect(saved.randomOrders.jian21).toBeUndefined();
    expect(saved.progress["jijing_supplement:1"]).toBeTruthy();
    expect(saved.wrongBook["jijing_supplement:1"]).toBeTruthy();
    expect(saved.positions["jijing_supplement:sequential"]).toBe(0);
    expect(saved.randomOrders.jijing_supplement).toEqual(["jijing_supplement:1"]);
    confirm.mockRestore();
  });

  it("practises and resets the Xiahua collection without changing existing progress", async () => {
    const state = createDefaultState();
    state.progress["jian21:1"] = {
      attempted: true,
      mastered: true,
      attempts: 1,
      firstAttemptCorrect: true,
      lastAnsweredAt: "2026-07-30T01:00:00.000Z",
    };
    saveState(state);

    const user = userEvent.setup();
    render(<App data={fixtureWithXiahua} />);
    await user.click(screen.getByRole("button", { name: "虾滑P1/P4" }));
    await user.type(screen.getByLabelText("听写答案"), "dressler");
    await user.click(screen.getByRole("button", { name: "核对" }));

    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem("sherry-dictation:v1") ?? "{}");
      expect(saved.progress["xiahua_p1p4:1"].mastered).toBe(true);
      expect(saved.progress["jian21:1"].mastered).toBe(true);
    });

    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    await user.click(screen.getByRole("button", { name: "重置虾滑P1/P4进度" }));

    const saved = JSON.parse(localStorage.getItem("sherry-dictation:v1") ?? "{}");
    expect(confirm).toHaveBeenCalledWith("确定重置“虾滑P1/P4”词库的答题进度和错题吗？");
    expect(saved.progress["xiahua_p1p4:1"]).toBeUndefined();
    expect(saved.progress["jian21:1"].mastered).toBe(true);
    confirm.mockRestore();
  });

  it("does not reset progress when the confirmation is cancelled", async () => {
    const state = createDefaultState();
    state.progress = {
      "jian21:1": {
        attempted: true,
        mastered: true,
        attempts: 1,
        firstAttemptCorrect: true,
        lastAnsweredAt: "2026-07-28T01:00:00.000Z",
      },
    };
    saveState(state);
    vi.spyOn(window, "confirm").mockReturnValue(false);

    const user = userEvent.setup();
    render(<App data={fixture} />);
    await user.click(screen.getByRole("button", { name: "重置剑21进度" }));

    const saved = JSON.parse(localStorage.getItem("sherry-dictation:v1") ?? "{}");
    expect(saved.progress["jian21:1"]).toBeTruthy();
  });

  it("does not offer a reset action when viewing the aggregate collection", async () => {
    const state = createDefaultState();
    state.collectionScope = "all";
    state.progress = {
      "jian21:1": {
        attempted: true,
        mastered: true,
        attempts: 1,
        firstAttemptCorrect: true,
        lastAnsweredAt: "2026-07-28T01:00:00.000Z",
      },
      "jijing_supplement:1": {
        attempted: true,
        mastered: false,
        attempts: 1,
        firstAttemptCorrect: false,
        lastAnsweredAt: "2026-07-28T02:00:00.000Z",
      },
    };
    state.wrongBook = {
      "jian21:1": { addedAt: "2026-07-28T01:00:00.000Z", wrongCount: 1 },
      "jijing_supplement:1": { addedAt: "2026-07-28T02:00:00.000Z", wrongCount: 1 },
    };
    saveState(state);

    const user = userEvent.setup();
    render(<App data={fixtureWithSupplement} />);
    expect(screen.queryByRole("button", { name: "重置全部进度" })).not.toBeInTheDocument();
    expect(screen.queryByTitle("重置当前词库进度")).not.toBeInTheDocument();

    const saved = JSON.parse(localStorage.getItem("sherry-dictation:v1") ?? "{}");
    expect(saved.progress["jian21:1"]).toBeTruthy();
    expect(saved.progress["jijing_supplement:1"]).toBeTruthy();
    expect(saved.wrongBook["jian21:1"]).toBeTruthy();
    expect(saved.wrongBook["jijing_supplement:1"]).toBeTruthy();
  });
});
