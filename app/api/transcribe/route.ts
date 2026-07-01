import { NextResponse } from "next/server"
import { del, get } from "@vercel/blob"
import { getVercelOidcToken } from "@vercel/oidc"
import {
  DIRECT_UPLOAD_MAX_FILE_SIZE,
  SUPPORTED_EXTENSIONS,
  SUPPORTED_MIME_TYPES,
  type TimestampStatus,
  type TranscribeResult,
  type TranscriptSegment,
  type TranscriptWord,
} from "@/lib/types"
import { getExtension, formatBytes } from "@/lib/format"
import { reencodeToOpus, shouldReencode, probeDurationSeconds } from "@/lib/transcode"
import { createInputFile, computeSilenceScores, planChunks, extractChunkOpus } from "@/lib/vad-chunk"
import { getChunkPlan, getTranscriptionEngine, type TranscriptionEngine } from "@/lib/engines"

class PayloadTooLargeError extends Error {}

export const runtime = "nodejs"
// Download from Blob + ffmpeg transcode + transcription is the heaviest path.
// Pro allows up to 800s; give it a generous budget for large/long media.
// NOTE: Memory/CPU is NOT set here. With Fluid Compute (default on Pro) it cannot
// be configured via code or vercel.json — adjust it in the Vercel dashboard
// (Project → Settings → Functions) up to 4GB / 2 vCPU if ffmpeg needs more.
export const maxDuration = 800

const GROQ_TRANSCRIPTIONS_URL = "https://api.groq.com/openai/v1/audio/transcriptions"
const AI_GATEWAY_TRANSCRIPTIONS_URL = "https://ai-gateway.vercel.sh/v4/ai/transcription-model"
const AI_GATEWAY_PROTOCOL_VERSION = "0.0.1"

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

/**
 * Decide between single-shot and chunked transcription, then route to the engine.
 * Files that fit under the engine's per-chunk ceiling (model length limit and/or
 * file-size limit) are transcribed in one request; longer files are split at silence
 * valleys via ffmpeg silence detection and merged back with offset-corrected timestamps.
 */
async function transcribeBuffer(
  buffer: Buffer,
  fileName: string,
  contentType: string,
  engine: TranscriptionEngine,
): Promise<TranscribeResult> {
  const plan = getChunkPlan(engine)
  const duration = await probeDurationSeconds(buffer, fileName)

  if (duration == null || duration <= plan.maxSeconds) {
    const prepared = await prepareForTranscription(buffer, fileName, contentType, engine)
    return withTranscriptionMetadata(await transcribeOne(prepared, engine), engine)
  }

  return withTranscriptionMetadata(await transcribeChunked(buffer, fileName, engine, duration, plan), engine)
}

function withTranscriptionMetadata(result: TranscribeResult, engine: TranscriptionEngine): TranscribeResult {
  const timestampStatus: TimestampStatus = engine.supportsTimestamps
    ? result.segments?.length
      ? "available"
      : "unavailable"
    : "unsupported"
  return {
    ...result,
    timestampStatus,
    transcriptionEngineLabel: engine.label,
  }
}

/** Transcribe a single prepared audio payload with the selected engine. */
async function transcribeOne(prepared: PreparedAudio, engine: TranscriptionEngine): Promise<TranscribeResult> {
  if (engine.via === "groq") {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) throw new Error("Groq API 키가 서버에 설정되어 있지 않습니다.")
    return transcribeWithGroq(apiKey, prepared, engine)
  }
  return transcribeWithGateway(prepared, engine)
}

/**
 * Split long media at detected silence valleys, transcribe each chunk, and
 * merge the results. Each chunk's timestamps are shifted by the chunk's start
 * offset so the final timeline is continuous.
 */
async function transcribeChunked(
  buffer: Buffer,
  fileName: string,
  engine: TranscriptionEngine,
  duration: number,
  plan: ReturnType<typeof getChunkPlan>,
): Promise<TranscribeResult> {
  const { path, cleanup } = await createInputFile(buffer, fileName)
  try {
    const scores = await computeSilenceScores(path, duration)
    const chunks = planChunks(scores, duration, plan.targetSeconds, plan.maxSeconds)
    if (chunks.length === 0) throw new Error("오디오 분할 지점을 계산하지 못했습니다.")

    const parts: { result: TranscribeResult; offset: number }[] = []
    // Sequential to respect provider rate limits and bound peak memory.
    for (const chunk of chunks) {
      const opus = await extractChunkOpus(path, chunk.startSec, chunk.endSec)
      if (opus.byteLength > engine.maxFileSize) {
        throw new PayloadTooLargeError(
          `분할 후에도 청크 크기가 ${formatBytes(opus.byteLength)}로 ${engine.label} 한도(${formatBytes(engine.maxFileSize)})를 초과합니다.`,
        )
      }
      const prepared: PreparedAudio = {
        bytes: opus,
        fileName: `chunk-${chunk.index}.opus`,
        mediaType: "audio/ogg",
      }
      const result = await transcribeOne(prepared, engine)
      parts.push({ result, offset: chunk.startSec })
    }

    return mergeTranscripts(parts, duration)
  } finally {
    await cleanup()
  }
}

