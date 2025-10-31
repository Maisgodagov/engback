export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
export type SpeechSpeed = 'slow' | 'normal' | 'fast';
export type GrammarComplexity = 'simple' | 'intermediate' | 'complex';
export type VocabularyComplexity = 'basic' | 'intermediate' | 'advanced';

export type Timestamp = [number, number];

export interface TranscriptChunk {
  text: string;
  timestamp: Timestamp;
}

export interface TranscriptWordChunk {
  text: string;
  timestamp: Timestamp;
}

export interface TranscriptionResult {
  fullText: string;
  text: string;
  chunks: TranscriptChunk[];
  wordChunks: TranscriptWordChunk[];
}

export type TranslationResult = TranscriptionResult;

export interface AnalysisResult {
  cefrLevel: CEFRLevel;
  speechSpeed: SpeechSpeed;
  grammarComplexity: GrammarComplexity;
  vocabularyComplexity: VocabularyComplexity;
  topics: string[];
}

export type ExerciseType = 'vocabulary' | 'topic' | 'statementCheck';

export interface BaseExercise {
  id: string;
  type: ExerciseType;
  question: string;
  options: string[];
  correctAnswer: number;
}

export interface VocabularyExercise extends BaseExercise {
  type: 'vocabulary';
  word: string;
}

export interface TopicExercise extends BaseExercise {
  type: 'topic';
}

export interface StatementExercise extends BaseExercise {
  type: 'statementCheck';
}

export type Exercise = VocabularyExercise | TopicExercise | StatementExercise;

export interface ProcessedVideo {
  id: string;
  videoName: string;
  videoUrl: string;
  durationSeconds: number | null;
  audioLevel?: number; // Коэффициент нормализации громкости (0.1-1.0)
  transcription: TranscriptionResult;
  translation: TranslationResult;
  analysis: AnalysisResult;
  exercises: Exercise[];
  likesCount: number;
  isLiked: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PhraseSnippet {
  id: string;
  contentId: string;
  videoName: string;
  videoUrl: string;
  startSeconds: number;
  endSeconds: number;
  matchedText: string;
  contextText: string;
  phrase: string;
  durationSeconds: number | null;
  audioLevel?: number;
}

export interface PhraseSearchResult {
  items: PhraseSnippet[];
  phrase: string;
  returned: number;
}

export interface VideoFeedItem {
  id: string;
  videoName: string;
  videoUrl: string;
  durationSeconds: number | null;
  audioLevel?: number; // Коэффициент нормализации громкости (0.1-1.0)
  analysis: AnalysisResult;
  status: 'NOT_STARTED' | 'WATCHED' | 'COMPLETED';
  likesCount: number;
  isLiked: boolean;
  createdAt: string;
}

export interface SubmitExerciseAnswer {
  exerciseId: string;
  selectedOption: number;
}

export interface LikeStatus {
  likesCount: number;
  isLiked: boolean;
}
