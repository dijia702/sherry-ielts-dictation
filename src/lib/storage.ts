import type { PersistedState } from "../types";

export const STORAGE_KEY = "sherry-dictation:v1";

export function createDefaultState(): PersistedState {
  return {
    schemaVersion: 1,
    elapsedSeconds: 0,
    elapsedSecondsByPage: {},
    collectionScope: "jian21",
    pageSelections: {
      jian21: "all",
      jijing_supplement: "all",
      xiahua_p1p4: "all",
      all: "all",
    },
    practiceMode: "sequential",
    positions: {},
    randomOrders: {},
    progress: {},
    wrongPracticeProgress: {},
    starredPracticeProgress: {},
    wrongBook: {},
    starredWords: {},
    settings: {
      autoPlay: true,
      playbackRate: 1,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyValues(
  value: unknown,
  predicate: (item: unknown) => boolean,
): value is Record<string, unknown> {
  return isRecord(value) && Object.values(value).every(predicate);
}

export function isPersistedState(value: unknown): value is PersistedState {
  if (!isRecord(value)) return false;
  const candidate = value as Partial<PersistedState>;
  const isQuestionProgress = (item: unknown) => {
    if (!isRecord(item)) return false;
    return (
      typeof item.attempted === "boolean" &&
      typeof item.mastered === "boolean" &&
      Number.isInteger(item.attempts) &&
      Number(item.attempts) >= 0 &&
      (typeof item.firstAttemptCorrect === "boolean" || item.firstAttemptCorrect === null) &&
      typeof item.lastAnsweredAt === "string"
    );
  };
  const validProgress = hasOnlyValues(candidate.progress, isQuestionProgress);
  const validWrongPracticeProgress =
    candidate.wrongPracticeProgress === undefined ||
    hasOnlyValues(candidate.wrongPracticeProgress, isQuestionProgress);
  const validStarredPracticeProgress =
    candidate.starredPracticeProgress === undefined ||
    hasOnlyValues(candidate.starredPracticeProgress, isQuestionProgress);
  const validWrongBook = hasOnlyValues(candidate.wrongBook, (item) => {
    if (!isRecord(item)) return false;
    return (
      typeof item.addedAt === "string" &&
      Number.isInteger(item.wrongCount) &&
      Number(item.wrongCount) >= 1 &&
      (item.correctStreak === undefined ||
        (Number.isInteger(item.correctStreak) && Number(item.correctStreak) >= 0)) &&
      (item.errorTimestamps === undefined ||
        (Array.isArray(item.errorTimestamps) &&
          item.errorTimestamps.length >= 1 &&
          item.errorTimestamps.every((timestamp) => typeof timestamp === "string")))
    );
  });
  const validStarredWords =
    candidate.starredWords === undefined ||
    hasOnlyValues(candidate.starredWords, (item) => isRecord(item) && typeof item.addedAt === "string");
  const validPositions = hasOnlyValues(
    candidate.positions,
    (item) => Number.isInteger(item) && Number(item) >= 0,
  );
  const validRandomOrders = hasOnlyValues(
    candidate.randomOrders,
    (item) => Array.isArray(item) && item.every((id) => typeof id === "string"),
  );
  const validPageSelections =
    candidate.pageSelections === undefined ||
    (isRecord(candidate.pageSelections) &&
      Object.entries(candidate.pageSelections).every(
        ([scope, selection]) =>
          ["jian21", "jijing_supplement", "xiahua_p1p4", "all"].includes(scope) &&
          typeof selection === "string" &&
          (selection === "all" || /^(jian21|jijing_supplement|xiahua_p1p4):\d+:\d+$/.test(selection)),
      ));
  const validElapsedSecondsByPage =
    candidate.elapsedSecondsByPage === undefined ||
    hasOnlyValues(
      candidate.elapsedSecondsByPage,
      (item) => Number.isInteger(item) && Number(item) >= 0,
    );
  const settings = candidate.settings;
  return (
    candidate.schemaVersion === 1 &&
    (candidate.elapsedSeconds === undefined ||
      (Number.isInteger(candidate.elapsedSeconds) && candidate.elapsedSeconds >= 0)) &&
    ["jian21", "jijing_supplement", "xiahua_p1p4", "all"].includes(
      candidate.collectionScope ?? "",
    ) &&
    ["sequential", "random", "wrong", "starred"].includes(candidate.practiceMode ?? "") &&
    validPageSelections &&
    validElapsedSecondsByPage &&
    validPositions &&
    validRandomOrders &&
    validProgress &&
    validWrongPracticeProgress &&
    validStarredPracticeProgress &&
    validWrongBook &&
    validStarredWords &&
    isRecord(settings) &&
    typeof settings.autoPlay === "boolean" &&
    [0.75, 1, 1.25].includes(Number(settings.playbackRate))
  );
}

function migrateState(state: PersistedState): PersistedState {
  const pageSelections = {
    ...createDefaultState().pageSelections!,
    ...(state.pageSelections ?? {}),
  };
  const currentPage = pageSelections[state.collectionScope] ?? "all";
  const currentPageKey = `${state.collectionScope}:${currentPage}`;
  const elapsedSecondsByPage = {
    ...(state.elapsedSecondsByPage ?? {}),
    ...(state.elapsedSecondsByPage?.[currentPageKey] === undefined && state.elapsedSeconds
      ? { [currentPageKey]: state.elapsedSeconds }
      : {}),
  };
  return {
    ...state,
    elapsedSeconds: state.elapsedSeconds ?? 0,
    elapsedSecondsByPage,
    pageSelections,
    wrongPracticeProgress: state.wrongPracticeProgress ?? {},
    starredPracticeProgress: state.starredPracticeProgress ?? {},
    starredWords: state.starredWords ?? {},
    wrongBook: Object.fromEntries(
      Object.entries(state.wrongBook).map(([questionId, entry]) => [
        questionId,
        {
          ...entry,
          errorTimestamps:
            entry.errorTimestamps && entry.errorTimestamps.length > 0
              ? entry.errorTimestamps
              : [entry.addedAt],
          correctStreak: entry.correctStreak ?? 0,
        },
      ]),
    ),
  };
}

export function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultState();
    const parsed: unknown = JSON.parse(raw);
    return isPersistedState(parsed) ? migrateState(parsed) : createDefaultState();
  } catch {
    return createDefaultState();
  }
}

export function saveState(state: PersistedState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function exportState(state: PersistedState): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `sherry-dictation-progress-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export async function parseImportedState(
  file: File,
  validQuestionIds?: ReadonlySet<string>,
): Promise<PersistedState> {
  const parsed: unknown = JSON.parse(await file.text());
  if (!isPersistedState(parsed)) {
    throw new Error("进度文件格式不正确");
  }
  if (validQuestionIds) {
    const referencedIds = [
      ...Object.keys(parsed.progress),
      ...Object.keys(parsed.wrongPracticeProgress ?? {}),
      ...Object.keys(parsed.starredPracticeProgress ?? {}),
      ...Object.keys(parsed.wrongBook),
      ...Object.keys(parsed.starredWords ?? {}),
      ...Object.values(parsed.randomOrders).flatMap((ids) => ids ?? []),
    ];
    if (referencedIds.some((id) => !validQuestionIds.has(id))) {
      throw new Error("进度文件包含当前词库中不存在的题目");
    }
  }
  return migrateState(parsed);
}
