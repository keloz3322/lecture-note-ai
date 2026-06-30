import { NextResponse } from "next/server"
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { MAX_FILE_SIZE, SUPPORTED_EXTENSIONS, SUPPORTED_MIME_TYPES } from "@/lib/types"
import { getExtension } from "@/lib/format"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as HandleUploadBody

    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const payload = parseClientPayload(clientPayload)
        const fileName = payload.fileName || pathname
        const ext = getExtension(fileName)

        if (!SUPPORTED_EXTENSIONS.includes(ext as (typeof SUPPORTED_EXTENSIONS)[number])) {
          throw new Error(`지원하지 않는 파일 형식입니다. (${SUPPORTED_EXTENSIONS.join(", ")} 만 지원)`)
        }

        if (payload.size && payload.size > MAX_FILE_SIZE) {
          const limitMb = Math.floor(MAX_FILE_SIZE / (1024 * 1024))
          throw new Error(`파일 크기가 ${limitMb}MB를 초과했습니다.`)
        }

        if (payload.type && !isSupportedMimeType(payload.type)) {
          throw new Error("지원하지 않는 오디오 MIME 형식입니다.")
        }

        return {
          allowedContentTypes: [...SUPPORTED_MIME_TYPES],
          maximumSizeInBytes: MAX_FILE_SIZE,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ fileName, size: payload.size ?? null, type: payload.type ?? null }),
        }
      },
    })

    return NextResponse.json(jsonResponse)
  } catch (error) {
    const message = error instanceof Error ? error.message : "업로드 처리 중 오류가 발생했습니다."
    return NextResponse.json({ error: "업로드 처리 중 오류가 발생했습니다." }, { status: 500 })
  }
}

function parseClientPayload(clientPayload: string | null): { fileName?: string; size?: number; type?: string } {
  if (!clientPayload) return {}
  try {
    const parsed = JSON.parse(clientPayload) as { fileName?: unknown; size?: unknown; type?: unknown }
    return {
      fileName: typeof parsed.fileName === "string" ? parsed.fileName : undefined,
      size: typeof parsed.size === "number" && Number.isFinite(parsed.size) ? parsed.size : undefined,
      type: typeof parsed.type === "string" ? parsed.type : undefined,
    }
  } catch {
    return {}
  }
}

function isSupportedMimeType(type: string) {
  return (SUPPORTED_MIME_TYPES as readonly string[]).includes(type)
}
