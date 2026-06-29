import { NextResponse } from "next/server"
import { MOCK_REFINE } from "@/lib/mock-data"
import type { RefineResult } from "@/lib/types"

// Placeholder refinement route (Gemini).
//
// Later, replace the mock with a real call that sends the raw transcript and
// asks the model to return cleaned transcript + summary + key points +
// study questions + action items as structured JSON. Example:
//
//   const res = await fetch(
//     `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
//     { method: "POST", body: JSON.stringify({ ... }) },
//   )
//
// The API key must ONLY be read on the server (process.env.GEMINI_API_KEY).

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { rawTranscript?: string }

    if (!body.rawTranscript || body.rawTranscript.trim().length === 0) {
      return NextResponse.json({ error: "교정/요약할 전사문이 없습니다." }, { status: 400 })
    }

    // Simulate processing latency.
    await new Promise((r) => setTimeout(r, 1800))

    const result: RefineResult = MOCK_REFINE
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: "교정/요약에 실패했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 })
  }
}
