"use client"

import { useMemo, useState } from "react"
import { CheckSquare, Clock3, Download, FileText, HelpCircle, ListChecks, ScrollText } from "lucide-react"
import { buildMarkdown, buildPlainText, downloadTextFile, formatDuration } from "@/lib/format"
import type { RefineResult, TabKey } from "@/lib/types"
import { CopyButton } from "./copy-button"

interface ResultsPanelProps {
  result: RefineResult
  fileName: string
}

const TABS: { key: TabKey; label: string; icon: typeof FileText }[] = [
  { key: "timeline", label: "타임라인", icon: Clock3 },
  { key: "transcript", label: "정리된 전사문", icon: ScrollText },
  { key: "summary", label: "요약", icon: FileText },
  { key: "keyPoints", label: "핵심 포인트", icon: ListChecks },
  { key: "questions", label: "복습 질문", icon: HelpCircle },
  { key: "actions", label: "할 일", icon: CheckSquare },
]

export function ResultsPanel({ result, fileName }: ResultsPanelProps) {
  const [tab, setTab] = useState<TabKey>("timeline")
  const baseName = useMemo(() => fileName.replace(/\.[^.]+$/, ""), [fileName])

  const tabText = useMemo(() => getTabText(result, tab), [result, tab])

  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-card">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-card-foreground">학습 노트</h2>
        <div className="flex items-center gap-2">
          <CopyButton getText={() => tabText} label="탭 복사" />
          <button
            type="button"
            onClick={() => downloadTextFile(buildMarkdown(result, baseName), `${baseName}.md`)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
          >
            <Download className="size-3.5" />
            Markdown
          </button>
          <button
            type="button"
            onClick={() => downloadTextFile(buildPlainText(result, baseName), `${baseName}.txt`)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
          >
            <Download className="size-3.5" />
            TXT
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-border px-2 py-2" role="tablist">
        {TABS.map(({ key, label, icon: Icon }) => {
          const active = tab === key
          return (
            <button
              key={key}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(key)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                active ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          )
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <TabContent result={result} tab={tab} />
      </div>
    </div>
  )
}

function TabContent({ result, tab }: { result: RefineResult; tab: TabKey }) {
  if (tab === "timeline") {
    if (result.timeline.length === 0) {
      return <p className="text-sm text-muted-foreground">타임라인 결과가 없습니다.</p>
    }
    return (
      <ol className="space-y-3">
        {result.timeline.map((item, i) => (
          <li key={`${item.start}-${item.end}-${i}`} className="rounded-md border border-border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-sm bg-secondary px-1.5 py-0.5 text-xs font-medium tabular-nums text-foreground">
                {formatDuration(item.start)}-{formatDuration(item.end)}
              </span>
              <h3 className="text-sm font-semibold text-card-foreground">{item.title}</h3>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.summary}</p>
          </li>
        ))}
      </ol>
    )
  }
  if (tab === "transcript") {
    return (
      <div className="space-y-3 text-sm leading-relaxed text-card-foreground">
        {result.cleanedTranscript.split("\n\n").map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    )
  }
  if (tab === "summary") {
    return <p className="text-sm leading-relaxed text-card-foreground">{result.summary}</p>
  }
  if (tab === "keyPoints") {
    return (
      <ul className="space-y-2">
        {result.keyPoints.map((p, i) => (
          <li key={i} className="flex gap-2 text-sm leading-relaxed text-card-foreground">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
            <span>{p}</span>
          </li>
        ))}
      </ul>
    )
  }
  if (tab === "questions") {
    return (
      <ol className="space-y-3">
        {result.studyQuestions.map((q, i) => (
          <li key={i} className="flex gap-3 text-sm leading-relaxed text-card-foreground">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium">
              {i + 1}
            </span>
            <span>{q}</span>
          </li>
        ))}
      </ol>
    )
  }
  return (
    <ul className="space-y-2">
      {result.actionItems.map((a, i) => (
        <li key={i} className="flex items-start gap-2 text-sm leading-relaxed text-card-foreground">
          <CheckSquare className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span>{a}</span>
        </li>
      ))}
    </ul>
  )
}

function getTabText(result: RefineResult, tab: TabKey): string {
  switch (tab) {
    case "timeline":
      return result.timeline
        .map((item) => `- ${formatDuration(item.start)}-${formatDuration(item.end)} ${item.title}: ${item.summary}`)
        .join("\n")
    case "transcript":
      return result.cleanedTranscript
    case "summary":
      return result.summary
    case "keyPoints":
      return result.keyPoints.map((p) => `- ${p}`).join("\n")
    case "questions":
      return result.studyQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")
    case "actions":
      return result.actionItems.map((a) => `- ${a}`).join("\n")
  }
}
