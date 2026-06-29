"use client"

import { useCallback, useState } from "react"
import { Check, Copy } from "lucide-react"

interface CopyButtonProps {
  getText: () => string
  label?: string
}

export function CopyButton({ getText, label = "복사" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(getText())
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }, [getText])

  return (
    <button
      type="button"
      onClick={onCopy}
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
    >
      {copied ? <Check className="size-3.5 text-primary" /> : <Copy className="size-3.5" />}
      {copied ? "복사됨" : label}
    </button>
  )
}
