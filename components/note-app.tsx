"use client"

import { useCallback, useMemo, useState } from "react"
import {
  AlertTriangle,
  AudioLines,
  Clock3,
  FileAudio,
  FileText,
  Languages,
  Loader2,
  Mic,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  Wand2,
} from "lucide-react"
import { usePipeline } from "@/hooks/use-pipeline"
import { DEFAULT_FILE_DEMO_ID, FILE_DEMO_PRESETS, getFileDemoPreset } from "@/lib/demo-result"
import type { FileDemoPresetId, FileDemoPreset } from "@/lib/demo-result"
import type { AudioFileMeta } from "@/lib/types"
import {
  DEFAULT_REFINE_ENGINE,
  DEFAULT_TRANSCRIPTION_ENGINE,
  getRefineEngine,
  getTranscriptionEngine,
} from "@/lib/engines"
import { formatBytes, formatDuration } from "@/lib/format"
import { EngineSelector } from "./engine-selector"
import { LiveTranslatePanel } from "./live-translate-panel"
import { ProgressSteps } from "./progress-steps"
import { ResultsPanel } from "./results-panel"
import { UploadPanel } from "./upload-panel"

type WorkflowMode = "file" | "live"

export function NoteApp() {
  const { state, run, runDemo, reset, changeContentType, stepOrder } = usePipeline()
  const [mode, setMode] = useState<WorkflowMode>("live")
  const [file, setFile] = useState<File | null>(null)
  const [meta, setMeta] = useState<AudioFileMeta | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [transcriptionEngine, setTranscriptionEngine] = useState(DEFAULT_TRANSCRIPTION_ENGINE)
  const [refineEngine, setRefineEngine] = useState(DEFAULT_REFINE_ENGINE)
  const [selectedDemoId, setSelectedDemoId] = useState<FileDemoPresetId>(DEFAULT_FILE_DEMO_ID)
  const [isDemo, setIsDemo] = useState(false)
  const selectedDemo = useMemo(() => getFileDemoPreset(selectedDemoId), [selectedDemoId])

  const progressLabels = useMemo(() => {
    const transcription = getTranscriptionEngine(transcriptionEngine)
    const refine = getRefineEngine(refineEngine)
    return {
      transcribe: `${statusEngineName(transcription.label)}로 전사 중`,
      refine: `${statusEngineName(refine.label)}로 교정 · 요약 중`,
    }
  }, [transcriptionEngine, refineEngine])

  const progressDetails = useMemo(() => {
    const transcription = getTranscriptionEngine(transcriptionEngine)
    const refine = getRefineEngine(refineEngine)
    const transcriptionName = statusEngineName(transcription.label)
    const refineName = statusEngineName(refine.label)
    const timestampNote = transcription.supportsTimestamps
      ? "완료되면 타임스탬프 기반 타임라인을 함께 만들 수 있습니다."
      : "이 엔진은 타임스탬프를 반환하지 않아 결과에서 타임라인을 비활성화합니다."

    if (isDemo) {
      const duration = formatDuration(selectedDemo.meta.durationSeconds)
      return {
        prepare: `${selectedDemo.label} 데모 샘플을 불러옵니다.${duration ? ` 원본 길이는 ${duration}입니다.` : ""}`,
        upload: "발표용 데모라 실제 파일 업로드 없이 준비된 결과 데이터를 불러옵니다.",
        transcribe: `${transcriptionName} 전사 과정을 압축해서 보여줍니다.${demoTimingText(selectedDemo, "transcribe")}`,
        refine: `${refineName} 노트 생성 과정을 압축해서 보여줍니다.${demoTimingText(selectedDemo, "refine")}`,
      }
    }

    return {
      prepare: "파일 형식과 브라우저에서 읽을 수 있는 길이 정보를 확인합니다.",
      upload: "Vercel Blob에 임시 업로드한 뒤 서버에서 처리합니다. 오디오는 처리 후 삭제됩니다.",
      transcribe: `${transcriptionName} 전사는 스트리밍하지 않고 완료 후 한 번에 반환합니다. 큰 파일은 압축하거나 무음 구간 기준으로 나눕니다. ${timestampNote}`,
      refine: `${refineName}가 전사문을 정리하고 콘텐츠 유형별 노트 형식으로 재구성합니다.`,
    }
  }, [transcriptionEngine, refineEngine, isDemo, selectedDemo])

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
    setValidationError(null)
    setIsDemo(false)
    run(file, meta, { transcriptionEngine, refineEngine })
  }, [file, meta, run, transcriptionEngine, refineEngine])

  const startDemo = useCallback(() => {
    setValidationError(null)
    setIsDemo(true)
    setFile(new File([""], `${selectedDemo.fileName}.ogg`, { type: selectedDemo.meta.type }))
    setMeta(selectedDemo.meta)
    runDemo({ transcriptionEngine, refineEngine, demoId: selectedDemo.id })
  }, [runDemo, selectedDemo, transcriptionEngine, refineEngine])

  const error = validationError ?? state.error
  const hasStarted = state.isRunning || state.result !== null || state.error !== null

  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground ring-1 ring-border/60">
              <AudioLines className="size-4.5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold leading-none tracking-tight text-foreground">
                Transcript Studio
              </h1>
              <p className="mt-0.5 hidden truncate text-[11px] text-muted-foreground md:block">
                음성 · 영상 · 실시간 번역을 학습 노트로
              </p>
            </div>
          </div>

          <nav
            className="ml-auto flex shrink-0 items-center gap-0.5 rounded-lg border border-border bg-card p-0.5 sm:ml-6"
            role="tablist"
            aria-label="작업 방식"
          >
            <ModeButton
              active={mode === "live"}
              icon={<Languages className="size-4" />}
              label="실시간 번역·전사"
              onClick={() => setMode("live")}
            />
            <ModeButton
              active={mode === "file"}
              icon={<FileAudio className="size-4" />}
              label="파일 분석"
              onClick={() => setMode("file")}
            />
          </nav>

          <span className="ml-auto hidden shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground lg:inline-flex">
            <Sparkles className="size-3 text-brand" />
            AI Gateway + Gemini Live
          </span>
        </div>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6">
        {mode === "file" ? (
          <div className="grid gap-4 lg:grid-cols-[330px_minmax(0,1fr)]">
            <aside className="flex flex-col gap-4">
              <section className="overflow-hidden rounded-xl border border-border bg-card">
                <RailHeader step="1" title="소스 파일" description="분석할 음성 · 영상 파일을 선택하세요" />
                <div className="p-3">
                  <UploadPanel
                    file={file}
                    meta={meta}
                    disabled={state.isRunning}
                    onSelect={onSelect}
                    onClear={onClear}
                    onValidationError={(message) => {
                      setValidationError(message)
                      setIsDemo(false)
                      setFile(null)
                      setMeta(null)
                    }}
                  />
                  <DemoPresetPicker
                    presets={FILE_DEMO_PRESETS}
                    selectedId={selectedDemoId}
                    disabled={state.isRunning}
                    onSelect={(id) => {
                      setSelectedDemoId(id)
                      if (isDemo && !state.isRunning) {
                        const preset = getFileDemoPreset(id)
                        setFile(new File([""], `${preset.fileName}.ogg`, { type: preset.meta.type }))
                        setMeta(preset.meta)
                        reset()
                        setIsDemo(false)
                      }
                    }}
                  />
                </div>
              </section>

              <section className="overflow-hidden rounded-xl border border-border bg-card">
                <RailHeader step="2" title="엔진 설정" description="전사와 요약에 사용할 모델" />
                <div className="p-3">
                  <EngineSelector
                    transcriptionEngine={transcriptionEngine}
                    refineEngine={refineEngine}
                    disabled={state.isRunning}
                    onTranscriptionChange={setTranscriptionEngine}
                    onRefineChange={setRefineEngine}
                  />
                </div>
              </section>

              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-sm text-destructive"
                >
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium">처리 오류</p>
                    <p className="mt-0.5 leading-relaxed text-destructive/90">{error}</p>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                {!hasStarted ? (
                  <>
                    <button
                      type="button"
                      onClick={startDemo}
                      disabled={state.isRunning}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Sparkles className="size-4" />
                      데모 보기
                    </button>
                    <button
                      type="button"
                      onClick={start}
                      disabled={!file || !meta}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-brand-foreground shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
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
                        onClick={start}
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-brand-foreground shadow-sm transition-opacity hover:opacity-90"
                      >
                        <RotateCcw className="size-4" />
                        다시 시도
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={onClear}
                      disabled={state.isRunning}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      새 파일
                    </button>
                  </>
                )}
              </div>

              {hasStarted && (
                <section className="overflow-hidden rounded-xl border border-border bg-card">
                  <RailHeader step="3" title="진행 상태" description="파이프라인 처리 단계" />
                  <div className="p-4">
                    <ProgressSteps
                      order={stepOrder}
                      steps={state.steps}
                      labels={progressLabels}
                      details={progressDetails}
                      showCompletedDetails={isDemo}
                    />
                  </div>
                </section>
              )}

              <p className="flex items-start gap-2 rounded-lg border border-border/70 bg-card/60 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                오디오 파일은 처리 후 저장되지 않습니다. API 키는 서버에서만 사용됩니다.
              </p>
            </aside>

            <section className="min-h-[480px]">
              {state.result && meta ? (
                <ResultsPanel
                  result={state.result}
                  fileName={meta.name}
                  onChangeType={changeContentType}
                  changingType={state.changingType}
                />
              ) : (
                <FileEmptyState running={state.isRunning} hasError={Boolean(error)} />
              )}
            </section>
          </div>
        ) : (
          <LiveTranslatePanel />
        )}
      </main>
    </div>
  )
}

