"use client"

import { useCallback, useRef, useState } from "react"
import { upload } from "@vercel/blob/client"
import { getDemoResult, getDemoTranscription } from "@/lib/demo-result"
import type { FileDemoPresetId } from "@/lib/demo-result"
import { getTranscriptionEngine } from "@/lib/engines"
import type {
  AudioFileMeta,
  PipelineStep,
  RefineResult,
  StepStatus,
  TranscribeResult,
  UploadResult,
} from "@/lib/types"

const STEP_ORDER: PipelineStep[] = ["prepare", "upload", "transcribe", "refine", "done"]
const DEMO_STEP_DELAYS_MS: Record<Exclude<PipelineStep, "done">, number> = {
  prepare: 1800,
  upload: 2200,
  transcribe: 6500,
  refine: 4500,
}
// Blob upload is the default path (it bypasses the ~4.5MB serverless body limit).
// Set NEXT_PUBLIC_ENABLE_BLOB_UPLOAD="false" to force the legacy direct-upload path.
const ENABLE_BLOB_UPLOAD = process.env.NEXT_PUBLIC_ENABLE_BLOB_UPLOAD !== "false"

export interface EngineSelection {
  transcriptionEngine?: string
  refineEngine?: string
}

export interface DemoRunOptions extends EngineSelection {
  demoId?: FileDemoPresetId
}

export interface PipelineState {
  steps: Record<PipelineStep, StepStatus>
  activeStep: PipelineStep | null
  error: string | null
  result: RefineResult | null
  isRunning: boolean
  /** True while re-running refine for a manually selected content type. */
  changingType: boolean
  /** True while generating a Korean translation for the cleaned transcript. */
  translatingTranscript: boolean
  translationProgress: { completed: number; total: number } | null
}

interface TranslationResponse extends Pick<RefineResult, "translatedTranscriptKo" | "translatedTranscriptKoNotice"> {
  sourceLanguage?: string
  sourceChars?: number
  chunkCount?: number
  completedChunks?: number
  chunkIndex?: number
}

function initialSteps(): Record<PipelineStep, StepStatus> {
  return { prepare: "pending", upload: "pending", transcribe: "pending", refine: "pending", done: "pending" }
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

async function postForm<T>(url: string, body: FormData): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    body,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "요청에 실패했습니다.")
  return data as T
}

