import { NextResponse } from "next/server"
import { generateObject } from "ai"
import { z } from "zod"
import { getContentType, isContentTypeId } from "@/lib/content-types"
import { getRefineEngine, type RefineEngine } from "@/lib/engines"

export const runtime = "nodejs"
export const maxDuration = 300

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta"
const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash"
const GEMINI_THINKING_LEVEL = "medium"
const FALLBACK_GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"]
const TRANSLATION_CHUNK_CHAR_LIMIT = 9000
const MAX_TRANSLATION_CHUNKS = 8
const TRANSLATION_TOTAL_CHAR_LIMIT = TRANSLATION_CHUNK_CHAR_LIMIT * MAX_TRANSLATION_CHUNKS

const translationZodSchema = z.object({
  sourceLanguage: z.string(),
  translatedTranscriptKo: z.string(),
})

const translationSchema = {
  type: "object",
  properties: {
    sourceLanguage: {
      type: "string",
      description: "Detected source language name, e.g. English, Japanese, Korean.",
    },
    translatedTranscriptKo: {
      type: "string",
      description: "Natural Korean translation of the provided cleaned transcript chunk. Do not summarize.",
    },
  },
  required: ["sourceLanguage", "translatedTranscriptKo"],
  additionalProperties: false,
} as const

const geminiResponseSchema = stripUnsupportedSchemaFields(translationSchema)

type TranslationOutput = z.infer<typeof translationZodSchema>

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      text?: string
      engine?: string
      contentType?: string
    }

    const text = getText(body.text)
    if (!text) {
      return NextResponse.json({ error: "번역할 정리된 전사문이 없습니다." }, { status: 400 })
    }

    if (isMostlyKorean(text)) {
      return NextResponse.json({
        translatedTranscriptKo: text,
        translatedTranscriptKoNotice: "정리된 전사문이 이미 한국어라 같은 내용을 표시합니다.",
      })
    }

    const engine = getRefineEngine(body.engine)
    const contentTypeLabel = isContentTypeId(body.contentType) ? getContentType(body.contentType).label : "일반"
    const { chunks, truncated } = splitTranscript(text)
    const translatedChunks: string[] = []
    let sourceLanguage = ""

    for (let index = 0; index < chunks.length; index++) {
      const output = await translateChunk(engine, {
        chunk: chunks[index],
        index,
        total: chunks.length,
        contentTypeLabel,
      })
      sourceLanguage ||= output.sourceLanguage
      translatedChunks.push(output.translatedTranscriptKo)
    }

    return NextResponse.json({
      translatedTranscriptKo: translatedChunks.join("\n\n").trim(),
      translatedTranscriptKoNotice: truncated
        ? `긴 전사문이라 현재 한국어 번역본은 앞부분 약 ${TRANSLATION_TOTAL_CHAR_LIMIT.toLocaleString(
            "ko-KR",
          )}자 기준으로 생성했습니다. 원문 전사문 전체는 그대로 보존됩니다.`
        : undefined,
      sourceLanguage: sourceLanguage || undefined,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "한국어 번역본을 생성하지 못했습니다."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

async function translateChunk(
  engine: RefineEngine,
  input: { chunk: string; index: number; total: number; contentTypeLabel: string },
): Promise<TranslationOutput> {
  if (engine.via === "gemini") {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) throw new Error("Gemini API 키가 서버에 설정되어 있지 않습니다.")
    return translateWithGemini(apiKey, input)
  }
  return translateWithGateway(engine, input)
}

async function translateWithGateway(
  engine: RefineEngine,
  input: { chunk: string; index: number; total: number; contentTypeLabel: string },
) {
  try {
    const { object } = await generateObject({
      model: engine.modelId,
      schema: translationZodSchema,
      prompt: buildPrompt(input),
      temperature: 0.1,
    })
    return normalizeTranslationOutput(object)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`AI Gateway 한국어 번역 실패 (${engine.modelId}): ${detail}`)
  }
}

async function translateWithGemini(
  apiKey: string,
  input: { chunk: string; index: number; total: number; contentTypeLabel: string },
) {
  let lastError: Error | null = null

  for (const model of getGeminiModels()) {
    const response = await fetchGeminiGenerateContent(apiKey, model, buildPrompt(input))
    const text = await response.text()

    if (!response.ok) {
      lastError = new Error(geminiErrorMessage(response.status, text, model))
      if (shouldTryNextGeminiModel(response.status, text)) continue
      throw lastError
    }

    try {
      return normalizeTranslationOutput(parseJsonObject(extractGeminiOutputText(text)))
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Gemini가 JSON 형식의 번역 결과를 반환하지 못했습니다.")
      continue
    }
  }

  throw lastError ?? new Error("Gemini 한국어 번역에 실패했습니다.")
}

