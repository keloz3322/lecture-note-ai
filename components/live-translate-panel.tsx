"use client"

import { AlertTriangle, Download, Languages, Loader2, Mic, RotateCcw, Sparkles, Square, Wand2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { DEFAULT_REFINE_ENGINE, getRefineEngine, REFINE_ENGINES } from "@/lib/engines"
import {
  getLiveTranslateLanguageLabel,
  LIVE_TRANSLATE_LANGUAGES,
  type LiveTranslateLanguageCode,
} from "@/lib/live-translate"
import { useLiveTranslate } from "@/hooks/use-live-translate"
import { ResultsPanel } from "./results-panel"

const SESSION_FILE_NAME = "실시간 번역 세션.txt"
type NoteSource = "source" | "translation" | "both"

const NOTE_SOURCE_LABELS: Record<NoteSource, string> = {
  translation: "번역문 기준",
  source: "원문 기준",
  both: "원문 + 번역문",
}

export function LiveTranslatePanel() {
  const live = useLiveTranslate()
  const noteSectionRef = useRef<HTMLDivElement>(null)
  const [targetLanguageCode, setTargetLanguageCode] = useState<LiveTranslateLanguageCode>("ko")
  const [echoTargetLanguage, setEchoTargetLanguage] = useState(true)
  const [refineEngine, setRefineEngine] = useState(DEFAULT_REFINE_ENGINE)
  const [pendingNoteSource, setPendingNoteSource] = useState<NoteSource | null>(null)
  const [autoScrollTranscript, setAutoScrollTranscript] = useState(true)

  const isActive = live.status === "connecting" || live.status === "listening" || live.status === "stopping"
  const isRefining = live.status === "refining"
  const canRefine = !isActive && (live.sourceChunks.length > 0 || live.translationChunks.length > 0)
  const refine = getRefineEngine(refineEngine)

  useEffect(() => {
    if (live.result) noteSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [live.result])

  async function handleRefine(source: NoteSource) {
    setPendingNoteSource(source)
    noteSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    try {
      await live.refine(source, refineEngine)
    } finally {
      setPendingNoteSource(null)
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      <aside className="flex flex-col gap-4">
        <section className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-brand-muted text-brand">
              <Languages className="size-4.5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-card-foreground">실시간 번역</h2>
              <p className="text-xs text-muted-foreground">마이크 음성을 실시간으로 번역하고 전사합니다.</p>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-foreground">번역 언어</span>
              <select
                value={targetLanguageCode}
                disabled={isActive}
                onChange={(event) => setTargetLanguageCode(event.target.value as LiveTranslateLanguageCode)}
                className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {LIVE_TRANSLATE_LANGUAGES.map((language) => (
                  <option key={language.code} value={language.code}>
                    {language.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2">
              <span className="text-xs leading-relaxed text-muted-foreground">
                입력이 이미 번역 언어일 때도 그대로 표시
              </span>
              <input
                type="checkbox"
                checked={echoTargetLanguage}
                disabled={isActive}
                onChange={(event) => setEchoTargetLanguage(event.target.checked)}
                className="size-4 accent-primary"
              />
            </label>
          </div>

          <div className="mt-4 flex gap-2">
            {!isActive ? (
              <>
                <button
                  type="button"
                  onClick={live.runDemo}
                  disabled={isRefining}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Sparkles className="size-4" />
                  데모 보기
                </button>
                <button
                  type="button"
                  onClick={() => live.start({ targetLanguageCode, echoTargetLanguage })}
                  disabled={isRefining}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-brand-foreground shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Mic className="size-4" />
                  번역 시작
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={live.stop}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-destructive px-4 py-2.5 text-sm font-medium text-destructive-foreground shadow-sm transition-opacity hover:opacity-90"
              >
                <Square className="size-4" />
                종료
              </button>
            )}
            <button
              type="button"
              onClick={live.reset}
              disabled={isActive || isRefining}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="초기화"
            >
              <RotateCcw className="size-4" />
            </button>
          </div>

          <StatusLine status={live.status} targetLanguageCode={live.targetLanguageCode || targetLanguageCode} />

          {live.error && (
            <div
              role="alert"
              className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div className="min-w-0">
                <p className="font-medium">처리 오류</p>
                <p className="mt-0.5 text-destructive/90">{live.error}</p>
              </div>
            </div>
          )}

          {live.recording && !isActive && (
            <div className="mt-3 rounded-lg border border-border bg-background p-3">
              <a
                href={live.recording.url}
                download={live.recording.fileName}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
              >
                <Download className="size-4" />
                녹음 파일 다운로드
              </a>
              <p className="mt-2 text-xs text-muted-foreground">
                {formatRecordingType(live.recording.mimeType)} · {formatBytes(live.recording.size)}
              </p>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            <span className="size-2 rounded-full bg-lane-note" aria-hidden />
            노트로 정리
          </h2>
          <label className="mt-3 flex flex-col gap-1.5">
            <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <Wand2 className="size-3.5 text-muted-foreground" />
              노트 엔진
            </span>
            <select
              value={refineEngine}
              disabled={isRefining}
              onChange={(event) => setRefineEngine(event.target.value)}
              className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {REFINE_ENGINES.map((engine) => (
                <option key={engine.id} value={engine.id}>
                  {engine.label}
                </option>
              ))}
            </select>
            <p className="text-xs leading-relaxed text-muted-foreground">{refine.description}</p>
          </label>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            정리에 사용할 전사 내용을 선택하세요.
          </p>
          <div className="mt-2 grid gap-2">
            <button
              type="button"
              disabled={!canRefine || isRefining}
              onClick={() => handleRefine("translation")}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand px-3 py-2.5 text-sm font-medium text-brand-foreground shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pendingNoteSource === "translation" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <span className="size-2 rounded-full bg-brand-foreground/70" aria-hidden />
              )}
              {pendingNoteSource === "translation" ? "정리 중..." : "번역문 기준"}
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!canRefine || isRefining}
                onClick={() => handleRefine("source")}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pendingNoteSource === "source" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <span className="size-2 rounded-full bg-lane-source" aria-hidden />
                )}
                {pendingNoteSource === "source" ? "정리 중..." : "원문 기준"}
              </button>
              <button
                type="button"
                disabled={!canRefine || isRefining}
                onClick={() => handleRefine("both")}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pendingNoteSource === "both" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <span className="flex items-center -space-x-1" aria-hidden>
                    <span className="size-2 rounded-full bg-lane-source ring-1 ring-card" />
                    <span className="size-2 rounded-full bg-lane-translation ring-1 ring-card" />
                  </span>
                )}
                {pendingNoteSource === "both" ? "정리 중..." : "원문 + 번역"}
              </button>
            </div>
          </div>
          {isRefining && (
            <div
              className="mt-3 flex items-start gap-2 rounded-md border border-primary/20 bg-primary/10 px-3 py-2 text-xs leading-relaxed text-muted-foreground"
              aria-live="polite"
            >
              <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-primary" />
              <span>{pendingNoteSource ? `${NOTE_SOURCE_LABELS[pendingNoteSource]}으로 노트를 생성하고 있습니다.` : "노트를 생성하고 있습니다."}</span>
            </div>
          )}
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            실시간 번역 타임라인은 모델 타임스탬프가 아니라 수신 시각 기반 추정값으로 생성됩니다.
          </p>
        </section>
      </aside>

      <section className="flex min-w-0 flex-col gap-4">
        <div className="flex min-h-[430px] flex-col overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-card-foreground">
                실시간 전사
                {isActive && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/10 px-2 py-0.5 text-[11px] font-medium text-green-500">
                    <span className="relative flex size-1.5">
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-green-500/70" />
                      <span className="relative size-1.5 rounded-full bg-green-500" />
                    </span>
                    LIVE
                  </span>
                )}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                수신 시각은 표시용이며 노트에서는 추정 타임라인으로 사용됩니다.
              </p>
            </div>
            <label className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={autoScrollTranscript}
                onChange={(event) => setAutoScrollTranscript(event.target.checked)}
                className="size-3.5 accent-primary"
              />
              자동 스크롤
            </label>
          </div>
          <div className="grid flex-1 gap-0 lg:grid-cols-2">
            <TranscriptStream
              lane="source"
              title="원문"
              chunks={live.sourceChunks}
              empty="마이크 입력이 들어오면 원문 전사가 표시됩니다."
              autoScroll={autoScrollTranscript}
            />
            <TranscriptStream
              lane="translation"
              title={`번역문 · ${getLiveTranslateLanguageLabel(targetLanguageCode)}`}
              chunks={live.translationChunks}
              empty="번역 결과가 도착하면 여기에 쌓입니다."
              autoScroll={autoScrollTranscript}
            />
          </div>
          {live.usageTokens !== null && (
            <div className="flex items-center justify-between border-t border-border bg-background/40 px-4 py-2 text-xs text-muted-foreground">
              <span>누적 토큰</span>
              <span className="font-mono tabular-nums text-foreground">{live.usageTokens.toLocaleString()}</span>
            </div>
          )}
        </div>

        <div ref={noteSectionRef} className="min-h-[680px] scroll-mt-24 [&>*]:min-h-[680px]">
          {live.result ? (
            <div className="relative">
              {isRefining && (
                <div
                  className="absolute right-3 top-3 z-10 inline-flex items-center gap-2 rounded-md border border-primary/20 bg-card/95 px-3 py-2 text-xs text-muted-foreground shadow-sm backdrop-blur"
                  aria-live="polite"
                >
                  <Loader2 className="size-3.5 animate-spin text-primary" />
                  새 노트 생성 중
                </div>
              )}
              <ResultsPanel
                result={live.result}
                fileName={SESSION_FILE_NAME}
                onChangeType={live.changeContentType}
                changingType={live.changingType}
              />
            </div>
          ) : (
            <div className="flex min-h-[680px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40 p-8 text-center">
              <div
                className={`flex size-14 items-center justify-center rounded-full ${
                  isRefining ? "bg-brand-muted text-brand" : "bg-secondary text-muted-foreground"
                }`}
              >
                {isRefining ? <Loader2 className="size-6 animate-spin" /> : <Wand2 className="size-6" />}
              </div>
              <p className="mt-4 text-sm font-medium text-foreground">
                {isRefining ? "노트를 생성하고 있습니다" : "아직 노트 결과가 없습니다"}
              </p>
              <p className="mt-1.5 max-w-md text-xs leading-relaxed text-muted-foreground">
                {isRefining
                  ? `${pendingNoteSource ? NOTE_SOURCE_LABELS[pendingNoteSource] : "선택한 전사 내용"}을 요약 엔진에 보내 정리하고 있습니다. 완료되면 이 영역에 넓게 표시됩니다.`
                  : "실시간 번역을 종료한 뒤 전사 내용을 선택해 기존 노트 파이프라인으로 정리할 수 있습니다."}
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function StatusLine({
  status,
  targetLanguageCode,
}: {
  status: ReturnType<typeof useLiveTranslate>["status"]
  targetLanguageCode: string
}) {
  const text = {
    idle: "대기 중",
    connecting: "Gemini Live 연결 중",
    listening: `${getLiveTranslateLanguageLabel(targetLanguageCode)}로 번역 중`,
    stopping: "세션 종료 중",
    stopped: "세션 종료됨",
    refining: "노트 생성 중",
    error: "오류 발생",
  }[status]

  const isListening = status === "listening"
  const isError = status === "error"
  const isBusy = status === "connecting" || status === "stopping" || status === "refining"

  return (
    <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground">
      <span className="relative flex size-2 items-center justify-center">
        {isListening && (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-green-500/70" aria-hidden />
        )}
        <span
          className={`relative size-2 rounded-full ${
            isListening
              ? "bg-green-500"
              : isError
                ? "bg-destructive"
                : isBusy
                  ? "bg-brand"
                  : "bg-muted-foreground/45"
          }`}
        />
      </span>
      <span className={isListening ? "text-foreground" : isError ? "text-destructive" : undefined}>{text}</span>
    </div>
  )
}

function TranscriptStream({
  lane,
  title,
  chunks,
  empty,
  autoScroll,
}: {
  lane: "source" | "translation"
  title: string
  chunks: { id: string; text: string; languageCode?: string; receivedAtSeconds: number }[]
  empty: string
  autoScroll: boolean
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!autoScroll) return
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
  }, [autoScroll, chunks.length])

  const laneColor = lane === "translation" ? "bg-lane-translation" : "bg-lane-source"
  const chunkAccent =
    lane === "translation"
      ? "border-l-2 border-l-lane-translation/60"
      : "border-l-2 border-l-lane-source/50"

  return (
    <div className="flex min-h-0 flex-col border-b border-border p-4 last:border-b-0 lg:border-b-0 lg:border-r lg:last:border-r-0">
      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        <span className={`size-2 rounded-full ${laneColor}`} aria-hidden />
        {title}
        <span className="ml-auto font-sans text-[11px] font-normal normal-case tabular-nums text-muted-foreground/70">
          {chunks.length > 0 ? `${chunks.length}개` : ""}
        </span>
      </h3>
      <div ref={scrollRef} className="scrollbar-subtle mt-3 max-h-[330px] flex-1 space-y-2 overflow-y-auto pr-1">
        {chunks.length === 0 ? (
          <p className="text-sm leading-relaxed text-muted-foreground">{empty}</p>
        ) : (
          chunks.map((chunk) => (
            <div
              key={chunk.id}
              className={`rounded-md rounded-l-lg border border-border bg-background p-2.5 ${chunkAccent}`}
            >
              <div className="mb-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="font-mono tabular-nums">{formatElapsed(chunk.receivedAtSeconds)}</span>
                {chunk.languageCode && (
                  <span className="rounded bg-secondary px-1 py-0.5 font-mono text-[10px] uppercase">
                    {chunk.languageCode}
                  </span>
                )}
              </div>
              <p className="text-sm leading-relaxed text-card-foreground">{chunk.text}</p>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function formatElapsed(seconds: number) {
  const rounded = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(rounded / 60)
  const rest = rounded % 60
  return `${minutes}:${rest.toString().padStart(2, "0")}`
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** exponent
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`
}

function formatRecordingType(mimeType: string) {
  if (mimeType.includes("mp4")) return "M4A / AAC"
  if (mimeType.includes("ogg")) return "OGG / Opus"
  if (mimeType.includes("webm") && mimeType.includes("opus")) return "WebM / Opus"
  if (mimeType.includes("webm")) return "WebM"
  return mimeType || "Audio"
}
