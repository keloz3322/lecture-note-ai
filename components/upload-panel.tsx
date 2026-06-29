"use client"

import { useCallback, useRef, useState } from "react"
import { FileAudio, UploadCloud, X } from "lucide-react"
import { formatBytes, formatDuration, getExtension } from "@/lib/format"
import { ACTIVE_UPLOAD_MAX_FILE_SIZE, SUPPORTED_EXTENSIONS, type AudioFileMeta } from "@/lib/types"

interface UploadPanelProps {
  file: File | null
  meta: AudioFileMeta | null
  disabled?: boolean
  onSelect: (file: File, meta: AudioFileMeta) => void
  onClear: () => void
  onValidationError: (message: string) => void
}

export function UploadPanel({ file, meta, disabled, onSelect, onClear, onValidationError }: UploadPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleFile = useCallback(
    (selected: File) => {
      const ext = getExtension(selected.name)
      if (!SUPPORTED_EXTENSIONS.includes(ext as (typeof SUPPORTED_EXTENSIONS)[number])) {
        onValidationError(`지원하지 않는 파일 형식입니다. (${SUPPORTED_EXTENSIONS.join(", ")})`)
        return
      }
      if (selected.size > ACTIVE_UPLOAD_MAX_FILE_SIZE) {
        onValidationError(`파일 크기가 ${formatBytes(ACTIVE_UPLOAD_MAX_FILE_SIZE)}를 초과했습니다.`)
        return
      }

      const base: AudioFileMeta = { name: selected.name, size: selected.size, type: selected.type }
      // Try to read duration in the browser (best-effort).
      const url = URL.createObjectURL(selected)
      const audio = new Audio()
      audio.preload = "metadata"
      audio.onloadedmetadata = () => {
        onSelect(selected, { ...base, durationSeconds: audio.duration })
        URL.revokeObjectURL(url)
      }
      audio.onerror = () => {
        onSelect(selected, base)
        URL.revokeObjectURL(url)
      }
      audio.src = url
    },
    [onSelect, onValidationError],
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      if (disabled) return
      const dropped = e.dataTransfer.files?.[0]
      if (dropped) handleFile(dropped)
    },
    [disabled, handleFile],
  )

  if (file && meta) {
    const duration = formatDuration(meta.durationSeconds)
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <FileAudio className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-card-foreground" title={meta.name}>
              {meta.name}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>{formatBytes(meta.size)}</span>
              {duration && (
                <>
                  <span aria-hidden>·</span>
                  <span>{duration}</span>
                </>
              )}
              <span aria-hidden>·</span>
              <span className="uppercase">{getExtension(meta.name)}</span>
            </div>
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={onClear}
              aria-label="파일 제거"
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !disabled) inputRef.current?.click()
      }}
      aria-disabled={disabled}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-6 py-10 text-center transition-colors ${
        dragging ? "border-primary bg-primary/5" : "border-border bg-card hover:border-muted-foreground/50"
      } ${disabled ? "pointer-events-none opacity-60" : ""}`}
    >
      <div className="flex size-11 items-center justify-center rounded-full bg-secondary text-foreground">
        <UploadCloud className="size-5" />
      </div>
      <p className="mt-3 text-sm font-medium text-foreground">오디오 파일 업로드</p>
      <p className="mt-1 text-xs text-muted-foreground">클릭하거나 파일을 끌어다 놓으세요</p>
      <p className="mt-3 text-xs text-muted-foreground">
        {SUPPORTED_EXTENSIONS.join(", ")} · 최대 {formatBytes(ACTIVE_UPLOAD_MAX_FILE_SIZE)}
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".mp3,.m4a,.wav,.webm,.ogg,audio/*"
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          const selected = e.target.files?.[0]
          if (selected) handleFile(selected)
          e.target.value = ""
        }}
      />
    </div>
  )
}
