import type { RefineResult, TranscribeResult } from "./types"

// Example data so the full UX works without external APIs.
// Replace these with real Groq / Gemini responses when wiring up the integrations.

export const MOCK_TRANSCRIBE: TranscribeResult = {
  language: "ko",
  durationSeconds: 612,
  rawTranscript:
    "자 그러면 오늘 수업 시작하겠습니다 어 지난 시간에 우리가 운영체제에서 프로세스랑 스레드 차이를 봤었죠 음 오늘은 그 다음 주제인 스케줄링을 볼 건데 어 스케줄링이 왜 필요하냐면 CPU는 하나인데 실행해야 되는 프로세스는 여러 개잖아요 그래서 누구를 먼저 실행시킬지 정하는 게 스케줄링이고 이걸 정하는 알고리즘이 여러 개가 있어요 어 첫 번째가 FCFS 그러니까 먼저 온 순서대로 처리하는 거고 두 번째가 SJF 가장 짧은 작업 먼저 그 다음에 라운드 로빈 이렇게 있는데 라운드 로빈이 실제로 제일 많이 쓰여요 타임 슬라이스를 정해놓고 돌아가면서 실행하는 방식이고 음 시험에는 각 알고리즘의 평균 대기시간 계산하는 문제가 꼭 나오니까 연습 많이 해두세요 그리고 다음 주에 퀴즈 있는 거 잊지 마시고요",
}

export const MOCK_REFINE: RefineResult = {
  contentType: "lecture",
  detectedType: "lecture",
  cleanedTranscript:
    "오늘 수업을 시작하겠습니다. 지난 시간에는 운영체제에서 프로세스와 스레드의 차이를 살펴보았습니다. 오늘은 그 다음 주제인 'CPU 스케줄링'을 다루겠습니다.\n\n스케줄링이 필요한 이유는 CPU는 하나인데 실행해야 하는 프로세스는 여러 개이기 때문입니다. 따라서 어떤 프로세스를 먼저 실행할지 결정하는 과정이 스케줄링이며, 이를 결정하는 알고리즘에는 여러 종류가 있습니다.\n\n첫 번째는 FCFS(First-Come, First-Served)로, 먼저 도착한 순서대로 처리합니다. 두 번째는 SJF(Shortest Job First)로, 실행 시간이 가장 짧은 작업을 먼저 처리합니다. 마지막으로 라운드 로빈(Round Robin)은 타임 슬라이스를 정해 두고 프로세스를 번갈아 실행하는 방식이며, 실무에서 가장 널리 사용됩니다.\n\n시험에는 각 알고리즘의 평균 대기 시간을 계산하는 문제가 자주 출제되므로 충분히 연습해 두시기 바랍니다. 또한 다음 주에 퀴즈가 있으니 잊지 마시기 바랍니다.",
  summary:
    "이번 강의는 CPU 스케줄링의 개념과 주요 알고리즘을 다룹니다. CPU는 하나지만 실행할 프로세스는 여러 개이므로, 실행 순서를 정하는 스케줄링이 필요합니다. 대표적인 알고리즘으로 FCFS, SJF, 라운드 로빈이 소개되었으며, 그중 라운드 로빈이 실무에서 가장 많이 쓰입니다. 시험에서는 평균 대기 시간 계산 문제가 자주 출제됩니다.",
  timeline: [
    {
      start: 0,
      end: 90,
      title: "프로세스와 스레드 복습",
      summary: "지난 시간에 다룬 운영체제의 프로세스와 스레드 차이를 짚고 오늘 주제로 넘어갑니다.",
    },
    {
      start: 90,
      end: 260,
      title: "CPU 스케줄링 필요성",
      summary: "하나의 CPU에서 여러 프로세스를 처리해야 하므로 실행 순서를 정하는 스케줄링이 필요하다고 설명합니다.",
    },
    {
      start: 260,
      end: 480,
      title: "주요 스케줄링 알고리즘",
      summary: "FCFS, SJF, 라운드 로빈의 차이와 라운드 로빈의 실무 활용도를 비교합니다.",
    },
    {
      start: 480,
      end: 612,
      title: "시험 대비 포인트",
      summary: "평균 대기 시간 계산 문제가 중요하므로 관련 문제 풀이 연습과 다음 주 퀴즈 준비를 강조합니다.",
    },
  ],
  keyPoints: [
    "스케줄링은 하나의 CPU로 여러 프로세스를 실행하기 위해 실행 순서를 결정하는 과정이다.",
    "FCFS는 먼저 도착한 순서대로 처리하는 가장 단순한 방식이다.",
    "SJF는 실행 시간이 가장 짧은 작업을 우선 처리한다.",
    "라운드 로빈은 타임 슬라이스 기반으로 번갈아 실행하며 실무에서 가장 널리 쓰인다.",
    "각 알고리즘의 평균 대기 시간 계산이 시험 핵심 포인트다.",
  ],
  sections: [
    {
      id: "studyQuestions",
      title: "복습 질문",
      kind: "qa",
      items: [
        "CPU 스케줄링이 필요한 근본적인 이유는 무엇인가?",
        "FCFS와 SJF의 차이점과 각각의 장단점을 설명하라.",
        "라운드 로빈에서 타임 슬라이스 크기는 성능에 어떤 영향을 주는가?",
        "세 가지 알고리즘으로 동일한 프로세스 집합의 평균 대기 시간을 비교하라.",
      ],
    },
    {
      id: "actionItems",
      title: "할 일",
      kind: "list",
      items: [
        "FCFS, SJF, 라운드 로빈의 평균 대기 시간 계산 문제 풀이 연습하기",
        "프로세스와 스레드 차이 복습 노트 다시 확인하기",
        "다음 주 퀴즈 대비 정리",
      ],
    },
  ],
}
