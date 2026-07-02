import { NextResponse } from "next/server"
import { generateObject } from "ai"
import { z } from "zod"
import type {
  RefineResult,
  RefineSection,
  TimelineItem,
  TimestampStatus,
  TranscriptSegment,
  TranscriptWord,
} from "@/lib/types"
import {
  CONTENT_TYPES,
  DEFAULT_CONTENT_TYPE,
  getContentType,
  isContentTypeId,
  type ContentTypeDef,
  type ContentTypeId,
} from "@/lib/content-types"
import { getRefineEngine, type RefineEngine } from "@/lib/engines"

type RefineInput = {
  rawTranscript: string
  segments?: TranscriptSegment[]
  words?: TranscriptWord[]
  durationSeconds?: number
  timestampStatus?: TimestampStatus
  transcriptionEngineLabel?: string
  overrideType?: ContentTypeId
}

/** Zod schema for the Gateway (generateObject) path — mirrors refineSchema. */
const refineZodSchema = z.object({
  detectedType: z.enum(CONTENT_TYPES.map((t) => t.id) as [string, ...string[]]),
  cleanedTranscript: z.string(),
  summary: z.string(),
  timeline: z.array(
    z.object({
      start: z.number(),
      end: z.number(),
      title: z.string(),
      summary: z.string(),
    }),
  ),
  keyPoints: z.array(z.string()),
  sections: z.array(z.object({ id: z.string(), items: z.array(z.string()) })),
})

export const runtime = "nodejs"
// LLM refine over long transcripts can exceed the default 60s; give it headroom.
export const maxDuration = 300

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta"
const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash"
const GEMINI_THINKING_LEVEL = "medium"
const FALLBACK_GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"]
const GATEWAY_GEMINI_TEMPERATURE = 1
const DEFAULT_GATEWAY_TEMPERATURE = 0.1
const GEMINI_SHORT_TRANSCRIPT_RETRY_LIMIT = 1
const COMPACT_REFINE_CHAR_THRESHOLD = 40_000
const COMPACT_REFINE_SEGMENT_THRESHOLD = 800
const COMPACT_REFINE_PROMPT_BUDGET = 28_000

const CONTENT_TYPE_IDS = CONTENT_TYPES.map((type) => type.id)

const refineSchema = {
  type: "object",
  properties: {
    detectedType: {
      type: "string",
      enum: CONTENT_TYPE_IDS,
      description: "The content type that best fits this transcript.",
    },
    cleanedTranscript: {
      type: "string",
      description: "The cleaned full transcript in Korean.",
    },
    summary: {
      type: "string",
      description: "A concise Korean summary in 4 to 7 sentences.",
    },
    timeline: {
      type: "array",
      description: "Chronological sections based on the provided timestamps.",
      items: {
        type: "object",
        properties: {
          start: { type: "number", description: "Section start time in seconds." },
          end: { type: "number", description: "Section end time in seconds." },
          title: { type: "string", description: "Short section title." },
          summary: { type: "string", description: "Section summary." },
        },
        required: ["start", "end", "title", "summary"],
        additionalProperties: false,
      },
    },
    keyPoints: {
      type: "array",
      description: "Important points.",
      items: { type: "string" },
    },
    sections: {
      type: "array",
      description: "Type-specific sections. Use exactly the section ids requested in the prompt.",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "The requested section id." },
          items: { type: "array", items: { type: "string" } },
        },
        required: ["id", "items"],
        additionalProperties: false,
      },
    },
  },
  required: ["detectedType", "cleanedTranscript", "summary", "timeline", "keyPoints", "sections"],
  additionalProperties: false,
} as const

