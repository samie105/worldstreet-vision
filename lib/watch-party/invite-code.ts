/** Normalizes invite codes from URLs (case, whitespace). */
export function normalizeInviteCode(code: string): string {
  return code.trim().toUpperCase()
}
