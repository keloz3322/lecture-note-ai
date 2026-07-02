"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Check,
  CheckSquare,
  Clock3,
  Download,
  FileText,
  ListChecks,
  PencilLine,
  ScrollText,
  Sparkles,
  X,
} from "lucide-react"
import { buildMarkdown, buildPlainText, downloadTextFile, formatDuration } from "@/lib/format"
import type { RefineResult, RefineSection } from "@/lib/types"
import { CONTENT_TYPES, getContentType, getCoreLabel, type ContentTypeId } from "@/lib/content-types"
import { CopyButton } from "./copy-button"

interface ResultsPanelProps {
  result: RefineResult
  fileName: string
  /** Re-run refine with a manually chosen content type. */
  onChangeType?: (type: ContentTypeId) => void
  /** True while a type-change refine is in flight. */
  changingType?: boolean
  /** Render without the outer card frame (when embedded in a parent card). */
  frameless?: boolean
}

type ViewKey = "note" | "timeline" | "transcript"

/** User edits layered over the AI result. Reset whenever a new result arrives. */
interface ResultEdits {
  summary?: string
  transcript?: string
}

export function ResultsPanel({ result, fileName, onChangeType, changingType, frameless }: ResultsPanelProps) {
  const [view, setView] = useState<ViewKey>("note")
  const [edits, setEdits] = useState<ResultEdits>({})
  const baseName = useMemo(() => fileName.replace(/\.[^.]+$/, ""), [fileName])
  const timelineAvailable = result.timestampStatus === "available" || result.timestampStatus === "estimated"

  // A fresh AI result invalidates local edits and any view that no longer applies.
  useEffect(() => {
    setEdits({})
  }, [result])

  useEffect(() => {
    if (view === "timeline" && !timelineAvailable) setView("note")
  }, [view, timelineAvailable])

  const summaryText = edits.summary ?? result.summary
  const transcriptText = edits.transcript ?? result.cleanedTranscript
  const edited = edits.summary !== undefined || edits.transcript !== undefined

  /** Result with user edits applied, used for copy and export. */
  const exportResult = useMemo<RefineResult>(
    () => ({ ...result, summary: summaryText, cleanedTranscript: transcriptText }),
    [result, summaryText, transcriptText],
  )

  const sectionTabs = useMemo(() => result.sections.filter((s) => s.items.length > 0), [result.sections])

  const viewText = useMemo(
    () => getViewText(exportResult, view, sectionTabs),
    [exportResult, view, sectionTabs],
  )

  return (
    <div
      className={`flex h-full flex-col overflow-hidden bg-card ${
        frameless ? "" : "rounded-xl border border-border"
      }`}
    >
      {/* Document header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-lane-note/15 text-lane-note">
            <Sparkles className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-card-foreground" title={baseName}>
              {baseName}
            </h2>
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              AI 생성 노트 · 검토 후 사용하세요
              {edited && (
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-muted px-1.5 py-px font-medium text-brand">
                  <PencilLine className="size-2.5" />
                  수정됨
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <TypeSelector
            value={result.contentType}
            detected={result.detectedType}
            disabled={changingType}
            onChange={onChangeType}
          />
          <CopyButton getText={() => viewText} label="복사" />
          <button
            type="button"
            onClick={() => downloadTextFile(buildMarkdown(exportResult, baseName), `${baseName}.md`)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
          >
            <Download className="size-3.5" />
            MD
          </button>
          <button
            type="button"
            onClick={() => downloadTextFile(buildPlainText(exportResult, baseName), `${baseName}.txt`)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
          >
            <Download className="size-3.5" />
            TXT
          </button>
        </div>
      </div>

      {/* View switcher */}
      <div className="scrollbar-subtle flex gap-1 overflow-x-auto border-b border-border px-2 py-2" role="tablist">
        <ViewButton active={view === "note"} onClick={() => setView("note")} icon={FileText} label="노트 문서" />
        <ViewButton
          active={view === "timeline"}
          disabled={!timelineAvailable}
          onClick={() => setView("timeline")}
          icon={Clock3}
          label={getCoreLabel(result.contentType, "timeline")}
        />
        <ViewButton
          active={view === "transcript"}
          onClick={() => setView("transcript")}
          icon={ScrollText}
          label="정리된 전사문"
        />
      </div>

      {result.timelineNotice && view !== "transcript" && (
        <div className="flex items-start gap-2 border-b border-border bg-secondary/30 px-4 py-2.5 text-xs leading-relaxed text-muted-foreground">
          <Clock3 className="mt-0.5 size-3.5 shrink-0" />
          <span>{result.timelineNotice}</span>
        </div>
      )}

      {/* Content */}
      <div className="scrollbar-subtle flex-1 overflow-y-auto">
        {view === "note" && (
          <NoteDocument
            result={result}
            summaryText={summaryText}
            summaryEdited={edits.summary !== undefined}
            onSummaryChange={(value) =>
              setEdits((prev) => (value === result.summary ? { ...prev, summary: undefined } : { ...prev, summary: value }))
            }
            sections={sectionTabs}
          />
        )}
        {view === "timeline" && <TimelineView result={result} />}
        {view === "transcript" && (
          <TranscriptView
            text={transcriptText}
            edited={edits.transcript !== undefined}
            original={result.cleanedTranscript}
            onChange={(value) =>
              setEdits((prev) =>
                value === result.cleanedTranscript ? { ...prev, transcript: undefined } : { ...prev, transcript: value },
              )
            }
          />
        )}
      </div>
    </div>
  )
}

