import { NextResponse } from "next/server"
import { del, get } from "@vercel/blob"
import { transcribe } from "ai"
import { gateway } from "@ai-sdk/gateway"
import {
  DIRECT_UPLOAD_MAX_FILE_SIZE,
  SUPPORTED_EXTENSIONS,
  SUPPORTED_MIME_TYPES,
  type TranscribeResult,
  type TranscriptSegment,
  type TranscriptWord,
} from "@/lib/types"
import { getExtension, formatBytes } from "@/lib/format"
import { reencodeToOpus, shouldReencode, probeDurationSeconds } from "@/lib/transcode"
import { checkDurationLimit, getTranscriptionEngine, type TranscriptionEngine } from "@/lib/engines"

class PayloadTooLargeError extends Error {}
class MediaTooLongError extends Error {}

export const runtime = "nodejs"
// Larger files need more time to download from Blob and transcribe.
// Capped automatically to the plan's max (60s on Hobby, up to 300s on Pro).
export const maxDuration = 300

const GROQ_TRANSCRIPTIONS_URL = "https://api.groq.com/openai/v1/audio/transcriptions"

/** Re-encode when within 1MB of the engine's hard limit. */
function reencodeThresholdFor(engine: TranscriptionEngine) {
  return Math.max(engine.maxFileSize - 1024 * 1024, 1024 * 1024)
}

export async function POST(request: Request) {
  let cleanupTarget: string | undefined
  try {
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await request.formData()
      const file = form.get("file")
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "전사할 오디오 파일이 없습니다." }, { status: 400 })
      }
      const engine = getTranscriptionEngine(getFormString(form.get("engine")))
      validateDirectUpload(file)
      const buffer = Buffer.from(await file.arrayBuffer())
      const result = await transcribeBuffer(buffer, file.name, file.type, engine)
      return NextResponse.json(result)
    }

    const body = (await request.json().catch(() => ({}))) as {
      pathname?: string
      audioUrl?: string
      fileName?: string
      engine?: string
    }
    cleanupTarget = body.pathname ?? body.audioUrl
    const engine = getTranscriptionEngine(body.engine)

    if (!body.pathname) {
      return NextResponse.json({ error: "전사할 오디오 정보가 없습니다." }, { status: 400 })
    }

    const fileName = body.fileName ?? "audio.ogg"
    // The Blob store is private, so the provider cannot fetch the URL directly.
    // Download the file server-side (Blob -> server, bypassing the request body limit),
    // compress it if needed, and hand it to the selected engine.
    const { buffer, contentType } = await downloadPrivateBlob(body.pathname)
    const result = await transcribeBuffer(buffer, fileName, contentType, engine)
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return NextResponse.json({ error: error.message }, { status: 413 })
    }
    if (error instanceof MediaTooLongError) {
      return NextResponse.json({ error: error.message }, { status: 422 })
    }
    const message = error instanceof Error ? error.message : "전사에 실패했습니다. 잠시 후 다시 시도해 주세요."
    return NextResponse.json({ error: message }, { status: 500 })
  } finally {
    if (cleanupTarget) await deleteTemporaryBlob(cleanupTarget)
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

/** Prepare the media and route it to the selected transcription engine. */
async function transcribeBuffer(
  buffer: Buffer,
  fileName: string,
  contentType: string,
  engine: TranscriptionEngine,
): Promise<TranscribeResult> {
  const prepared = await prepareForTranscription(buffer, fileName, contentType, engine)

  if (engine.via === "groq") {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) throw new Error("Groq API 키가 서버에 설정되어 있지 않습니다.")
    return transcribeWithGroq(apiKey, prepared, engine)
  }

  return transcribeWithGateway(prepared, engine)
}

interface PreparedAudio {
  bytes: Buffer
  fileName: string
  mediaType: string
}

async function transcribeWithGroq(
  apiKey: string,
  prepared: PreparedAudio,
  engine: TranscriptionEngine,
): Promise<TranscribeResult> {
  const fileForm = new FormData()
  fileForm.append("model", process.env.GROQ_TRANSCRIPTION_MODEL || engine.modelId)
  fileForm.append("response_format", "verbose_json")
  fileForm.append("temperature", "0")
  appendTimestampOptions(fileForm)
  fileForm.append("file", new File([prepared.bytes], prepared.fileName, { type: prepared.mediaType }), prepared.fileName)

  const fileResult = await requestGroq(apiKey, fileForm)
  if (!fileResult.ok) throw new Error(groqErrorMessage(fileResult.status, fileResult.errorText))

  return normalizeGroqResult(fileResult.data)
}

