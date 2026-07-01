import { NextResponse } from "next/server"
import {
  isLiveTranslateLanguageCode,
  LIVE_TRANSLATE_ENGINE_LABEL,
  LIVE_TRANSLATE_MODEL,
  type LiveTranslateLanguageCode,
} from "@/lib/live-translate"

export const runtime = "nodejs"

interface TokenRequest {
  targetLanguageCode?: string
  echoTargetLanguage?: boolean
}

interface GeminiTokenResponse {
  name?: string
  expireTime?: string
  newSessionExpireTime?: string
  error?: {
    message?: string
    status?: string
  }
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: "Gemini API 키가 설정되어 있지 않습니다." }, { status: 500 })
  }

  const body = (await request.json().catch(() => ({}))) as TokenRequest
  const targetLanguageCode: LiveTranslateLanguageCode = isLiveTranslateLanguageCode(body.targetLanguageCode)
    ? body.targetLanguageCode
    : "ko"
  const echoTargetLanguage = body.echoTargetLanguage !== false

  const tokenResponse = await fetch(
    `https://generativelanguage.googleapis.com/v1alpha/auth_tokens?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        expireTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        newSessionExpireTime: new Date(Date.now() + 60 * 1000).toISOString(),
        uses: 1,
        bidiGenerateContentSetup: {
          model: `models/${LIVE_TRANSLATE_MODEL}`,
          generationConfig: {
            responseModalities: ["AUDIO"],
            translationConfig: {
              targetLanguageCode,
              echoTargetLanguage,
            },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
      }),
    },
  )

  const data = (await tokenResponse.json().catch(() => ({}))) as GeminiTokenResponse
  if (!tokenResponse.ok || !data.name) {
    return NextResponse.json(
      {
        error:
          data.error?.message ||
          `${LIVE_TRANSLATE_ENGINE_LABEL} 세션 토큰을 발급하지 못했습니다. Gemini API 설정을 확인해 주세요.`,
      },
      { status: tokenResponse.status || 502 },
    )
  }

  return NextResponse.json({
    token: data.name,
    model: LIVE_TRANSLATE_MODEL,
    targetLanguageCode,
    echoTargetLanguage,
    expireTime: data.expireTime,
    newSessionExpireTime: data.newSessionExpireTime,
  })
}