export function usePipeline() {
  const [state, setState] = useState<PipelineState>({
    steps: initialSteps(),
    activeStep: null,
    error: null,
    result: null,
    isRunning: false,
    changingType: false,
    translatingTranscript: false,
    translationProgress: null,
  })
  const abortRef = useRef(false)
  // Cache the last transcription so we can re-run refine when the user changes
  // the content type without re-uploading or re-transcribing.
  const lastTranscriptRef = useRef<TranscribeResult | null>(null)
  // Remember the engines used for this run so changeContentType reuses them.
  const lastRefineEngineRef = useRef<string | undefined>(undefined)

  const setStep = useCallback((step: PipelineStep, status: StepStatus) => {
    setState((prev) => ({
      ...prev,
      steps: { ...prev.steps, [step]: status },
      activeStep: status === "active" ? step : prev.activeStep,
    }))
  }, [])

  const reset = useCallback(() => {
    abortRef.current = true
    lastTranscriptRef.current = null
    setState({
      steps: initialSteps(),
      activeStep: null,
      error: null,
      result: null,
      isRunning: false,
      changingType: false,
      translatingTranscript: false,
      translationProgress: null,
    })
  }, [])

  const run = useCallback(async (file: File, _meta: AudioFileMeta, engines?: EngineSelection) => {
    abortRef.current = false
    lastTranscriptRef.current = null
    lastRefineEngineRef.current = engines?.refineEngine
    setState({
      steps: initialSteps(),
      activeStep: null,
      error: null,
      result: null,
      isRunning: true,
      changingType: false,
      translatingTranscript: false,
      translationProgress: null,
    })

    const fail = (step: PipelineStep, message: string) => {
      setState((prev) => ({
        ...prev,
        steps: { ...prev.steps, [step]: "error" },
        error: message,
        isRunning: false,
        activeStep: step,
      }))
    }

    try {
      // 1. Prepare
      setStep("prepare", "active")
      await wait(500)
      setStep("prepare", "complete")

      // 2. Upload / validate
      setStep("upload", "active")
      let uploaded: UploadResult | null = null
      let useDirectFile = !ENABLE_BLOB_UPLOAD

      if (ENABLE_BLOB_UPLOAD) {
        try {
          const blob = await upload(file.name, file, {
            access: "private",
            handleUploadUrl: "/api/upload",
            contentType: file.type || undefined,
            // Multipart for larger files makes the direct-to-Blob upload more resilient.
            multipart: file.size > 20 * 1024 * 1024,
            clientPayload: JSON.stringify({ fileName: file.name, size: file.size, type: file.type }),
          })
          uploaded = {
            audioUrl: blob.url,
            fileName: file.name,
            pathname: blob.pathname,
            size: file.size,
          }
        } catch {
          useDirectFile = true
        }
      }
      if (abortRef.current) return
      setStep("upload", "complete")

      // 3. Transcribe (Groq)
      setStep("transcribe", "active")
      let transcribed: TranscribeResult
      try {
        if (useDirectFile || !uploaded) {
          const form = new FormData()
          form.append("file", file)
          if (engines?.transcriptionEngine) form.append("engine", engines.transcriptionEngine)
          transcribed = await postForm<TranscribeResult>("/api/transcribe", form)
        } else {
          transcribed = await postJson<TranscribeResult>("/api/transcribe", {
            pathname: uploaded.pathname,
            audioUrl: uploaded.audioUrl,
            fileName: uploaded.fileName,
            engine: engines?.transcriptionEngine,
          })
        }
      } catch (e) {
        return fail("transcribe", toMessage(e, "전사에 실패했습니다."))
      }
      if (abortRef.current) return
      lastTranscriptRef.current = transcribed
      setStep("transcribe", "complete")

      // 4. Refine / summarize (Gemini)
      setStep("refine", "active")
      let refined: RefineResult
      try {
        refined = await postJson<RefineResult>("/api/refine", {
          rawTranscript: transcribed.rawTranscript,
          segments: transcribed.segments,
          words: transcribed.words,
          durationSeconds: transcribed.durationSeconds,
          timestampStatus: transcribed.timestampStatus,
          transcriptionEngineLabel: transcribed.transcriptionEngineLabel,
          engine: engines?.refineEngine,
        })
      } catch (e) {
        return fail("refine", toMessage(e, "교정/요약에 실패했습니다."))
      }
      if (abortRef.current) return
      setStep("refine", "complete")

      // 5. Done
      setStep("done", "complete")
      setState((prev) => ({ ...prev, result: refined, isRunning: false, activeStep: "done" }))
    } catch (e) {
      setState((prev) => ({ ...prev, error: toMessage(e, "알 수 없는 오류가 발생했습니다."), isRunning: false }))
    }
  }, [setStep])

  const runDemo = useCallback(async (engines?: DemoRunOptions) => {
    abortRef.current = false
    lastTranscriptRef.current = null
    lastRefineEngineRef.current = engines?.refineEngine
    const transcription = getTranscriptionEngine(engines?.transcriptionEngine)
    const demoTimestampStatus = transcription.supportsTimestamps ? "available" : "unsupported"
    setState({
      steps: initialSteps(),
      activeStep: null,
      error: null,
      result: null,
      isRunning: true,
      changingType: false,
      translatingTranscript: false,
      translationProgress: null,
    })

    const advance = async (step: PipelineStep, delayMs: number) => {
      if (abortRef.current) return false
      setStep(step, "active")
      await wait(delayMs)
      if (abortRef.current) return false
      setStep(step, "complete")
      return true
    }

    if (!(await advance("prepare", DEMO_STEP_DELAYS_MS.prepare))) return
    if (!(await advance("upload", DEMO_STEP_DELAYS_MS.upload))) return
    if (!(await advance("transcribe", DEMO_STEP_DELAYS_MS.transcribe))) return
    if (!(await advance("refine", DEMO_STEP_DELAYS_MS.refine))) return
    if (abortRef.current) return
    lastTranscriptRef.current = getDemoTranscription({
      timestampStatus: demoTimestampStatus,
      transcriptionEngineLabel: transcription.label,
      demoId: engines?.demoId,
    })
    setStep("done", "complete")
    setState((prev) => ({
      ...prev,
      result: getDemoResult({
        timestampStatus: demoTimestampStatus,
        transcriptionEngineLabel: transcription.label,
        refineEngine: engines?.refineEngine,
        demoId: engines?.demoId,
      }),
      isRunning: false,
      activeStep: "done",
    }))
  }, [setStep])

  // Re-run only the refine step with a user-selected content type, reusing the
  // cached transcript (no re-upload / re-transcription).
  const changeContentType = useCallback(async (contentType: string) => {
    const transcribed = lastTranscriptRef.current
    if (!transcribed) return

    setState((prev) => ({ ...prev, changingType: true, error: null }))
    try {
      const refined = await postJson<RefineResult>("/api/refine", {
        rawTranscript: transcribed.rawTranscript,
        segments: transcribed.segments,
        words: transcribed.words,
        durationSeconds: transcribed.durationSeconds,
        timestampStatus: transcribed.timestampStatus,
        transcriptionEngineLabel: transcribed.transcriptionEngineLabel,
        contentType,
        engine: lastRefineEngineRef.current,
      })
      setState((prev) => {
        const previous = prev.result
        const translation =
          previous?.cleanedTranscript === refined.cleanedTranscript
            ? {
                translatedTranscriptKo: previous.translatedTranscriptKo,
                translatedTranscriptKoNotice: previous.translatedTranscriptKoNotice,
              }
            : {}
        return { ...prev, result: { ...refined, ...translation }, changingType: false }
      })
    } catch (e) {
      setState((prev) => ({
        ...prev,
        changingType: false,
        error: toMessage(e, "유형을 변경해 다시 생성하지 못했습니다."),
      }))
    }
  }, [])

  const translateTranscript = useCallback(async () => {
    const current = state.result
    if (!current?.cleanedTranscript || current.translatedTranscriptKo) return

    setState((prev) => ({ ...prev, translatingTranscript: true, translationProgress: null, error: null }))
    try {
      const plan = await postJson<TranslationResponse>("/api/translate-transcript", {
        text: current.cleanedTranscript,
        contentType: current.contentType,
        engine: lastRefineEngineRef.current,
        mode: "plan",
      })

      if (plan.translatedTranscriptKo) {
        setState((prev) => ({
          ...prev,
          result: prev.result ? { ...prev.result, ...pickTranslation(plan) } : prev.result,
          translatingTranscript: false,
          translationProgress: null,
        }))
        return
      }

      const total = Math.max(1, plan.chunkCount ?? 1)
      const translatedChunks: string[] = []

      for (let index = 0; index < total; index++) {
        if (abortRef.current) return
        setState((prev) => ({ ...prev, translationProgress: { completed: index, total } }))
        const chunk = await postJson<TranslationResponse>("/api/translate-transcript", {
          text: current.cleanedTranscript,
          contentType: current.contentType,
          engine: lastRefineEngineRef.current,
          mode: "chunk",
          chunkIndex: index,
        })
        translatedChunks[index] = chunk.translatedTranscriptKo ?? ""
        setState((prev) => ({ ...prev, translationProgress: { completed: index + 1, total } }))
      }

      const translated = {
        translatedTranscriptKo: translatedChunks.join("\n\n").trim(),
        translatedTranscriptKoNotice:
          total > 1 ? `정리된 전사문 전체를 ${total}개 조각으로 나누어 번역했습니다.` : undefined,
      }

      setState((prev) => ({
        ...prev,
        result: prev.result ? { ...prev.result, ...translated } : prev.result,
        translatingTranscript: false,
        translationProgress: null,
      }))
    } catch (e) {
      setState((prev) => ({
        ...prev,
        translatingTranscript: false,
        translationProgress: null,
        error: toMessage(e, "한국어 번역본을 생성하지 못했습니다."),
      }))
    }
  }, [state.result])

  return { state, run, runDemo, reset, changeContentType, translateTranscript, stepOrder: STEP_ORDER }
}

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function toMessage(e: unknown, fallback: string): string {
  if (e instanceof Error && e.message) return e.message
  return fallback
}

function pickTranslation(response: TranslationResponse): Pick<RefineResult, "translatedTranscriptKo" | "translatedTranscriptKoNotice"> {
  return {
    translatedTranscriptKo: response.translatedTranscriptKo,
    translatedTranscriptKoNotice: response.translatedTranscriptKoNotice,
  }
}
