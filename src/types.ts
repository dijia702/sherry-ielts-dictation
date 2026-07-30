export type CollectionId = "jian21" | "jijing_supplement" | "xiahua_p1p4";
export type CollectionScope = CollectionId | "all";
export type PracticeMode = "sequential" | "random" | "wrong" | "starred";
export type Accent = "en-GB" | "en-US";

export interface AudioClip {
  accent: Accent;
  label: string;
  text: string;
  src: string;
}

export interface QuizQuestion {
  id: string;
  collectionId: CollectionId;
  entryIndex: number;
  page: number;
  number: number;
  sourceHeadword: string;
  canonicalAnswer: string;
  acceptedAnswers: string[];
  partOfSpeech: string;
  meaningZh: string;
  audioSequence: AudioClip[];
}

export interface QuizCollection {
  id: CollectionId;
  label: string;
  questionCount: number;
  questionIds: string[];
}

export interface QuizData {
  schemaVersion: 1;
  generatedAt: string;
  voices: Record<Accent, string>;
  totals: {
    questions: number;
    britishAudioAssets: number;
    usVariantAudioAssets: number;
  };
  collections: QuizCollection[];
  questions: QuizQuestion[];
}

export interface QuestionProgress {
  attempted: boolean;
  mastered: boolean;
  attempts: number;
  firstAttemptCorrect: boolean | null;
  lastAnsweredAt: string;
}

export interface WrongBookEntry {
  addedAt: string;
  wrongCount: number;
  errorTimestamps?: string[];
  correctStreak?: number;
}

export interface StarredWordEntry {
  addedAt: string;
}

export interface AppSettings {
  autoPlay: boolean;
  playbackRate: 0.75 | 1 | 1.25;
}

export interface PersistedState {
  schemaVersion: 1;
  elapsedSeconds?: number;
  elapsedSecondsByPage?: Record<string, number>;
  collectionScope: CollectionScope;
  pageSelections?: Partial<Record<CollectionScope, string>>;
  practiceMode: PracticeMode;
  positions: Record<string, number>;
  randomOrders: Record<string, string[]>;
  progress: Record<string, QuestionProgress>;
  wrongPracticeProgress?: Record<string, QuestionProgress>;
  starredPracticeProgress?: Record<string, QuestionProgress>;
  wrongBook: Record<string, WrongBookEntry>;
  starredWords?: Record<string, StarredWordEntry>;
  settings: AppSettings;
}

export type FeedbackState =
  | { type: "idle" }
  | { type: "wrong"; message: string }
  | { type: "correct"; message: string }
  | { type: "revealed"; message: string };
