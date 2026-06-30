"use client"

import { AlertCircle, Check, Loader2 } from "lucide-react"
import type { PipelineStep, StepStatus } from "@/lib/types"

const STEP_LABELS: Record<PipelineStep, string> = {
  prepare: "파일 준비",
  upload: "업로드 / 검증",
  transcribe: "Groq로 전사 중",
  refine: "Gemini로 교정 · 요약 중",
  done: "완료",
}

interface ProgressStepsProps {
  order: PipelineStep[]
  steps: Record<PipelineStep, StepStatus>
  labels?: Partial<Record<PipelineStep, string>>
  details?: Partial<Record<PipelineStep, string>>
}

export function ProgressSteps({ order, steps, labels, details }: ProgressStepsProps) {
  return (
    <ol className="flex flex-col gap-1">
      {order.map((step, i) => {
        const status = steps[step]
        const isLast = i === order.length - 1
        const label = labels?.[step] ?? STEP_LABELS[step]
        const detail = status === "active" ? details?.[step] : undefined
        return (
          <li key={step} className="flex gap-3">
            <div className="flex flex-col items-center">
              <StepIcon status={status} index={i + 1} />
              {!isLast && (
                <span
                  className={`my-0.5 w-px flex-1 ${status === "complete" ? "bg-primary/40" : "bg-border"}`}
                  aria-hidden
                />
              )}
            </div>
            <div className={`pb-3 pt-1 ${isLast ? "pb-0" : ""}`}>
              <p
                className={`text-sm ${
                  status === "active"
                    ? "font-medium text-foreground"
                    : status === "complete"
                      ? "text-foreground"
                      : status === "error"
                        ? "font-medium text-destructive"
                        : "text-muted-foreground"
                }`}
              >
                {label}
              </p>
              <p className="text-xs text-muted-foreground">{statusLabel(status)}</p>
              {detail && <p className="mt-1 max-w-[260px] text-xs leading-relaxed text-muted-foreground">{detail}</p>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function statusLabel(status: StepStatus): string {
  switch (status) {
    case "active":
      return "진행 중…"
    case "complete":
      return "완료"
    case "error":
      return "오류 발생"
    default:
      return "대기 중"
  }
}

function StepIcon({ status, index }: { status: StepStatus; index: number }) {
  const base = "flex size-6 shrink-0 items-center justify-center rounded-full text-xs"
  if (status === "complete") {
    return (
      <span className={`${base} bg-primary text-primary-foreground`}>
        <Check className="size-3.5" />
      </span>
    )
  }
  if (status === "active") {
    return (
      <span className={`${base} bg-primary/15 text-primary`}>
        <Loader2 className="size-3.5 animate-spin" />
      </span>
    )
  }
  if (status === "error") {
    return (
      <span className={`${base} bg-destructive/15 text-destructive`}>
        <AlertCircle className="size-3.5" />
      </span>
    )
  }
  return <span className={`${base} border border-border text-muted-foreground`}>{index}</span>
}
