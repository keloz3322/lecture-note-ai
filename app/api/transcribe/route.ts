import { NextResponse } from "next/server"
import { del } from "@vercel/blob"
import {
  DIRECT_UPLOAD_MAX_FILE_SIZE,
  SUPPORTED_EXTENSIONS,
  SUPPORTED_MIME_TYPES,
  type TranscribeResult,
  type TranscriptSegment,
  type TranscriptWord,
} from "@/lib/types"
import { getExtension } from "@/lib/format"

export const runtime = "nodejs"
export const maxDuration = 60

const GROQ_TRANSCRIPTIONS_URL = "https://api.groq.com/openai/v1/audio/transcriptions"
const DEFAULT_GROQ_MODEL = "whisper-large-v3"

export async function POST(request: Request) {
  let audioUrl: string | undefined
  try {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: "Groq API 키가 서버에 설정되어 있지 않습니다." }, { status: 500 })
    }

    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await request.formData()
      const file = form.get("file")
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "전사할 오디오 파일이 없습니다." }, { status: 400 })
      }
      validateDirectUpload(file)
      const result = await transcribeFileWithGroq(apiKey, file)
      return NextResponse.json(result)
    }

    const body = (await request.json().catch(() => ({}))) as {
      audioUrl?: string
      fileName?: string
    }
    audioUrl = body.audioUrl

    if (!body.audioUrl || !isHttpUrl(body.audioUrl)) {
      return NextResponse.json({ error: "전사할 오디오 정보가 없습니다." }, { status: 400 })
    }

    const result = await transcribeWithGroq({
      apiKey,
      audioUrl: body.audioUrl,
      fileName: body.fileName ?? "lecture-audio.ogg",
    })
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : "전사에 실패했습니다. 잠시 후 다시 시도해 주세요."
    return NextResponse.json({ error: message }, { status: 500 })
  } finally {
    if (audioUrl) await deleteTemporaryBlob(audioUrl)
  }
}

function validateDirectUpload(file: File) {
  const ext = getExtension(file.name)
  if (!SUPPORTED_EXTENSIONS.includes(ext as (typeof SUPPORTED_EXTENSIONS)[number])) {
    throw new Error(`지원하지 않는 파일 형식입니다. (${SUPPORTED_EXTENSIONS.join(", ")} 만 지원)`)
  }

  if (file.size > DIRECT_UPLOAD_MAX_FILE_SIZE) {
    throw new Error("현재 배포 모드에서는 4.2MB 이하 파일만 안정적으로 처리할 수 있습니다.")
  }

  if (file.type && !(SUPPORTED_MIME_TYPES as readonly string[]).includes(file.type)) {
    throw new Error("지원하지 않는 오디오 MIME 형식입니다.")
  }
}

async function transcribeFileWithGroq(apiKey: string, file: File): Promise<TranscribeResult> {
  const model = process.env.GROQ_TRANSCRIPTION_MODEL || DEFAULT_GROQ_MODEL
  const fileForm = new FormData()
  fileForm.append("model", model)
  fileForm.append("response_format", "verbose_json")
  fileForm.append("temperature", "0")
  appendTimestampOptions(fileForm)
  fileForm.append("file", file, file.name)

  const fileResult = await requestGroq(apiKey, fileForm)
  if (!fileResult.ok) throw new Error(groqErrorMessage(fileResult.status, fileResult.errorText))

  return normalizeGroqResult(fileResult.data)
}

async function transcribeWithGroq({
  apiKey,
  audioUrl,
  fileName,
}: {
  apiKey: string
  audioUrl: string
  fileName: string
}): Promise<TranscribeResult> {
  const model = process.env.GROQ_TRANSCRIPTION_MODEL || DEFAULT_GROQ_MODEL
  const urlResult = await requestGroq(apiKey, buildUrlForm(audioUrl, model))

  if (urlResult.ok) return normalizeGroqResult(urlResult.data)
  if (!shouldFallbackToFile(urlResult.status, urlResult.errorText)) {
    throw new Error(groqErrorMessage(urlResult.status, urlResult.errorText))
  }

  const audioResponse = await fetch(audioUrl)
  if (!audioResponse.ok) {
    throw new Error("업로드된 오디오 파일을 다시 읽지 못했습니다.")
  }

  const audioBlob = await audioResponse.blob()
  const fileForm = new FormData()
  fileForm.append("model", model)
  fileForm.append("response_format", "verbose_json")
  fileForm.append("temperature", "0")
  appendTimestampOptions(fileForm)
  fileForm.append("file", new File([audioBlob], fileName, { type: audioBlob.type || "audio/ogg" }))

  const fileResult = await requestGroq(apiKey, fileForm)
  if (!fileResult.ok) throw new Error(groqErrorMessage(fileResult.status, fileResult.errorText))

  return normalizeGroqResult(fileResult.data)
}

