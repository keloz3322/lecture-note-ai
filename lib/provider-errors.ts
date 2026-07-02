export type ProviderLabel = "AI Gateway" | "Gemini API" | "Groq" | "Gemini Live"

interface ProviderIssueContext {
  provider: ProviderLabel
  status?: unknown
  statusText?: unknown
  message?: unknown
  error?: unknown
}

const RESOURCE_ERROR_STATUSES = new Set([402, 429])

const RESOURCE_ERROR_PATTERN =
  /\b(?:RESOURCE_EXHAUSTED|insufficient_quota|rate[\s_-]*limit(?:ed|ing|s)?|quota|billing|credits?|balance|exceeded|exhausted|payment|subscription|too[\s_-]*many[\s_-]*requests|payment[\s_-]*required)\b/i

export function getProviderResourceIssueMessage(context: ProviderIssueContext) {
  const status = normalizeStatus(context.status) ?? statusFromUnknown(context.error)
  const text = [context.statusText, context.message, collectErrorText(context.error)].filter(Boolean).join("\n")

  if (status != null && RESOURCE_ERROR_STATUSES.has(status)) return providerResourceIssueMessage(context.provider)
  if (RESOURCE_ERROR_PATTERN.test(text)) return providerResourceIssueMessage(context.provider)

  return null
}

function providerResourceIssueMessage(provider: ProviderLabel) {
  return `${provider} 요청이 API 크레딧, 할당량, 결제 또는 속도 제한 문제로 차단되었습니다. 이 경우는 앱 코드 문제가 아니라 연결된 ${provider} 계정의 크레딧을 다 썼거나 quota, credits, billing, balance, rate limit 설정에 막힌 상태일 가능성이 큽니다. ${provider} 대시보드에서 결제와 사용량 한도를 확인하거나 잠시 후 다시 시도해 주세요.`
}

function normalizeStatus(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value)) return value
  if (typeof value === "string" && /^\d{3}$/.test(value.trim())) return Number(value.trim())
  return undefined
}

function statusFromUnknown(value: unknown, depth = 0): number | undefined {
  if (depth > 3 || typeof value !== "object" || value === null) return undefined

  const record = value as Record<string, unknown>
  return (
    normalizeStatus(record.status) ??
    normalizeStatus(record.statusCode) ??
    normalizeStatus(record.code) ??
    statusFromUnknown(record.response, depth + 1) ??
    statusFromUnknown(record.cause, depth + 1)
  )
}

function collectErrorText(value: unknown, depth = 0): string {
  if (depth > 3 || value == null) return ""
  if (typeof value === "string") return value.slice(0, 4000)
  if (typeof value === "number" || typeof value === "boolean") return String(value)

  if (value instanceof Error) {
    return [value.name, value.message, collectErrorText((value as { cause?: unknown }).cause, depth + 1)]
      .filter(Boolean)
      .join("\n")
      .slice(0, 4000)
  }

  if (typeof value !== "object") return ""

  const record = value as Record<string, unknown>
  return [
    record.message,
    record.status,
    record.statusText,
    record.code,
    record.type,
    record.reason,
    record.error,
    record.errors,
    record.details,
    record.body,
    record.responseBody,
    record.data,
    record.cause,
  ]
    .map((item) => collectErrorText(item, depth + 1))
    .filter(Boolean)
    .join("\n")
    .slice(0, 4000)
}
