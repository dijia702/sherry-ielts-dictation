import type {
  CollectionId,
  CollectionScope,
  PersistedState,
  PracticeMode,
  QuizQuestion,
} from "../types";

export const PAGE_SIZE = 25;
export const ALL_PAGES = "all";

export interface QuizPageGroup {
  key: string;
  collectionId: CollectionId;
  page: number;
  part: number;
  partCount: number;
  questions: QuizQuestion[];
}

export function normalizeAnswer(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en")
    .replace(/[\s-]+/g, " ");
}

export function isAnswerCorrect(input: string, answers: string[]): boolean {
  const normalized = normalizeAnswer(input);
  return normalized.length > 0 && answers.some((answer) => normalizeAnswer(answer) === normalized);
}

export function buildPageGroups(
  questions: QuizQuestion[],
  scope: CollectionScope,
): QuizPageGroup[] {
  const pageMap = new Map<string, QuizQuestion[]>();

  questions.forEach((question) => {
    if (scope !== "all" && question.collectionId !== scope) return;
    const key = `${question.collectionId}:${question.page}`;
    const pageQuestions = pageMap.get(key) ?? [];
    pageQuestions.push(question);
    pageMap.set(key, pageQuestions);
  });

  return Array.from(pageMap.entries()).flatMap(([, pageQuestions]) => {
    const sorted = [...pageQuestions].sort((left, right) => left.number - right.number);
    const partCount = Math.ceil(sorted.length / PAGE_SIZE);
    return Array.from({ length: partCount }, (_, partIndex) => ({
      key: `${sorted[0].collectionId}:${sorted[0].page}:${partIndex + 1}`,
      collectionId: sorted[0].collectionId,
      page: sorted[0].page,
      part: partIndex + 1,
      partCount,
      questions: sorted.slice(partIndex * PAGE_SIZE, (partIndex + 1) * PAGE_SIZE),
    }));
  });
}

export function scopeQuestionIds(
  questions: QuizQuestion[],
  scope: CollectionScope,
  pageSelection: string = ALL_PAGES,
): string[] {
  if (pageSelection !== ALL_PAGES) {
    return (
      buildPageGroups(questions, scope)
        .find((group) => group.key === pageSelection)
        ?.questions.map((question) => question.id) ?? []
    );
  }
  return questions
    .filter((question) => scope === "all" || question.collectionId === scope)
    .map((question) => question.id);
}

export function shuffleIds(ids: string[], random: () => number = Math.random): string[] {
  const result = [...ids];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export function buildQueue(
  questions: QuizQuestion[],
  scope: CollectionScope,
  mode: PracticeMode,
  state: PersistedState,
  pageSelection: string = ALL_PAGES,
): string[] {
  const scoped = scopeQuestionIds(questions, scope, pageSelection);
  if (mode === "wrong") {
    return scoped.filter((id) => Boolean(state.wrongBook[id]));
  }
  if (mode === "starred") {
    return scoped.filter((id) => Boolean(state.starredWords?.[id]));
  }
  if (mode === "random") {
    const stored = state.randomOrders[randomOrderKey(scope, pageSelection)] ?? [];
    const scopedSet = new Set(scoped);
    const validStored = stored.filter((id) => scopedSet.has(id));
    const missing = scoped.filter((id) => !validStored.includes(id));
    return [...validStored, ...missing];
  }
  return scoped;
}

export function randomOrderKey(
  scope: CollectionScope,
  pageSelection: string = ALL_PAGES,
): string {
  return pageSelection === ALL_PAGES ? scope : `${scope}:${pageSelection}`;
}

export function queueKey(
  scope: CollectionScope,
  mode: PracticeMode,
  pageSelection: string = ALL_PAGES,
): string {
  return pageSelection === ALL_PAGES
    ? `${scope}:${mode}`
    : `${scope}:${pageSelection}:${mode}`;
}

export function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function clampPosition(position: number, queueLength: number): number {
  if (queueLength <= 0) return 0;
  return Math.min(Math.max(position, 0), queueLength - 1);
}
