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
  /** Provider-side max upload size in bytes (free-tier limits). */
  maxFileSize: number
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
    description: "OpenAI whisper-1 (구간 타임스탬프 지원, 타임라인 정확)",
    via: "gateway",
    modelId: "openai/whisper-1",
    maxFileSize: 25 * MB,
    supportsTimestamps: true,
  },
  {
    id: "gateway-gpt4o",
    label: "AI Gateway · GPT-4o Transcribe",
    description: "OpenAI gpt-4o-transcribe (정확도 높음, 타임스탬프 없음)",
    via: "gateway",
    modelId: "openai/gpt-4o-transcribe",
    maxFileSize: 25 * MB,
    supportsTimestamps: false,
  },
  {
    id: "groq",
    label: "Groq · Whisper Large v3",
    description: "Groq 외부 API (구간/단어 타임스탬프 지원)",
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
