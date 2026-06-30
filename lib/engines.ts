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
   * Per-request audio length limit in seconds, if the model enforces one. gpt-4o
   * transcribe models reject audio longer than 1500s (25 min); whisper-1 and Groq
   * Whisper have no length limit beyond the file-size cap. This is no longer a hard
   * reject — it is the per-chunk ceiling the VAD chunker keeps each piece under.
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
      "OpenAI gpt-4o-transcribe · 정확도는 높지만 타임스탬프가 없습니다. 25분을 넘으면 무음 구간에서 자동 분할해 전사합니다.",
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

/** Short, human-readable note about how an engine handles size/length (for the UI). */
export function transcriptionLimitText(engine: TranscriptionEngine): string {
  const timestamps = engine.supportsTimestamps ? "타임스탬프 지원" : "타임스탬프 없음"
  const length = engine.maxDurationSeconds
    ? `${Math.round(engine.maxDurationSeconds / 60)}분 초과 시 자동 분할`
    : "긴 파일 자동 분할"
  return `${timestamps} · ${length}`
}

/**
 * Opus output at 32kbps ≈ 4000 bytes/sec. Used to translate the provider's
 * file-size limit into an equivalent audio-length ceiling for chunk planning.
 */
const OPUS_BYTES_PER_SEC = 32000 / 8

export interface ChunkPlan {
  /** Desired length of each chunk in seconds. */
  targetSeconds: number
  /** Hard upper bound per chunk (model length limit and/or file-size limit). */
  maxSeconds: number
}

/**
 * Compute chunk sizing for an engine. The per-chunk ceiling is the smaller of the
 * model's length limit and the audio length that fits under its file-size limit.
 * The target applies a safety margin and a global cap so each transcription request
 * stays well within the serverless time budget.
 */
export function getChunkPlan(engine: TranscriptionEngine): ChunkPlan {
  const sizeLimitSeconds = Math.floor((engine.maxFileSize * 0.9) / OPUS_BYTES_PER_SEC)
  const durationLimit = engine.maxDurationSeconds ?? Number.POSITIVE_INFINITY
  const maxSeconds = Math.min(sizeLimitSeconds, durationLimit)
  const targetSeconds = Math.min(Math.floor(maxSeconds * 0.85), 1500)
  return { targetSeconds, maxSeconds }
}
