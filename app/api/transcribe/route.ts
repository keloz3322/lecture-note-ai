import { NextResponse } from "next/server"
import { MOCK_TRANSCRIBE } from "@/lib/mock-data"
import type { TranscribeResult } from "@/lib/types"

// Placeholder transcription route (Groq Whisper).
//
// Later, replace the mock with a real call. Example shape:
//
//   const groqForm = new FormData()
//   groqForm.append("file", audioBlob, fileName)
//   groqForm.append("model", "whisper-large-v3-turbo")
//   const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
//     method: "POST",
//     headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
//     body: groqForm,
//   })
//
// The API key must ONLY be read on the server (process.env.GROQ_API_KEY),
// never exposed to the browser. MVP does no chunking — one file, one request.

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      audioUrl?: string
      fileName?: string
    }

    if (!body.audioUrl && !body.fileName) {
      return NextResponse.json({ error: "전사할 오디오 정보가 없습니다." }, { status: 400 })
    }

    // Simulate processing latency.
    await new Promise((r) => setTimeout(r, 1500))

    const result: TranscribeResult = MOCK_TRANSCRIBE
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: "전사에 실패했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 })
  }
}
