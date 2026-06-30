// Single source of truth for the transcription and refine (LLM) engines the app
// can use. The UI builds its selectors from these lists, and the API routes look
// up engine metadata here to decide how to call the provider.

const MB = 1024 * 1024

/** How a transcription request is fulfilled. */
export type TranscriptionVia = "groq" | "gateway"

export interface TranscriptionEngine {
  id: string
  label: string
  description: string
  via: TranscriptionVia
  /** Model id passed to the provider (gateway model id for gateway engines). */
  modelId: string
  /** Provider-side max upload size in bytes. */
  maxFileSize: number
  /**
   * Hard per-request audio length limit in seconds, if the model enforces one.
   * gpt-4o transcribe models reject audio longer than 1500s (25 min); whisper-1
   * and Groq Whisper have no length limit beyond the file-size cap.
   */
  maxDurationSeconds?: number
  /**
   * Max output tokens the model can emit. gpt-4o transcribe models cap output at
   * ~2000 tokens, so very long/dense audio can be truncated. Advisory only.
   */
  maxOutputTokens?: number
  /** Whether the engine returns usable segment timestamps for the timeline. */
  supportsTimestamps: boolean
}

/** How a refine (summarize) request is fulfilled. */
export type RefineVia = "gemini" | "gateway"

export interface RefineEngine {
  id: string
  label: string
  description: string
  via: RefineVia
  /** Model id passed to the provider (gateway model id for gateway engines). */
  modelId: string
}

export const TRANSCRIPTION_ENGINES: TranscriptionEngine[] = [
  {
    id: "gateway-whisper",
    label: "AI Gateway · Whisper",
    description: "OpenAI whisper-1 · 구간 타임스탬프 지원으로 타임라인이 정확하고 길이 제한이 없습니다.",
    via: "gateway",
    modelId: "openai/whisper-1",
    maxFileSize: 25 * MB,
    supportsTimestamps: true,
  },
  {
    id: "gateway-gpt4o",
    label: "AI Gateway · GPT-4o Transcribe",
    description:
      "OpenAI gpt-4o-transcribe · 정확도는 높지만 타임스탬프가 없고, 최대 25분(1500초)까지만 처리하며 긴 전사는 잘릴 수 있습니다.",
    via: "gateway",
    modelId: "openai/gpt-4o-transcribe",
    maxFileSize: 25 * MB,
    maxDurationSeconds: 1500,
    maxOutputTokens: 2000,
    supportsTimestamps: false,
  },
  {
    id: "groq",
    label: "Groq · Whisper Large v3",
    description: "Groq 외부 API · 구간/단어 타임스탬프를 지원하며 길이 제한이 없습니다.",
    via: "groq",
    modelId: "whisper-large-v3",
    maxFileSize: 25 * MB,
    supportsTimestamps: true,
  },
]

export const REFINE_ENGINES: RefineEngine[] = [
  {
    id: "gateway-gemini",
    label: "AI Gateway · Gemini 2.5 Flash",
    description: "Google Gemini 2.5 Flash (빠르고 균형 잡힌 기본값)",
    via: "gateway",
    modelId: "google/gemini-2.5-flash",
  },
  {
    id: "gateway-gpt",
    label: "AI Gateway · GPT-5.5",
    description: "OpenAI GPT-5.5 (고품질 요약)",
    via: "gateway",
    modelId: "openai/gpt-5.5",
  },
  {
    id: "gemini",
    label: "Gemini API (직접)",
    description: "Google Gemini 외부 API 직접 호출",
    via: "gemini",
    modelId: "gemini-2.5-flash",
  },
]

export const DEFAULT_TRANSCRIPTION_ENGINE = "gateway-whisper"
export const DEFAULT_REFINE_ENGINE = "gateway-gemini"

const TRANSCRIPTION_MAP = new Map(TRANSCRIPTION_ENGINES.map((e) => [e.id, e]))
const REFINE_MAP = new Map(REFINE_ENGINES.map((e) => [e.id, e]))

/** Resolve a transcription engine by id, falling back to the default. */
export function getTranscriptionEngine(id: string | undefined | null): TranscriptionEngine {
  return TRANSCRIPTION_MAP.get(id ?? "") ?? TRANSCRIPTION_MAP.get(DEFAULT_TRANSCRIPTION_ENGINE)!
}

/** Resolve a refine engine by id, falling back to the default. */
export function getRefineEngine(id: string | undefined | null): RefineEngine {
  return REFINE_MAP.get(id ?? "") ?? REFINE_MAP.get(DEFAULT_REFINE_ENGINE)!
}

/** Short, human-readable summary of an engine's hard limits (for the selector UI). */
export function transcriptionLimitText(engine: TranscriptionEngine): string {
  const fileMb = Math.round(engine.maxFileSize / MB)
  const sizePart = `압축 후 최대 ${fileMb}MB`
  const lengthPart = engine.maxDurationSeconds
    ? `길이 최대 ${Math.round(engine.maxDurationSeconds / 60)}분`
    : "길이 제한 없음"
  return `${sizePart} · ${lengthPart}`
}

/**
 * Check whether an audio length (seconds) is allowed by the engine.
 * Returns null when allowed, or a user-facing message when it exceeds the limit.
 * A small tolerance avoids rejecting files right at the boundary due to rounding.
 */
export function checkDurationLimit(engine: TranscriptionEngine, durationSeconds: number | undefined): string | null {
  if (!engine.maxDurationSeconds || !durationSeconds || !Number.isFinite(durationSeconds)) return null
  if (durationSeconds <= engine.maxDurationSeconds + 1) return null
  const limitMin = Math.round(engine.maxDurationSeconds / 60)
  const actualMin = Math.floor(durationSeconds / 60)
  return `${engine.label}는 최대 ${limitMin}분까지 처리할 수 있는데 이 파일은 약 ${actualMin}분입니다. 더 짧은 파일을 쓰거나 길이 제한이 없는 Whisper 엔진을 선택해 주세요.`
}