function DemoPresetPicker({
  presets,
  selectedId,
  disabled,
  onSelect,
}: {
  presets: FileDemoPreset[]
  selectedId: FileDemoPresetId
  disabled: boolean
  onSelect: (id: FileDemoPresetId) => void
}) {
  const selected = getFileDemoPreset(selectedId)
  const duration = formatDuration(selected.meta.durationSeconds)

  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-foreground">데모 샘플</p>
        {duration && (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock3 className="size-3" />
            {duration}
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {presets.map((preset) => {
          const active = preset.id === selectedId
          return (
            <button
              key={preset.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(preset.id)}
              className={`min-w-0 rounded-md border px-2 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                active
                  ? "border-brand/50 bg-brand-muted text-brand"
                  : "border-border bg-background text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <span className="block truncate text-xs font-semibold">{preset.label}</span>
              <span className="mt-0.5 block truncate text-[10px] opacity-80">{preset.badge}</span>
            </button>
          )
        })}
      </div>
      <div className="mt-2 rounded-lg border border-border bg-background px-2.5 py-2">
        <p className="text-[11px] leading-relaxed text-muted-foreground">{selected.description}</p>
        <p className="mt-1 text-[10px] text-muted-foreground">
          {formatBytes(selected.meta.size)}
          {selected.timings?.transcribeMs ? ` · 실제 전사 ${formatProcessingMs(selected.timings.transcribeMs)}` : ""}
          {selected.timings?.refineMs ? ` · 실제 노트 ${formatProcessingMs(selected.timings.refineMs)}` : ""}
        </p>
      </div>
    </div>
  )
}

function ModeButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-secondary text-foreground shadow-sm"
          : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
      }`}
    >
      <span className={active ? "text-brand" : "text-muted-foreground"}>{icon}</span>
      <span className="hidden sm:inline">{label}</span>
      <span className="sr-only sm:hidden">{label}</span>
    </button>
  )
}

function RailHeader({ step, title, description }: { step: string; title: string; description: string }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-border bg-surface px-3.5 py-2.5">
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border bg-card font-mono text-[10px] font-semibold text-muted-foreground">
        {step}
      </span>
      <div className="min-w-0">
        <h2 className="text-xs font-semibold text-foreground">{title}</h2>
        <p className="truncate text-[11px] text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

function statusEngineName(label: string) {
  return label.replace(/^AI Gateway · /, "").replace(/^Groq · /, "Groq ")
}

function demoTimingText(preset: FileDemoPreset, step: "transcribe" | "refine") {
  const ms = step === "transcribe" ? preset.timings?.transcribeMs : preset.timings?.refineMs
  return ms ? ` 실제 측정 시간은 약 ${formatProcessingMs(ms)}입니다.` : ""
}

function formatProcessingMs(ms: number) {
  const seconds = Math.max(1, Math.round(ms / 1000))
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  if (minutes === 0) return `${rest}초`
  if (rest === 0) return `${minutes}분`
  return `${minutes}분 ${rest}초`
}

function FileEmptyState({ running, hasError }: { running: boolean; hasError: boolean }) {
  if (running) {
    return (
      <div className="flex h-full min-h-[480px] flex-col items-center justify-center rounded-xl border border-border bg-card p-8 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-brand-muted text-brand">
          <Loader2 className="size-6 animate-spin" />
        </div>
        <p className="mt-4 text-sm font-medium text-foreground">노트를 생성하고 있습니다</p>
        <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-muted-foreground">
          전사와 요약이 끝나면 여기에 정리된 노트 문서가 표시됩니다. 진행 상태는 왼쪽 패널에서 확인할 수 있습니다.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-[480px] flex-col rounded-xl border border-dashed border-border bg-card/40">
      <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-secondary text-muted-foreground">
          <FileText className="size-6" />
        </div>
        <p className="mt-4 text-sm font-medium text-foreground">
          {hasError ? "다시 시도할 준비가 되었습니다" : "아직 결과가 없습니다"}
        </p>
        <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-muted-foreground">
          음성 · 영상 파일을 업로드하고 전사를 시작하면 요약 · 타임라인 · 핵심 포인트가 담긴 노트 문서가 여기에
          만들어집니다.
        </p>

        <div className="mt-8 grid w-full max-w-lg gap-3 sm:grid-cols-3">
          <EmptyStep icon={<UploadCloud className="size-4" />} title="업로드" description="파일 선택 또는 드래그" />
          <EmptyStep icon={<Mic className="size-4" />} title="전사" description="음성을 텍스트로 변환" />
          <EmptyStep icon={<Wand2 className="size-4" />} title="노트 생성" description="유형별 노트로 정리" />
        </div>

        <p className="mt-6 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Sparkles className="size-3.5 text-brand" />
          파일이 없다면 왼쪽의 데모 보기로 전체 흐름을 미리 볼 수 있습니다.
        </p>
      </div>
    </div>
  )
}

function EmptyStep({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-4">
      <span className="flex size-8 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
        {icon}
      </span>
      <span className="text-xs font-medium text-foreground">{title}</span>
      <span className="text-center text-[11px] leading-relaxed text-muted-foreground">{description}</span>
    </div>
  )
}
