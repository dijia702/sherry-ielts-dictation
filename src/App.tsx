import {
  BookOpen,
  BookMarked,
  Check,
  ChevronDown,
  Clock3,
  FileText,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Download,
  Eye,
  FileUp,
  ListOrdered,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  Shuffle,
  Star,
  Volume2,
  X,
} from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAudioSequence } from "./hooks/useAudioSequence";
import { useCloudSync } from "./hooks/useCloudSync";
import LibraryView from "./components/LibraryView";
import CloudSyncPanel from "./components/CloudSyncPanel";
import {
  ALL_PAGES,
  buildPageGroups,
  buildQueue,
  clampPosition,
  formatElapsed,
  isAnswerCorrect,
  queueKey,
  randomOrderKey,
  scopeQuestionIds,
  shuffleIds,
} from "./lib/quiz";
import {
  exportState,
  loadState,
  parseImportedState,
  saveState,
} from "./lib/storage";
import { fuzzySearchMatch } from "./lib/fuzzySearch";
import {
  getErrorTimestamps,
  latestWrongTimestamp,
  recordCorrectWrongPractice,
  recordWrongEvent,
  WRONG_BOOK_CORRECT_STREAK_TARGET,
} from "./lib/wrongBook";
import { exportWrongBookFile } from "./lib/wrongBookExport";
import type { ReportFormat } from "./lib/progressReport";
import type {
  CollectionScope,
  CollectionId,
  FeedbackState,
  PersistedState,
  PracticeMode,
  QuizData,
  QuizQuestion,
} from "./types";


interface AppProps {
  data: QuizData;
}

const COLLECTION_OPTIONS: Array<{ value: CollectionScope; label: string }> = [
  { value: "jian21", label: "剑21" },
  { value: "jijing_supplement", label: "补充机经" },
  { value: "xiahua_p1p4", label: "虾滑P1/P4" },
  { value: "all", label: "全部" },
];

const COLLECTION_SHORT_LABELS: Record<CollectionId, string> = {
  jian21: "剑21",
  jijing_supplement: "补充机经",
  xiahua_p1p4: "虾滑P1/P4",
};

function collectionShortLabel(collectionId: CollectionId): string {
  return COLLECTION_SHORT_LABELS[collectionId];
}

const MODE_OPTIONS: Array<{
  value: PracticeMode;
  label: string;
  icon: typeof ListOrdered;
}> = [
  { value: "sequential", label: "顺序", icon: ListOrdered },
  { value: "random", label: "随机", icon: Shuffle },
  { value: "wrong", label: "错题", icon: BookMarked },
  { value: "starred", label: "收藏", icon: Star },
];

function nowIso(): string {
  return new Date().toISOString();
}

const WRONG_TIME_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function formatWrongTime(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? "时间未知" : WRONG_TIME_FORMATTER.format(date);
}

function collectionLabel(data: QuizData, question: QuizQuestion): string {
  return data.collections.find((collection) => collection.id === question.collectionId)?.label ?? "词表";
}