/** Concatenate chunk transcripts and shift their timestamps by each chunk's offset. */
function mergeTranscripts(parts: { result: TranscribeResult; offset: number }[], totalDuration: number): TranscribeResult {
  const rawTranscript = parts
    .map((p) => p.result.rawTranscript.trim())
    .filter(Boolean)
    .join("\n")

  const segments: TranscriptSegment[] = []
  const words: TranscriptWord[] = []
  let language: string | undefined

  for (const { result, offset } of parts) {
    if (!language && result.language) language = result.language
    for (const seg of result.segments ?? []) {
      segments.push({ start: seg.start + offset, end: seg.end + offset, text: seg.text })
    }
    for (const word of result.words ?? []) {
      words.push({ word: word.word, start: word.start + offset, end: word.end + offset })
    }
  }

  return {
    rawTranscript,
    language,
    durationSeconds: totalDuration,
    segments: segments.length > 0 ? segments : undefined,
    words: words.length > 0 ? words : undefined,
  }
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
  const auth = await getAiGatewayAuth()
  const response = await requestGatewayTranscription(auth, prepared, engine)
  if (!response.ok) throw new Error(`AI Gateway 전사 실패 (${engine.modelId}): ${response.errorText}`)

  return normalizeGatewayResult(response.data)
}

async function getAiGatewayAuth(): Promise<{ token: string; authMethod: "api-key" | "oidc" }> {
  const apiKey = process.env.AI_GATEWAY_API_KEY?.trim()
  if (apiKey) return { token: apiKey, authMethod: "api-key" }

  const oidcToken = (await getVercelOidcToken().catch(() => undefined)) || process.env.VERCEL_OIDC_TOKEN?.trim()
  if (!oidcToken) {
    throw new Error("AI Gateway 인증 토큰이 설정되어 있지 않습니다.")
  }

  return { token: oidcToken, authMethod: "oidc" }
}

async function requestGatewayTranscription(
  auth: { token: string; authMethod: "api-key" | "oidc" },
  prepared: PreparedAudio,
  engine: TranscriptionEngine,
): Promise<{ ok: true; data: unknown } | { ok: false; status: number; errorText: string }> {
  const response = await fetch(AI_GATEWAY_TRANSCRIPTIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth.token}`,
      "ai-gateway-protocol-version": AI_GATEWAY_PROTOCOL_VERSION,
      "ai-gateway-auth-method": auth.authMethod,
      "ai-model-id": engine.modelId,
      "ai-transcription-model-specification-version": "4",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      audio: prepared.bytes.toString("base64"),
      mediaType: prepared.mediaType || "audio/ogg",
      ...(engine.supportsTimestamps
        ? { providerOptions: { openai: { timestampGranularities: ["segment"] } } }
        : {}),
    }),
  })

  const text = await response.text()
  if (!response.ok) {
    return { ok: false, status: response.status, errorText: extractErrorMessage(text) || text.slice(0, 240) }
  }

  try {
    return { ok: true, data: JSON.parse(text) }
  } catch {
    return { ok: true, data: { text } }
  }
}

function normalizeGatewayResult(data: unknown): TranscribeResult {
  const object = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {}
  const rawTranscript = getText(object.text)

  if (!rawTranscript) {
    throw new Error("AI Gateway 전사 결과가 비어 있습니다.")
  }

  return {
    rawTranscript,
    language: getText(object.language) || undefined,
    durationSeconds: toNumber(object.durationInSeconds) ?? undefined,
    segments: normalizeGatewaySegments(object.segments),
    words: undefined,
  }
}

function normalizeGatewaySegments(value: unknown): TranscriptSegment[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined
  const mapped = value
    .map((seg) => {
      const record = typeof seg === "object" && seg !== null ? (seg as Record<string, unknown>) : {}
      const start = toNumber(record.startSecond ?? record.start)
      const end = toNumber(record.endSecond ?? record.end)
      const text = getText(record.text)
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
 * Prepare media for a single-shot request (used when the file already fits under
 * the engine's per-chunk ceiling). Video or oversized audio is compressed to Opus
 * (16kHz mono, 32kbps). Longer media is handled by the chunked path instead, so a
 * size overflow here is unexpected and surfaced as a clear error.
 */
async function prepareForTranscription(
  buffer: Buffer,
  fileName: string,
  contentType: string,
  engine: TranscriptionEngine,
): Promise<PreparedAudio> {
  const threshold = reencodeThresholdFor(engine)

  if (!shouldReencode(fileName, contentType, buffer.byteLength, threshold)) {
    return { bytes: buffer, fileName, mediaType: contentType || "audio/ogg" }
  }

  const opus = await reencodeToOpus(buffer, fileName)

  if (opus.byteLength > engine.maxFileSize) {
    throw new PayloadTooLargeError(
      `압축 후에도 파일 크기가 ${formatBytes(opus.byteLength)}로 ${engine.label} 한도(${formatBytes(engine.maxFileSize)})를 초과합니다.`,
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
