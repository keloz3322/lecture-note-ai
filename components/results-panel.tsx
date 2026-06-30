"use client"

import { useEffect, useMemo, useState } from "react"
import { CheckSquare, Clock3, Download, FileText, ListChecks, Quote, ScrollText, Sparkles } from "lucide-react"
import { buildMarkdown, buildPlainText, downloadTextFile, formatDuration } from "@/lib/format"
import type { RefineResult, RefineSection, TabKey } from "@/lib/types"
import { CONTENT_TYPES, getContentType, getCoreLabel, type ContentTypeId } from "@/lib/content-types"
import { CopyButton } from "./copy-button"

interface ResultsPanelProps {
  result: RefineResult
  fileName: string
  /** Re-run refine with a manually chosen content type. */
  onChangeType?: (type: ContentTypeId) => void
  /** True while a type-change refine is in flight. */
  changingType?: boolean
}

/** Core tabs, with labels that adapt to the content type. */
function buildCoreTabs(
  contentType: ContentTypeId,
  timelineAvailable: boolean,
): { key: TabKey; label: string; icon: typeof FileText; disabled?: boolean }[] {
  return [
    { key: "summary", label: "요약", icon: FileText },
    { key: "timeline", label: getCoreLabel(contentType, "timeline"), icon: Clock3, disabled: !timelineAvailable },
    { key: "keyPoints", label: getCoreLabel(contentType, "keyPoints"), icon: ListChecks },
    { key: "transcript", label: "정리된 전사문", icon: ScrollText },
  ]
}

function sectionIcon(kind: RefineSection["kind"]) {
  if (kind === "qa") return CheckSquare
  if (kind === "text") return FileText
  return Quote
}

export function ResultsPanel({ result, fileName, onChangeType, changingType }: ResultsPanelProps) {
  const [tab, setTab] = useState<TabKey>("summary")
  const baseName = useMemo(() => fileName.replace(/\.[^.]+$/, ""), [fileName])
  const timelineAvailable = result.timestampStatus === "available"

  const coreTabs = useMemo(() => buildCoreTabs(result.contentType, timelineAvailable), [result.contentType, timelineAvailable])

  // Only show section tabs that actually have content.
  const sectionTabs = useMemo(() => result.sections.filter((s) => s.items.length > 0), [result.sections])

  // When the content type changes, the active tab may point at a section that no
  // longer exists. Fall back to the summary tab so the panel never goes blank.
  useEffect(() => {
    const validKeys = new Set<TabKey>([
      ...coreTabs.filter((t) => !t.disabled).map((t) => t.key),
      ...sectionTabs.map((s) => s.id),
    ])
    if (!validKeys.has(tab)) setTab("summary")
  }, [coreTabs, sectionTabs, tab])

  const tabText = useMemo(() => getTabText(result, tab), [result, tab])

  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-card">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-card-foreground">노트</h2>
          <TypeSelector
            value={result.contentType}
            detected={result.detectedType}
            disabled={changingType}
            onChange={onChangeType}
          />
        </div>
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
        {coreTabs.map(({ key, label, icon: Icon, disabled }) => (
          <TabButton
            key={key}
            active={tab === key}
            disabled={disabled}
            onClick={() => setTab(key)}
            icon={Icon}
            label={label}
          />
        ))}
        {sectionTabs.map((section) => (
          <TabButton
            key={section.id}
            active={tab === section.id}
            onClick={() => setTab(section.id)}
            icon={sectionIcon(section.kind)}
            label={section.title}
          />
        ))}
      </div>

      {!timelineAvailable && result.timelineNotice && (
        <div className="flex items-start gap-2 border-b border-border bg-secondary/30 px-4 py-2.5 text-xs leading-relaxed text-muted-foreground">
          <Clock3 className="mt-0.5 size-3.5 shrink-0" />
          <span>{result.timelineNotice}</span>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <TabContent result={result} tab={tab} />
      </div>
    </div>
  )
}

function TabButton({
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
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
        disabled
          ? "cursor-not-allowed text-muted-foreground/45"
          : active
            ? "bg-secondary text-foreground"
            : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="size-3.5" />
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
      <Sparkles className="size-3 text-muted-foreground" aria-hidden />
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as ContentTypeId)}
        className="rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
        title={value === detected ? "AI가 감지한 유형" : `AI 감지: ${getContentType(detected).label}`}
      >
        {CONTENT_TYPES.map((type) => (
          <option key={type.id} value={type.id}>
            {type.label}
          </option>
        ))}
      </select>
      {changingTypeIndicator(disabled)}
    </label>
  )
}

function changingTypeIndicator(disabled?: boolean) {
  if (!disabled) return null
  return <span className="text-xs text-muted-foreground">재생성 중…</span>
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

  // Dynamic, type-specific section.
  const section = result.sections.find((s) => s.id === tab)
  if (!section) {
    return <p className="text-sm text-muted-foreground">표시할 내용이 없습니다.</p>
  }
  return <SectionContent section={section} />
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
    default: {
      const section = result.sections.find((s) => s.id === tab)
      if (!section) return ""
      return section.items.map((item, i) => (section.kind === "qa" ? `${i + 1}. ${item}` : `- ${item}`)).join("\n")
    }
  }
}