const geminiResponseSchema = stripUnsupportedSchemaFields(refineSchema)

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      rawTranscript?: string
      segments?: TranscriptSegment[]
      words?: TranscriptWord[]
      durationSeconds?: number
      timestampStatus?: TimestampStatus
      transcriptionEngineLabel?: string
      contentType?: string
      engine?: string
    }

    if (!body.rawTranscript || body.rawTranscript.trim().length === 0) {
      return NextResponse.json({ error: "교정/요약할 전사문이 없습니다." }, { status: 400 })
    }

    const engine = getRefineEngine(body.engine)

    // If the user explicitly chose a type, force it; otherwise let the model detect.
    const overrideType = isContentTypeId(body.contentType) ? body.contentType : undefined

    const input: RefineInput = {
      rawTranscript: body.rawTranscript,
      segments: normalizeIncomingSegments(body.segments),
      words: normalizeIncomingWords(body.words),
      durationSeconds: typeof body.durationSeconds === "number" ? body.durationSeconds : undefined,
      timestampStatus: normalizeTimestampStatus(body.timestampStatus),
      transcriptionEngineLabel: getText(body.transcriptionEngineLabel),
      overrideType,
    }
    const result = await runRefine(engine, input)

    return NextResponse.json(result)
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "교정/요약에 실패했습니다. 잠시 후 다시 시도해 주세요."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/** Route the refine request to the selected engine. */
async function runRefine(engine: RefineEngine, input: RefineInput): Promise<RefineResult> {
  if (engine.via === "gemini") {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) throw new Error("Gemini API 키가 서버에 설정되어 있지 않습니다.")
    return refineWithGemini(apiKey, input)
  }
  return refineWithGateway(engine, input)
}

/** Refine via the Vercel AI Gateway using the AI SDK's generateObject(). */
async function refineWithGateway(engine: RefineEngine, input: RefineInput): Promise<RefineResult> {
  try {
    const { object } = await generateObject({
      model: engine.modelId,
      schema: refineZodSchema,
      prompt: buildPrompt(input, { preserveFullTranscript: isGeminiRefineEngine(engine) }),
      temperature: getGatewayTemperature(engine),
    })
    const result = normalizeRefineResult(object, input)

    const retryReason = geminiCleanedTranscriptRetryReason(result, input)
    if (!isGeminiRefineEngine(engine) || !retryReason) {
      return result
    }

    const retry = await generateObject({
      model: engine.modelId,
      schema: refineZodSchema,
      prompt: buildPrompt(input, { preserveFullTranscript: true, cleanedTranscriptRetry: retryReason }),
      temperature: getGatewayTemperature(engine),
    })

    return chooseBetterGeminiResult(result, normalizeRefineResult(retry.object, input), input)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`AI Gateway 교정/요약 실패 (${engine.modelId}): ${detail}`)
  }
}

function getGatewayTemperature(engine: RefineEngine) {
  return engine.id === "gateway-gemini" ? GATEWAY_GEMINI_TEMPERATURE : DEFAULT_GATEWAY_TEMPERATURE
}

function isGeminiRefineEngine(engine: RefineEngine) {
  return engine.id === "gateway-gemini" || engine.via === "gemini" || /gemini/i.test(engine.modelId)
}

function geminiCleanedTranscriptRetryReason(
  result: RefineResult,
  input: Pick<RefineInput, "rawTranscript" | "segments">,
): "short" | "long" | undefined {
  if (usesCompactRefineInput(input)) return undefined
  const length = result.cleanedTranscript.length
  if (length < minimumCleanedTranscriptChars(input.rawTranscript)) return "short"
  if (length > maximumCleanedTranscriptChars(input.rawTranscript)) return "long"
  return undefined
}

function chooseBetterGeminiResult(current: RefineResult, next: RefineResult, input: Pick<RefineInput, "rawTranscript">) {
  return geminiCleanedTranscriptScore(next, input) > geminiCleanedTranscriptScore(current, input) ? next : current
}

function geminiCleanedTranscriptScore(result: RefineResult, input: Pick<RefineInput, "rawTranscript">) {
  const rawLength = input.rawTranscript.trim().length
  const length = result.cleanedTranscript.length
  const min = minimumCleanedTranscriptChars(input.rawTranscript)
  const max = maximumCleanedTranscriptChars(input.rawTranscript)
  if (length < min) return length - min
  if (length > max) return max - length
  return rawLength - Math.abs(rawLength - length)
}

function minimumCleanedTranscriptChars(rawTranscript: string) {
  const length = rawTranscript.trim().length
  if (length <= 0) return 0
  const ratio = length > 12_000 ? 0.55 : length > 6_000 ? 0.65 : 0.75
  return Math.floor(length * ratio)
}

