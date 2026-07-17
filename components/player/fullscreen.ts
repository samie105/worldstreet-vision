/**
 * Cross-browser fullscreen helpers for the custom player.
 *
 * Covers the standard Fullscreen API plus the WebKit / old-WebKit / Gecko /
 * Trident prefixed variants, and the iPhone-only escape hatch where element
 * fullscreen is unavailable entirely and the <video> element must enter the
 * native fullscreen player via `webkitEnterFullscreen()`.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const warnedMessages = new Set<string>()

function warnOnce(message: string) {
  if (warnedMessages.has(message)) return
  warnedMessages.add(message)
  console.warn(`[vision-player] ${message}`)
}

export function warnFullscreenUnavailable() {
  warnOnce("Fullscreen is not supported in this browser/context — no standard or prefixed API is available.")
}

/** The element currently in fullscreen, across vendor prefixes. */
export function getFullscreenElement(): Element | null {
  if (typeof document === "undefined") return null
  const doc = document as any
  return (
    doc.fullscreenElement ??
    doc.webkitFullscreenElement ??
    doc.mozFullScreenElement ??
    doc.msFullscreenElement ??
    null
  )
}

/**
 * Request fullscreen on `node`, trying the standard API first and then every
 * prefixed variant. Returns `false` when no API exists on the element (the
 * caller can then fall back to native <video> fullscreen on iPhone).
 */
export function requestElementFullscreen(node: HTMLElement): boolean {
  const el = node as any
  const request =
    el.requestFullscreen ??
    el.webkitRequestFullscreen ??
    el.webkitRequestFullScreen ??
    el.mozRequestFullScreen ??
    el.msRequestFullscreen
  if (typeof request !== "function") return false
  try {
    const result = request.call(node)
    if (result && typeof result.catch === "function") {
      void result.catch((error: unknown) => {
        warnOnce(`Fullscreen request was rejected: ${String(error)}`)
      })
    }
    return true
  } catch (error) {
    warnOnce(`Fullscreen request failed: ${String(error)}`)
    return false
  }
}

/** Exit document fullscreen across vendor prefixes. Returns false when no API exists. */
export function exitDocumentFullscreen(): boolean {
  if (typeof document === "undefined") return false
  const doc = document as any
  const exit =
    doc.exitFullscreen ??
    doc.webkitExitFullscreen ??
    doc.webkitCancelFullScreen ??
    doc.mozCancelFullScreen ??
    doc.msExitFullscreen
  if (typeof exit !== "function") return false
  try {
    const result = exit.call(document)
    if (result && typeof result.catch === "function") {
      void result.catch(() => {})
    }
    return true
  } catch {
    return false
  }
}

/**
 * iPhone fallback: element fullscreen doesn't exist there, but the <video>
 * element can enter the native fullscreen player. Returns false when the
 * API is unavailable (or the video has no media data yet, which makes iOS throw).
 */
export function enterVideoNativeFullscreen(video: HTMLVideoElement): boolean {
  const el = video as any
  if (typeof el.webkitEnterFullscreen !== "function") return false
  try {
    el.webkitEnterFullscreen()
    return true
  } catch (error) {
    warnOnce(`Native video fullscreen failed: ${String(error)}`)
    return false
  }
}

/** Leave the iPhone native fullscreen player, when supported. */
export function exitVideoNativeFullscreen(video: HTMLVideoElement): boolean {
  const el = video as any
  if (typeof el.webkitExitFullscreen !== "function") return false
  try {
    el.webkitExitFullscreen()
    return true
  } catch {
    return false
  }
}

const FULLSCREEN_CHANGE_EVENTS = [
  "fullscreenchange",
  "webkitfullscreenchange",
  "mozfullscreenchange",
  "MSFullscreenChange",
] as const

/**
 * Subscribe to fullscreen state changes across all vendor-prefixed event
 * names. Returns an unsubscribe function.
 */
export function addFullscreenChangeListener(handler: () => void): () => void {
  if (typeof document === "undefined") return () => {}
  for (const eventName of FULLSCREEN_CHANGE_EVENTS) {
    document.addEventListener(eventName, handler)
  }
  return () => {
    for (const eventName of FULLSCREEN_CHANGE_EVENTS) {
      document.removeEventListener(eventName, handler)
    }
  }
}
