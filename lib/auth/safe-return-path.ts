/** Allow only same-origin relative paths (prevents open redirects). */
export function safeReturnPath(raw: string | string[] | undefined | null): string | undefined {
  const v = Array.isArray(raw) ? raw[0] : raw
  if (!v || typeof v !== "string") return undefined
  const trimmed = v.trim()
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return undefined
  if (trimmed.includes(":") && !trimmed.startsWith("/")) return undefined
  return trimmed
}
