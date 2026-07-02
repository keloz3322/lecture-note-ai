import kurzweilDemoResult from "@/lib/kurzweil-demo-result.json"
import interviewDemoResult from "@/lib/interview-demo-result.json"
import meetingDemoResult from "@/lib/meeting-demo-result.json"
import meetingDemoTranslation from "@/lib/meeting-demo-translation-ko.json"
import type { AudioFileMeta, RefineResult, TimestampStatus, TranscribeResult, TranscriptSegment } from "@/lib/types"

export const DEMO_FILE_NAME = "Ray Kurzweil - MIT 2025 Robert A. Muh Award Lecture"
export type FileDemoPresetId = "lecture" | "interview" | "meeting"

export const DEMO_FILE_META: AudioFileMeta = {
  name: DEMO_FILE_NAME,
  size: 52_154_291,
  type: "audio/ogg",
  durationSeconds: 3615,
}

const KURZWEIL_DEMO_RESULT = kurzweilDemoResult as RefineResult
const INTERVIEW_DEMO_RESULT = interviewDemoResult as RefineResult
const MEETING_DEMO_RESULT = meetingDemoResult as RefineResult
const MEETING_DEMO_TRANSLATION = meetingDemoTranslation as { translatedTranscriptKo: string }
const KOREAN_SOURCE_DEMO_TRANSLATION_NOTICE =
  "정리된 전사문 전체가 이미 한국어로 준비되어 있어 같은 풀 본문을 번역본 탭에도 제공합니다."
const FULL_DEMO_TRANSLATION_NOTICE = "정리된 전사문 전체를 한국어로 미리 번역한 데모 번역본입니다."
const KURZWEIL_DEMO_RESULT_WITH_TRANSLATION: RefineResult = {
  ...KURZWEIL_DEMO_RESULT,
  translatedTranscriptKo: KURZWEIL_DEMO_RESULT.cleanedTranscript,
  translatedTranscriptKoNotice: KOREAN_SOURCE_DEMO_TRANSLATION_NOTICE,
}
const INTERVIEW_DEMO_RESULT_WITH_TRANSLATION: RefineResult = {
  ...INTERVIEW_DEMO_RESULT,
  translatedTranscriptKo: INTERVIEW_DEMO_RESULT.cleanedTranscript,
  translatedTranscriptKoNotice: KOREAN_SOURCE_DEMO_TRANSLATION_NOTICE,
}
const MEETING_DEMO_RESULT_WITH_TRANSLATION: RefineResult = {
  ...MEETING_DEMO_RESULT,
  translatedTranscriptKo: MEETING_DEMO_TRANSLATION.translatedTranscriptKo,
  translatedTranscriptKoNotice: FULL_DEMO_TRANSLATION_NOTICE,
}

export interface FileDemoPreset {
  id: FileDemoPresetId
  label: string
  badge: string
  description: string
  fileName: string
  meta: AudioFileMeta
  result: RefineResult
  timings?: {
    transcribeMs?: number
    refineMs?: number
  }
}

export const FILE_DEMO_PRESETS: FileDemoPreset[] = [
  {
    id: "lecture",
    label: "강의",
    badge: "강의 / 수업",
    description: "1시간 MIT 강연을 학습 노트와 복습 질문으로 정리합니다.",
    fileName: DEMO_FILE_NAME,
    meta: DEMO_FILE_META,
    result: KURZWEIL_DEMO_RESULT_WITH_TRANSLATION,
  },
  {
    id: "interview",
    label: "인터뷰",
    badge: "인터뷰",
    description: "Demis Hassabis 인터뷰를 핵심 인용과 후속 질문 중심으로 정리합니다.",
    fileName: "03-original-interview-demis-hassabis-2025-full",
    meta: {
      name: "03-original-interview-demis-hassabis-2025-full",
      size: 5_219_577,
      type: "audio/ogg",
      durationSeconds: 847,
    },
    result: INTERVIEW_DEMO_RESULT_WITH_TRANSLATION,
    timings: {
      transcribeMs: 44_647,
      refineMs: 330_757,
    },
  },
  {
    id: "meeting",
    label: "회의",
    badge: "회의",
    description: "CARB 공개 회의 2시간 49분 녹음을 결정 사항과 액션 아이템으로 정리합니다.",
    fileName: "02-meeting-california-air-resources-board-2026-06-25-full",
    meta: {
      name: "02-meeting-california-air-resources-board-2026-06-25-full",
      size: 59_718_019,
      type: "audio/ogg",
      durationSeconds: 10_138,
    },
    result: MEETING_DEMO_RESULT_WITH_TRANSLATION,
    timings: {
      transcribeMs: 569_000,
      refineMs: 27_579,
    },
  },
]

export const DEFAULT_FILE_DEMO_ID: FileDemoPresetId = "lecture"

export function getFileDemoPreset(id: string | undefined | null): FileDemoPreset {
  return FILE_DEMO_PRESETS.find((preset) => preset.id === id) ?? FILE_DEMO_PRESETS[0]
}

export function getDemoResult({
  timestampStatus = "available",
  transcriptionEngineLabel,
  demoId,
}: {
  timestampStatus?: TimestampStatus
  transcriptionEngineLabel?: string
  refineEngine?: string
  demoId?: string
} = {}): RefineResult {
  const base = getFileDemoPreset(demoId).result

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

export function getDemoTranscription({
  timestampStatus = "available",
  transcriptionEngineLabel,
  demoId,
}: {
  timestampStatus?: TimestampStatus
  transcriptionEngineLabel?: string
  demoId?: string
} = {}): TranscribeResult {
  const preset = getFileDemoPreset(demoId)
  const result = getDemoResult({ timestampStatus, transcriptionEngineLabel, demoId })

  return {
    rawTranscript: result.cleanedTranscript,
    durationSeconds: preset.meta.durationSeconds,
    segments: timestampStatus === "available" || timestampStatus === "estimated" ? demoSegments(result) : undefined,
    timestampStatus,
    transcriptionEngineLabel,
  }
}

function demoSegments(result: RefineResult): TranscriptSegment[] | undefined {
  if (result.timeline.length === 0) return undefined

  return result.timeline.map((item, index) => ({
    id: index,
    start: item.start,
    end: item.end,
    text: `${item.title}. ${item.summary}`,
  }))
}
