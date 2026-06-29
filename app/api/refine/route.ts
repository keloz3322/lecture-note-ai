import { NextResponse } from "next/server"
import type { RefineResult, TimelineItem, TranscriptSegment, TranscriptWord } from "@/lib/types"

export const runtime = "nodejs"
export const maxDuration = 60

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta"
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"
const FALLBACK_GEMINI_MODELS = ["gemini-2.5-flash-lite", "gemini-2.0-flash"]

const refineSchema = {
  type: "object",
  properties: {
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
      description: "Chronological lecture sections based on the provided timestamps.",
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
      description: "Important study points.",
      items: { type: "string" },
    },
    studyQuestions: {
      type: "array",
      description: "Review questions.",
      items: { type: "string" },
    },
    actionItems: {
      type: "array",
      description: "Follow-up action items.",
      items: { type: "string" },
    },
  },
  required: ["cleanedTranscript", "summary", "timeline", "keyPoints", "studyQuestions", "actionItems"],
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
    }

    if (!body.rawTranscript || body.rawTranscript.trim().length === 0) {
      return NextResponse.json({ error: "교정/요약할 전사문이 없습니다." }, { status: 400 })
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: "Gemini API 키가 서버에 설정되어 있지 않습니다." }, { status: 500 })
    }

    const input = {
      rawTranscript: body.rawTranscript,
      segments: normalizeIncomingSegments(body.segments),
      words: normalizeIncomingWords(body.words),
      durationSeconds: typeof body.durationSeconds === "number" ? body.durationSeconds : undefined,
    }
    const result = await refineWithGemini(apiKey, input)

    return NextResponse.json(result)
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "교정/요약에 실패했습니다. 잠시 후 다시 시도해 주세요."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

async function refineWithGemini(
  apiKey: string,
  input: {
    rawTranscript: string
    segments?: TranscriptSegment[]
    words?: TranscriptWord[]
    durationSeconds?: number
  },
): Promise<RefineResult> {
  const prompt = buildPrompt(input)
  let lastError: Error | null = null

  for (const model of getGeminiModels()) {
    const response = await fetch(`${GEMINI_API_BASE}/models/${encodeURIComponent(model)}:generateContent`, {
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
          responseMimeType: "application/json",
          responseSchema: geminiResponseSchema,
        },
      }),
    })

    const text = await response.text()
    if (!response.ok) {
      lastError = new Error(geminiErrorMessage(response.status, text, model))
      if (shouldTryNextGeminiModel(response.status, text)) continue
      throw lastError
    }

    try {
      const outputText = extractGeminiOutputText(text)
      const parsed = parseJsonObject(outputText)
      return normalizeRefineResult(parsed, input)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Gemini가 JSON 형식 결과를 반환하지 못했습니다.")
      continue
    }
  }

  throw lastError ?? new Error("Gemini 교정/요약에 실패했습니다.")
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
}: {
  rawTranscript: string
  segments?: TranscriptSegment[]
  words?: TranscriptWord[]
  durationSeconds?: number
}) {
  const timedTranscript = buildTimedTranscript(segments, rawTranscript)
  const wordTimestamps = buildWordTimestamps(words)
  const wordSection = wordTimestamps
    ? `\n\n단어 단위 타임스탬프(필요할 때만 참고):\n${wordTimestamps}`
    : ""
  const durationHint = durationSeconds ? `\n전체 길이: ${formatTimestamp(durationSeconds)}` : ""

  return `다음은 강의/발표 녹음에서 자동 전사한 원문입니다.

반드시 한국어로 답하세요.
반드시 JSON 객체 하나만 반환하세요. 설명문, 마크다운 코드펜스, 주석은 쓰지 마세요.
JSON 키는 cleanedTranscript, summary, timeline, keyPoints, studyQuestions, actionItems만 사용하세요.

작성 규칙:
- 원문의 의미를 보존하면서 말더듬, 반복 표현, 불필요한 추임새를 자연스럽게 정리하세요.
- 전사문에 없는 사실은 새로 만들지 마세요.
- timestamp가 있는 구간 전사문을 보고 timeline을 시간 순서대로 작성하세요.
- timeline은 4~8개 구간으로 묶고, start/end는 제공된 segment 시각을 근거로 초 단위 숫자로 쓰세요.
- 단어 단위 timestamp는 segment 경계가 애매하거나 특정 단어 위치를 확인할 때만 참고하세요.
- summary는 4~7문장, keyPoints는 5~9개, studyQuestions는 4~7개, actionItems는 3~6개로 작성하세요.${durationHint}

타임스탬프 포함 전사:
${timedTranscript}${wordSection}`
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
  },
): RefineResult {
  const outer = asRecord(value)
  const record = asRecord(outer.result || outer.data || value)
  const timeline = normalizeTimeline(record.timeline)

  return {
    cleanedTranscript:
      getText(record.cleanedTranscript) ||
      getText(record.cleaned_transcript) ||
      input.rawTranscript,
    summary: getText(record.summary) || "요약을 생성하지 못했습니다.",
    timeline: timeline.length ? timeline : buildFallbackTimeline(input.segments),
    keyPoints: toStringArray(record.keyPoints || record.key_points),
    studyQuestions: toStringArray(record.studyQuestions || record.study_questions),
    actionItems: toStringArray(record.actionItems || record.action_items),
  }
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
