import type { PersistedState, QuizData } from "../types";
import { getErrorTimestamps } from "./wrongBook";

export function buildWrongBookExport(data: QuizData, state: PersistedState) {
  const collectionLabels = new Map(
    data.collections.map((collection) => [collection.id, collection.label]),
  );
  const entries = data.questions
    .filter((question) => Boolean(state.wrongBook[question.id]))
    .map((question) => {
      const wrongEntry = state.wrongBook[question.id];
      return {
        id: question.id,
        canonicalAnswer: question.canonicalAnswer,
        sourceHeadword: question.sourceHeadword,
        acceptedAnswers: question.acceptedAnswers,
        partOfSpeech: question.partOfSpeech,
        meaningZh: question.meaningZh,
        collectionId: question.collectionId,
        collectionLabel: collectionLabels.get(question.collectionId) ?? question.collectionId,
        page: question.page,
        number: question.number,
        wrongCount: wrongEntry.wrongCount,
        correctStreak: wrongEntry.correctStreak ?? 0,
        addedAt: wrongEntry.addedAt,
        errorTimestamps: getErrorTimestamps(wrongEntry),
        audioSequence: question.audioSequence,
      };
    })
    .sort(
      (left, right) =>
        Date.parse(right.errorTimestamps.at(-1) ?? right.addedAt) -
        Date.parse(left.errorTimestamps.at(-1) ?? left.addedAt),
    );

  return {
    schemaVersion: 1,
    fileType: "sherry-wrong-book",
    exportedAt: new Date().toISOString(),
    totalEntries: entries.length,
    totalErrorEvents: entries.reduce((total, entry) => total + entry.wrongCount, 0),
    entries,
  };
}

export function exportWrongBookFile(data: QuizData, state: PersistedState): void {
  const payload = buildWrongBookExport(data, state);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const today = new Date();
  const localDate = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");
  link.href = url;
  link.download = `sherry-wrong-book-${localDate}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
