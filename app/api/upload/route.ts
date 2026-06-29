import { NextResponse } from "next/server"
import { MAX_FILE_SIZE, SUPPORTED_EXTENSIONS, type UploadResult } from "@/lib/types"
import { getExtension } from "@/lib/format"

// Placeholder upload route.
//
// Later, replace the mock body with a real implementation:
//   - Generate a Vercel Blob client upload token (`@vercel/blob/client`), OR
//   - Stream the file to temporary storage and return a short-lived URL.
// The audio file is NOT meant to be persisted long-term.

export async function POST(request: Request) {
  try {
    const form = await request.formData()
    const file = form.get("file")

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "오디오 파일이 없습니다." }, { status: 400 })
    }

    const ext = getExtension(file.name)
    if (!SUPPORTED_EXTENSIONS.includes(ext as (typeof SUPPORTED_EXTENSIONS)[number])) {
      return NextResponse.json(
        { error: `지원하지 않는 파일 형식입니다. (${SUPPORTED_EXTENSIONS.join(", ")} 만 지원)` },
        { status: 415 },
      )
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "파일 크기가 25MB를 초과했습니다." }, { status: 413 })
    }

    // MOCK: pretend we stored the file and return a reference URL.
    const result: UploadResult = {
      audioUrl: `mock://uploads/${encodeURIComponent(file.name)}`,
      fileName: file.name,
    }

    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: "업로드 처리 중 오류가 발생했습니다." }, { status: 500 })
  }
}