function ElapsedClock({
  initialSeconds,
  onChange,
}: {
  initialSeconds: number;
  onChange: (seconds: number) => void;
}) {
  const [elapsedSeconds, setElapsedSeconds] = useState(initialSeconds);

  useEffect(() => {
    onChange(elapsedSeconds);
  }, [elapsedSeconds, onChange]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setElapsedSeconds((seconds) => seconds + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  return <dd>{formatElapsed(elapsedSeconds)}</dd>;
}

export default function App({ data }: AppProps) {
  const [activeView, setActiveView] = useState<
    "practice" | "library" | "wrong" | "wrong-flashcards"
  >("practice");
  const [persisted, setPersisted] = useState<PersistedState>(() => loadState());
  const cloudSync = useCloudSync(persisted, setPersisted);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<FeedbackState>({ type: "idle" });
  const [wrongDrawerOpen, setWrongDrawerOpen] = useState(false);
  const [wrongBookExportOpen, setWrongBookExportOpen] = useState(false);
  const [wrongView, setWrongView] = useState<"current" | "all" | "pages" | "dates" | "starred">("all");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reportExportOpen, setReportExportOpen] = useState(false);
  const [wrongSearch, setWrongSearch] = useState("");
  const [flashcardIndex, setFlashcardIndex] = useState(0);
  const [flashcardRevealed, setFlashcardRevealed] = useState(false);
  const [flashcardBook, setFlashcardBook] = useState<"wrong" | "starred">("wrong");
  const [flashcardScope, setFlashcardScope] = useState<"all" | "date">("all");
  const [flashcardDate, setFlashcardDate] = useState("");
  const [navigationDirection, setNavigationDirection] = useState<"forward" | "backward" | null>(null);
  const [pageAdvanceRequested, setPageAdvanceRequested] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const lastAnswerSpaceAtRef = useRef(0);
  const elapsedSecondsRef = useRef(persisted.elapsedSeconds ?? 0);
  const elapsedPageKeyRef = useRef("");
  const persistedRef = useRef(persisted);
  const [elapsedClockVersion, setElapsedClockVersion] = useState(0);
  persistedRef.current = persisted;

  const questionMap = useMemo(
    () => new Map(data.questions.map((question) => [question.id, question])),
    [data.questions],
  );

  const pageGroups = useMemo(
    () => buildPageGroups(data.questions, persisted.collectionScope),
    [data.questions, persisted.collectionScope],
  );
  const storedPageSelection = persisted.pageSelections?.[persisted.collectionScope] ?? ALL_PAGES;
  const pageSelection =
    storedPageSelection === ALL_PAGES || pageGroups.some((group) => group.key === storedPageSelection)
      ? storedPageSelection
      : ALL_PAGES;
  const elapsedPageKey = `${persisted.collectionScope}:${pageSelection}`;

  const scopeIds = useMemo(
    () => scopeQuestionIds(data.questions, persisted.collectionScope, pageSelection),
    [data.questions, pageSelection, persisted.collectionScope],
  );
  const queue = useMemo(
    () =>
      buildQueue(
        data.questions,
        persisted.collectionScope,
        persisted.practiceMode,
        persisted,
        pageSelection,
      ),
    [data.questions, pageSelection, persisted],
  );
  const currentQueueKey = queueKey(
    persisted.collectionScope,
    persisted.practiceMode,
    pageSelection,
  );
  const position = clampPosition(persisted.positions[currentQueueKey] ?? 0, queue.length);
  const currentQuestion = questionMap.get(queue[position]);

  const { isPlaying, activeAccent, play, stop } = useAudioSequence(
    persisted.settings.playbackRate,
  );

  const openLibrary = useCallback(() => {
    stop();
    setActiveView("library");
  }, [stop]);

  const returnToPractice = useCallback(() => {
    setActiveView("practice");
    window.requestAnimationFrame(() => inputRef.current?.focus());
    if (currentQuestion) void play(currentQuestion);
  }, [currentQuestion, play]);

  const recordElapsedSeconds = useCallback((seconds: number) => {
    elapsedSecondsRef.current = seconds;
  }, []);

  useEffect(() => {
    elapsedSecondsRef.current = persisted.elapsedSecondsByPage?.[elapsedPageKey] ?? 0;
    elapsedPageKeyRef.current = elapsedPageKey;
    setElapsedClockVersion((version) => version + 1);
  }, [elapsedPageKey]);

  useEffect(() => {
    saveState({
      ...persisted,
      elapsedSeconds: elapsedSecondsRef.current,
      elapsedSecondsByPage: {
        ...(persisted.elapsedSecondsByPage ?? {}),
        [elapsedPageKey]: elapsedSecondsRef.current,
      },
    });
  }, [elapsedPageKey, persisted]);

  useEffect(() => {
    const saveLatestElapsed = () => {
      saveState({
        ...persistedRef.current,
        elapsedSeconds: elapsedSecondsRef.current,
        elapsedSecondsByPage: {
          ...(persistedRef.current.elapsedSecondsByPage ?? {}),
          [elapsedPageKeyRef.current]: elapsedSecondsRef.current,
        },
      });
    };
    const saveWhenHidden = () => {
      if (document.visibilityState === "hidden") saveLatestElapsed();
    };

    window.addEventListener("pagehide", saveLatestElapsed);
    document.addEventListener("visibilitychange", saveWhenHidden);
    return () => {
      window.removeEventListener("pagehide", saveLatestElapsed);
      document.removeEventListener("visibilitychange", saveWhenHidden);
    };
  }, []);

  useEffect(() => {
    stop();
    setAnswer("");
    setFeedback({ type: "idle" });
    window.requestAnimationFrame(() => inputRef.current?.focus());
    if (currentQuestion) {
      void play(currentQuestion);
    }
  }, [currentQuestion?.id, play, stop]);

  const updatePosition = useCallback(
    (nextPosition: number) => {
      setPersisted((state) => ({
        ...state,
        positions: {
          ...state.positions,
          [currentQueueKey]: clampPosition(nextPosition, queue.length),
        },
      }));
    },
    [currentQueueKey, queue.length],
  );

  const markSkippedIfNeeded = useCallback(() => {
    if (!currentQuestion) return;
    const occurredAt = nowIso();
    setPersisted((state) => {
      const isWrongPractice = state.practiceMode === "wrong";
      const isStarredPractice = state.practiceMode === "starred";
      const progressRecords = isWrongPractice
        ? (state.wrongPracticeProgress ?? {})
        : isStarredPractice
          ? (state.starredPracticeProgress ?? {})
          : state.progress;
      const existing = progressRecords[currentQuestion.id];
      const { [currentQuestion.id]: _clearedWrongPractice, ...remainingWrongPracticeProgress } =
        state.wrongPracticeProgress ?? {};
      return {
        ...state,
        ...(isWrongPractice
          ? {
              wrongPracticeProgress: {
                ...progressRecords,
                [currentQuestion.id]: {
                  attempted: true,
                  mastered: false,
                  attempts: existing?.attempts ?? 0,
                  firstAttemptCorrect: existing?.firstAttemptCorrect ?? null,
                  lastAnsweredAt: nowIso(),
                },
              },
            }
          : isStarredPractice
            ? {
                starredPracticeProgress: {
                  ...progressRecords,
                  [currentQuestion.id]: {
                    attempted: true,
                    mastered: false,
                    attempts: existing?.attempts ?? 0,
                    firstAttemptCorrect: existing?.firstAttemptCorrect ?? null,
                    lastAnsweredAt: nowIso(),
                  },
                },
              }
          : {
              progress: {
                ...state.progress,
                [currentQuestion.id]: {
                  attempted: true,
                  mastered: false,
                  attempts: existing?.attempts ?? 0,
                  firstAttemptCorrect: existing?.firstAttemptCorrect ?? null,
                  lastAnsweredAt: nowIso(),
                },
              },
              wrongPracticeProgress: remainingWrongPracticeProgress,
            }),
        wrongBook: {
          ...state.wrongBook,
          [currentQuestion.id]: recordWrongEvent(
            state.wrongBook[currentQuestion.id],
            occurredAt,
          ),
        },
      };
    });
  }, [currentQuestion]);

  const goPrevious = useCallback(() => {
    if (position <= 0) return;
    setNavigationDirection("backward");
    updatePosition(position - 1);
  }, [position, updatePosition]);

  const goNext = useCallback(
    (markSkip = true) => {
      if (!currentQuestion) return;
      if (markSkip && feedback.type === "idle") markSkippedIfNeeded();
      if (position >= queue.length - 1) {
        if (pageSelection !== ALL_PAGES && feedback.type !== "idle") {
          setPageAdvanceRequested(true);
        }
        return;
      }
      setNavigationDirection("forward");
      updatePosition(position + 1);
    }, [
      currentQuestion,
      feedback.type,
      markSkippedIfNeeded,
      pageSelection,
      position,
      queue.length,
      updatePosition,
    ],
  );

  const submitAnswer = useCallback(
    (event?: FormEvent) => {
      event?.preventDefault();
      if (feedback.type !== "idle") {
        goNext(false);
        return;
      }
      if (!currentQuestion || !answer.trim()) return;
      const correct = isAnswerCorrect(answer, currentQuestion.acceptedAnswers);
      const answeredAt = nowIso();
      const existingWrongEntry = persisted.wrongBook[currentQuestion.id];
      const nextCorrectStreak = existingWrongEntry
        ? (existingWrongEntry.correctStreak ?? 0) + 1
        : 0;
      const completesWrongPractice =
        correct &&
        persisted.practiceMode === "wrong" &&
        Boolean(existingWrongEntry) &&
        nextCorrectStreak >= WRONG_BOOK_CORRECT_STREAK_TARGET;

      setPersisted((state) => {
        const isWrongPractice = state.practiceMode === "wrong";
        const isStarredPractice = state.practiceMode === "starred";
        const progressRecords = isWrongPractice
          ? (state.wrongPracticeProgress ?? {})
          : isStarredPractice
            ? (state.starredPracticeProgress ?? {})
            : state.progress;
        const existing = progressRecords[currentQuestion.id];
        const baseProgress = {
          attempted: true,
          attempts: (existing?.attempts ?? 0) + 1,
          firstAttemptCorrect: existing?.firstAttemptCorrect ?? correct,
          lastAnsweredAt: answeredAt,
        };

        if (correct) {
          const wrongEntry = state.wrongBook[currentQuestion.id];
          const shouldTrackStreak = state.practiceMode === "wrong" && Boolean(wrongEntry);
          const nextWrongBook = shouldTrackStreak
            ? (() => {
                const updatedEntry = recordCorrectWrongPractice(wrongEntry!);
                if (updatedEntry.correctStreak! >= WRONG_BOOK_CORRECT_STREAK_TARGET) {
                  const { [currentQuestion.id]: _removed, ...remainingWrongBook } = state.wrongBook;
                  return remainingWrongBook;
                }
                return { ...state.wrongBook, [currentQuestion.id]: updatedEntry };
              })()
            : state.wrongBook;
          return {
            ...state,
            ...(isWrongPractice
              ? {
                  wrongPracticeProgress: {
                    ...progressRecords,
                    [currentQuestion.id]: { ...baseProgress, mastered: true },
                  },
                }
              : isStarredPractice
                ? {
                    starredPracticeProgress: {
                      ...progressRecords,
                      [currentQuestion.id]: { ...baseProgress, mastered: true },
                    },
                  }
              : {
                  progress: {
                    ...state.progress,
                    [currentQuestion.id]: { ...baseProgress, mastered: true },
                  },
                }),
            wrongBook: nextWrongBook,
          };
        }

        const wrongEntry = state.wrongBook[currentQuestion.id];
        const { [currentQuestion.id]: _clearedWrongPractice, ...remainingWrongPracticeProgress } =
          state.wrongPracticeProgress ?? {};
        return {
          ...state,
          ...(isWrongPractice
            ? {
                wrongPracticeProgress: {
                  ...progressRecords,
                  [currentQuestion.id]: { ...baseProgress, mastered: false },
                },
              }
            : isStarredPractice
              ? {
                  starredPracticeProgress: {
                    ...progressRecords,
                    [currentQuestion.id]: { ...baseProgress, mastered: false },
                  },
                }
            : {
                progress: {
                  ...state.progress,
                  [currentQuestion.id]: { ...baseProgress, mastered: false },
                },
                wrongPracticeProgress: remainingWrongPracticeProgress,
              }),
          wrongBook: {
            ...state.wrongBook,
            [currentQuestion.id]: recordWrongEvent(wrongEntry, answeredAt),
          },
        };
      });

      if (correct) {
        setFeedback({
          type: "correct",
          message: completesWrongPractice
            ? "连续答对 3 次，已移出错题本"
            : persisted.practiceMode === "wrong" && existingWrongEntry
              ? `拼写正确，连续答对 ${nextCorrectStreak}/${WRONG_BOOK_CORRECT_STREAK_TARGET}`
              : "拼写正确",
        });
      } else {
        setFeedback({ type: "wrong", message: "拼写不正确，再试一次" });
        window.requestAnimationFrame(() => {
          inputRef.current?.focus();
          inputRef.current?.select();
        });
      }
    },
    [answer, currentQuestion, feedback.type, goNext],
  );

  const retryCurrent = useCallback(() => {
    setAnswer("");
    setFeedback({ type: "idle" });
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const revealAnswer = useCallback(() => {
    if (!currentQuestion || feedback.type !== "idle") return;
    markSkippedIfNeeded();
    setFeedback({ type: "revealed", message: "已显示答案" });
  }, [currentQuestion, feedback.type, markSkippedIfNeeded]);

  const addCurrentToWrongBook = useCallback(() => {
    if (!currentQuestion) return;
    markSkippedIfNeeded();
    setFeedback({ type: "wrong", message: "已加入错题本" });
  }, [currentQuestion, markSkippedIfNeeded]);

  const switchScope = useCallback(
    (scope: CollectionScope) => {
      setNavigationDirection("forward");
      setPersisted((state) => {
        const currentElapsed = elapsedSecondsRef.current;
        const storedSelection = state.pageSelections?.[scope] ?? ALL_PAGES;
        const targetSelection =
          storedSelection === ALL_PAGES ||
          buildPageGroups(data.questions, scope).some((group) => group.key === storedSelection)
            ? storedSelection
            : ALL_PAGES;
        const orderKey = randomOrderKey(scope, targetSelection);
        const targetElapsedKey = `${scope}:${targetSelection}`;
        const nextPageSelections = { ...state.pageSelections, [scope]: targetSelection };
        if (state.practiceMode !== "random" || state.randomOrders[orderKey]) {
          return {
            ...state,
            collectionScope: scope,
            pageSelections: nextPageSelections,
            elapsedSecondsByPage: {
              ...(state.elapsedSecondsByPage ?? {}),
              [elapsedPageKey]: currentElapsed,
              ...(scope !== state.collectionScope ? { [targetElapsedKey]: 0 } : {}),
            },
          };
        }
        return {
          ...state,
          collectionScope: scope,
          pageSelections: nextPageSelections,
          elapsedSecondsByPage: {
            ...(state.elapsedSecondsByPage ?? {}),
            [elapsedPageKey]: currentElapsed,
            ...(scope !== state.collectionScope ? { [targetElapsedKey]: 0 } : {}),
          },
          randomOrders: {
            ...state.randomOrders,
            [orderKey]: shuffleIds(scopeQuestionIds(data.questions, scope, targetSelection)),
          },
        };
      });
    },
    [data.questions, elapsedPageKey],
  );

  const switchPage = useCallback(
    (selection: string) => {
      setNavigationDirection("forward");
      setPersisted((state) => {
        const orderKey = randomOrderKey(state.collectionScope, selection);
        const currentElapsed = elapsedSecondsRef.current;
        const targetElapsedKey = `${state.collectionScope}:${selection}`;
        const nextState: PersistedState = {
          ...state,
          pageSelections: {
            ...state.pageSelections,
            [state.collectionScope]: selection,
          },
          elapsedSecondsByPage: {
            ...(state.elapsedSecondsByPage ?? {}),
            [elapsedPageKey]: currentElapsed,
            ...(selection !== pageSelection ? { [targetElapsedKey]: 0 } : {}),
          },
        };
        if (state.practiceMode === "random" && !state.randomOrders[orderKey]) {
          nextState.randomOrders = {
            ...state.randomOrders,
            [orderKey]: shuffleIds(
              scopeQuestionIds(data.questions, state.collectionScope, selection),
            ),
          };
        }
        return nextState;
      });
    },
    [data.questions, elapsedPageKey],
  );

  const switchAdjacentPage = useCallback(
    (direction: "previous" | "next") => {
      if (pageSelection === ALL_PAGES) return false;
      const currentIndex = pageGroups.findIndex((group) => group.key === pageSelection);
      if (currentIndex < 0) return false;
      const targetIndex = direction === "next" ? currentIndex + 1 : currentIndex - 1;
      const targetPage = pageGroups[targetIndex];
      if (!targetPage) return false;
      switchPage(targetPage.key);
      return true;
    },
    [pageGroups, pageSelection, switchPage],
  );

  useEffect(() => {
    if (!pageAdvanceRequested) return;
    setPageAdvanceRequested(false);
    switchAdjacentPage("next");
  }, [pageAdvanceRequested, switchAdjacentPage]);

  useEffect(() => {
    if (activeView !== "practice" || settingsOpen || wrongDrawerOpen) return;
    const handleNavigationKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key !== " ") lastAnswerSpaceAtRef.current = 0;
      if (event.target instanceof HTMLSelectElement) return;
      if (event.key === " ") {
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
          const input = event.target;
          const selectionStart = input.selectionStart ?? input.value.length;
          const selectionEnd = input.selectionEnd ?? selectionStart;
          const isDoubleSpace = Date.now() - lastAnswerSpaceAtRef.current < 450;

          event.preventDefault();
          if (isDoubleSpace) {
            lastAnswerSpaceAtRef.current = 0;
            const nextAnswer = `${input.value.slice(0, selectionStart)} ${input.value.slice(selectionEnd)}`;
            setAnswer(nextAnswer);
            window.requestAnimationFrame(() => input.setSelectionRange(selectionStart + 1, selectionStart + 1));
            return;
          }

          lastAnswerSpaceAtRef.current = Date.now();
          if (currentQuestion) void play(currentQuestion);
          return;
        }

        event.preventDefault();
        if (currentQuestion) void play(currentQuestion);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        if (pageSelection !== ALL_PAGES && position <= 0) {
          switchAdjacentPage("previous");
        } else {
          goPrevious();
        }
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goNext(true);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        if (
          pageSelection !== ALL_PAGES &&
          position >= queue.length - 1 &&
          feedback.type !== "idle"
        ) {
          switchAdjacentPage("next");
        } else {
          revealAnswer();
        }
      }
    };
    window.addEventListener("keydown", handleNavigationKey);
    return () => window.removeEventListener("keydown", handleNavigationKey);
  }, [
    activeView,
    currentQuestion,
    feedback.type,
    goNext,
    goPrevious,
    pageSelection,
    position,
    play,
    setPageAdvanceRequested,
    queue.length,
    revealAnswer,
    settingsOpen,
    switchAdjacentPage,
    wrongDrawerOpen,
  ]);

  const switchMode = useCallback(
    (mode: PracticeMode) => {
      setNavigationDirection("forward");
      setPersisted((state) => {
        const orderKey = randomOrderKey(state.collectionScope, pageSelection);
        const next = {
          ...state,
          practiceMode: mode,
          pageSelections: { ...state.pageSelections, [state.collectionScope]: pageSelection },
        };
        if (mode === "random" && !state.randomOrders[orderKey]) {
          next.randomOrders = {
            ...state.randomOrders,
            [orderKey]: shuffleIds(
              scopeQuestionIds(data.questions, state.collectionScope, pageSelection),
            ),
          };
        }
        return next;
      });
    },
    [data.questions, pageSelection],
  );

  const reshuffle = useCallback(() => {
    setNavigationDirection("forward");
    setPersisted((state) => {
      return {
        ...state,
        pageSelections: { ...state.pageSelections, [state.collectionScope]: pageSelection },
        randomOrders: {
          ...state.randomOrders,
          [randomOrderKey(state.collectionScope, pageSelection)]: shuffleIds(
            scopeQuestionIds(data.questions, state.collectionScope, pageSelection),
          ),
        },
        positions: {
          ...state.positions,
          [queueKey(state.collectionScope, "random", pageSelection)]: 0,
        },
      };
    });
  }, [data.questions, pageSelection]);

  const isScopedPracticeMode =
    persisted.practiceMode === "wrong" || persisted.practiceMode === "starred";
  const progressQuestionIds = isScopedPracticeMode ? queue : scopeIds;
  const activeProgressRecords =
    persisted.practiceMode === "wrong"
      ? (persisted.wrongPracticeProgress ?? {})
      : persisted.practiceMode === "starred"
        ? (persisted.starredPracticeProgress ?? {})
      : persisted.progress;
  const scopedProgress = useMemo(
    () => progressQuestionIds.map((id) => activeProgressRecords[id]).filter(Boolean),
    [activeProgressRecords, progressQuestionIds],
  );
  const attemptedCount = scopedProgress.filter((item) => item.attempted).length;
  const masteredCount = scopedProgress.filter((item) => item.mastered).length;
  const firstAttempts = scopedProgress.filter((item) => item.firstAttemptCorrect !== null);
  const firstCorrect = firstAttempts.filter((item) => item.firstAttemptCorrect).length;
  const accuracy = firstAttempts.length ? Math.round((firstCorrect / firstAttempts.length) * 100) : 0;
  const wrongCount = scopeIds.filter((id) => Boolean(persisted.wrongBook[id])).length;
  const answeredPercent = progressQuestionIds.length
    ? (attemptedCount / progressQuestionIds.length) * 100
    : 0;
  const remainingCount = Math.max(progressQuestionIds.length - attemptedCount, 0);

  const allWrongQuestions = useMemo(
    () => {
      const matches = data.questions.filter((question) => {
        if (!persisted.wrongBook[question.id]) return false;
        return fuzzySearchMatch(wrongSearch, [
          question.canonicalAnswer,
          question.sourceHeadword,
          ...question.acceptedAnswers,
          question.partOfSpeech,
          question.meaningZh,
        ]);
      });
      return matches.sort(
        (left, right) =>
          Date.parse(latestWrongTimestamp(persisted.wrongBook[right.id])) -
          Date.parse(latestWrongTimestamp(persisted.wrongBook[left.id])),
      );
    },
    [data.questions, persisted.wrongBook, wrongSearch],
  );

  const currentWrongQuestions = useMemo(() => {
    const currentIds = new Set(scopeIds);
    return allWrongQuestions
      .filter(
        (question) =>
          persisted.collectionScope === "all" ||
          question.collectionId === persisted.collectionScope,
      )
      .filter((question) => currentIds.has(question.id));
  }, [allWrongQuestions, persisted.collectionScope, scopeIds]);

  const collectionWrongQuestions = useMemo(
    () =>
      allWrongQuestions.filter(
        (question) =>
          persisted.collectionScope === "all" ||
          question.collectionId === persisted.collectionScope,
      ),
    [allWrongQuestions, persisted.collectionScope],
  );

  const collectionStarredQuestions = useMemo(() => {
    const starredWords = persisted.starredWords ?? {};
    return data.questions
      .filter(
        (question) =>
          Boolean(starredWords[question.id]) &&
          (persisted.collectionScope === "all" || question.collectionId === persisted.collectionScope) &&
          fuzzySearchMatch(wrongSearch, [
            question.canonicalAnswer,
            question.sourceHeadword,
            ...question.acceptedAnswers,
            question.partOfSpeech,
            question.meaningZh,
          ]),
      )
      .sort(
        (left, right) =>
          Date.parse(starredWords[right.id].addedAt) - Date.parse(starredWords[left.id].addedAt),
      );
  }, [data.questions, persisted.collectionScope, persisted.starredWords, wrongSearch]);

  const collectionWrongQuestionsForFlashcards = useMemo(() => {
    const wrongQuestions = data.questions.filter(
      (question) =>
        Boolean(persisted.wrongBook[question.id]) &&
        (persisted.collectionScope === "all" ||
          question.collectionId === persisted.collectionScope),
    );
    return wrongQuestions.sort(
      (left, right) =>
        Date.parse(latestWrongTimestamp(persisted.wrongBook[right.id])) -
        Date.parse(latestWrongTimestamp(persisted.wrongBook[left.id])),
    );
  }, [data.questions, persisted.collectionScope, persisted.wrongBook]);

  const collectionStarredQuestionsForFlashcards = useMemo(() => {
    const starredWords = persisted.starredWords ?? {};
    return data.questions
      .filter(
        (question) =>
          Boolean(starredWords[question.id]) &&
          (persisted.collectionScope === "all" || question.collectionId === persisted.collectionScope),
      )
      .sort(
        (left, right) =>
          Date.parse(starredWords[right.id].addedAt) - Date.parse(starredWords[left.id].addedAt),
      );
  }, [data.questions, persisted.collectionScope, persisted.starredWords]);

  const flashcardDateSummaries = useMemo(() => {
    const byDate = new Map<
      string,
      Array<{ question: QuizQuestion; latestTimestamp: string }>
    >();
    for (const question of collectionWrongQuestionsForFlashcards) {
      const timestampsByDate = new Map<string, string[]>();
      for (const timestamp of getErrorTimestamps(persisted.wrongBook[question.id])) {
        const date = new Date(timestamp);
        if (Number.isNaN(date.getTime())) continue;
        const dateKey = [
          date.getFullYear(),
          String(date.getMonth() + 1).padStart(2, "0"),
          String(date.getDate()).padStart(2, "0"),
        ].join("-");
        const timestamps = timestampsByDate.get(dateKey) ?? [];
        timestamps.push(timestamp);
        timestampsByDate.set(dateKey, timestamps);
      }
      for (const [date, timestamps] of timestampsByDate) {
        const questions = byDate.get(date) ?? [];
        questions.push({ question, latestTimestamp: timestamps.at(-1) ?? timestamps[0] });
        byDate.set(date, questions);
      }
    }
    return [...byDate.entries()]
      .map(([date, questions]) => ({
        date,
        questions: questions.sort(
          (left, right) => Date.parse(right.latestTimestamp) - Date.parse(left.latestTimestamp),
        ),
      }))
      .sort((left, right) => right.date.localeCompare(left.date));
  }, [collectionWrongQuestionsForFlashcards, persisted.wrongBook]);

  const selectedFlashcardDate =
    flashcardDateSummaries.some((summary) => summary.date === flashcardDate)
      ? flashcardDate
      : (flashcardDateSummaries[0]?.date ?? "");
  const wrongQuestionsForFlashcards = useMemo(() => {
    if (flashcardScope === "all") return collectionWrongQuestionsForFlashcards;
    return (
      flashcardDateSummaries.find((summary) => summary.date === selectedFlashcardDate)?.questions.map(
        ({ question }) => question,
      ) ?? []
    );
  }, [collectionWrongQuestionsForFlashcards, flashcardDateSummaries, flashcardScope, selectedFlashcardDate]);

  const flashcardQuestions =
    flashcardBook === "wrong"
      ? wrongQuestionsForFlashcards
      : collectionStarredQuestionsForFlashcards;

  const flashcardQuestion = flashcardQuestions[flashcardIndex];
  const flashcardIsStarred = Boolean(
    flashcardQuestion && persisted.starredWords?.[flashcardQuestion.id],
  );

  const wrongPageSummaries = useMemo(
    () =>
      pageGroups
        .map((group) => {
          const questions = group.questions.filter((question) => {
            if (!persisted.wrongBook[question.id]) return false;
            return fuzzySearchMatch(wrongSearch, [
              question.canonicalAnswer,
              question.sourceHeadword,
              ...question.acceptedAnswers,
              question.partOfSpeech,
              question.meaningZh,
            ]);
          });
          return { group, questions };
        })
        .filter(({ questions }) => questions.length > 0),
    [pageGroups, persisted.wrongBook, wrongSearch],
  );

  const wrongDateSummaries = useMemo(() => {
    const byDate = new Map<
      string,
      Array<{ question: QuizQuestion; errorCount: number; latestTimestamp: string }>
    >();
    for (const question of collectionWrongQuestions) {
      const timestampsByDate = new Map<string, string[]>();
      for (const timestamp of getErrorTimestamps(persisted.wrongBook[question.id])) {
        const date = new Date(timestamp);
        if (Number.isNaN(date.getTime())) continue;
        const dateKey = [
          date.getFullYear(),
          String(date.getMonth() + 1).padStart(2, "0"),
          String(date.getDate()).padStart(2, "0"),
        ].join("-");
        const timestamps = timestampsByDate.get(dateKey) ?? [];
        timestamps.push(timestamp);
        timestampsByDate.set(dateKey, timestamps);
      }
      for (const [date, timestamps] of timestampsByDate) {
        const questions = byDate.get(date) ?? [];
        questions.push({
          question,
          errorCount: timestamps.length,
          latestTimestamp: timestamps.at(-1) ?? timestamps[0],
        });
        byDate.set(date, questions);
      }
    }
    return [...byDate.entries()]
      .map(([date, questions]) => ({
        date,
        questions: questions.sort(
          (left, right) => Date.parse(right.latestTimestamp) - Date.parse(left.latestTimestamp),
        ),
      }))
      .sort((left, right) => right.date.localeCompare(left.date));
  }, [collectionWrongQuestions, persisted.wrongBook]);

  const displayedWrongQuestions =
    wrongView === "current" ? currentWrongQuestions : collectionWrongQuestions;
  const pageSummaryQuestionCount = wrongPageSummaries.reduce(
    (total, summary) => total + summary.questions.length,
    0,
  );
  const dateSummaryQuestionCount = wrongDateSummaries.reduce(
    (total, summary) => total + summary.questions.length,
    0,
  );

  const toggleStarredWord = useCallback((questionId: string) => {
    setPersisted((state) => {
      const starredWords = state.starredWords ?? {};
      if (starredWords[questionId]) {
        const { [questionId]: _removed, ...remainingStarredWords } = starredWords;
        return { ...state, starredWords: remainingStarredWords };
      }
      return {
        ...state,
        starredWords: { ...starredWords, [questionId]: { addedAt: nowIso() } },
      };
    });
  }, []);

  const practiceWrongCollection = useCallback(() => {
    const scope = persisted.collectionScope;
    setPersisted((state) => ({
      ...state,
      pageSelections: { ...state.pageSelections, [scope]: ALL_PAGES },
      practiceMode: "wrong",
      positions: { ...state.positions, [queueKey(scope, "wrong", ALL_PAGES)]: 0 },
    }));
    setActiveView("practice");
  }, [persisted.collectionScope]);

  const practiceWrongPage = useCallback(
    (selection: string) => {
      const scope = persisted.collectionScope;
      setPersisted((state) => ({
        ...state,
        pageSelections: { ...state.pageSelections, [scope]: selection },
        practiceMode: "wrong",
        positions: { ...state.positions, [queueKey(scope, "wrong", selection)]: 0 },
      }));
      setActiveView("practice");
    },
    [persisted.collectionScope],
  );

  const practiceStarredCollection = useCallback(() => {
    const scope = persisted.collectionScope;
    setPersisted((state) => ({
      ...state,
      pageSelections: { ...state.pageSelections, [scope]: ALL_PAGES },
      practiceMode: "starred",
      positions: { ...state.positions, [queueKey(scope, "starred", ALL_PAGES)]: 0 },
    }));
    setActiveView("practice");
  }, [persisted.collectionScope]);

  const practiceStarredQuestion = useCallback(
    (questionId: string) => {
      const targetScope = persisted.collectionScope;
      const starredIds = data.questions
        .filter(
          (question) =>
            Boolean(persisted.starredWords?.[question.id]) &&
            (targetScope === "all" || question.collectionId === targetScope),
        )
        .map((question) => question.id);
      const targetPosition = Math.max(starredIds.indexOf(questionId), 0);
      setPersisted((state) => ({
        ...state,
        pageSelections: { ...state.pageSelections, [targetScope]: ALL_PAGES },
        practiceMode: "starred",
        positions: {
          ...state.positions,
          [queueKey(targetScope, "starred", ALL_PAGES)]: targetPosition,
        },
      }));
      setActiveView("practice");
    },
    [data.questions, persisted.collectionScope, persisted.starredWords],
  );

  const openWrongBook = useCallback(() => {
    setWrongView(pageSelection === ALL_PAGES ? "all" : "current");
    setWrongDrawerOpen(false);
    setActiveView("wrong");
  }, [pageSelection]);

  const openWrongFlashcards = useCallback(() => {
    setFlashcardBook("wrong");
    setFlashcardScope("all");
    setFlashcardIndex(0);
    setFlashcardRevealed(false);
    setActiveView("wrong-flashcards");
  }, []);

  const openStarredFlashcards = useCallback(() => {
    setFlashcardBook("starred");
    setFlashcardIndex(0);
    setFlashcardRevealed(false);
    setActiveView("wrong-flashcards");
  }, []);

  const selectFlashcardScope = useCallback(
    (scope: "all" | "date") => {
      setFlashcardScope(scope);
      if (scope === "date") {
        setFlashcardDate((current) =>
          flashcardDateSummaries.some((summary) => summary.date === current)
            ? current
            : (flashcardDateSummaries[0]?.date ?? ""),
        );
      }
      setFlashcardIndex(0);
      setFlashcardRevealed(false);
    },
    [flashcardDateSummaries],
  );

  const selectFlashcardDate = useCallback((date: string) => {
    setFlashcardDate(date);
    setFlashcardIndex(0);
    setFlashcardRevealed(false);
  }, []);

  const selectFlashcardStart = useCallback(
    (questionId: string) => {
      const index = flashcardQuestions.findIndex((question) => question.id === questionId);
      if (index >= 0) {
        setFlashcardIndex(index);
        setFlashcardRevealed(false);
      }
    },
    [flashcardQuestions],
  );

  const moveFlashcard = useCallback(
    (direction: "previous" | "next") => {
      setFlashcardIndex((index) => {
        const nextIndex = direction === "next" ? index + 1 : index - 1;
        return Math.min(Math.max(nextIndex, 0), Math.max(flashcardQuestions.length - 1, 0));
      });
      setFlashcardRevealed(false);
    },
    [flashcardQuestions.length],
  );

  useEffect(() => {
    setFlashcardIndex((index) => Math.min(index, Math.max(flashcardQuestions.length - 1, 0)));
  }, [flashcardQuestions.length]);

  useEffect(() => {
    if (activeView !== "wrong-flashcards" || settingsOpen || !flashcardQuestion) return;
    const handleFlashcardKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.target instanceof HTMLSelectElement) return;
      if (event.key === "Shift") {
        event.preventDefault();
        toggleStarredWord(flashcardQuestion.id);
      } else if (event.shiftKey) {
        return;
      } else if (event.key === " ") {
        event.preventDefault();
        setFlashcardRevealed(true);
        void play(flashcardQuestion);
      } else if (event.key === "Enter") {
        event.preventDefault();
        if (flashcardRevealed) {
          moveFlashcard("next");
        } else {
          setFlashcardRevealed(true);
          void play(flashcardQuestion);
        }
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        moveFlashcard("previous");
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        moveFlashcard("next");
      }
    };
    window.addEventListener("keydown", handleFlashcardKey);
    return () => window.removeEventListener("keydown", handleFlashcardKey);
  }, [activeView, flashcardQuestion, flashcardRevealed, moveFlashcard, play, settingsOpen, toggleStarredWord]);

  const markWrongMastered = useCallback((questionId: string) => {
    setPersisted((state) => {
      const { [questionId]: _removed, ...remainingWrong } = state.wrongBook;
      const existing = state.progress[questionId];
      return {
        ...state,
        wrongBook: remainingWrong,
        progress: {
          ...state.progress,
          [questionId]: {
            attempted: true,
            mastered: true,
            attempts: existing?.attempts ?? 0,
            firstAttemptCorrect: existing?.firstAttemptCorrect ?? null,
            lastAnsweredAt: nowIso(),
          },
        },
      };
    });
  }, []);

  const practiceWrongQuestion = useCallback(
    (questionId: string) => {
      const targetScope = persisted.collectionScope;
      const wrongIds = data.questions
        .filter(
          (question) =>
            Boolean(persisted.wrongBook[question.id]) &&
            (targetScope === "all" || question.collectionId === targetScope),
        )
        .map((question) => question.id);
      const targetPosition = Math.max(wrongIds.indexOf(questionId), 0);
      setPersisted((state) => ({
        ...state,
        pageSelections: { ...state.pageSelections, [targetScope]: ALL_PAGES },
        practiceMode: "wrong",
        positions: {
          ...state.positions,
          [queueKey(targetScope, "wrong", ALL_PAGES)]: targetPosition,
        },
      }));
      setWrongDrawerOpen(false);
      setActiveView("practice");
    },
    [data.questions, persisted.wrongBook],
  );

  const exportWrongBookReport = useCallback(
    async (format: "pdf" | "word") => {
      try {
        const {
          buildWrongBookReport,
          exportWrongBookReportPdf,
          exportWrongBookReportWord,
        } = await import("./lib/wrongBookReport");
        const report = buildWrongBookReport(data, persisted);
        if (format === "pdf") {
          await exportWrongBookReportPdf(report);
        } else {
          await exportWrongBookReportWord(report);
        }
        setWrongBookExportOpen(false);
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "错题报告导出失败，请稍后重试。");
      }
    },
    [data, persisted],
  );

  const handleImport = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const imported = await parseImportedState(file, new Set(questionMap.keys()));
      const importedPage = imported.pageSelections?.[imported.collectionScope] ?? ALL_PAGES;
      const importedPageKey = `${imported.collectionScope}:${importedPage}`;
      elapsedSecondsRef.current =
        imported.elapsedSecondsByPage?.[importedPageKey] ?? imported.elapsedSeconds ?? 0;
      elapsedPageKeyRef.current = importedPageKey;
      setPersisted(imported);
      setElapsedClockVersion((version) => version + 1);
      setSettingsOpen(false);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "无法导入进度文件");
    }
  }, [questionMap]);

  const exportLearningReport = useCallback(
    async (format: ReportFormat) => {
      try {
        const { buildProgressReport, exportProgressReportPdf, exportProgressReportWord } = await import(
          "./lib/progressReport"
        );
        const stateForExport = {
          ...persisted,
          elapsedSeconds: elapsedSecondsRef.current,
          elapsedSecondsByPage: {
            ...(persisted.elapsedSecondsByPage ?? {}),
            [elapsedPageKey]: elapsedSecondsRef.current,
          },
        };
        const report = buildProgressReport(
          data,
          stateForExport,
          persisted.collectionScope,
          pageSelection,
          elapsedSecondsRef.current,
        );
        if (format === "pdf") {
          await exportProgressReportPdf(report);
        } else {
          await exportProgressReportWord(report);
        }
        setReportExportOpen(false);
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "学习报告导出失败，请稍后重试。");
      }
    },
    [data, elapsedPageKey, pageSelection, persisted],
  );

  const resetCollectionProgress = useCallback((collectionId: CollectionId) => {
    const label = collectionShortLabel(collectionId);
    if (!window.confirm(`确定重置“${label}”词库的答题进度和错题吗？`)) return;

    const scopedQuestionIds = new Set(scopeQuestionIds(data.questions, collectionId));
    const belongsToCollection = (key: string) =>
      key === collectionId || key.startsWith(`${collectionId}:`);
    setPersisted((state) => ({
      ...state,
      positions: Object.fromEntries(
        Object.entries(state.positions).filter(([key]) => !belongsToCollection(key)),
      ),
      randomOrders: Object.fromEntries(
        Object.entries(state.randomOrders).filter(([key]) => !belongsToCollection(key)),
      ),
      progress: Object.fromEntries(
        Object.entries(state.progress).filter(([id]) => !scopedQuestionIds.has(id)),
      ),
      wrongPracticeProgress: Object.fromEntries(
        Object.entries(state.wrongPracticeProgress ?? {}).filter(([id]) => !scopedQuestionIds.has(id)),
      ),
      starredPracticeProgress: Object.fromEntries(
        Object.entries(state.starredPracticeProgress ?? {}).filter(([id]) => !scopedQuestionIds.has(id)),
      ),
      wrongBook: Object.fromEntries(
        Object.entries(state.wrongBook).filter(([id]) => !scopedQuestionIds.has(id)),
      ),
      elapsedSecondsByPage: Object.fromEntries(
        Object.entries(state.elapsedSecondsByPage ?? {}).filter(([key]) => !belongsToCollection(key)),
      ),
    }));
    if (persisted.collectionScope === collectionId) {
      elapsedSecondsRef.current = 0;
      setElapsedClockVersion((version) => version + 1);
    }
    setAnswer("");
    setFeedback({ type: "idle" });
    setNavigationDirection("forward");
    setWrongDrawerOpen(false);
    setSettingsOpen(false);
  }, [data.questions, persisted.collectionScope]);

  const resetCurrentCollectionProgress = useCallback(() => {
    if (persisted.collectionScope !== "all") {
      resetCollectionProgress(persisted.collectionScope);
    }
  }, [persisted.collectionScope, resetCollectionProgress]);

  const answerVisible = feedback.type !== "idle";
  const emptyPracticeMode = isScopedPracticeMode && queue.length === 0;
  const feedbackEmoji = feedback.type === "wrong" ? "❌" : feedback.type === "correct" ? "✅" : "👀";

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <Volume2 size={22} strokeWidth={1.8} />
          </div>
          <div>
            <h1>雅思听力高频词1000词听写</h1>
            <p>IELTS LISTENING DICTATION</p>
          </div>
        </div>
        <div className="header-actions">
          {activeView === "wrong-flashcards" ? (
            <button className="quiet-button" type="button" onClick={() => setActiveView("wrong")}>
              <ChevronLeft size={18} />
              <span>返回错题本</span>
            </button>
          ) : activeView !== "practice" ? (
            <button className="quiet-button" type="button" onClick={returnToPractice}>
              <ChevronLeft size={18} />
              <span>返回听写</span>
            </button>
          ) : (
            <button className="quiet-button" type="button" onClick={openWrongBook}>
              <BookMarked size={18} />
              <span>错题本</span>
              {Object.keys(persisted.wrongBook).length > 0 && (
                <span className="count-badge">{Object.keys(persisted.wrongBook).length}</span>
              )}
            </button>
          )}
          <button
            className="icon-button"
            type="button"
            aria-label="设置"
            title="设置"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 size={19} />
          </button>
        </div>
      </header>

      {activeView === "library" ? (
        <LibraryView
          data={data}
          initialScope={persisted.collectionScope}
          onPlay={(question) => void play(question)}
          onResetCollectionProgress={resetCollectionProgress}
        />
      ) : activeView === "wrong" || activeView === "wrong-flashcards" ? null : (
      <main className="practice-panel">
        <div className="control-row">
          <div className="control-group">
            <span className="control-label">词库</span>
            <div className="segmented-control" aria-label="选择词库">
              {COLLECTION_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={persisted.collectionScope === option.value ? "is-active" : ""}
                  aria-pressed={persisted.collectionScope === option.value}
                  onClick={() => switchScope(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <button
              className="icon-button small"
              type="button"
              aria-label="浏览词库"
              title="浏览词库"
              onClick={openLibrary}
            >
              <BookOpen size={17} />
            </button>
            {persisted.collectionScope !== "all" && (
              <button
                className="icon-button small reset-collection-button"
                type="button"
                aria-label={`重置${collectionShortLabel(persisted.collectionScope)}进度`}
                title="重置当前词库进度"
                onClick={resetCurrentCollectionProgress}
              >
                <RotateCcw size={16} />
              </button>
            )}
          </div>
          <div className="control-group mode-group">
            <span className="control-label">题序</span>
            <div className="segmented-control" aria-label="选择题序">
              {MODE_OPTIONS.map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={persisted.practiceMode === option.value ? "is-active" : ""}
                    aria-pressed={persisted.practiceMode === option.value}
                    onClick={() => switchMode(option.value)}
                  >
                    <Icon size={15} />
                    {option.label}
                  </button>
                );
              })}
            </div>
            {persisted.practiceMode === "random" && (
              <button
                className="icon-button small"
                type="button"
                aria-label="重新随机排序"
                title="重新随机排序"
                onClick={reshuffle}
              >
                <RefreshCw size={16} />
              </button>
            )}
          </div>
        </div>

        <div className="page-control-row">
          <label className="page-range-control" htmlFor="practice-page">
            <span className="control-label">听写页码</span>
            <span className="page-select-shell">
              <FileText size={16} aria-hidden="true" />
              <select
                id="practice-page"
                value={pageSelection}
                onChange={(event) => switchPage(event.target.value)}
                aria-label="选择听写页码"
              >
                <option value={ALL_PAGES}>全部页 · {scopeQuestionIds(data.questions, persisted.collectionScope).length}词</option>
                {pageGroups.map((group) => {
                  const collectionPrefix =
                    persisted.collectionScope === "all"
                      ? `${collectionShortLabel(group.collectionId)} · `
                      : "";
                  const partLabel =
                    group.partCount > 1 ? ` · 第${group.part}/${group.partCount}组` : "";
                  return (
                    <option key={group.key} value={group.key}>
                      {collectionPrefix}Page {group.page}{partLabel} · {group.questions.length}词
                    </option>
                  );
                })}
              </select>
            </span>
          </label>
          <span className="page-selection-count">当前 {scopeIds.length} 词</span>
        </div>

        <details className="usage-guide">
          <summary>
            <CircleHelp size={16} aria-hidden="true" />
            <span>使用说明</span>
            <ChevronDown className="usage-guide-chevron" size={16} aria-hidden="true" />
          </summary>
          <p>
            选择词库与 Page 后自动播放；输入后按 <kbd>Enter</kbd> 核对，再按 <kbd>Enter</kbd>
            进入下一词。<kbd>←</kbd> / <kbd>→</kbd> 切题，<kbd>↓</kbd>
            显示答案；按 <kbd>Space</kbd> 重播录音，输入时连续按两次 <kbd>Space</kbd> 输入空格；完成选定 Page 的最后一词后按 <kbd>↓</kbd> 进入下一 Page，第一页词按 <kbd>←</kbd> 返回上一 Page；答错会自动加入错题本。
          </p>
        </details>

        {emptyPracticeMode ? (
          <section className="empty-state" aria-live="polite">
            <Check size={34} />
            <h2>
              {persisted.practiceMode === "starred"
                ? pageSelection === ALL_PAGES
                  ? "收藏词本是空的"
                  : "当前页没有收藏词"
                : pageSelection === ALL_PAGES
                  ? "错题本是空的"
                  : "当前页没有错题"}
            </h2>
            <button type="button" className="primary-button" onClick={() => switchMode("sequential")}>
              返回顺序练习
            </button>
          </section>
        ) : currentQuestion ? (
          <>
            <section
              key={`${currentQueueKey}:${position}:${currentQuestion.id}`}
              className={`question-stage${navigationDirection ? ` question-enter-${navigationDirection}` : ""}`}
              data-testid="question-stage"
            >
              <div className="question-meta">
                <span data-testid="question-position">
                  {position + 1} / {queue.length}
                </span>
                <span>{collectionLabel(data, currentQuestion)}</span>
              </div>

              <button
                className={`play-button ${isPlaying ? "is-playing" : ""}`}
                type="button"
                aria-label={isPlaying ? "停止播放" : "播放单词"}
                title={isPlaying ? "停止播放" : "播放单词"}
                onClick={() => (isPlaying ? stop() : void play(currentQuestion))}
              >
                {isPlaying ? <Pause size={27} fill="currentColor" /> : <Play size={28} fill="currentColor" />}
              </button>

              <div className={`waveform ${isPlaying ? "is-active" : ""}`} aria-hidden="true">
                {Array.from({ length: 7 }, (_, index) => (
                  <span key={index} />
                ))}
              </div>
              <p className="accent-status" aria-live="polite">
                {isPlaying ? (activeAccent === "en-US" ? "美音" : "英音") : "准备听写"}
              </p>

              <form className="answer-form" onSubmit={submitAnswer} aria-keyshortcuts="Enter">
                <div className={`answer-input-wrap feedback-${feedback.type}`}>
                  <input
                    ref={inputRef}
                    value={answer}
                    onChange={(event) => {
                      setAnswer(event.target.value);
                      if (feedback.type !== "idle") setFeedback({ type: "idle" });
                    }}
                    placeholder="输入听到的单词或短语"
                    aria-label="听写答案"
                    aria-describedby="answer-feedback"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                  <button className="check-button" type="submit" disabled={!answer.trim()}>
                    <Check size={18} />
                    核对
                  </button>
                </div>
              </form>

              <div
                id="answer-feedback"
                className={`feedback-line feedback-${feedback.type}`}
                aria-live="polite"
              >
                {feedback.type !== "idle" && (
                  <span>
                    <span className="feedback-emoji" aria-hidden="true">
                      {feedbackEmoji}
                    </span>
                    {feedback.message}
                  </span>
                )}
                {feedback.type === "wrong" && (
                  <div className="feedback-actions">
                    <button type="button" className="text-button" onClick={retryCurrent}>
                      <RotateCcw size={16} />
                      继续拼写
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => goNext(false)}
                      disabled={position >= queue.length - 1}
                    >
                      下一词
                      <ChevronRight size={16} />
                    </button>
                  </div>
                )}
              </div>

              {answerVisible && (
                <div
                  className={`answer-reveal${feedback.type === "wrong" ? " answer-reveal-wrong" : ""}`}
                  data-testid="answer-reveal"
                >
                  <div>
                    <span className="answer-word">{currentQuestion.canonicalAnswer}</span>
                    {currentQuestion.acceptedAnswers.length > 1 && (
                      <span className="answer-variants">
                        可接受：{currentQuestion.acceptedAnswers.join(" / ")}
                      </span>
                    )}
                  </div>
                  <p className="answer-meaning">
                    <span className="answer-part-of-speech">{currentQuestion.partOfSpeech}</span>
                    <span>{currentQuestion.meaningZh}</span>
                  </p>
                  <small>
                    {collectionLabel(data, currentQuestion)} · 第 {currentQuestion.page} 页 · 第{" "}
                    {currentQuestion.number} 词
                  </small>
                </div>
              )}

              <div className="secondary-actions">
                <button
                  type="button"
                  className="quiet-button"
                  onClick={revealAnswer}
                  aria-keyshortcuts="ArrowDown"
                  disabled={answerVisible}
                >
                  <Eye size={17} />
                  显示答案
                </button>
                <button type="button" className="quiet-button" onClick={addCurrentToWrongBook}>
                  <BookMarked size={17} />
                  加入错题
                </button>
              </div>
            </section>

            <section
              className="progress-section"
              aria-label={
                persisted.practiceMode === "wrong"
                  ? "错题练习进度"
                  : persisted.practiceMode === "starred"
                    ? "收藏词听写进度"
                    : "学习进度"
              }
            >
              <div className="progress-heading">
                <span>
                  {persisted.practiceMode === "wrong"
                    ? "错题练习进度"
                    : persisted.practiceMode === "starred"
                      ? "收藏词听写进度"
                      : "答题进度"}
                </span>
                <strong>
                  {attemptedCount} / {progressQuestionIds.length}
                </strong>
              </div>
              <div className="progress-track" aria-hidden="true">
                <span style={{ width: `${answeredPercent}%` }} />
              </div>
              <dl className="progress-summary-grid">
                <div>
                  <dt>答对题目</dt>
                  <dd>{masteredCount}</dd>
                </div>
                <div>
                  <dt>正确率</dt>
                  <dd>{accuracy}%</dd>
                </div>
                <div>
                  <dt>答题进度</dt>
                  <dd>
                    {attemptedCount}/{progressQuestionIds.length}
                  </dd>
                </div>
                <div>
                  <dt>剩余词</dt>
                  <dd>{remainingCount}</dd>
                </div>
                <div>
                  <dt>耗时</dt>
                  <ElapsedClock
                    key={elapsedClockVersion}
                    initialSeconds={
                      persisted.elapsedSecondsByPage?.[elapsedPageKey] ??
                      elapsedSecondsRef.current
                    }
                    onChange={recordElapsedSeconds}
                  />
                </div>
              </dl>
            </section>

            <nav className="desktop-navigation" aria-label="题目导航">
              <button
                type="button"
                className="quiet-button"
                aria-keyshortcuts="ArrowLeft"
                onClick={goPrevious}
                disabled={position <= 0}
              >
                <ChevronLeft size={18} />
                上一题
              </button>
              <button
                type="button"
                className="primary-button"
                aria-keyshortcuts="ArrowRight"
                onClick={() => goNext(true)}
                disabled={position >= queue.length - 1}
              >
                下一题
                <ChevronRight size={18} />
              </button>
            </nav>
          </>
        ) : null}
      </main>
      )}

      {activeView === "practice" && currentQuestion && !emptyPracticeMode && (
        <nav className="mobile-navigation" aria-label="移动端题目导航">
          <button
            type="button"
            onClick={goPrevious}
            disabled={position <= 0}
            aria-label="上一题"
            aria-keyshortcuts="ArrowLeft"
          >
            <ChevronLeft size={22} />
          </button>
          <button
            type="button"
            className="mobile-play"
            onClick={() => (isPlaying ? stop() : void play(currentQuestion))}
            aria-label={isPlaying ? "停止播放" : "播放单词"}
          >
            {isPlaying ? <Pause size={23} fill="currentColor" /> : <Play size={23} fill="currentColor" />}
          </button>
          <button
            type="button"
            onClick={() => goNext(true)}
            disabled={position >= queue.length - 1}
            aria-label="下一题"
            aria-keyshortcuts="ArrowRight"
          >
            <ChevronRight size={22} />
          </button>
        </nav>
      )}

      {activeView === "wrong-flashcards" && (
        <main className="flashcard-page" aria-labelledby="flashcard-title">
          <section className="flashcard-panel">
            <div className="flashcard-heading">
              <div>
                <span className="eyebrow">{flashcardBook === "wrong" ? "WRONG WORDS" : "STARRED WORDS"}</span>
                <h2 id="flashcard-title">{flashcardBook === "wrong" ? "错词刷词" : "收藏词刷词"}</h2>
                <p>按空格查看中文并播放读音；按 Enter 显示中文，再按一次进入下一词；Shift 收藏或取消收藏；左右键可直接切换。</p>
                <div className="flashcard-scope-controls">
                  {flashcardBook === "wrong" && (
                  <div className="segmented-control flashcard-scope-switcher" aria-label="选择错词刷词范围">
                    <button
                      type="button"
                      className={flashcardScope === "all" ? "is-active" : ""}
                      aria-pressed={flashcardScope === "all"}
                      onClick={() => selectFlashcardScope("all")}
                    >
                      汇总错词
                    </button>
                    <button
                      type="button"
                      className={flashcardScope === "date" ? "is-active" : ""}
                      aria-pressed={flashcardScope === "date"}
                      onClick={() => selectFlashcardScope("date")}
                    >
                      按日期刷词
                    </button>
                  </div>
                  )}
                  {flashcardBook === "wrong" && flashcardScope === "date" && (
                    <label className="flashcard-date-select">
                      <span>日期</span>
                      <select
                        aria-label="选择错词日期"
                        value={selectedFlashcardDate}
                        onChange={(event) => selectFlashcardDate(event.target.value)}
                      >
                        {flashcardDateSummaries.map((summary) => (
                          <option key={summary.date} value={summary.date}>
                            {summary.date} · {summary.questions.length} 词
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {flashcardQuestion && (
                    <label className="flashcard-start-select">
                      <span>从此词开始</span>
                      <select
                        aria-label={flashcardBook === "wrong" ? "选择错词起始词" : "选择收藏词起始词"}
                        value={flashcardQuestion.id}
                        onChange={(event) => selectFlashcardStart(event.target.value)}
                      >
                        {flashcardQuestions.map((question, index) => (
                          <option key={question.id} value={question.id}>
                            {index + 1}. {question.canonicalAnswer} · {question.meaningZh}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              </div>
              <span className="flashcard-total">
                {flashcardBook === "wrong" && flashcardScope === "date" && selectedFlashcardDate
                  ? `${selectedFlashcardDate} · `
                  : flashcardBook === "wrong" ? "汇总 · " : "收藏 · "}
                {flashcardQuestions.length} 词
              </span>
            </div>
            {flashcardQuestion ? (
              <>
                <div className="flashcard-position">
                  {flashcardIndex + 1} / {flashcardQuestions.length}
                </div>
                <button
                  type="button"
                  className={`flashcard-word${flashcardRevealed ? " is-revealed" : ""}`}
                  onClick={() => {
                    setFlashcardRevealed(true);
                    void play(flashcardQuestion);
                  }}
                  aria-label="按空格或点击显示释义并播放"
                >
                  <span>{flashcardQuestion.canonicalAnswer}</span>
                  {flashcardRevealed && (
                    <small>
                      <strong>{flashcardQuestion.partOfSpeech}</strong>
                      {flashcardQuestion.meaningZh}
                    </small>
                  )}
                </button>
                <div className="flashcard-actions" aria-label="错词导航">
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => moveFlashcard("previous")}
                    disabled={flashcardIndex <= 0}
                    aria-label="上一个错词"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <button
                    type="button"
                    className="flashcard-play-button"
                    onClick={() => {
                      setFlashcardRevealed(true);
                      void play(flashcardQuestion);
                    }}
                    aria-label="播放并显示释义"
                  >
                    <Volume2 size={19} />
                    播放 / 显示释义
                  </button>
                  <button
                    type="button"
                    className={`icon-button key-word-toggle${flashcardIsStarred ? " is-starred" : ""}`}
                    aria-label={
                      flashcardIsStarred
                        ? `取消收藏 ${flashcardQuestion.canonicalAnswer}`
                        : `收藏 ${flashcardQuestion.canonicalAnswer} 到重点词本`
                    }
                    title={flashcardIsStarred ? "取消收藏" : "加入重点词本"}
                    onClick={() => toggleStarredWord(flashcardQuestion.id)}
                  >
                    <Star size={20} fill={flashcardIsStarred ? "currentColor" : "none"} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => moveFlashcard("next")}
                    disabled={flashcardIndex >= flashcardQuestions.length - 1}
                    aria-label="下一个错词"
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>
                <div className="flashcard-progress" aria-label="错词刷词进度">
                  <div className="progress-track" aria-hidden="true">
                    <span
                      style={{
                        width: `${((flashcardIndex + 1) / flashcardQuestions.length) * 100}%`,
                      }}
                    />
                  </div>
                  <span>刷词进度 {flashcardIndex + 1}/{flashcardQuestions.length}</span>
                </div>
              </>
            ) : (
              <div className="flashcard-empty">
                <Check size={34} />
                <h3>{flashcardBook === "wrong" ? "当前词库暂无错词" : "当前词库暂无收藏词"}</h3>
                <p>{flashcardBook === "wrong" ? "答错或揭示答案后，错词会自动加入这里。" : "请先从错词刷词中人工收藏重点词。"}</p>
              </div>
            )}
          </section>
        </main>
      )}

      {activeView === "wrong" && (
        <main className="wrong-book-page">
          <section
            className="wrong-book-content"
            role="region"
            aria-label="错题本"
            aria-labelledby="wrong-title"
          >
            <div className="drawer-header">
              <div>
                <h2 id="wrong-title">{wrongView === "starred" ? "收藏词本" : "错题本"}</h2>
                <p>
                  {wrongView === "starred"
                    ? `${collectionStarredQuestions.length} 个人工收藏词条`
                    : `${Object.keys(persisted.wrongBook).length} 个待掌握词条`}
                </p>
              </div>
              <div className="drawer-header-actions">
                <button
                  type="button"
                  className="quiet-button compact"
                  disabled={
                    wrongView === "starred"
                      ? collectionStarredQuestionsForFlashcards.length === 0
                      : wrongQuestionsForFlashcards.length === 0
                  }
                  onClick={wrongView === "starred" ? openStarredFlashcards : openWrongFlashcards}
                >
                  <BookOpen size={16} />
                  {wrongView === "starred" ? "刷收藏词卡" : "刷错词卡"}
                </button>
                <button
                  type="button"
                  className="quiet-button compact"
                  disabled={
                    wrongView === "starred"
                      ? collectionStarredQuestions.length === 0
                      : collectionWrongQuestions.length === 0
                  }
                  onClick={wrongView === "starred" ? practiceStarredCollection : practiceWrongCollection}
                >
                  {wrongView === "starred" ? <Star size={16} /> : <BookMarked size={16} />}
                  {wrongView === "starred" ? "听写收藏词" : "练习汇总错题"}
                </button>
                {wrongView !== "starred" && <button
                  type="button"
                  className="quiet-button compact"
                  aria-label="导出全部错题"
                  title="导出全部错题"
                  disabled={Object.keys(persisted.wrongBook).length === 0}
                  onClick={() => setWrongBookExportOpen(true)}
                >
                  <Download size={16} />
                  导出
                </button>}
                <button
                  type="button"
                  className="icon-button"
                  aria-label="关闭错题本"
                  onClick={returnToPractice}
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="drawer-search">
              <Search size={17} />
              <input
                type="search"
                value={wrongSearch}
                onChange={(event) => setWrongSearch(event.target.value)}
                placeholder="模糊搜索单词、词性或释义"
                aria-label="模糊搜索错题"
              />
            </div>
            <div className="wrong-view-switcher" role="tablist" aria-label="错题范围">
              <button
                type="button"
                role="tab"
                aria-selected={wrongView === "current"}
                className={wrongView === "current" ? "is-active" : ""}
                disabled={pageSelection === ALL_PAGES}
                onClick={() => setWrongView("current")}
              >
                当前 Page · {currentWrongQuestions.length}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={wrongView === "all"}
                className={wrongView === "all" ? "is-active" : ""}
                onClick={() => setWrongView("all")}
              >
                当前词库全部 · {collectionWrongQuestions.length}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={wrongView === "pages"}
                className={wrongView === "pages" ? "is-active" : ""}
                onClick={() => setWrongView("pages")}
              >
                按 Page 汇总 · {wrongPageSummaries.length}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={wrongView === "dates"}
                className={wrongView === "dates" ? "is-active" : ""}
                onClick={() => setWrongView("dates")}
              >
                按日期汇总 · {wrongDateSummaries.length}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={wrongView === "starred"}
                className={wrongView === "starred" ? "is-active" : ""}
                onClick={() => setWrongView("starred")}
              >
                收藏词本 · {collectionStarredQuestions.length}
              </button>
            </div>
            {wrongSearch.trim() && (
              <p className="drawer-search-result" aria-live="polite">
                找到 {wrongView === "pages"
                  ? pageSummaryQuestionCount
                  : wrongView === "dates"
                    ? dateSummaryQuestionCount
                    : wrongView === "starred"
                      ? collectionStarredQuestions.length
                      : displayedWrongQuestions.length} 个匹配词条
              </p>
            )}
            {(wrongView === "current" || wrongView === "all") && (
              <div className="wrong-list">
                {displayedWrongQuestions.length === 0 ? (
                  <div className="drawer-empty">没有匹配的错题</div>
                ) : (
                  displayedWrongQuestions.map((question) => {
                  const wrongEntry = persisted.wrongBook[question.id];
                  const errorTimestamps = getErrorTimestamps(wrongEntry);
                  const missingLegacyTimestamps = Math.max(
                    wrongEntry.wrongCount - errorTimestamps.length,
                    0,
                  );
                  return (
                    <article className="wrong-row" key={question.id}>
                      <div className="wrong-row-content">
                        <button
                          type="button"
                          className="wrong-word-button"
                          aria-label={`播放单词 ${question.canonicalAnswer}`}
                          title={`播放 ${question.canonicalAnswer}`}
                          onClick={() => void play(question)}
                        >
                          {question.canonicalAnswer}
                        </button>
                        <p>
                          <span className="wrong-part-of-speech">{question.partOfSpeech}</span>
                          {question.meaningZh}
                        </p>
                        <small>{collectionLabel(data, question)}</small>
                        <small className="wrong-correct-streak">
                          连续答对 {wrongEntry.correctStreak ?? 0}/{WRONG_BOOK_CORRECT_STREAK_TARGET}
                        </small>
                        <details className="wrong-history">
                          <summary>
                            <Clock3 size={14} aria-hidden="true" />
                            <span>
                              错误 {wrongEntry.wrongCount} 次 · 最近{" "}
                              {formatWrongTime(latestWrongTimestamp(wrongEntry))}
                            </span>
                            <ChevronDown size={14} aria-hidden="true" />
                          </summary>
                          <ol>
                            {[...errorTimestamps].reverse().map((timestamp, index) => (
                              <li key={`${timestamp}:${index}`}>
                                <span>
                                  {missingLegacyTimestamps > 0
                                    ? `已记录 ${index + 1}`
                                    : `第 ${wrongEntry.wrongCount - index} 次`}
                                </span>
                                <time dateTime={timestamp}>{formatWrongTime(timestamp)}</time>
                              </li>
                            ))}
                            {missingLegacyTimestamps > 0 && (
                              <li className="legacy-history-note">
                                另有 {missingLegacyTimestamps} 次旧记录无具体时间
                              </li>
                            )}
                          </ol>
                        </details>
                      </div>
                      <div className="wrong-row-actions">
                        <button
                          type="button"
                          className="icon-button small"
                          aria-label={`播放 ${question.canonicalAnswer}`}
                          title="播放"
                          onClick={() => void play(question)}
                        >
                          <Play size={16} />
                        </button>
                        <button type="button" className="text-button" onClick={() => practiceWrongQuestion(question.id)}>
                          练习
                        </button>
                        <button type="button" className="text-button success" onClick={() => markWrongMastered(question.id)}>
                          掌握
                        </button>
                      </div>
                    </article>
                  );
                  })
                )}
              </div>
            )}
            {wrongView === "pages" && <section className="wrong-page-summary" aria-label="按 Page 汇总错题">
              <div className="wrong-page-summary-heading">
                <strong>按 Page 汇总</strong>
                <span>{wrongPageSummaries.length} 页</span>
              </div>
              {wrongPageSummaries.length === 0 ? (
                <p className="drawer-empty compact-empty">暂无 Page 错题</p>
              ) : (
                <div className="wrong-page-summary-list">
                  {wrongPageSummaries.map(({ group, questions }) => (
                    <details key={group.key} className="wrong-page-summary-item">
                      <summary>
                        <span>
                          {persisted.collectionScope === "all"
                            ? `${collectionShortLabel(group.collectionId)} · `
                            : ""}
                          Page {group.page}
                          {group.partCount > 1 ? ` · 第${group.part}/${group.partCount}组` : ""}
                        </span>
                        <strong>{questions.length}</strong>
                      </summary>
                      <div className="wrong-page-summary-words">
                        {questions.map((question) => (
                          <button
                            key={question.id}
                            type="button"
                            onClick={() => void play(question)}
                            aria-label={`播放汇总单词 ${question.canonicalAnswer}`}
                          >
                            <span>{question.canonicalAnswer}</span>
                            <small>
                              <span className="wrong-part-of-speech">{question.partOfSpeech}</span>
                              {question.meaningZh}
                            </small>
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        className="wrong-page-practice-button"
                        onClick={() => practiceWrongPage(group.key)}
                      >
                        <BookMarked size={14} />
                        练习本页错题
                      </button>
                    </details>
                  ))}
                </div>
              )}
            </section>}
            {wrongView === "dates" && <section className="wrong-page-summary wrong-date-summary" aria-label="按日期汇总错题">
              <div className="wrong-page-summary-heading">
                <strong>按日期汇总</strong>
                <span>{wrongDateSummaries.length} 天</span>
              </div>
              {wrongDateSummaries.length === 0 ? (
                <p className="drawer-empty compact-empty">暂无日期错题记录</p>
              ) : (
                <div className="wrong-page-summary-list">
                  {wrongDateSummaries.map(({ date, questions }) => {
                    const errorCount = questions.reduce((total, item) => total + item.errorCount, 0);
                    return (
                      <details key={date} className="wrong-page-summary-item">
                        <summary>
                          <span>{date}</span>
                          <strong>{questions.length} 词 · {errorCount} 次</strong>
                        </summary>
                        <div className="wrong-page-summary-words">
                          {questions.map(({ question, errorCount: count }) => (
                            <button
                              key={`${date}:${question.id}`}
                              type="button"
                              onClick={() => void play(question)}
                              aria-label={`播放 ${date} 的错词 ${question.canonicalAnswer}`}
                            >
                              <span>{question.canonicalAnswer}</span>
                              <small>
                                <span className="wrong-part-of-speech">{question.partOfSpeech}</span>
                                {question.meaningZh}
                              </small>
                              <em>当日错误 {count} 次</em>
                            </button>
                          ))}
                        </div>
                      </details>
                    );
                  })}
                </div>
              )}
            </section>}
            {wrongView === "starred" && (
              <section className="wrong-list key-word-list" aria-label="收藏词本">
                {collectionStarredQuestions.length === 0 ? (
                  <div className="drawer-empty">暂无人工收藏的重点词</div>
                ) : (
                  collectionStarredQuestions.map((question) => (
                    <article className="wrong-row" key={question.id}>
                      <div className="wrong-row-content">
                        <button
                          type="button"
                          className="wrong-word-button"
                          aria-label={`播放重点词 ${question.canonicalAnswer}`}
                          title={`播放 ${question.canonicalAnswer}`}
                          onClick={() => void play(question)}
                        >
                          {question.canonicalAnswer}
                        </button>
                        <p>
                          <span className="wrong-part-of-speech">{question.partOfSpeech}</span>
                          {question.meaningZh}
                        </p>
                        <small>
                          {collectionLabel(data, question)} · 第 {question.page} 页 · 第 {question.number} 词
                        </small>
                      </div>
                      <div className="wrong-row-actions">
                        <button
                          type="button"
                          className="icon-button small"
                          aria-label={`播放 ${question.canonicalAnswer}`}
                          title="播放"
                          onClick={() => void play(question)}
                        >
                          <Play size={16} />
                        </button>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => practiceStarredQuestion(question.id)}
                        >
                          听写
                        </button>
                        <button
                          type="button"
                          className="icon-button small key-word-toggle is-starred"
                          aria-label={`取消收藏 ${question.canonicalAnswer}`}
                          title="取消收藏"
                          onClick={() => toggleStarredWord(question.id)}
                        >
                          <Star size={16} fill="currentColor" />
                        </button>
                      </div>
                    </article>
                  ))
                )}
              </section>
            )}
          </section>
        </main>
      )}

      {settingsOpen && (
        <div className="overlay centered" role="presentation" onMouseDown={() => setSettingsOpen(false)}>
          <section
            className="settings-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="drawer-header">
              <h2 id="settings-title">设置</h2>
              <button
                type="button"
                className="icon-button"
                aria-label="关闭设置"
                onClick={() => setSettingsOpen(false)}
              >
                <X size={20} />
              </button>
            </div>
            <CloudSyncPanel
              configured={cloudSync.configured}
              email={cloudSync.email}
              status={cloudSync.status}
              message={cloudSync.message}
              onSignIn={cloudSync.signInWithEmail}
              onSignOut={cloudSync.signOut}
              onSynchronize={cloudSync.synchronize}
            />
            <div className="settings-row stacked">
              <strong>播放速度</strong>
              <div className="segmented-control speed-control">
                {([0.75, 1, 1.25] as const).map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    className={persisted.settings.playbackRate === rate ? "is-active" : ""}
                    onClick={() =>
                      setPersisted((state) => ({
                        ...state,
                        settings: { ...state.settings, playbackRate: rate },
                      }))
                    }
                  >
                    {rate}×
                  </button>
                ))}
              </div>
            </div>
            <div className="settings-actions">
              <button type="button" className="quiet-button" onClick={() => setReportExportOpen(true)}>
                <Download size={17} />
                导出学习报告
              </button>
              <button
                type="button"
                className="quiet-button"
                onClick={() =>
                  exportState({
                    ...persisted,
                    elapsedSeconds: elapsedSecondsRef.current,
                    elapsedSecondsByPage: {
                      ...(persisted.elapsedSecondsByPage ?? {}),
                      [elapsedPageKey]: elapsedSecondsRef.current,
                    },
                  })
                }
              >
                <Download size={17} />
                备份进度
              </button>
              <button type="button" className="quiet-button" onClick={() => importInputRef.current?.click()}>
                <FileUp size={17} />
                导入进度
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept="application/json"
                hidden
                onChange={handleImport}
              />
              {persisted.collectionScope !== "all" && (
                <button type="button" className="danger-button" onClick={resetCurrentCollectionProgress}>
                  <RotateCcw size={17} />
                  重置当前词库
                </button>
              )}
            </div>
          </section>
        </div>
      )}

      {reportExportOpen && (
        <div className="overlay centered" role="presentation" onMouseDown={() => setReportExportOpen(false)}>
          <section
            className="report-export-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-export-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="drawer-header">
              <div>
                <h2 id="report-export-title">导出学习报告</h2>
                <p>
                  {persisted.collectionScope === "all"
                    ? "全部词库"
                    : data.collections.find((collection) => collection.id === persisted.collectionScope)?.label}
                  {pageSelection === ALL_PAGES ? " · 全部页面" : ` · ${pageSelection}`}
                </p>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="关闭学习报告导出"
                onClick={() => setReportExportOpen(false)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="report-export-options">
              <button type="button" onClick={() => void exportLearningReport("pdf")}>
                <FileText size={24} />
                <strong>导出 PDF</strong>
                <span>适合打印与分享</span>
              </button>
              <button type="button" onClick={() => void exportLearningReport("word")}>
                <FileText size={24} />
                <strong>导出 Word</strong>
                <span>可继续编辑与补充</span>
              </button>
            </div>
          </section>
        </div>
      )}

      {wrongBookExportOpen && (
        <div className="overlay centered" role="presentation" onMouseDown={() => setWrongBookExportOpen(false)}>
          <section
            className="report-export-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wrong-book-export-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="drawer-header">
              <div>
                <h2 id="wrong-book-export-title">导出错题报告</h2>
                <p>{Object.keys(persisted.wrongBook).length} 个待复习词条</p>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="关闭错题报告导出"
                onClick={() => setWrongBookExportOpen(false)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="report-export-options three-options">
              <button type="button" onClick={() => void exportWrongBookReport("pdf")}>
                <FileText size={24} />
                <strong>导出 PDF</strong>
                <span>适合打印与分享</span>
              </button>
              <button type="button" onClick={() => void exportWrongBookReport("word")}>
                <FileText size={24} />
                <strong>导出 Word</strong>
                <span>可继续编辑与补充</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  exportWrongBookFile(data, persisted);
                  setWrongBookExportOpen(false);
                }}
              >
                <Download size={24} />
                <strong>备份 JSON</strong>
                <span>保留完整错题记录</span>
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