/** Transcribe via the Vercel AI Gateway using the AI SDK's transcribe(). */
async function transcribeWithGateway(
  prepared: PreparedAudio,
  engine: TranscriptionEngine,
): Promise<TranscribeResult> {
  try {
    const result = await transcribe({
      model: gateway.transcriptionModel(engine.modelId),
      audio: new Uint8Array(prepared.bytes),
      // Best-effort: ask Whisper for segment timestamps. Ignored by models that
      // don't support them (e.g. gpt-4o-transcribe).
      ...(engine.supportsTimestamps
        ? { providerOptions: { openai: { timestampGranularities: ["segment"] } } }
        : {}),
    })

    const rawTranscript = result.text?.trim()
    if (!rawTranscript) throw new Error("전사 결과가 비어 있습니다.")

    return {
      rawTranscript,
      language: result.language || undefined,
      durationSeconds: result.durationInSeconds || undefined,
      segments: normalizeGatewaySegments(result.segments),
      words: undefined,
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`AI Gateway 전사 실패 (${engine.modelId}): ${detail}`)
  }
}

function normalizeGatewaySegments(
  segments: { text: string; startSecond: number; endSecond: number }[] | undefined,
): TranscriptSegment[] | undefined {
  if (!Array.isArray(segments) || segments.length === 0) return undefined
  const mapped = segments
    .map((seg) => {
      const start = toNumber(seg.startSecond)
      const end = toNumber(seg.endSecond)
      const text = getText(seg.text)
      if (start == null || end == null || !text) return null
      return { start, end, text }
    })
    .filter((item): item is TranscriptSegment => item !== null)
  return mapped.length > 0 ? mapped : undefined
}

async function downloadPrivateBlob(pathname: string): Promise<{ buffer: Buffer; contentType: string }> {
  const result = await get(pathname, { access: "private" })
  if (!result || !result.stream) {
    throw new Error("업로드된 오디오 파일을 찾을 수 없습니다.")
  }

  const arrayBuffer = await new Response(result.stream).arrayBuffer()
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: result.blob.contentType || "audio/ogg",
  }
}

/**
 * Prepare the downloaded media for the selected engine. Files that are video or
 * larger than the engine's re-encode threshold are compressed to Opus (16kHz
 * mono, 32kbps). If the result still exceeds the engine's hard limit, we stop and
 * surface a clear message (chunking is intentionally not implemented yet).
 */
async function prepareForTranscription(
  buffer: Buffer,
  fileName: string,
  contentType: string,
  engine: TranscriptionEngine,
): Promise<PreparedAudio> {
  // Enforce the model's hard length limit (e.g. gpt-4o transcribe: 25 min).
  // Length is unchanged by re-encoding, so we probe the original input.
  if (engine.maxDurationSeconds) {
    const duration = await probeDurationSeconds(buffer, fileName)
    const lengthError = checkDurationLimit(engine, duration ?? undefined)
    if (lengthError) throw new MediaTooLongError(lengthError)
  }

  const threshold = reencodeThresholdFor(engine)

  if (!shouldReencode(fileName, contentType, buffer.byteLength, threshold)) {
    return { bytes: buffer, fileName, mediaType: contentType || "audio/ogg" }
  }

  const opus = await reencodeToOpus(buffer, fileName)

  if (opus.byteLength > engine.maxFileSize) {
    throw new PayloadTooLargeError(
      `압축 후에도 파일 크기가 ${formatBytes(opus.byteLength)}로 ${engine.label} 한도(${formatBytes(engine.maxFileSize)})를 초과합니다. ` +
        `더 짧은 길이로 나눠서 업로드해 주세요. (긴 파일 자동 분할은 추후 지원 예정입니다.)`,
    )
  }

  const baseName = fileName.replace(/\.[^./\\]+$/, "")
  return { bytes: Buffer.from(opus), fileName: `${baseName}.opus`, mediaType: "audio/ogg" }
}

function getFormString(value: FormDataEntryValue | null): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
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

async function deleteTemporaryBlob(urlOrPathname: string) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return
  try {
    // Accepts either a blob URL or a pathname (private blob URLs aren't publicly
    // routable, so we delete by pathname when available).
    await del(urlOrPathname)
  } catch {
    // Best-effort cleanup. A failed delete should not hide a successful transcript.
  }
}
