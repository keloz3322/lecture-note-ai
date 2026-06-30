import type { AudioFileMeta, RefineResult } from "@/lib/types"

export const DEMO_FILE_NAME = "바이브코딩 툴 비교 분석 ｜ 바이브코딩 4강 "

export const DEMO_FILE_META: AudioFileMeta = {
  name: DEMO_FILE_NAME,
  size: 1_677_722,
  type: "audio/ogg",
  durationSeconds: 452,
}

export const DEMO_RESULT: RefineResult = {
  contentType: "lecture",
  detectedType: "lecture",
  summary:
    "이 강의는 AI 모델과 바이브 코딩 도구를 실제 개발 목적에 맞게 비교합니다. ChatGPT, Claude, Gemini, Grok 같은 모델은 각기 강점이 다르지만, 결과 품질은 모델보다 사용자의 요구사항 정의와 피드백 방식에 더 크게 좌우된다고 설명합니다. 웹빌더 계열에서는 v0, Replit, Google AI Studio를 비교하고, 코드 에디터 계열에서는 Claude Code와 Cursor의 차이를 짚습니다. 결론적으로 빠른 웹 프로토타입은 v0, 깊은 코드 작업은 Claude Code가 유리하지만, 가장 중요한 것은 도구보다 도메인 지식과 기획력입니다.",
  timeline: [
    {
      start: 0,
      end: 48,
      title: "바이브 코딩 도구를 비교하는 기준",
      summary: "도구를 단순 인기순으로 고르지 말고, 만들려는 결과물과 작업 방식에 맞춰 비교해야 한다는 관점을 제시합니다.",
    },
    {
      start: 48,
      end: 116,
      title: "주요 AI 모델별 특징",
      summary: "ChatGPT, Claude, Gemini, Grok의 장단점을 짚고, 모델 선택보다 명확한 지시와 반복 피드백이 중요하다고 설명합니다.",
    },
    {
      start: 116,
      end: 196,
      title: "결과 품질을 좌우하는 요소",
      summary: "프롬프트, 예시, 제약 조건, 검증 기준이 결과물을 크게 바꾸며, 같은 모델도 사용 방식에 따라 성능 차이가 난다고 정리합니다.",
    },
    {
      start: 196,
      end: 305,
      title: "웹빌더형 도구 비교",
      summary: "v0는 UI와 Vercel 생태계 연동에 강하고, Replit은 더 넓은 기능 구현에 유리하며, Google AI Studio는 무료 실험과 빠른 배포에 장점이 있습니다.",
    },
    {
      start: 305,
      end: 392,
      title: "AI 코드 에디터 비교",
      summary: "Claude Code는 복잡한 코드 수정과 추론에 강하고, Cursor는 파일 탐색과 코드 시각화가 편리해 프로젝트 규모에 따라 선택지가 달라집니다.",
    },
    {
      start: 392,
      end: 452,
      title: "추천 조합과 학습 방향",
      summary: "웹 프로토타입은 v0, 깊은 코드 작업은 Claude Code를 추천하되, 장기적으로는 도구 사용법보다 문제 정의 능력을 키워야 한다고 마무리합니다.",
    },
  ],
  keyPoints: [
    "AI 모델 선택보다 요구사항을 얼마나 구체적으로 전달하는지가 결과 품질에 더 큰 영향을 준다.",
    "v0는 UI 생성과 Vercel 배포 흐름이 자연스러워 웹 프로토타입에 적합하다.",
    "Replit은 웹앱 전체를 빠르게 실험하기 좋지만, 세밀한 코드 품질 관리는 별도로 필요하다.",
    "Claude Code는 긴 맥락의 코드 이해와 복잡한 수정에 강해 실제 개발 보조에 유리하다.",
    "Cursor는 기존 코드베이스를 탐색하고 파일 단위로 수정하는 워크플로가 편하다.",
    "좋은 결과를 얻으려면 도구보다 도메인 지식, 기획력, 검증 기준을 먼저 세워야 한다.",
  ],
  cleanedTranscript:
    "이번 강의에서는 바이브 코딩에 사용할 수 있는 주요 AI 모델과 개발 도구를 비교합니다. 먼저 ChatGPT, Claude, Gemini, Grok처럼 많이 쓰이는 모델들은 각자 강점이 다르지만, 실제 결과물은 모델 이름만으로 결정되지 않습니다. 어떤 기능을 만들고 싶은지, 어떤 제약이 있는지, 결과물을 어떻게 검증할지 명확히 설명할수록 더 좋은 답을 얻을 수 있습니다.\n\n웹빌더형 도구로는 v0, Replit, Google AI Studio를 비교할 수 있습니다. v0는 UI를 빠르게 만들고 Vercel 배포까지 이어지는 흐름이 좋습니다. Replit은 프론트엔드와 백엔드를 함께 실험하기 편하고, Google AI Studio는 무료 실험과 빠른 공유에 장점이 있습니다.\n\n코드 에디터형 도구에서는 Claude Code와 Cursor가 대표적입니다. Claude Code는 복잡한 코드 수정이나 긴 맥락을 이해하는 데 강하고, Cursor는 기존 프로젝트 안에서 파일을 탐색하고 수정하는 흐름이 좋습니다. 결론적으로 웹 프로토타입은 v0, 깊은 코드 작업은 Claude Code가 유리하지만, 가장 중요한 것은 어떤 도구를 쓰느냐보다 스스로 문제를 정의하고 검증하는 능력입니다.",
  sections: [
    {
      id: "studyQuestions",
      title: "복습 질문",
      kind: "qa",
      items: [
        "v0가 웹 프로토타입 제작에 특히 유리한 이유는 무엇인가?",
        "AI 모델의 성능보다 프롬프트와 요구사항 정의가 중요하다고 볼 수 있는 이유는 무엇인가?",
        "Replit과 Google AI Studio는 각각 어떤 상황에서 장점이 있는가?",
        "Claude Code와 Cursor의 작업 방식 차이는 무엇인가?",
        "바이브 코딩 도구를 선택하기 전에 먼저 정해야 할 기준은 무엇인가?",
      ],
    },
    {
      id: "actionItems",
      title: "할 일",
      kind: "list",
      items: [
        "만들고 싶은 서비스의 핵심 사용자 흐름을 한 문장으로 정리한다.",
        "v0로 첫 화면과 주요 상태를 빠르게 만든 뒤, 실제 동작이 필요한 부분을 분리한다.",
        "Claude Code나 Cursor로 API, 데이터 흐름, 예외 처리를 점검한다.",
        "완성 후에는 배포 환경에서 실제 파일과 API 키로 한 번 더 검증한다.",
      ],
    },
  ],
}
