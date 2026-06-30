import type { RefineResult } from "./types"

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const value = bytes / Math.pow(1024, i)
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function formatDuration(seconds?: number): string | null {
  if (seconds == null || !isFinite(seconds)) return null
  const total = Math.round(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => n.toString().padStart(2, "0")
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

export function getExtension(fileName: string): string {
  const parts = fileName.split(".")
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : ""
}

/** Build a full note Markdown document from the refined result. */
export function buildMarkdown(result: RefineResult, fileName: string): string {
  const lines: string[] = []
  lines.push(`# ${fileName} — 노트`)
  lines.push("")
  lines.push("## 요약")
  lines.push("")
  lines.push(result.summary)
  lines.push("")
  if (result.timeline.length > 0) {
    lines.push("## 타임라인")
    lines.push("")
    for (const item of result.timeline) {
      lines.push(`- ${formatDuration(item.start)}-${formatDuration(item.end)} ${item.title}: ${item.summary}`)
    }
    lines.push("")
  } else if (result.timelineNotice) {
    lines.push("## 타임라인")
    lines.push("")
    lines.push(result.timelineNotice)
    lines.push("")
  }
  lines.push("## 핵심 포인트")
  lines.push("")
  for (const p of result.keyPoints) lines.push(`- ${p}`)
  lines.push("")
  for (const section of result.sections) {
    if (section.items.length === 0) continue
    lines.push(`## ${section.title}`)
    lines.push("")
    section.items.forEach((item, i) => {
      lines.push(section.kind === "qa" ? `${i + 1}. ${item}` : `- ${item}`)
    })
    lines.push("")
  }
  lines.push("## 정리된 전사문")
  lines.push("")
  lines.push(result.cleanedTranscript)
  lines.push("")
  return lines.join("\n")
}

/** Build a plain-text note. */
export function buildPlainText(result: RefineResult, fileName: string): string {
  const lines: string[] = []
  lines.push(`${fileName} — 노트`)
  lines.push("=".repeat(40))
  lines.push("")
  lines.push("[ 요약 ]")
  lines.push(result.summary)
  lines.push("")
  if (result.timeline.length > 0) {
    lines.push("[ 타임라인 ]")
    result.timeline.forEach((item) => {
      lines.push(`- ${formatDuration(item.start)}-${formatDuration(item.end)} ${item.title}: ${item.summary}`)
    })
    lines.push("")
  } else if (result.timelineNotice) {
    lines.push("[ 타임라인 ]")
    lines.push(result.timelineNotice)
    lines.push("")
  }
  lines.push("[ 핵심 포인트 ]")
  result.keyPoints.forEach((p) => lines.push(`- ${p}`))
  lines.push("")
  for (const section of result.sections) {
    if (section.items.length === 0) continue
    lines.push(`[ ${section.title} ]`)
    section.items.forEach((item, i) => {
      lines.push(section.kind === "qa" ? `${i + 1}. ${item}` : `- ${item}`)
    })
    lines.push("")
  }
  lines.push("[ 정리된 전사문 ]")
  lines.push(result.cleanedTranscript)
  lines.push("")
  return lines.join("\n")
}

export function downloadTextFile(content: string, fileName: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
