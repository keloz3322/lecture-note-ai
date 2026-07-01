import kurzweilDemoResult from "@/lib/kurzweil-demo-result.json"
import type { AudioFileMeta, RefineResult, TimestampStatus } from "@/lib/types"

export const DEMO_FILE_NAME = "Ray Kurzweil - MIT 2025 Robert A. Muh Award Lecture"

export const DEMO_FILE_META: AudioFileMeta = {
  name: DEMO_FILE_NAME,
  size: 52_154_291,
  type: "audio/ogg",
  durationSeconds: 3615,
}

const KURZWEIL_DEMO_RESULT = kurzweilDemoResult as RefineResult

const DEMO_RESULTS_BY_REFINE_ENGINE: Record<string, RefineResult> = {
  "gateway-gpt": KURZWEIL_DEMO_RESULT,
  "gateway-gemini": KURZWEIL_DEMO_RESULT,
  gemini: KURZWEIL_DEMO_RESULT,
}

export function getDemoResult({
  timestampStatus = "available",
  transcriptionEngineLabel,
  refineEngine,
}: {
  timestampStatus?: TimestampStatus
  transcriptionEngineLabel?: string
  refineEngine?: string
} = {}): RefineResult {
  const base = DEMO_RESULTS_BY_REFINE_ENGINE[refineEngine ?? ""] ?? KURZWEIL_DEMO_RESULT

  if (timestampStatus === "available") {
    return { ...base, timestampStatus, timelineNotice: undefined }
  }

  const timelineNotice =
    timestampStatus === "unsupported"
      ? `${transcriptionEngineLabel || "선택한 전사 엔진"}은 타임스탬프를 반환하지 않아 타임라인을 생성하지 않습니다.`
      : "이번 전사 결과에는 사용할 수 있는 타임스탬프가 없어 타임라인을 생성하지 않습니다."

  return {
    ...base,
    timestampStatus,
    timeline: [],
    timelineNotice,
  }
}
