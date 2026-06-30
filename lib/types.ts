// Shared types for the Transcript Studio pipeline.
// Kept in one place so connecting Groq / Gemini / Vercel Blob later is straightforward.

import type { ContentTypeId } from "./content-types"

// Audio + video containers. Video is accepted because the server extracts/compresses
// the audio track with ffmpeg before sending it to Groq.
export const SUPPORTED_EXTENSIONS = [
  "mp3",
  "m4a",
  "wav",
  "webm",
  "ogg",
  "opus",
  "mp4",
  "mov",
  "mkv",
  "avi",
  "m4v",
] as const
export type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number]

// Extensions that are unambiguously video containers (used to decide re-encoding).
export const VIDEO_EXTENSIONS = ["mp4", "mov", "mkv", "avi", "m4v"] as const

// App-level cap for the Blob-based upload path (client uploads straight to Vercel
// Blob, bypassing the serverless body limit). This is our own chosen ceiling, not
// a Blob limit; the server then compresses and enforces each engine's real limits.
export const MAX_FILE_SIZE = 100 * 1024 * 1024
// Used only when Blob upload is disabled and the file goes through the serverless
// request body, which Vercel caps at ~4.5MB.
export const DIRECT_UPLOAD_MAX_FILE_SIZE = Math.floor(4.2 * 1024 * 1024)
export const ACTIVE_UPLOAD_MAX_FILE_SIZE =
  process.env.NEXT_PUBLIC_ENABLE_BLOB_UPLOAD !== "false" ? MAX_FILE_SIZE : DIRECT_UPLOAD_MAX_FILE_SIZE

// Groq's free tier rejects transcription files larger than 25MB.
export const GROQ_MAX_FILE_SIZE = 25 * 1024 * 1024
// Above this, the server re-encodes to compact Opus (16kHz mono, 32kbps) before sending.
export const REENCODE_THRESHOLD = 24 * 1024 * 1024

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
  "video/mp4",
  "video/quicktime",
  "video/x-matroska",
  "video/x-msvideo",
  "video/mpeg",
  "video/x-m4v",
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

/** A type-specific output section returned by Gemini. */
export interface RefineSection {
  /** Matches a SectionSpec.id from the content-type registry. */
  id: string
  /** Display label (mirrors the spec title). */
  title: string
  /** How to render/copy the items. */
  kind: "list" | "qa" | "text"
  /** Section content. For "text" kind, typically a single string. */
  items: string[]
}

/** Response shape from /api/refine (Gemini) */
export interface RefineResult {
  /** The content type used to generate this result. */
  contentType: ContentTypeId
  /** The type Gemini detected from the transcript (may differ if user overrode it). */
  detectedType: ContentTypeId
  cleanedTranscript: string
  summary: string
  timeline: TimelineItem[]
  keyPoints: string[]
  /** Type-specific sections layered on top of the common core. */
  sections: RefineSection[]
}

export interface TimelineItem {
  start: number
  end: number
  title: string
  summary: string
}

/** Core tabs are always present; section tabs are keyed by their section id. */
export type CoreTabKey = "timeline" | "transcript" | "summary" | "keyPoints"
export type TabKey = CoreTabKey | string

export interface ApiError {
  error: string
}
