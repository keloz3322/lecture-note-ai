"use client"

import { AlertTriangle, Languages, Mic, RotateCcw, Square, Wand2 } from "lucide-react"
import { useState } from "react"
import { DEFAULT_REFINE_ENGINE, getRefineEngine, REFINE_ENGINES } from "@/lib/engines"
import {
  getLiveTranslateLanguageLabel,
  LIVE_TRANSLATE_LANGUAGES,
  type LiveTranslateLanguageCode,
} from "@/lib/live-translate"
import { useLiveTranslate } from "@/hooks/use-live-translate"
import { ResultsPanel } from "./results-panel"

const SESSION_FILE_NAME = "실시간 번역 세션.txt"

export function LiveTranslatePanel() {
  const live = useLiveTranslate()
  const [targetLanguageCode, setTargetLanguageCode] = useState<LiveTranslateLanguageCode>("ko")
  const [echoTargetLanguage, setEchoTargetLanguage] = useState(true)
  const [refineEngine, setRefineEngine] = useState(DEFAULT_REFINE_ENGINE)

  const isActive = live.status === "connecting" || live.status === "listening" || live.status === "stopping"
  const canRefine = !isActive && (live.sourceChunks.length > 0 || live.translationChunks.length > 0)
  const refine = getRefineEngine(refineEngine)

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <aside className="flex flex-col gap-4">
        <section className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Languages className="size-4" />
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
                className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm text-foreground focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
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

            <label className="flex flex-col gap-1.5">
              <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <Wand2 className="size-3.5 text-muted-foreground" />
                노트 엔진
              </span>
              <select
                value={refineEngine}
                disabled={live.status === "refining"}
                onChange={(event) => setRefineEngine(event.target.value)}
                className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm text-foreground focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              >
                {REFINE_ENGINES.map((engine) => (
                  <option key={engine.id} value={engine.id}>
                    {engine.label}
                  </option>
                ))}
              </select>
              <p className="text-xs leading-relaxed text-muted-foreground">{refine.description}</p>
            </label>
          </div>

          <div className="mt-4 flex gap-2">
            {!isActive ? (
              <button
                type="button"
                onClick={() => live.start({ targetLanguageCode, echoTargetLanguage })}
                disabled={live.status === "refining"}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Mic className="size-4" />
                번역 시작
              </button>
            ) : (
              <button
                type="button"
                onClick={live.stop}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-destructive px-4 py-2.5 text-sm font-medium text-destructive-foreground transition-opacity hover:opacity-90"
              >
                <Square className="size-4" />
                종료
              </button>
            )}
            <button
              type="button"
              onClick={live.reset}
              disabled={isActive || live.status === "refining"}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-card px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
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
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">노트로 정리</h2>
          <div className="mt-3 grid gap-2">
            <button
              type="button"
              disabled={!canRefine || live.status === "refining"}
              onClick={() => live.refine("translation", refineEngine)}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              번역문 기준
            </button>
            <button
              type="button"
              disabled={!canRefine || live.status === "refining"}
              onClick={() => live.refine("source", refineEngine)}
              className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
            >
              원문 기준
            </button>
            <button
              type="button"
              disabled={!canRefine || live.status === "refining"}
              onClick={() => live.refine("both", refineEngine)}
              className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
            >
              원문 + 번역문
            </button>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            실시간 번역은 모델 타임스탬프를 반환하지 않으므로 노트 결과의 타임라인은 비활성화됩니다.
          </p>
        </section>
      </aside>

      <section className="grid min-h-[560px] gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="flex min-h-[560px] flex-col rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-card-foreground">실시간 전사</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              수신 시각은 표시용이며 공식 타임라인으로 사용하지 않습니다.
            </p>
          </div>
          <div className="grid flex-1 gap-0 md:grid-cols-2 xl:grid-cols-1">
            <TranscriptStream title="원문" chunks={live.sourceChunks} empty="마이크 입력이 들어오면 원문 전사가 표시됩니다." />
            <TranscriptStream
              title={`번역문 · ${getLiveTranslateLanguageLabel(targetLanguageCode)}`}
              chunks={live.translationChunks}
              empty="번역 결과가 도착하면 여기에 쌓입니다."
            />
          </div>
          {live.usageTokens !== null && (
            <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
              누적 토큰: {live.usageTokens.toLocaleString()}
            </div>
          )}
        </div>

        {live.result ? (
          <ResultsPanel
            result={live.result}
            fileName={SESSION_FILE_NAME}
            onChangeType={live.changeContentType}
            changingType={live.changingType}
          />
        ) : (
          <div className="flex min-h-[560px] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 p-8 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
              <Wand2 className="size-6" />
            </div>
            <p className="mt-4 text-sm font-medium text-foreground">
              {live.status === "refining" ? "노트를 생성하고 있습니다" : "아직 노트 결과가 없습니다"}
            </p>
            <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
              실시간 번역을 종료한 뒤 전사 내용을 선택해 기존 노트 파이프라인으로 정리할 수 있습니다.
            </p>
          </div>
        )}
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

  return (
    <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
      <span
        className={`size-2 rounded-full ${
          status === "listening" ? "bg-green-500" : status === "error" ? "bg-destructive" : "bg-muted-foreground/45"
        }`}
      />
      {text}
    </div>
  )
}

function TranscriptStream({
  title,
  chunks,
  empty,
}: {
  title: string
  chunks: { id: string; text: string; languageCode?: string; receivedAtSeconds: number }[]
  empty: string
}) {
  return (
    <div className="min-h-0 border-b border-border p-4 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0 xl:border-b xl:border-r-0 xl:last:border-b-0">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="mt-3 max-h-[220px] space-y-2 overflow-y-auto pr-1 xl:max-h-[205px]">
        {chunks.length === 0 ? (
          <p className="text-sm leading-relaxed text-muted-foreground">{empty}</p>
        ) : (
          chunks.map((chunk) => (
            <div key={chunk.id} className="rounded-md border border-border bg-background p-2.5">
              <div className="mb-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="font-mono">{formatElapsed(chunk.receivedAtSeconds)}</span>
                {chunk.languageCode && <span>{chunk.languageCode}</span>}
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
