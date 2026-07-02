"use client"

import { useCallback, useRef, useState } from "react"
import type { ContentTypeId } from "@/lib/content-types"
import { DEFAULT_REFINE_ENGINE } from "@/lib/engines"
import liveDemoResult from "@/lib/live-demo-result.json"
import {
  LIVE_TRANSLATE_ENGINE_LABEL,
  LIVE_TRANSLATE_MODEL,
  type LiveTranslateLanguageCode,
} from "@/lib/live-translate"
import type { RefineResult, TranscriptSegment } from "@/lib/types"

type LiveStatus = "idle" | "connecting" | "listening" | "stopping" | "stopped" | "refining" | "error"
type NoteSource = "source" | "translation" | "both"
type DemoTimer = number

interface LiveRecording {
  url: string
  fileName: string
  mimeType: string
  size: number
}

interface TokenResponse {
  token: string
  model: string
  targetLanguageCode: LiveTranslateLanguageCode
  echoTargetLanguage: boolean
}

interface TranscriptChunk {
  id: string
  text: string
  languageCode?: string
  receivedAtSeconds: number
}

interface AudioResources {
  context: AudioContext
  stream: MediaStream
  source: MediaStreamAudioSourceNode
  processor: ScriptProcessorNode
  sink: GainNode
}

interface ServerMessage {
  setupComplete?: Record<string, never>
  serverContent?: {
    inputTranscription?: {
      text?: string
      languageCode?: string
    }
    outputTranscription?: {
      text?: string
      languageCode?: string
    }
    turnComplete?: boolean
  }
  usageMetadata?: {
    totalTokenCount?: number
  }
}

interface LiveDemoData {
  session: {
    targetLanguageCode: LiveTranslateLanguageCode
    usageTokens: number | null
    sourceChunks: TranscriptChunk[]
    translationChunks: TranscriptChunk[]
  }
  result: RefineResult
}

const LIVE_DEMO = liveDemoResult as LiveDemoData
const LIVE_DEMO_AUDIO_DELAY_MS = 1500
const LIVE_DEMO_SECONDS_TO_MS = 1000
const LIVE_DEMO_STREAM_LEAD_SECONDS = 2
const LIVE_DEMO_REFINE_DELAY_MS = 4000

