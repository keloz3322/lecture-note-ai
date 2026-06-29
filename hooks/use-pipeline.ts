"use client"

import { useCallback, useRef, useState } from "react"
import { upload } from "@vercel/blob/client"
import type {
  AudioFileMeta,
  PipelineStep,
  RefineResult,
  StepStatus,
  TranscribeResult,
  UploadResult,
} from "@/lib/types"

const STEP_ORDER: PipelineStep[] = ["prepare", "upload", "transcribe", "refine", "done"]
const ENABLE_BLOB_UPLOAD = process.env.NEXT_PUBLIC_ENABLE_BLOB_UPLOAD === "true"

export interface PipelineState {
  steps: Record<PipelineStep, StepStatus>
  activeStep: PipelineStep | null
  error: string | null
  result: RefineResult | null
  isRunning: boolean
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
  })
  const abortRef = useRef(false)

  const setStep = useCallback((step: PipelineStep, status: StepStatus) => {
    setState((prev) => ({
      ...prev,
      steps: { ...prev.steps, [step]: status },
      activeStep: status === "active" ? step : prev.activeStep,
    }))
  }, [])

  const reset = useCallback(() => {
    abortRef.current = true
    setState({ steps: initialSteps(), activeStep: null, error: null, result: null, isRunning: false })
  }, [])

  const run = useCallback(async (file: File, _meta: AudioFileMeta) => {
    abortRef.current = false
    setState({ steps: initialSteps(), activeStep: null, error: null, result: null, isRunning: true })

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
            access: "public",
            handleUploadUrl: "/api/upload",
            contentType: file.type || undefined,
            multipart: false,
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
          transcribed = await postForm<TranscribeResult>("/api/transcribe", form)
        } else {
          transcribed = await postJson<TranscribeResult>("/api/transcribe", {
            audioUrl: uploaded.audioUrl,
            fileName: uploaded.fileName,
          })
        }
      } catch (e) {
        return fail("transcribe", toMessage(e, "전사에 실패했습니다."))
      }
      if (abortRef.current) return
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

  return { state, run, reset, stepOrder: STEP_ORDER }
}

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function toMessage(e: unknown, fallback: string): string {
  if (e instanceof Error && e.message) return e.message
  return fallback
}
