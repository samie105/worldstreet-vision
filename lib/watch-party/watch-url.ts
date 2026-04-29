import { normalizeInviteCode } from "./invite-code"

/** Appends or replaces `party` on a relative watch URL so next-episode navigation stays synced. */
export function withPartyQueryOnWatchHref(href: string, partyCode: string): string {
  const code = normalizeInviteCode(partyCode)
  try {
    const u = new URL(href, "http://vision.watch")
    u.searchParams.set("party", code)
    return `${u.pathname}${u.search}`
  } catch {
    return href
  }
}
