// Central registry of content types. This is the single source of truth that both
// the refine API route (prompt + schema) and the UI (type selector + section tabs)
// read from. Add a new content type here and the whole pipeline adapts.
//
// Kept free of server-only / lucide imports so it is safe to import from both the
// server route and client components.

export type ContentTypeId = "lecture" | "meeting" | "interview" | "podcast" | "general"

/** How a type-specific section is rendered and copied. */
export type SectionKind = "list" | "qa" | "text"

export interface SectionSpec {
  /** Stable id Gemini echoes back so we can match output to the spec. */
  id: string
  /** Human label shown as the tab/heading. */
  title: string
  kind: SectionKind
  /** Guidance handed to Gemini describing what to put in this section. */
  instruction: string
}

/** Core tabs that can have a type-specific label. */
export type CoreLabelKey = "timeline" | "keyPoints"

export interface ContentTypeDef {
  id: ContentTypeId
  /** Short label shown in the type selector. */
  label: string
  /** One-line description of the type. */
  description: string
  /** Extra context appended to the prompt to steer tone/structure. */
  promptGuidance: string
  /** Optional overrides for core tab labels so they read naturally per type. */
  coreLabels?: Partial<Record<CoreLabelKey, string>>
  /** Type-specific sections layered on top of the common core. */
  sections: SectionSpec[]
}

/** Default core labels used when a type does not override them. */
export const DEFAULT_CORE_LABELS: Record<CoreLabelKey, string> = {
  timeline: "타임라인",
  keyPoints: "핵심 포인트",
}

export const CONTENT_TYPES: ContentTypeDef[] = [
  {
    id: "lecture",
    label: "강의 / 수업",
    description: "강의, 발표, 세미나 등 학습용 녹음",
    promptGuidance:
      "학습자가 복습하기 좋도록 개념을 명확히 정리하고, 이해를 점검할 수 있는 노트로 작성하세요.",
    coreLabels: { timeline: "강의 흐름", keyPoints: "핵심 개념" },
    sections: [
      { id: "studyQuestions", title: "복습 질문", kind: "qa", instruction: "학습 내용을 점검할 복습 질문 4~7개" },
      { id: "actionItems", title: "할 일", kind: "list", instruction: "학습자가 이어서 할 일이나 과제 3~6개" },
    ],
  },
  {
    id: "meeting",
    label: "회의",
    description: "팀 미팅, 업무 논의, 의사결정 회의",
    promptGuidance:
      "결정 사항과 담당자, 후속 작업이 분명히 드러나도록 실무에 바로 쓰는 회의록 형태로 정리하세요.",
    coreLabels: { timeline: "안건 흐름", keyPoints: "핵심 논점" },
    sections: [
      { id: "decisions", title: "결정 사항", kind: "list", instruction: "회의에서 내려진 결정 사항 3~8개" },
      {
        id: "actionItems",
        title: "액션 아이템",
        kind: "list",
        instruction: "후속 작업. 담당자나 기한이 언급되면 함께 표기 (예: '담당: 김OO, ~금요일')",
      },
    ],
  },
  {
    id: "interview",
    label: "인터뷰",
    description: "인터뷰, 1:1 대화, 사용자 리서치",
    promptGuidance:
      "발언의 맥락과 화자의 의도를 보존하고, 인상적인 발언을 인용으로 살리세요.",
    coreLabels: { timeline: "대화 흐름", keyPoints: "핵심 내용" },
    sections: [
      { id: "quotes", title: "핵심 인용", kind: "list", instruction: "인터뷰에서 핵심적이거나 인상적인 발언 인용 3~7개" },
      { id: "followups", title: "후속 질문", kind: "qa", instruction: "더 깊이 파고들 만한 후속 질문 3~6개" },
    ],
  },
  {
    id: "podcast",
    label: "팟캐스트 / 대담",
    description: "팟캐스트, 토크, 영상 콘텐츠",
    promptGuidance:
      "대화의 흐름과 흥미로운 지점을 살려 청취자가 핵심을 빠르게 파악하도록 정리하세요.",
    coreLabels: { timeline: "에피소드 흐름", keyPoints: "핵심 주제" },
    sections: [
      { id: "highlights", title: "하이라이트", kind: "list", instruction: "대화의 흥미로운 하이라이트나 핵심 주장 4~8개" },
      { id: "references", title: "언급된 자료", kind: "list", instruction: "언급된 책·링크·인물·도구 등 참고 자료 (없으면 빈 배열)" },
    ],
  },
  {
    id: "general",
    label: "일반",
    description: "메모, 음성 일기, 기타 녹음",
    promptGuidance: "내용의 성격에 맞춰 핵심을 간결하고 읽기 쉽게 정리하세요.",
    sections: [
      { id: "actionItems", title: "할 일", kind: "list", instruction: "내용에서 도출되는 할 일이나 후속 작업 (없으면 빈 배열)" },
    ],
  },
]

export const DEFAULT_CONTENT_TYPE: ContentTypeId = "general"

const CONTENT_TYPE_MAP = new Map<ContentTypeId, ContentTypeDef>(CONTENT_TYPES.map((type) => [type.id, type]))

export function getContentType(id: string | undefined | null): ContentTypeDef {
  if (id && CONTENT_TYPE_MAP.has(id as ContentTypeId)) {
    return CONTENT_TYPE_MAP.get(id as ContentTypeId)!
  }
  return CONTENT_TYPE_MAP.get(DEFAULT_CONTENT_TYPE)!
}

export function isContentTypeId(value: unknown): value is ContentTypeId {
  return typeof value === "string" && CONTENT_TYPE_MAP.has(value as ContentTypeId)
}

/** Resolve a core tab label for a given content type, falling back to the default. */
export function getCoreLabel(id: string | undefined | null, key: CoreLabelKey): string {
  return getContentType(id).coreLabels?.[key] ?? DEFAULT_CORE_LABELS[key]
}
