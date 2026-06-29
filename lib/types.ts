// Shared types for the Lecture Note AI pipeline.
// Kept in one place so connecting Groq / Gemini / Vercel Blob later is straightforward.

export const SUPPORTED_EXTENSIONS = ["mp3", "m4a", "wav", "webm", "ogg"] as const
export type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number]

// 25MB MVP limit
export const MAX_FILE_SIZE = 25 * 1024 * 1024

export const SUPPORTED_MIME_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/x-m4a",
  "audio/m4a",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/webm",
  "audio/ogg",
  "video/webm",
] as const

export interface AudioFileMeta {
  name: string
  size: number
  type: string
  /** Duration in seconds, if it could be read in the browser. */
  durationSeconds?: number
}

/** Steps of the processing pipeline shown to the user. */
export type PipelineStep =
  | "prepare" // 1. 파일 준비
  | "upload" // 2. 업로드 / 검증
  | "transcribe" // 3. Groq 전사
  | "refine" // 4. Gemini 교정/요약
  | "done" // 5. 완료

export type StepStatus = "pending" | "active" | "complete" | "error"

/** Response shape from /api/upload */
export interface UploadResult {
  // Later this will be a Vercel Blob URL or temporary storage reference.
  audioUrl: string
  fileName: string
}

/** Response shape from /api/transcribe (Groq Whisper) */
export interface TranscribeResult {
  rawTranscript: string
  language?: string
  durationSeconds?: number
}

/** Response shape from /api/refine (Gemini) */
export interface RefineResult {
  cleanedTranscript: string
  summary: string
  keyPoints: string[]
  studyQuestions: string[]
  actionItems: string[]
}

export type TabKey = "transcript" | "summary" | "keyPoints" | "questions" | "actions"

export interface ApiError {
  error: string
}
