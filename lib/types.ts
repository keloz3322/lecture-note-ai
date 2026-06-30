// Shared types for the Lecture Note AI pipeline.
// Kept in one place so connecting Groq / Gemini / Vercel Blob later is straightforward.

export const SUPPORTED_EXTENSIONS = ["mp3", "m4a", "wav", "webm", "ogg"] as const
export type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number]

// Max size for the Blob-based upload path (client uploads straight to Vercel Blob,
// so this is bounded by Groq Whisper's own file limit rather than the serverless body limit).
export const MAX_FILE_SIZE = 100 * 1024 * 1024
// Used only when Blob upload is disabled and the file goes through the serverless
// request body, which Vercel caps at ~4.5MB.
export const DIRECT_UPLOAD_MAX_FILE_SIZE = Math.floor(4.2 * 1024 * 1024)
export const ACTIVE_UPLOAD_MAX_FILE_SIZE =
  process.env.NEXT_PUBLIC_ENABLE_BLOB_UPLOAD !== "false" ? MAX_FILE_SIZE : DIRECT_UPLOAD_MAX_FILE_SIZE

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
  "audio/opus",
  "application/ogg",
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
  audioUrl: string
  fileName: string
  pathname?: string
  size?: number
}

/** Response shape from /api/transcribe (Groq Whisper) */
export interface TranscribeResult {
  rawTranscript: string
  language?: string
  durationSeconds?: number
  segments?: TranscriptSegment[]
  words?: TranscriptWord[]
}

export interface TranscriptSegment {
  id?: number
  start: number
  end: number
  text: string
}

export interface TranscriptWord {
  word: string
  start: number
  end: number
}

/** Response shape from /api/refine (Gemini) */
export interface RefineResult {
  cleanedTranscript: string
  summary: string
  timeline: TimelineItem[]
  keyPoints: string[]
  studyQuestions: string[]
  actionItems: string[]
}

export interface TimelineItem {
  start: number
  end: number
  title: string
  summary: string
}

export type TabKey = "timeline" | "transcript" | "summary" | "keyPoints" | "questions" | "actions"

export interface ApiError {
  error: string
}
