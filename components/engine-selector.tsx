"use client"

import { Mic, Wand2 } from "lucide-react"
import { REFINE_ENGINES, TRANSCRIPTION_ENGINES, transcriptionLimitText } from "@/lib/engines"

interface EngineSelectorProps {
  transcriptionEngine: string
  refineEngine: string
  disabled?: boolean
  onTranscriptionChange: (id: string) => void
  onRefineChange: (id: string) => void
}

export function EngineSelector({
  transcriptionEngine,
  refineEngine,
  disabled,
  onTranscriptionChange,
  onRefineChange,
}: EngineSelectorProps) {
  const transcription = TRANSCRIPTION_ENGINES.find((e) => e.id === transcriptionEngine)
  const refine = REFINE_ENGINES.find((e) => e.id === refineEngine)

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <Field
        id="transcription-engine"
        icon={<Mic className="size-4" />}
        label="전사 엔진"
        value={transcriptionEngine}
        disabled={disabled}
        onChange={onTranscriptionChange}
        options={TRANSCRIPTION_ENGINES}
        hint={transcription?.description}
        meta={transcription ? transcriptionLimitText(transcription) : undefined}
      />
      <Field
        id="refine-engine"
        icon={<Wand2 className="size-4" />}
        label="요약 엔진"
        value={refineEngine}
        disabled={disabled}
        onChange={onRefineChange}
        options={REFINE_ENGINES}
        hint={refine?.description}
      />
    </div>
  )
}

interface FieldProps {
  id: string
  icon: React.ReactNode
  label: string
  value: string
  disabled?: boolean
  onChange: (id: string) => void
  options: { id: string; label: string }[]
  hint?: string
  meta?: string
}

function Field({ id, icon, label, value, disabled, onChange, options, hint, meta }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="flex items-center gap-1.5 text-xs font-medium text-foreground">
        <span className="text-muted-foreground">{icon}</span>
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm text-foreground transition-colors focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
      {hint && <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>}
      {meta && (
        <p className="inline-flex w-fit rounded border border-border bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
          {meta}
        </p>
      )}
    </div>
  )
}