export function useLiveTranslate() {
  const [status, setStatus] = useState<LiveStatus>("idle")
  const [error, setError] = useState<string | null>(null)
  const [sourceChunks, setSourceChunks] = useState<TranscriptChunk[]>([])
  const [translationChunks, setTranslationChunks] = useState<TranscriptChunk[]>([])
  const [result, setResult] = useState<RefineResult | null>(null)
  const [changingType, setChangingType] = useState(false)
  const [usageTokens, setUsageTokens] = useState<number | null>(null)
  const [targetLanguageCode, setTargetLanguageCode] = useState<LiveTranslateLanguageCode>("ko")
  const [recording, setRecording] = useState<LiveRecording | null>(null)
  const [isRecording, setIsRecording] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)
  const audioRef = useRef<AudioResources | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const recordingChunksRef = useRef<BlobPart[]>([])
  const recordingUrlRef = useRef<string | null>(null)
  const startedAtRef = useRef(0)
  const chunkIdRef = useRef(0)
  const sourceTextRef = useRef("")
  const translationTextRef = useRef("")
  const noteSourceRef = useRef<NoteSource>("translation")
  const refineEngineRef = useRef<string>(DEFAULT_REFINE_ENGINE)
  const demoTimersRef = useRef<DemoTimer[]>([])
  const demoRunIdRef = useRef(0)
  const isDemoRef = useRef(false)

  const clearDemoTimers = useCallback(() => {
    demoTimersRef.current.forEach((timer) => window.clearTimeout(timer))
    demoTimersRef.current = []
    demoRunIdRef.current += 1
    isDemoRef.current = false
  }, [])

  const clearRecording = useCallback(() => {
    if (recordingUrlRef.current) {
      URL.revokeObjectURL(recordingUrlRef.current)
      recordingUrlRef.current = null
    }
    recordingChunksRef.current = []
    setRecording(null)
    setIsRecording(false)
  }, [])

  const stopRecording = useCallback((discard = false) => {
    const recorder = recorderRef.current
    recorderRef.current = null
    if (!recorder) {
      if (discard) clearRecording()
      return
    }

    recorder.onstop = () => {
      setIsRecording(false)
      if (discard) {
        clearRecording()
        return
      }

      const chunks = recordingChunksRef.current
      if (chunks.length === 0) {
        setRecording(null)
        return
      }

      if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current)
      const mimeType = recorder.mimeType || "audio/webm"
      const blob = new Blob(chunks, { type: mimeType })
      const url = URL.createObjectURL(blob)
      recordingUrlRef.current = url
      setRecording({
        url,
        fileName: createRecordingFileName(mimeType),
        mimeType,
        size: blob.size,
      })
      recordingChunksRef.current = []
    }

    if (recorder.state === "inactive") {
      recorder.onstop(new Event("stop"))
      return
    }
    recorder.stop()
  }, [clearRecording])

  const startRecording = useCallback(
    (stream: MediaStream) => {
      if (typeof MediaRecorder === "undefined") return

      clearRecording()
      try {
        const mimeType = getRecordingMimeType()
        const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)

        recordingChunksRef.current = []
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) recordingChunksRef.current.push(event.data)
        }
        recorder.onerror = () => {
          setIsRecording(false)
        }

        recorderRef.current = recorder
        recorder.start(1000)
        setIsRecording(true)
      } catch {
        recorderRef.current = null
        recordingChunksRef.current = []
        setIsRecording(false)
      }
    },
    [clearRecording],
  )

  const appendChunk = useCallback((kind: "source" | "translation", text: string, languageCode?: string) => {
    const normalized = normalizeTranscriptPiece(text)
    if (!normalized) return

    const chunk: TranscriptChunk = {
      id: `${kind}-${++chunkIdRef.current}`,
      text: normalized,
      languageCode,
      receivedAtSeconds: elapsedSeconds(startedAtRef.current),
    }

    if (kind === "source") {
      sourceTextRef.current = joinTranscript(sourceTextRef.current, normalized)
      setSourceChunks((prev) => [...prev, chunk])
    } else {
      translationTextRef.current = joinTranscript(translationTextRef.current, normalized)
      setTranslationChunks((prev) => [...prev, chunk])
    }
  }, [])

  const stop = useCallback(() => {
    if (isDemoRef.current) {
      clearDemoTimers()
      setStatus("stopped")
      return
    }

    setStatus((prev) => (prev === "idle" || prev === "stopped" ? prev : "stopping"))
    stopRecording(false)
    stopAudio(audioRef.current)
    audioRef.current = null

    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }))
      window.setTimeout(() => ws.close(1000, "user stopped"), 350)
    } else {
      ws?.close()
      setStatus("stopped")
    }
    wsRef.current = null
  }, [clearDemoTimers, stopRecording])

  const reset = useCallback(() => {
    clearDemoTimers()
    stopRecording(true)
    stopAudio(audioRef.current)
    audioRef.current = null
    wsRef.current?.close()
    wsRef.current = null
    sourceTextRef.current = ""
    translationTextRef.current = ""
    chunkIdRef.current = 0
    setSourceChunks([])
    setTranslationChunks([])
    setResult(null)
    setError(null)
    setUsageTokens(null)
    setStatus("idle")
    setChangingType(false)
  }, [clearDemoTimers, stopRecording])

  const start = useCallback(
    async (options: { targetLanguageCode: LiveTranslateLanguageCode; echoTargetLanguage: boolean }) => {
      reset()
      setStatus("connecting")
      setTargetLanguageCode(options.targetLanguageCode)
      startedAtRef.current = performance.now()

      try {
        const token = await createLiveToken(options.targetLanguageCode, options.echoTargetLanguage)
        const ws = await openLiveSocket(token, options)
        wsRef.current = ws
        audioRef.current = await startMicrophoneStreaming((base64Audio) => {
          if (ws.readyState !== WebSocket.OPEN) return
          ws.send(
            JSON.stringify({
              realtimeInput: {
                audio: {
                  data: base64Audio,
                  mimeType: "audio/pcm;rate=16000",
                },
              },
            }),
          )
        })
        startRecording(audioRef.current.stream)
        setStatus("listening")
      } catch (e) {
        stopRecording(true)
        stopAudio(audioRef.current)
        audioRef.current = null
        wsRef.current?.close()
        wsRef.current = null
        setError(toMessage(e, "실시간 번역 세션을 시작하지 못했습니다."))
        setStatus("error")
      }
    },
    [reset, startRecording, stopRecording],
  )

  const buildNoteInput = useCallback((source: NoteSource) => {
    const sourceText = sourceTextRef.current.trim()
    const translationText = translationTextRef.current.trim()

    if (source === "source") return sourceText
    if (source === "translation") return translationText || sourceText
    if (!sourceText) return translationText
    if (!translationText) return sourceText

    return [
      "[원문 전사]",
      sourceText,
      "",
      "[번역 전사]",
      translationText,
      "",
      "위 원문과 번역문을 함께 참고해 내용 중심의 노트를 작성해 주세요.",
    ].join("\n")
  }, [])

  const refine = useCallback(
    async (source: NoteSource, refineEngine = DEFAULT_REFINE_ENGINE, contentType?: ContentTypeId) => {
      const rawTranscript = buildNoteInput(source)
      if (!rawTranscript.trim()) {
        setError("노트로 정리할 실시간 전사 내용이 아직 없습니다.")
        return
      }

      noteSourceRef.current = source
      refineEngineRef.current = refineEngine
      setStatus("refining")
      setError(null)

      try {
        const segments = buildEstimatedSegments(source, sourceChunks, translationChunks)
        const refined = await postJson<RefineResult>("/api/refine", {
          rawTranscript,
          segments,
          words: [],
          durationSeconds: estimatedDurationSeconds(segments),
          timestampStatus: segments.length > 0 ? "estimated" : "unavailable",
          transcriptionEngineLabel: LIVE_TRANSLATE_ENGINE_LABEL,
          contentType,
          engine: refineEngine,
        })
        setResult(refined)
        setStatus("stopped")
      } catch (e) {
        setError(toMessage(e, "실시간 번역 내용을 노트로 정리하지 못했습니다."))
        setStatus("error")
      }
    },
    [buildNoteInput, sourceChunks, translationChunks],
  )

  const runDemo = useCallback(() => {
    reset()

    const runId = demoRunIdRef.current
    const demo = LIVE_DEMO
    const events = [
      ...demo.session.sourceChunks.map((chunk) => ({ kind: "source" as const, chunk })),
      ...demo.session.translationChunks.map((chunk) => ({ kind: "translation" as const, chunk })),
    ].sort((a, b) => a.chunk.receivedAtSeconds - b.chunk.receivedAtSeconds)
    const lastDelay =
      LIVE_DEMO_AUDIO_DELAY_MS +
      demoStreamDelaySeconds(events.at(-1)?.chunk.receivedAtSeconds ?? 0) * LIVE_DEMO_SECONDS_TO_MS

    isDemoRef.current = true
    noteSourceRef.current = "translation"
    refineEngineRef.current = DEFAULT_REFINE_ENGINE
    setTargetLanguageCode(demo.session.targetLanguageCode || "ko")
    setStatus("connecting")
    setError(null)
    startedAtRef.current = performance.now()

    const schedule = (delayMs: number, fn: () => void) => {
      const timer = window.setTimeout(() => {
        if (demoRunIdRef.current !== runId || !isDemoRef.current) return
        fn()
      }, delayMs)
      demoTimersRef.current.push(timer)
    }

    schedule(LIVE_DEMO_AUDIO_DELAY_MS, () => setStatus("listening"))

    events.forEach(({ kind, chunk }, index) => {
      const delay = LIVE_DEMO_AUDIO_DELAY_MS + demoStreamDelaySeconds(chunk.receivedAtSeconds) * LIVE_DEMO_SECONDS_TO_MS
      schedule(delay, () => {
        const demoChunk = { ...chunk, id: `${kind}-demo-${index}` }
        const normalized = normalizeTranscriptPiece(demoChunk.text)
        if (!normalized) return

        if (kind === "source") {
          sourceTextRef.current = joinTranscript(sourceTextRef.current, normalized)
          setSourceChunks((prev) => [...prev, { ...demoChunk, text: normalized }])
        } else {
          translationTextRef.current = joinTranscript(translationTextRef.current, normalized)
          setTranslationChunks((prev) => [...prev, { ...demoChunk, text: normalized }])
        }
      })
    })

    schedule(lastDelay + 300, () => {
      setUsageTokens(demo.session.usageTokens)
      setStatus("refining")
    })
    schedule(lastDelay + 300 + LIVE_DEMO_REFINE_DELAY_MS, () => {
      setResult(demo.result)
      setStatus("stopped")
      isDemoRef.current = false
    })
  }, [reset])

  const changeContentType = useCallback(
    async (contentType: ContentTypeId) => {
      setChangingType(true)
      try {
        await refine(noteSourceRef.current, refineEngineRef.current, contentType)
      } finally {
        setChangingType(false)
      }
    },
    [refine],
  )

  const attachSocketHandlers = useCallback(
    (ws: WebSocket) => {
      ws.onmessage = async (event) => {
        const message = await parseServerMessage(event.data)
        const content = message?.serverContent
        if (content?.inputTranscription?.text) {
          appendChunk("source", content.inputTranscription.text, content.inputTranscription.languageCode)
        }
        if (content?.outputTranscription?.text) {
          appendChunk("translation", content.outputTranscription.text, content.outputTranscription.languageCode)
        }
        if (typeof message?.usageMetadata?.totalTokenCount === "number") {
          setUsageTokens(message.usageMetadata.totalTokenCount)
        }
      }
      ws.onerror = () => {
        setError("Gemini Live 연결에서 오류가 발생했습니다.")
        setStatus("error")
      }
      ws.onclose = () => {
        stopRecording(false)
        stopAudio(audioRef.current)
        audioRef.current = null
        setStatus((prev) => (prev === "error" || prev === "refining" ? prev : "stopped"))
      }
    },
    [appendChunk, stopRecording],
  )

  async function openLiveSocket(
    token: TokenResponse,
    options: { targetLanguageCode: LiveTranslateLanguageCode; echoTargetLanguage: boolean },
  ) {
    const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(
      token.token,
    )}`
    const ws = new WebSocket(wsUrl)
    ws.binaryType = "arraybuffer"

    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("Gemini Live 연결 시간이 초과되었습니다.")), 10000)
      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            setup: {
              model: `models/${token.model || LIVE_TRANSLATE_MODEL}`,
              generationConfig: {
                responseModalities: ["AUDIO"],
                translationConfig: {
                  targetLanguageCode: options.targetLanguageCode,
                  echoTargetLanguage: options.echoTargetLanguage,
                },
              },
              inputAudioTranscription: {},
              outputAudioTranscription: {},
            },
          }),
        )
      }
      ws.onmessage = async (event) => {
        const message = await parseServerMessage(event.data)
        if (message?.setupComplete) {
          window.clearTimeout(timeout)
          resolve()
        }
      }
      ws.onerror = () => {
        window.clearTimeout(timeout)
        reject(new Error("Gemini Live WebSocket 연결에 실패했습니다."))
      }
    })

    attachSocketHandlers(ws)
    return ws
  }

  return {
    status,
    error,
    sourceChunks,
    translationChunks,
    result,
    changingType,
    usageTokens,
    targetLanguageCode,
    recording,
    isRecording,
    start,
    stop,
    reset,
    runDemo,
    refine,
    changeContentType,
    sourceText: sourceTextRef.current,
    translationText: translationTextRef.current,
  }
}

async function createLiveToken(targetLanguageCode: LiveTranslateLanguageCode, echoTargetLanguage: boolean) {
  const res = await fetch("/api/live-translate/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetLanguageCode, echoTargetLanguage }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error || "Gemini Live 토큰 발급에 실패했습니다.")
  return data as TokenResponse
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "요청에 실패했습니다.")
  return data as T
}

async function startMicrophoneStreaming(onChunk: (base64Audio: string) => void): Promise<AudioResources> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  })
  const AudioContextClass = window.AudioContext || getWebkitAudioContext()
  const context = new AudioContextClass()
  await context.resume()

  const source = context.createMediaStreamSource(stream)
  const processor = context.createScriptProcessor(4096, 1, 1)
  const sink = context.createGain()
  sink.gain.value = 0

  let pending: number[] = []
  processor.onaudioprocess = (event) => {
    const input = event.inputBuffer.getChannelData(0)
    const pcm = downsampleToPcm16(input, context.sampleRate, 16000)
    for (let i = 0; i < pcm.length; i++) pending.push(pcm[i])

    while (pending.length >= 1600) {
      const chunk = pending.slice(0, 1600)
      pending = pending.slice(1600)
      onChunk(pcm16ToBase64(chunk))
    }
  }

  source.connect(processor)
  processor.connect(sink)
  sink.connect(context.destination)

  return { context, stream, source, processor, sink }
}

function stopAudio(resources: AudioResources | null) {
  if (!resources) return
  resources.processor.disconnect()
  resources.source.disconnect()
  resources.sink.disconnect()
  resources.stream.getTracks().forEach((track) => track.stop())
  void resources.context.close().catch(() => undefined)
}

function downsampleToPcm16(input: Float32Array, inputRate: number, outputRate: number) {
  if (outputRate === inputRate) return floatToPcm16(input)

  const ratio = inputRate / outputRate
  const outputLength = Math.floor(input.length / ratio)
  const output = new Int16Array(outputLength)

  for (let i = 0; i < outputLength; i++) {
    const start = Math.floor(i * ratio)
    const end = Math.min(Math.floor((i + 1) * ratio), input.length)
    let sum = 0
    for (let j = start; j < end; j++) sum += input[j]
    output[i] = floatSampleToPcm16(sum / Math.max(end - start, 1))
  }

  return output
}

function floatToPcm16(input: Float32Array) {
  const output = new Int16Array(input.length)
  for (let i = 0; i < input.length; i++) output[i] = floatSampleToPcm16(input[i])
  return output
}

function floatSampleToPcm16(sample: number) {
  const clamped = Math.max(-1, Math.min(1, sample))
  return clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff
}

function pcm16ToBase64(samples: number[]) {
  const bytes = new Uint8Array(samples.length * 2)
  const view = new DataView(bytes.buffer)
  samples.forEach((sample, index) => view.setInt16(index * 2, sample, true))

  let binary = ""
  const batchSize = 0x8000
  for (let i = 0; i < bytes.length; i += batchSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + batchSize))
  }
  return btoa(binary)
}

async function parseServerMessage(data: unknown): Promise<ServerMessage | null> {
  const text = await websocketMessageToText(data)
  if (!text) return null
  try {
    return JSON.parse(text) as ServerMessage
  } catch {
    return null
  }
}

async function websocketMessageToText(data: unknown): Promise<string | null> {
  if (typeof data === "string") return data
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data)
  if (data instanceof Blob) return data.text()
  if (data instanceof Uint8Array) return new TextDecoder().decode(data)
  return null
}

function normalizeTranscriptPiece(text: string) {
  return text.replace(/\s+/g, " ").trim()
}

function joinTranscript(current: string, next: string) {
  if (!current) return next
  if (/[\s\n]$/.test(current)) return `${current}${next}`
  if (/^[.,!?;:)\]}，。！？]/.test(next)) return `${current}${next}`
  return `${current} ${next}`
}

function buildEstimatedSegments(
  source: NoteSource,
  sourceChunks: TranscriptChunk[],
  translationChunks: TranscriptChunk[],
): TranscriptSegment[] {
  if (source === "source") return chunksToEstimatedSegments(sourceChunks)
  if (source === "translation") {
    return chunksToEstimatedSegments(translationChunks.length > 0 ? translationChunks : sourceChunks)
  }

  const merged = [
    ...sourceChunks.map((chunk) => ({ ...chunk, text: `[원문] ${chunk.text}` })),
    ...translationChunks.map((chunk) => ({ ...chunk, text: `[번역문] ${chunk.text}` })),
  ].sort((a, b) => a.receivedAtSeconds - b.receivedAtSeconds)

  return chunksToEstimatedSegments(merged)
}

function chunksToEstimatedSegments(chunks: TranscriptChunk[]): TranscriptSegment[] {
  const normalized = chunks
    .map((chunk) => ({
      ...chunk,
      text: normalizeTranscriptPiece(chunk.text),
      receivedAtSeconds: Math.max(0, chunk.receivedAtSeconds),
    }))
    .filter((chunk) => chunk.text.length > 0)
    .sort((a, b) => a.receivedAtSeconds - b.receivedAtSeconds)

  return normalized.map((chunk, index) => {
    const start = roundTime(chunk.receivedAtSeconds)
    const next = normalized[index + 1]
    const fallbackEnd = chunk.receivedAtSeconds + estimateChunkDuration(chunk.text)
    const rawEnd = next ? next.receivedAtSeconds : fallbackEnd
    const end = roundTime(Math.max(start + 0.5, rawEnd))

    return {
      id: index,
      start,
      end,
      text: chunk.text,
    }
  })
}

function estimateChunkDuration(text: string) {
  const compactLength = text.replace(/\s+/g, "").length
  return Math.min(8, Math.max(1.2, compactLength / 5))
}

function estimatedDurationSeconds(segments: TranscriptSegment[]) {
  if (segments.length === 0) return undefined
  return Math.max(...segments.map((segment) => segment.end))
}

function roundTime(seconds: number) {
  return Math.round(seconds * 10) / 10
}

function elapsedSeconds(startedAt: number) {
  if (!startedAt) return 0
  return Math.max(0, Math.round((performance.now() - startedAt) / 100) / 10)
}

function demoStreamDelaySeconds(receivedAtSeconds: number) {
  return Math.max(0, receivedAtSeconds - LIVE_DEMO_STREAM_LEAD_SECONDS)
}

function getRecordingMimeType() {
  const preferredTypes = [
    "audio/mp4;codecs=mp4a.40.2",
    "audio/mp4",
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
  ]
  return preferredTypes.find((type) => MediaRecorder.isTypeSupported(type)) || ""
}

function createRecordingFileName(mimeType: string) {
  const extension = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "m4a" : "webm"
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
  return `transcript-studio-live-recording-${timestamp}.${extension}`
}

function toMessage(e: unknown, fallback: string): string {
  if (e instanceof Error && e.message) return e.message
  return fallback
}

function getWebkitAudioContext() {
  const win = window as Window & { webkitAudioContext?: typeof AudioContext }
  if (!win.webkitAudioContext) throw new Error("이 브라우저는 Web Audio API를 지원하지 않습니다.")
  return win.webkitAudioContext
}