function buildUrlForm(audioUrl: string, model: string) {
  const form = new FormData()
  form.append("model", model)
  form.append("url", audioUrl)
  form.append("response_format", "verbose_json")
  form.append("temperature", "0")
  appendTimestampOptions(form)
  return form
}

function appendTimestampOptions(form: FormData) {
  form.append("timestamp_granularities[]", "segment")
  form.append("timestamp_granularities[]", "word")
}

async function requestGroq(
  apiKey: string,
  form: FormData,
): Promise<{ ok: true; data: unknown } | { ok: false; status: number; errorText: string }> {
  const response = await fetch(GROQ_TRANSCRIPTIONS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  })

  const text = await response.text()
  if (!response.ok) return { ok: false, status: response.status, errorText: text }

  try {
    return { ok: true, data: JSON.parse(text) }
  } catch {
    return { ok: true, data: { text } }
  }
}

function normalizeGroqResult(data: unknown): TranscribeResult {
  const object = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {}
  const rawTranscript = getText(object.text)

  if (!rawTranscript) {
    throw new Error("Groq 전사 결과가 비어 있습니다.")
  }

  return {
    rawTranscript,
    language: getText(object.language) || undefined,
    durationSeconds: typeof object.duration === "number" ? object.duration : undefined,
    segments: normalizeSegments(object.segments),
    words: normalizeWords(object.words),
  }
}

function normalizeSegments(value: unknown): TranscriptSegment[] | undefined {
  if (!Array.isArray(value)) return undefined
  const segments = value
    .map((item) => {
      const segment = typeof item === "object" && item !== null ? (item as Record<string, unknown>) : {}
      const start = toNumber(segment.start)
      const end = toNumber(segment.end)
      const text = getText(segment.text)
      if (start == null || end == null || !text) return null
      const id = toNumber(segment.id)
      return id == null ? { start, end, text } : { id, start, end, text }
    })
    .filter((item): item is TranscriptSegment => item !== null)
  return segments.length > 0 ? segments : undefined
}

function normalizeWords(value: unknown): TranscriptWord[] | undefined {
  if (!Array.isArray(value)) return undefined
  const words = value
    .map((item) => {
      const word = typeof item === "object" && item !== null ? (item as Record<string, unknown>) : {}
      const start = toNumber(word.start)
      const end = toNumber(word.end)
      const text = getText(word.word)
      if (start == null || end == null || !text) return null
      return { word: text, start, end }
    })
    .filter((item): item is TranscriptWord => item !== null)
  return words.length > 0 ? words : undefined
}

function toNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function shouldFallbackToFile(status: number, errorText: string) {
  return status === 400 && /\burl\b/i.test(errorText)
}

function groqErrorMessage(status: number, errorText: string) {
  const detail = extractErrorMessage(errorText)
  return detail ? `Groq 전사 실패 (${status}): ${detail}` : `Groq 전사 실패 (${status})`
}

function extractErrorMessage(errorText: string) {
  try {
    const parsed = JSON.parse(errorText) as { error?: { message?: unknown }; message?: unknown }
    return getText(parsed.error?.message) || getText(parsed.message)
  } catch {
    return errorText.slice(0, 240)
  }
}

function getText(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === "https:" || url.protocol === "http:"
  } catch {
    return false
  }
}

async function deleteTemporaryBlob(audioUrl: string) {
  if (!process.env.BLOB_READ_WRITE_TOKEN || !audioUrl.includes("blob.vercel-storage.com")) return
  try {
    await del(audioUrl)
  } catch {
    // Best-effort cleanup. A failed delete should not hide a successful transcript.
  }
}