function ViewButton({
  active,
  disabled,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean
  disabled?: boolean
  onClick: () => void
  icon: typeof FileText
  label: string
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      aria-disabled={disabled}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
        disabled
          ? "cursor-not-allowed text-muted-foreground/45"
          : active
            ? "bg-secondary text-foreground shadow-sm"
            : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
      }`}
    >
      <Icon className={`size-3.5 ${active && !disabled ? "text-brand" : ""}`} />
      {label}
    </button>
  )
}

function TypeSelector({
  value,
  detected,
  disabled,
  onChange,
}: {
  value: ContentTypeId
  detected: ContentTypeId
  disabled?: boolean
  onChange?: (type: ContentTypeId) => void
}) {
  if (!onChange) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
        <Sparkles className="size-3" />
        {getContentType(value).label}
      </span>
    )
  }
  return (
    <label className="inline-flex items-center gap-1.5">
      <span className="sr-only">콘텐츠 유형</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as ContentTypeId)}
        className="rounded-lg border border-border bg-card px-2 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
        title={value === detected ? "AI가 감지한 유형" : `AI 감지: ${getContentType(detected).label}`}
      >
        {CONTENT_TYPES.map((type) => (
          <option key={type.id} value={type.id}>
            {type.label}
          </option>
        ))}
      </select>
      {disabled && <span className="text-xs text-muted-foreground">재생성 중…</span>}
    </label>
  )
}

/**
 * Summary-first document view: overview → key points → type-specific sections,
 * stacked as one readable, reviewable document instead of scattered tabs.
 */
function NoteDocument({
  result,
  summaryText,
  summaryEdited,
  onSummaryChange,
  sections,
}: {
  result: RefineResult
  summaryText: string
  summaryEdited: boolean
  onSummaryChange: (value: string) => void
  sections: RefineSection[]
}) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-7 px-4 py-5 sm:px-6">
      <DocumentBlock
        title="요약"
        icon={FileText}
        copyText={summaryText}
        edited={summaryEdited}
        editable={{ value: summaryText, original: result.summary, onChange: onSummaryChange, rows: 6 }}
      >
        <p className="text-[15px] leading-7 text-card-foreground">{summaryText}</p>
      </DocumentBlock>

      <DocumentBlock
        title={getCoreLabel(result.contentType, "keyPoints")}
        icon={ListChecks}
        copyText={result.keyPoints.map((p) => `- ${p}`).join("\n")}
      >
        <ul className="space-y-2.5">
          {result.keyPoints.map((p, i) => (
            <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-card-foreground">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </DocumentBlock>

      {sections.map((section) => (
        <DocumentBlock
          key={section.id}
          title={section.title}
          icon={section.kind === "qa" ? CheckSquare : ListChecks}
          copyText={section.items
            .map((item, i) => (section.kind === "qa" ? `${i + 1}. ${item}` : `- ${item}`))
            .join("\n")}
        >
          <SectionContent section={section} />
        </DocumentBlock>
      ))}
    </div>
  )
}

/** One document section with a heading row, copy control, and optional inline editing. */
function DocumentBlock({
  title,
  icon: Icon,
  copyText,
  edited,
  editable,
  children,
}: {
  title: string
  icon: typeof FileText
  copyText: string
  edited?: boolean
  editable?: { value: string; original: string; onChange: (value: string) => void; rows: number }
  children: React.ReactNode
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")

  return (
    <section>
      <div className="flex items-center gap-2 border-b border-border pb-2">
        <Icon className="size-4 text-muted-foreground" aria-hidden />
        <h3 className="text-sm font-semibold text-card-foreground">{title}</h3>
        {edited && (
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-muted px-1.5 py-px text-[10px] font-medium text-brand">
            <PencilLine className="size-2.5" />
            수정됨
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {editable && !editing && (
            <button
              type="button"
              onClick={() => {
                setDraft(editable.value)
                setEditing(true)
              }}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <PencilLine className="size-3.5" />
              편집
            </button>
          )}
          <CopyButton getText={() => copyText} label="복사" />
        </div>
      </div>
      <div className="pt-3">
        {editable && editing ? (
          <div className="flex flex-col gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={editable.rows}
              className="scrollbar-subtle w-full resize-y rounded-lg border border-border bg-background p-3 text-sm leading-relaxed text-foreground focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              aria-label={`${title} 편집`}
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  editable.onChange(draft)
                  setEditing(false)
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-brand-foreground transition-opacity hover:opacity-90"
              >
                <Check className="size-3.5" />
                저장
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
              >
                <X className="size-3.5" />
                취소
              </button>
              {edited && (
                <button
                  type="button"
                  onClick={() => {
                    editable.onChange(editable.original)
                    setEditing(false)
                  }}
                  className="ml-auto text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  AI 원본으로 되돌리기
                </button>
              )}
            </div>
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  )
}

/** Otter-style timestamped rows: mono time rail + title/summary content. */
function TimelineView({ result }: { result: RefineResult }) {
  if (result.timeline.length === 0) {
    return <p className="px-5 py-6 text-sm text-muted-foreground">타임라인 결과가 없습니다.</p>
  }
  return (
    <ol className="mx-auto flex max-w-3xl flex-col px-4 py-4 sm:px-6">
      {result.timeline.map((item, i) => (
        <li
          key={`${item.start}-${item.end}-${i}`}
          className="group grid grid-cols-[92px_minmax(0,1fr)] gap-3 border-l-2 border-border py-3 pl-4 transition-colors hover:border-lane-note/70 sm:grid-cols-[110px_minmax(0,1fr)]"
        >
          <span className="pt-0.5 font-mono text-xs tabular-nums leading-5 text-lane-note">
            {formatDuration(item.start)}
            <span className="text-muted-foreground/60"> – {formatDuration(item.end)}</span>
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-card-foreground">{item.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.summary}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}

/** Cleaned transcript as readable paragraphs with whole-document editing. */
function TranscriptView({
  text,
  edited,
  original,
  onChange,
}: {
  text: string
  edited: boolean
  original: string
  onChange: (value: string) => void
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-5 sm:px-6">
      <DocumentBlock
        title="정리된 전사문"
        icon={ScrollText}
        copyText={text}
        edited={edited}
        editable={{ value: text, original, onChange, rows: 18 }}
      >
        <div className="space-y-3.5 text-[15px] leading-7 text-card-foreground">
          {text.split("\n\n").map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </DocumentBlock>
    </div>
  )
}

function SectionContent({ section }: { section: RefineSection }) {
  if (section.items.length === 0) {
    return <p className="text-sm text-muted-foreground">{section.title} 항목이 없습니다.</p>
  }
  if (section.kind === "qa") {
    return (
      <ol className="space-y-3">
        {section.items.map((item, i) => (
          <li key={i} className="flex gap-3 text-sm leading-relaxed text-card-foreground">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium">
              {i + 1}
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ol>
    )
  }
  if (section.kind === "text") {
    return (
      <div className="space-y-3 text-sm leading-relaxed text-card-foreground">
        {section.items.map((item, i) => (
          <p key={i}>{item}</p>
        ))}
      </div>
    )
  }
  return (
    <ul className="space-y-2">
      {section.items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-sm leading-relaxed text-card-foreground">
          <CheckSquare className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

function getViewText(result: RefineResult, view: ViewKey, sections: RefineSection[]): string {
  switch (view) {
    case "timeline":
      return result.timeline
        .map((item) => `- ${formatDuration(item.start)}-${formatDuration(item.end)} ${item.title}: ${item.summary}`)
        .join("\n")
    case "transcript":
      return result.cleanedTranscript
    case "note": {
      const lines: string[] = [result.summary, ""]
      lines.push(`[ ${getCoreLabel(result.contentType, "keyPoints")} ]`)
      result.keyPoints.forEach((p) => lines.push(`- ${p}`))
      for (const section of sections) {
        lines.push("")
        lines.push(`[ ${section.title} ]`)
        section.items.forEach((item, i) => {
          lines.push(section.kind === "qa" ? `${i + 1}. ${item}` : `- ${item}`)
        })
      }
      return lines.join("\n")
    }
  }
}
