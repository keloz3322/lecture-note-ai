import kurzweilDemoResult from "@/lib/kurzweil-demo-result.json"
import interviewDemoResult from "@/lib/interview-demo-result.json"
import meetingDemoResult from "@/lib/meeting-demo-result.json"
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
const MEETING_DEMO_TRANSLATED_TRANSCRIPT_KO = `좋습니다. 안녕하세요. 2026년 6월 25일 캘리포니아 대기자원위원회 공개 회의를 시작하겠습니다. 서기께서는 출석을 확인해 주시겠습니까? 발메스 박사, 아이젠헛 의원, 구에라 시의원, 홉킨스 감독관, 잭슨 의원, 리몬 의원, 파체코-워너 박사, 리초핀 의원, 샤힌 박사, 실바 시장, 스턴 상원의원, 스티글러-그라나도스 박사, 탁포리안 위원, 산체스 의장이 차례로 호명되었고, 의사정족수가 확인되었습니다. 산체스 의장은 일부 위원이 도착 중임을 알리고 회의를 이어갔습니다.

본격적인 안건에 앞서 회의 운영 안내가 진행되었습니다. 이날 회의는 현장 참석과 함께 전화 및 Zoom을 통한 원격 참여를 제공하며, 발언을 원하는 현장 참석자는 회의장 밖 로비에 비치된 발언 신청 카드를 작성해 안건 시작 전에 보드 보조 직원에게 제출해야 합니다. 원격 참석자는 Zoom에서 손들기 기능을 사용하거나 전화 참여 시 별표 9번을 눌러 발언 의사를 표시할 수 있고, 서기가 잠시 후 자세한 참여 절차를 안내한다고 설명했습니다.

안전 안내도 이어졌습니다. 화재 경보가 울리면 참석자들은 회의장 뒤쪽 로비 방향 비상구를 통해 즉시 대피하고, 계단을 내려가 로비를 지나 건물 밖으로 이동해야 합니다. 이후 안전 확인 신호가 주어지면 다시 강당으로 돌아와 청문회를 재개한다고 공지했습니다. Zoom 환경에서는 자막 기능을 사용할 수 있으며, 화면 하단의 CC 버튼을 눌러 자막을 켤 수 있다고 안내했습니다. 또한 Zoom 또는 전화로 참여하는 사람들은 통역과 기록을 위해 천천히 또렷하게 말해 달라고 요청했습니다.

스페인어 통역 서비스도 제공된다고 설명했습니다. Zoom 참가자는 화면의 Interpretation 버튼을 눌러 Spanish를 선택하면 스페인어 통역을 들을 수 있으며, 현장 참석자에게도 스페인어 통역이 제공된다고 안내했습니다. 이어서 회의는 의사 진행 절차, 대중 의견 수렴 방식, 안건별 발언 규칙을 확인하며 공식 일정으로 넘어갔습니다.`
const MEETING_DEMO_RESULT_WITH_TRANSLATION: RefineResult = {
  ...MEETING_DEMO_RESULT,
  translatedTranscriptKo: MEETING_DEMO_TRANSLATED_TRANSCRIPT_KO,
  translatedTranscriptKoNotice:
    "데모에서는 회의 전사문 앞부분의 한국어 번역본을 함께 제공합니다. 실제 분석에서는 번역 생성 버튼으로 정리된 전사문을 한국어로 추가 변환할 수 있습니다.",
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
    result: KURZWEIL_DEMO_RESULT,
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
    result: INTERVIEW_DEMO_RESULT,
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