function maximumCleanedTranscriptChars(rawTranscript: string) {
  const length = rawTranscript.trim().length
  if (length <= 0) return 0
  const ratio = length > 12_000 ? 0.9 : length > 6_000 ? 1.05 : 1.25
  return Math.ceil(length * ratio)
}

async function refineWithGemini(apiKey: string, input: RefineInput): Promise<RefineResult> {
  const prompt = buildPrompt(input, { preserveFullTranscript: true })
  let lastError: Error | null = null

  for (const model of getGeminiModels()) {
    const response = await fetchGeminiGenerateContent(apiKey, model, prompt)

    const text = await response.text()
    if (!response.ok) {
      lastError = new Error(geminiErrorMessage(response.status, text, model))
      if (shouldTryNextGeminiModel(response.status, text)) continue
      throw lastError
    }

    try {
      const outputText = extractGeminiOutputText(text)
      const parsed = parseJsonObject(outputText)
      const result = normalizeRefineResult(parsed, input)
      const retryReason = geminiCleanedTranscriptRetryReason(result, input)
      return retryReason
        ? await retryGeminiForFullTranscript(apiKey, model, result, input, retryReason)
        : result
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Gemini가 JSON 형식 결과를 반환하지 못했습니다.")
      continue
    }
  }

  throw lastError ?? new Error("Gemini 교정/요약에 실패했습니다.")
}

async function retryGeminiForFullTranscript(
  apiKey: string,
  model: string,
  firstResult: RefineResult,
  input: RefineInput,
  initialRetryReason: "short" | "long",
): Promise<RefineResult> {
  let best = firstResult
  let retryReason: "short" | "long" | undefined = initialRetryReason

  for (let attempt = 0; attempt < GEMINI_SHORT_TRANSCRIPT_RETRY_LIMIT; attempt++) {
    const retryPrompt = buildPrompt(input, { preserveFullTranscript: true, cleanedTranscriptRetry: retryReason })
    const response = await fetchGeminiGenerateContent(apiKey, model, retryPrompt)
    const text = await response.text()

    if (!response.ok) {
      return best
    }

    try {
      const parsed = parseJsonObject(extractGeminiOutputText(text))
      best = chooseBetterGeminiResult(best, normalizeRefineResult(parsed, input), input)
      retryReason = geminiCleanedTranscriptRetryReason(best, input)
      if (!retryReason) return best
    } catch {
      return best
    }
  }

  return best
}

