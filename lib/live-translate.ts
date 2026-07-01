export const LIVE_TRANSLATE_MODEL = "gemini-3.5-live-translate-preview"
export const LIVE_TRANSLATE_ENGINE_LABEL = "Gemini 3.5 Live Translate"

export const LIVE_TRANSLATE_LANGUAGES = [
  { code: "ko", label: "한국어" },
  { code: "en", label: "English" },
  { code: "ja", label: "日本語" },
  { code: "zh-Hans", label: "中文 간체" },
  { code: "zh-Hant", label: "中文 번체" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "vi", label: "Tiếng Việt" },
  { code: "th", label: "ไทย" },
  { code: "id", label: "Indonesia" },
  { code: "pt-BR", label: "Português BR" },
] as const

export type LiveTranslateLanguageCode = (typeof LIVE_TRANSLATE_LANGUAGES)[number]["code"]

export function isLiveTranslateLanguageCode(value: unknown): value is LiveTranslateLanguageCode {
  return typeof value === "string" && LIVE_TRANSLATE_LANGUAGES.some((language) => language.code === value)
}

export function getLiveTranslateLanguageLabel(code: string) {
  return LIVE_TRANSLATE_LANGUAGES.find((language) => language.code === code)?.label ?? code
}
