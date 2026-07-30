import type { WrongBookEntry } from "../types";

export const WRONG_BOOK_CORRECT_STREAK_TARGET = 3;

export function getErrorTimestamps(entry: WrongBookEntry): string[] {
  return entry.errorTimestamps?.length ? entry.errorTimestamps : [entry.addedAt];
}

export function recordWrongEvent(
  entry: WrongBookEntry | undefined,
  occurredAt: string,
): WrongBookEntry {
  if (!entry) {
    return {
      addedAt: occurredAt,
      wrongCount: 1,
      errorTimestamps: [occurredAt],
      correctStreak: 0,
    };
  }

  return {
    ...entry,
    wrongCount: entry.wrongCount + 1,
    errorTimestamps: [...getErrorTimestamps(entry), occurredAt],
    correctStreak: 0,
  };
}

export function recordCorrectWrongPractice(entry: WrongBookEntry): WrongBookEntry {
  return {
    ...entry,
    correctStreak: (entry.correctStreak ?? 0) + 1,
  };
}

export function latestWrongTimestamp(entry: WrongBookEntry): string {
  return getErrorTimestamps(entry).at(-1) ?? entry.addedAt;
}
