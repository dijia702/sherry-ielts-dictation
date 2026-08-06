import type { QuestionProgress, PersistedState, StarredWordEntry, WrongBookEntry } from "../types";
import { isPersistedState } from "./storage";
import { supabase } from "./supabase";

function timeValue(timestamp: string | undefined): number {
  if (!timestamp) return 0;
  const value = Date.parse(timestamp);
  return Number.isFinite(value) ? value : 0;
}

function latestActivity(state: PersistedState): number {
  const progressTimes = Object.values(state.progress).map((item) => timeValue(item.lastAnsweredAt));
  const wrongTimes = Object.values(state.wrongBook).flatMap((item) => [
    timeValue(item.addedAt),
    ...(item.errorTimestamps ?? []).map(timeValue),
  ]);
  const starredTimes = Object.values(state.starredWords ?? {}).map((item) => timeValue(item.addedAt));
  return Math.max(timeValue(state.cloudUpdatedAt), ...progressTimes, ...wrongTimes, ...starredTimes, 0);
}

function newerState(left: PersistedState, right: PersistedState): PersistedState {
  return latestActivity(left) >= latestActivity(right) ? left : right;
}

function mergeProgressEntry(
  local: QuestionProgress | undefined,
  remote: QuestionProgress | undefined,
): QuestionProgress | undefined {
  if (!local) return remote;
  if (!remote) return local;
  const newest = timeValue(local.lastAnsweredAt) >= timeValue(remote.lastAnsweredAt) ? local : remote;
  return {
    ...newest,
    attempted: local.attempted || remote.attempted,
    mastered: local.mastered || remote.mastered,
    attempts: Math.max(local.attempts, remote.attempts),
    firstAttemptCorrect:
      local.firstAttemptCorrect === false || remote.firstAttemptCorrect === false
        ? false
        : local.firstAttemptCorrect ?? remote.firstAttemptCorrect,
  };
}

function mergeProgressMap(
  local: Record<string, QuestionProgress> | undefined,
  remote: Record<string, QuestionProgress> | undefined,
): Record<string, QuestionProgress> {
  const result: Record<string, QuestionProgress> = {};
  for (const id of new Set([...Object.keys(local ?? {}), ...Object.keys(remote ?? {})])) {
    const entry = mergeProgressEntry(local?.[id], remote?.[id]);
    if (entry) result[id] = entry;
  }
  return result;
}

function mergeWrongEntry(
  local: WrongBookEntry | undefined,
  remote: WrongBookEntry | undefined,
): WrongBookEntry | undefined {
  if (!local) return remote;
  if (!remote) return local;
  const timestamps = [...new Set([...(local.errorTimestamps ?? [local.addedAt]), ...(remote.errorTimestamps ?? [remote.addedAt])])]
    .filter((timestamp) => Number.isFinite(Date.parse(timestamp)))
    .sort((left, right) => Date.parse(left) - Date.parse(right));
  return {
    addedAt: timeValue(local.addedAt) <= timeValue(remote.addedAt) ? local.addedAt : remote.addedAt,
    wrongCount: Math.max(local.wrongCount, remote.wrongCount, timestamps.length),
    errorTimestamps: timestamps.length > 0 ? timestamps : [local.addedAt],
    correctStreak: Math.max(local.correctStreak ?? 0, remote.correctStreak ?? 0),
  };
}

function mergeWrongBook(
  local: Record<string, WrongBookEntry>,
  remote: Record<string, WrongBookEntry>,
): Record<string, WrongBookEntry> {
  const result: Record<string, WrongBookEntry> = {};
  for (const id of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    const entry = mergeWrongEntry(local[id], remote[id]);
    if (entry) result[id] = entry;
  }
  return result;
}

function mergeStarredWords(
  local: Record<string, StarredWordEntry> | undefined,
  remote: Record<string, StarredWordEntry> | undefined,
): Record<string, StarredWordEntry> {
  const result: Record<string, StarredWordEntry> = {};
  for (const id of new Set([...Object.keys(local ?? {}), ...Object.keys(remote ?? {})])) {
    const localEntry = local?.[id];
    const remoteEntry = remote?.[id];
    if (!localEntry) {
      if (remoteEntry) result[id] = remoteEntry;
    } else if (!remoteEntry) {
      result[id] = localEntry;
    } else {
      result[id] = timeValue(localEntry.addedAt) <= timeValue(remoteEntry.addedAt) ? localEntry : remoteEntry;
    }
  }
  return result;
}

/**
 * Merges data-bearing records while using the newest snapshot for UI-only state.
 * Counts never decrease and error timestamps are deduplicated, so an offline device
 * cannot erase completed work when it reconnects.
 */
export function mergeCloudState(local: PersistedState, remote: PersistedState): PersistedState {
  const newest = newerState(local, remote);
  return {
    ...newest,
    schemaVersion: 1,
    cloudUpdatedAt: new Date(Math.max(latestActivity(local), latestActivity(remote), Date.now())).toISOString(),
    elapsedSeconds: Math.max(local.elapsedSeconds ?? 0, remote.elapsedSeconds ?? 0),
    elapsedSecondsByPage: Object.fromEntries(
      [...new Set([
        ...Object.keys(local.elapsedSecondsByPage ?? {}),
        ...Object.keys(remote.elapsedSecondsByPage ?? {}),
      ])].map((key) => [
        key,
        Math.max(local.elapsedSecondsByPage?.[key] ?? 0, remote.elapsedSecondsByPage?.[key] ?? 0),
      ]),
    ),
    progress: mergeProgressMap(local.progress, remote.progress),
    wrongPracticeProgress: mergeProgressMap(local.wrongPracticeProgress, remote.wrongPracticeProgress),
    starredPracticeProgress: mergeProgressMap(local.starredPracticeProgress, remote.starredPracticeProgress),
    wrongBook: mergeWrongBook(local.wrongBook, remote.wrongBook),
    starredWords: mergeStarredWords(local.starredWords, remote.starredWords),
  };
}

export function makeCloudSnapshot(state: PersistedState): PersistedState {
  return { ...state, cloudUpdatedAt: new Date().toISOString() };
}

export async function fetchCloudState(userId: string): Promise<PersistedState | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("dictation_states")
    .select("state")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return isPersistedState(data?.state) ? data.state : null;
}

export async function saveCloudState(userId: string, state: PersistedState): Promise<PersistedState> {
  if (!supabase) return state;
  const remote = await fetchCloudState(userId);
  const merged = remote ? mergeCloudState(state, remote) : state;
  const { error } = await supabase
    .from("dictation_states")
    .upsert({ user_id: userId, state: makeCloudSnapshot(merged) }, { onConflict: "user_id" });
  if (error) throw error;
  return merged;
}
