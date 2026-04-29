/**
 * Tiny event sink. Replace the sender with PostHog/Segment/Mixpanel when we
 * formally pick an analytics vendor. Keeping the API stable now means the
 * call sites don't need to change later.
 */
export type VisionEvent =
  | { type: "search.query"; query: string; results: number }
  | { type: "title.view"; titleId: string }
  | { type: "watch.start"; titleId: string; assetId: string; resumeAt: number }
  | { type: "watch.heartbeat"; titleId: string; assetId: string; positionSeconds: number }
  | { type: "watch.complete"; titleId: string; assetId: string }
  | { type: "watch-party.start"; inviteCode: string }
  | { type: "watch-party.join"; inviteCode: string }

export function trackEvent(event: VisionEvent): void {
  if (typeof window === "undefined") return
  if (process.env.NODE_ENV !== "production") {
    console.debug("[analytics]", event)
    return
  }
  // TODO: forward to chosen analytics provider when it is in place.
}