function fetchGeminiGenerateContent(apiKey: string, model: string, prompt: string) {
  return fetch(`${GEMINI_API_BASE}/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        thinkingConfig: {
          thinkingLevel: GEMINI_THINKING_LEVEL,
        },
        responseMimeType: "application/json",
        responseSchema: geminiResponseSchema,
      },
    }),
  })
}

function getGeminiModels() {
  const configured = (process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL)
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean)
  return Array.from(new Set([...configured, ...FALLBACK_GEMINI_MODELS]))
}

function shouldTryNextGeminiModel(status: number, responseText: string) {
  if ([404, 429, 500, 502, 503, 504].includes(status)) return true
  return /high demand|overloaded|unavailable|quota|not found|not supported/i.test(responseText)
}

function buildPrompt({
  rawTranscript,
  segments,
  words,
  durationSeconds,
  timestampStatus,
  transcriptionEngineLabel,
  overrideType,
}: {
  rawTranscript: string
  segments?: TranscriptSegment[]
  words?: TranscriptWord[]
  durationSeconds?: number
  timestampStatus?: TimestampStatus
  transcriptionEngineLabel?: string
  overrideType?: ContentTypeId
}, options: { preserveFullTranscript?: boolean; cleanedTranscriptRetry?: "short" | "long" } = {}) {
  const compactRefineInput = usesCompactRefineInput({ rawTranscript, segments })
  const timedTranscript = compactRefineInput
    ? buildCompactTimedTranscript(segments, rawTranscript)
    : buildTimedTranscript(segments, rawTranscript)
  const hasTimestamps = (timestampStatus === "available" || timestampStatus === "estimated") && !!segments?.length
  const wordTimestamps = buildWordTimestamps(words)
  const wordSection = wordTimestamps
    ? `\n\n단어 단위 타임스탬프(필요할 때만 참고):\n${wordTimestamps}`
    : ""
  const durationHint = durationSeconds ? `\n전체 길이: ${formatTimestamp(durationSeconds)}` : ""
  const timestampRule = hasTimestamps
    ? timestampStatus === "estimated"
      ? `- timestamp가 있는 구간 전사문을 보고 timeline을 시간 순서대로 작성하세요.
- 이 timestamp는 모델이 오디오에서 직접 반환한 값이 아니라 실시간 전사 수신 시각 기반 추정값입니다${
          transcriptionEngineLabel ? ` (${transcriptionEngineLabel})` : ""
        }.
- timeline은 4~8개 구간으로 묶고, start/end는 제공된 segment 시각을 근거로 초 단위 숫자로 쓰세요.
- 정확한 자막 싱크처럼 과도하게 세밀하게 만들지 말고, 강의/회의 흐름을 대략적으로 찾는 용도로 작성하세요.
- 단어 단위 timestamp는 segment 경계가 애매하거나 특정 단어 위치를 확인할 때만 참고하세요.`
      : `- timestamp가 있는 구간 전사문을 보고 timeline을 시간 순서대로 작성하세요.
- timeline은 4~8개 구간으로 묶고, start/end는 제공된 segment 시각을 근거로 초 단위 숫자로 쓰세요.
- 단어 단위 timestamp는 segment 경계가 애매하거나 특정 단어 위치를 확인할 때만 참고하세요.`
    : `- 이 전사 결과에는 신뢰할 수 있는 timestamp가 없습니다${
        transcriptionEngineLabel ? ` (${transcriptionEngineLabel})` : ""
      }.
- timeline은 반드시 빈 배열 []로 두세요. 추정 시간, 균등 분할, 가짜 구간을 만들지 마세요.`
  const transcriptHeading = hasTimestamps ? "타임스탬프 포함 전사" : "전사문"

  // The chosen type decides which sections to request and how to detect the type.
  const chosen = overrideType ? getContentType(overrideType) : null
  const typeInstruction = chosen
    ? `이 콘텐츠는 "${chosen.label}" 유형으로 처리하세요. detectedType은 "${chosen.id}"로 설정하세요.\n${chosen.promptGuidance}`
    : `먼저 전사문을 분석해 가장 잘 맞는 콘텐츠 유형 하나를 고르고 detectedType에 그 id를 쓰세요.\n${describeContentTypeChoices()}`

  // Sections depend on the chosen type; if auto-detecting, ask for the union of
  // common section ids so the output is useful regardless of detected type.
  const sectionSpecs = chosen ? chosen.sections : unionSections()
  const sectionInstruction = sectionSpecs
    .map((spec) => `  - id "${spec.id}" (${spec.title}): ${spec.instruction}`)
    .join("\n")
  const compactRule = compactRefineInput
    ? `\n긴 전사본 처리 기준:
- 아래 입력은 전체 전사본이 아니라 시간대별 대표 구간 발췌입니다.
- detectedType, summary, keyPoints, timeline, sections는 제공된 대표 구간과 시간 흐름을 근거로 작성하세요.
- cleanedTranscript는 간결한 교정 샘플만 반환해도 됩니다. 서버는 전체 원문 전사본을 별도로 보존해 결과의 정리된 전사문에 사용합니다.
- 특정 담당자, 결정 사항, 기한, 투표, 액션 아이템이 보이면 meeting 유형 신호로 강하게 반영하세요.`
    : ""
  const transcriptPreservationRule = options.preserveFullTranscript && !compactRefineInput
    ? `\nGemini 전용 cleanedTranscript 품질 기준:
- cleanedTranscript는 summary가 아니라 "전체 전사문을 읽기 좋게 교정한 풀 버전"입니다.
- 원문에 나온 모델명, 도구명, 서비스명, 가격, 비교 기준, 장단점, 추천 결론을 빠뜨리지 마세요.
- 문장을 자연스럽게 다듬고 문단을 나누되, 내용을 요약하거나 압축하지 마세요.
- 원문에 없는 예의상 표현, 추가 해설, 배경 설명, 새로운 연결 문장을 넣어 길이를 늘리지 마세요.
- cleanedTranscript는 원문 정보량을 대부분 보존해야 하며, 가능하면 원문 길이의 85~110%에 가깝게 작성하세요.
- 이 입력의 cleanedTranscript는 최소 ${minimumCleanedTranscriptChars(rawTranscript).toLocaleString("ko-KR")}자 이상을 목표로 하세요.
- 이 입력의 cleanedTranscript는 최대 ${maximumCleanedTranscriptChars(rawTranscript).toLocaleString("ko-KR")}자를 넘기지 마세요.
- summary와 cleanedTranscript가 비슷해지면 실패입니다. summary는 짧게, cleanedTranscript는 길고 자세하게 작성하세요.`
    : ""
  const retryRule =
    options.cleanedTranscriptRetry === "short"
      ? `\n이전 응답의 cleanedTranscript가 너무 짧아 요약처럼 보였습니다. 이번에는 빠진 내용을 복원해 원문 흐름 전체를 따라가는 교정 전사문으로 다시 작성하세요.`
      : options.cleanedTranscriptRetry === "long"
        ? `\n이전 응답의 cleanedTranscript가 원문보다 지나치게 길어졌습니다. 새 설명을 덧붙이지 말고 원문 발화에 충실한 교정 전사문으로 다시 압축하세요.`
        : ""

  return `다음은 음성/영상에서 자동 전사한 원문입니다.

${typeInstruction}

반드시 한국어로 답하세요.
반드시 JSON 객체 하나만 반환하세요. 설명문, 마크다운 코드펜스, 주석은 쓰지 마세요.
JSON 키는 detectedType, cleanedTranscript, summary, timeline, keyPoints, sections만 사용하세요.

작성 규칙:
- 원문의 의미를 보존하면서 말더듬, 반복 표현, 불필요한 추임새를 자연스럽게 정리하세요.
- cleanedTranscript에는 전사문 전체 흐름을 보존한 교정본을 넣고, summary에는 별도의 짧은 요약을 넣으세요.
- 전사문에 없는 사실은 새로 만들지 마세요.
${timestampRule}
- summary는 4~7문장, keyPoints는 5~9개로 작성하세요.
- sections 배열에는 아래에 명시된 id의 항목만 포함하세요. 각 항목은 { "id": ..., "items": [...] } 형식입니다. 해당 내용이 없으면 items를 빈 배열로 두세요.
${sectionInstruction}${compactRule}${transcriptPreservationRule}${retryRule}${durationHint}

${transcriptHeading}:
${timedTranscript}${wordSection}`
}

/** Describe each type so Gemini can pick the best fit when auto-detecting. */
function describeContentTypeChoices() {
  return ["선택 가능한 유형:", ...CONTENT_TYPES.map((type) => `  - ${type.id}: ${type.description}`)].join("\n")
}

/** Union of all section specs, de-duplicated by id, for the auto-detect case. */
function unionSections() {
  const seen = new Map<string, ContentTypeDef["sections"][number]>()
  for (const type of CONTENT_TYPES) {
    for (const spec of type.sections) {
      if (!seen.has(spec.id)) seen.set(spec.id, spec)
    }
  }
  return [...seen.values()]
}

function extractGeminiOutputText(responseText: string) {
  let data: unknown
  try {
    data = JSON.parse(responseText)
  } catch {
    return responseText
  }

  const record = asRecord(data)
  if (record.cleanedTranscript || record.summary || record.timeline) return responseText

  const outputText = getText(record.output_text)
  if (outputText) return outputText

  const stepText = extractTextFromSteps(record.steps)
  if (stepText) return stepText

  const candidateText = extractGenerateContentText(record.candidates)
  if (candidateText) return candidateText

  throw new Error("Gemini 응답에서 결과 텍스트를 찾지 못했습니다.")
}

function extractTextFromSteps(value: unknown) {
  if (!Array.isArray(value)) return ""
  return value
    .flatMap((step) => {
      const record = asRecord(step)
      const content = record.content
      if (!Array.isArray(content)) return []
      return content.map((block) => getText(asRecord(block).text)).filter(Boolean)
    })
    .join("\n")
    .trim()
}

function extractGenerateContentText(value: unknown) {
  if (!Array.isArray(value)) return ""
  return value
    .flatMap((candidate) => {
      const content = asRecord(asRecord(candidate).content).parts
      if (!Array.isArray(content)) return []
      return content.map((part) => getText(asRecord(part).text)).filter(Boolean)
    })
    .join("\n")
    .trim()
}

function parseJsonObject(text: string) {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "")
  try {
    return JSON.parse(trimmed)
  } catch {
    const extracted = extractBalancedJsonObject(trimmed)
    if (extracted) {
      try {
        return JSON.parse(extracted)
      } catch {
        // Fall through to the user-facing error below.
      }
    }
    throw new Error("Gemini가 JSON 형식 결과를 반환하지 못했습니다.")
  }
}

function extractBalancedJsonObject(text: string) {
  const start = text.indexOf("{")
  if (start === -1) return ""

  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < text.length; i++) {
    const char = text[i]

    if (escaped) {
      escaped = false
      continue
    }
    if (char === "\\") {
      escaped = true
      continue
    }
    if (char === '"') {
      inString = !inString
      continue
    }
    if (inString) continue

    if (char === "{") depth += 1
    if (char === "}") {
      depth -= 1
      if (depth === 0) return text.slice(start, i + 1)
    }
  }

  return ""
}

function normalizeRefineResult(
  value: unknown,
  input: {
    rawTranscript: string
    segments?: TranscriptSegment[]
    durationSeconds?: number
    timestampStatus?: TimestampStatus
    transcriptionEngineLabel?: string
    overrideType?: ContentTypeId
  },
): RefineResult {
  const outer = asRecord(value)
  const record = asRecord(outer.result || outer.data || value)
  const normalizedTimeline = fitTimelineToDuration(
    normalizeTimeline(record.timeline),
    getTimelineDurationLimit(input.durationSeconds, input.segments),
  )

  // Detected type comes from Gemini; an explicit override always wins for contentType.
  const detectedRaw = getText(record.detectedType)
  const detectedType: ContentTypeId = isContentTypeId(detectedRaw) ? detectedRaw : DEFAULT_CONTENT_TYPE
  const contentType: ContentTypeId = input.overrideType ?? detectedType
  const timestampStatus = normalizeTimelineStatus(input.timestampStatus, input.segments)
  const timeline =
    timestampStatus === "available" || timestampStatus === "estimated"
      ? normalizedTimeline.length
        ? normalizedTimeline
        : buildFallbackTimeline(input.segments)
      : []

  return {
    contentType,
    detectedType,
    timestampStatus,
    timelineNotice: timelineNotice(timestampStatus, input.transcriptionEngineLabel),
    cleanedTranscript: usesCompactRefineInput(input)
      ? normalizeLongTranscriptForDisplay(input.rawTranscript)
      : getText(record.cleanedTranscript) || getText(record.cleaned_transcript) || input.rawTranscript,
    summary: getText(record.summary) || "요약을 생성하지 못했습니다.",
    timeline,
    keyPoints: toStringArray(record.keyPoints || record.key_points),
    sections: buildSections(contentType, record.sections),
  }
}

function normalizeTimestampStatus(value: unknown): TimestampStatus | undefined {
  return value === "available" || value === "estimated" || value === "unsupported" || value === "unavailable"
    ? value
    : undefined
}

function normalizeTimelineStatus(status: TimestampStatus | undefined, segments: TranscriptSegment[] | undefined): TimestampStatus {
  if (status === "unsupported") return "unsupported"
  if (status === "estimated" && segments?.length) return "estimated"
  if (status === "available" && segments?.length) return "available"
  if (segments?.length) return "available"
  return "unavailable"
}

function timelineNotice(status: TimestampStatus, engineLabel?: string) {
  if (status === "available") return undefined
  if (status === "estimated") {
    return `${engineLabel || "선택한 전사 엔진"}의 타임라인은 모델 타임스탬프가 아니라 실시간 수신 시각 기반 추정값입니다.`
  }
  if (status === "unsupported") {
    return `${engineLabel || "선택한 전사 엔진"}은 타임스탬프를 반환하지 않아 타임라인을 생성하지 않았습니다.`
  }
  return "이번 전사 결과에는 사용할 수 있는 타임스탬프가 없어 타임라인을 생성하지 않았습니다."
}

/**
 * Map Gemini's raw section output onto the chosen type's section specs so the
 * client always gets sections in the right order with correct titles/kinds,
 * even if the model omitted or reordered some.
 */
function buildSections(contentType: ContentTypeId, raw: unknown): RefineSection[] {
  const def = getContentType(contentType)
  const byId = new Map<string, string[]>()

  if (Array.isArray(raw)) {
    for (const entry of raw) {
      const rec = asRecord(entry)
      const id = getText(rec.id)
      if (id) byId.set(id, toStringArray(rec.items))
    }
  }

  return def.sections.map((spec) => ({
    id: spec.id,
    title: spec.title,
    kind: spec.kind,
    items: byId.get(spec.id) ?? [],
  }))
}

function normalizeTimeline(value: unknown): TimelineItem[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      const record = asRecord(item)
      const start = getNumber(record.start)
      const end = getNumber(record.end)
      const title = getText(record.title)
      const summary = getText(record.summary)
      if (start == null || end == null || !title || !summary) return null
      return { start, end, title, summary }
    })
    .filter((item): item is TimelineItem => item !== null)
}

function getTimelineDurationLimit(durationSeconds: unknown, segments: TranscriptSegment[] | undefined) {
  if (typeof durationSeconds === "number" && Number.isFinite(durationSeconds) && durationSeconds > 0) {
    return durationSeconds
  }
  if (!segments?.length) return undefined
  const finiteEnds = segments.map((segment) => segment.end).filter((end) => Number.isFinite(end))
  return finiteEnds.length ? Math.max(...finiteEnds) : undefined
}

function fitTimelineToDuration(items: TimelineItem[], durationSeconds: number | undefined) {
  if (!durationSeconds || !Number.isFinite(durationSeconds) || durationSeconds <= 0 || items.length === 0) return items

  const maxEnd = Math.max(...items.map((item) => item.end))
  const scale = maxEnd > durationSeconds * 1.1 ? durationSeconds / maxEnd : 1

  return items
    .map((item) => {
      const start = clampTimelineSecond(item.start * scale, durationSeconds)
      const end = clampTimelineSecond(Math.max(start + 0.5, item.end * scale), durationSeconds)
      return {
        ...item,
        start,
        end,
      }
    })
    .filter((item) => item.start < durationSeconds && item.end <= durationSeconds)
}

function clampTimelineSecond(value: number, durationSeconds: number) {
  return Math.round(Math.min(durationSeconds, Math.max(0, value)) * 10) / 10
}

function buildFallbackTimeline(segments: TranscriptSegment[] | undefined): TimelineItem[] {
  if (!segments?.length) return []

  const bucketCount = Math.min(6, Math.max(1, Math.ceil(segments.length / 16)))
  const bucketSize = Math.ceil(segments.length / bucketCount)

  return Array.from({ length: bucketCount }, (_, index) => {
    const bucket = segments.slice(index * bucketSize, (index + 1) * bucketSize)
    const first = bucket[0]
    const last = bucket[bucket.length - 1]
    return {
      start: first?.start ?? 0,
      end: last?.end ?? first?.end ?? 0,
      title: `구간 ${index + 1}`,
      summary: bucket.map((segment) => segment.text.trim()).join(" ").slice(0, 240),
    }
  }).filter((item) => item.summary.length > 0)
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.map((item) => getText(item)).filter(Boolean)
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {}
}

function getText(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function buildTimedTranscript(segments: TranscriptSegment[] | undefined, rawTranscript: string) {
  if (!segments?.length) return rawTranscript
  return segments
    .map((segment) => `[${formatTimestamp(segment.start)}-${formatTimestamp(segment.end)}] ${segment.text.trim()}`)
    .join("\n")
}

function usesCompactRefineInput(input: Pick<RefineInput, "rawTranscript" | "segments">) {
  return (
    input.rawTranscript.trim().length > COMPACT_REFINE_CHAR_THRESHOLD ||
    (input.segments?.length ?? 0) > COMPACT_REFINE_SEGMENT_THRESHOLD
  )
}

function buildCompactTimedTranscript(segments: TranscriptSegment[] | undefined, rawTranscript: string) {
  if (!segments?.length) return compactPlainTranscript(rawTranscript)

  const bucketCount = Math.min(32, Math.max(8, Math.ceil(segments.length / 90)))
  const charsPerBucket = Math.max(420, Math.floor(COMPACT_REFINE_PROMPT_BUDGET / bucketCount))
  const bucketSize = Math.ceil(segments.length / bucketCount)
  const lines: string[] = []

  for (let bucketIndex = 0; bucketIndex < bucketCount; bucketIndex++) {
    const bucket = segments.slice(bucketIndex * bucketSize, (bucketIndex + 1) * bucketSize)
    if (!bucket.length) continue
    const first = bucket[0]
    const last = bucket[bucket.length - 1]
    lines.push(`\n[대표 구간 ${bucketIndex + 1}: ${formatTimestamp(first.start)}-${formatTimestamp(last.end)}]`)

    let used = 0
    const targetLines = Math.max(4, Math.floor(charsPerBucket / 120))
    const stride = Math.max(1, Math.floor(bucket.length / targetLines))
    for (let i = 0; i < bucket.length && used < charsPerBucket; i += stride) {
      const segment = bucket[i]
      const text = segment.text.trim()
      if (!text) continue
      const line = `[${formatTimestamp(segment.start)}-${formatTimestamp(segment.end)}] ${text}`
      used += line.length
      lines.push(line)
    }
  }

  return lines.join("\n").trim()
}

function compactPlainTranscript(rawTranscript: string) {
  const text = rawTranscript.trim()
  if (text.length <= COMPACT_REFINE_PROMPT_BUDGET) return text
  const chunkCount = 24
  const charsPerChunk = Math.floor(COMPACT_REFINE_PROMPT_BUDGET / chunkCount)
  const lines: string[] = []
  for (let i = 0; i < chunkCount; i++) {
    const start = Math.floor((text.length * i) / chunkCount)
    const excerpt = text.slice(start, start + charsPerChunk).trim()
    if (excerpt) lines.push(`[대표 발췌 ${i + 1}]\n${excerpt}`)
  }
  return lines.join("\n\n")
}

function normalizeLongTranscriptForDisplay(rawTranscript: string) {
  return rawTranscript
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function buildWordTimestamps(words: TranscriptWord[] | undefined) {
  if (!words?.length) return ""
  return words
    .slice(0, 1200)
    .map((word) => `${word.start.toFixed(2)}-${word.end.toFixed(2)}=${word.word}`)
    .join(" | ")
}

function formatTimestamp(seconds: number) {
  const total = Math.max(0, Math.round(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => n.toString().padStart(2, "0")
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

function normalizeIncomingSegments(value: unknown): TranscriptSegment[] | undefined {
  if (!Array.isArray(value)) return undefined
  const segments = value
    .map((item) => {
      const record = asRecord(item)
      const start = getNumber(record.start)
      const end = getNumber(record.end)
      const text = getText(record.text)
      const id = getNumber(record.id)
      if (start == null || end == null || !text) return null
      return id == null ? { start, end, text } : { id, start, end, text }
    })
    .filter((item): item is TranscriptSegment => item !== null)
  return segments.length ? segments : undefined
}

function normalizeIncomingWords(value: unknown): TranscriptWord[] | undefined {
  if (!Array.isArray(value)) return undefined
  const words = value
    .map((item) => {
      const record = asRecord(item)
      const start = getNumber(record.start)
      const end = getNumber(record.end)
      const word = getText(record.word)
      if (start == null || end == null || !word) return null
      return { word, start, end }
    })
    .filter((item): item is TranscriptWord => item !== null)
  return words.length ? words : undefined
}

function stripUnsupportedSchemaFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripUnsupportedSchemaFields)
  if (typeof value !== "object" || value === null) return value

  const output: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    if (key === "additionalProperties") continue
    output[key] = stripUnsupportedSchemaFields(child)
  }
  return output
}

function geminiErrorMessage(status: number, responseText: string, model: string) {
  try {
    const parsed = JSON.parse(responseText) as { error?: { message?: unknown }; message?: unknown }
    const detail = getText(parsed.error?.message) || getText(parsed.message)
    return detail
      ? `Gemini 교정/요약 실패 (${model}, ${status}): ${detail}`
      : `Gemini 교정/요약 실패 (${model}, ${status})`
  } catch {
    return `Gemini 교정/요약 실패 (${model}, ${status}): ${responseText.slice(0, 240)}`
  }
}