function buildPrompt({
  chunk,
  index,
  total,
  contentTypeLabel,
}: {
  chunk: string
  index: number
  total: number
  contentTypeLabel: string
}) {
  const partLabel = total > 1 ? `\n이 입력은 전체 전사문 중 ${index + 1}/${total}번째 조각입니다.` : ""
  return `다음은 "${contentTypeLabel}" 유형으로 정리된 전사문입니다.${partLabel}

작업:
- 원문 의미와 문단 순서를 유지해 자연스러운 한국어로 번역하세요.
- 요약하지 말고, 새로운 해석이나 정보를 추가하지 마세요.
- 인명, 기관명, 날짜, 수치, 약어는 가능한 한 보존하고 필요하면 괄호로 원문을 유지하세요.
- 발화체의 어색한 반복은 읽기 좋게 다듬되, 회의 절차나 결정 사항은 빠뜨리지 마세요.
- 반드시 JSON 객체 하나만 반환하세요.

JSON 키:
- sourceLanguage: 원문 언어
- translatedTranscriptKo: 한국어 번역문

전사문:
${chunk}`
}

function splitTranscript(text: string) {
  const source = text.length > TRANSLATION_TOTAL_CHAR_LIMIT ? text.slice(0, TRANSLATION_TOTAL_CHAR_LIMIT) : text
  const chunks: string[] = []
  let cursor = 0

  while (cursor < source.length) {
    const hardEnd = Math.min(source.length, cursor + TRANSLATION_CHUNK_CHAR_LIMIT)
    const slice = source.slice(cursor, hardEnd)
    const softBreak = Math.max(slice.lastIndexOf("\n\n"), slice.lastIndexOf(". "), slice.lastIndexOf("? "))
    const end =
      hardEnd < source.length && softBreak > TRANSLATION_CHUNK_CHAR_LIMIT * 0.55 ? cursor + softBreak + 1 : hardEnd
    const chunk = source.slice(cursor, end).trim()
    if (chunk) chunks.push(chunk)
    cursor = end
  }

  return { chunks, truncated: text.length > source.length }
}

function isMostlyKorean(text: string) {
  const korean = (text.match(/[\uac00-\ud7a3]/g) ?? []).length
  const latin = (text.match(/[A-Za-z]/g) ?? []).length
  return korean > 80 && korean >= latin * 0.45
}

function fetchGeminiGenerateContent(apiKey: string, model: string, prompt: string) {
  return fetch(`${GEMINI_API_BASE}/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        thinkingConfig: { thinkingLevel: GEMINI_THINKING_LEVEL },
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

function normalizeTranslationOutput(value: unknown): TranslationOutput {
  const record = asRecord(value)
  const sourceLanguage = getText(record.sourceLanguage) || getText(record.source_language) || "unknown"
  const translatedTranscriptKo = getText(record.translatedTranscriptKo) || getText(record.translated_transcript_ko)
  if (!translatedTranscriptKo) throw new Error("한국어 번역문이 비어 있습니다.")
  return { sourceLanguage, translatedTranscriptKo }
}

function extractGeminiOutputText(responseText: string) {
  let data: unknown
  try {
    data = JSON.parse(responseText)
  } catch {
    return responseText
  }

  const record = asRecord(data)
  if (record.translatedTranscriptKo || record.translated_transcript_ko) return responseText

  const candidateText = extractGenerateContentText(record.candidates)
  if (candidateText) return candidateText

  throw new Error("Gemini 응답에서 번역 텍스트를 찾지 못했습니다.")
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
    throw new Error("Gemini가 JSON 형식의 번역 결과를 반환하지 못했습니다.")
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
      ? `Gemini 한국어 번역 실패 (${model}, ${status}): ${detail}`
      : `Gemini 한국어 번역 실패 (${model}, ${status})`
  } catch {
    return `Gemini 한국어 번역 실패 (${model}, ${status}): ${responseText.slice(0, 240)}`
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {}
}

function getText(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}
