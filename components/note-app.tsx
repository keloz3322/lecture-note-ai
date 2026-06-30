"use client"

import { useCallback, useMemo, useState } from "react"
import { AlertTriangle, AudioLines, Play, RotateCcw, Sparkles } from "lucide-react"
import { usePipeline } from "@/hooks/use-pipeline"
import { DEMO_FILE_META, DEMO_FILE_NAME } from "@/lib/demo-result"
import type { AudioFileMeta } from "@/lib/types"
import {
  DEFAULT_REFINE_ENGINE,
  DEFAULT_TRANSCRIPTION_ENGINE,
  getRefineEngine,
  getTranscriptionEngine,
} from "@/lib/engines"
import { EngineSelector } from "./engine-selector"
import { ProgressSteps } from "./progress-steps"
import { ResultsPanel } from "./results-panel"
import { UploadPanel } from "./upload-panel"

export function NoteApp() {
  const { state, run, runDemo, reset, changeContentType, stepOrder } = usePipeline()
  const [file, setFile] = useState<File | null>(null)
  const [meta, setMeta] = useState<AudioFileMeta | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [transcriptionEngine, setTranscriptionEngine] = useState(DEFAULT_TRANSCRIPTION_ENGINE)
  const [refineEngine, setRefineEngine] = useState(DEFAULT_REFINE_ENGINE)
  const [isDemo, setIsDemo] = useState(false)
  const progressLabels = useMemo(() => {
    const transcription = getTranscriptionEngine(transcriptionEngine)
    const refine = getRefineEngine(refineEngine)
    return {
      transcribe: `${statusEngineName(transcription.label)}로 전사 중`,
      refine: `${statusEngineName(refine.label)}로 교정 · 요약 중`,
    }
  }, [transcriptionEngine, refineEngine])

  const onSelect = useCallback((selected: File, m: AudioFileMeta) => {
    setValidationError(null)
    setIsDemo(false)
    setFile(selected)
    setMeta(m)
  }, [])

  const onClear = useCallback(() => {
    setFile(null)
    setMeta(null)
    setIsDemo(false)
    setValidationError(null)
    reset()
  }, [reset])

  const start = useCallback(() => {
    if (!file || !meta) return
    // Length limits are no longer a hard block: long files are split near
    // detected silence valleys and transcribed in chunks on the server.
    setValidationError(null)
    setIsDemo(false)
    run(file, meta, { transcriptionEngine, refineEngine })
  }, [file, meta, run, transcriptionEngine, refineEngine])

  const startDemo = useCallback(() => {
    setValidationError(null)
    setIsDemo(true)
    setFile(new File([""], `${DEMO_FILE_NAME}.ogg`, { type: DEMO_FILE_META.type }))
    setMeta(DEMO_FILE_META)
    runDemo()
  }, [runDemo])

  const onStart = start
  const onRetry = start

  const error = validationError ?? state.error
  const hasStarted = state.isRunning || state.result !== null || state.error !== null

  return (
    <div className="min-h-svh bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <AudioLines className="size-4.5" />
            </div>
            <div>
              <h1 className="text-sm font-semibold leading-none text-foreground">Transcript Studio</h1>
              <p className="mt-1 text-xs text-muted-foreground">음성·영상을 정리된 노트로</p>
            </div>
          </div>
          <span className="hidden items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground sm:inline-flex">
            <Sparkles className="size-3" />
            AI Gateway
          </span>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-4 px-4 py-6 sm:px-6 lg:grid-cols-[340px_1fr]">
        {/* Left: file + status */}
        <aside className="flex flex-col gap-4">
          <section>
            <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">파일</h2>
            <UploadPanel
              file={file}
              meta={meta}
              disabled={state.isRunning}
              onSelect={onSelect}
              onClear={onClear}
              onValidationError={(m) => {
                setValidationError(m)
                setIsDemo(false)
                setFile(null)
                setMeta(null)
              }}
            />
          </section>

          <section>
            <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">엔진</h2>
            <EngineSelector
              transcriptionEngine={transcriptionEngine}
              refineEngine={refineEngine}
              disabled={state.isRunning}
              onTranscriptionChange={setTranscriptionEngine}
              onRefineChange={setRefineEngine}
            />
          </section>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div className="min-w-0">
                <p className="font-medium">처리 오류</p>
                <p className="mt-0.5 text-destructive/90">{error}</p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            {!hasStarted ? (
              <>
                <button
                  type="button"
                  onClick={startDemo}
                  disabled={state.isRunning}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Sparkles className="size-4" />
                  데모 보기
                </button>
                <button
                  type="button"
                  onClick={onStart}
                  disabled={!file || !meta}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Play className="size-4" />
                  전사 시작
                </button>
              </>
            ) : (
              <>
                {state.error && (
                  <button
                    type="button"
                    onClick={onRetry}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
                  >
                    <RotateCcw className="size-4" />
                    다시 시도
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClear}
                  disabled={state.isRunning}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  새 파일
                </button>
              </>
            )}
          </div>

          {hasStarted && (
            <section className="rounded-lg border border-border bg-card p-4">
              <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">진행 상태</h2>
              <ProgressSteps order={stepOrder} steps={state.steps} labels={progressLabels} />
            </section>
          )}

          <p className="text-xs leading-relaxed text-muted-foreground">
            오디오 파일은 처리 후 저장되지 않습니다. API 키는 서버에서만 사용됩니다.
          </p>
        </aside>

        {/* Right: results */}
        <section className="min-h-[420px]">
          {state.result && meta ? (
            <ResultsPanel
              result={state.result}
              fileName={meta.name}
              onChangeType={isDemo ? undefined : changeContentType}
              changingType={state.changingType}
            />
          ) : (
            <EmptyState running={state.isRunning} />
          )}
        </section>
      </main>
    </div>
  )
}

function statusEngineName(label: string) {
  return label.replace(/^AI Gateway · /, "").replace(/^Groq · /, "Groq ")
}

function EmptyState({ running }: { running: boolean }) {
  return (
    <div className="flex h-full min-h-[420px] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 p-8 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        <AudioLines className="size-6" />
      </div>
      <p className="mt-4 text-sm font-medium text-foreground">
        {running ? "노트를 생성하고 있습니다…" : "아직 결과가 없습니다"}
      </p>
      <p className="mt-1 max-w-xs text-xs text-muted-foreground">
        {running
          ? "전사와 요약이 끝나면 여기에 정리된 노트가 표시됩니다."
          : "음성·영상 파일을 업로드하고 전사를 시작하면 정리된 노트가 여기에 표시됩니다."}
      </p>
    </div>
  )
}
