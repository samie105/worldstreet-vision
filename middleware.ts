import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"
import { NextResponse, type NextRequest } from "next/server"

import { isDevAuthBypassEnabled } from "@/lib/auth/dev-bypass"

const isPublicRoute = createRouteMatcher([
  "/login(.*)",
  "/register(.*)",
  "/invite/(.*)",
])

const isProtectedApi = createRouteMatcher([
  "/api/profile(.*)",
  "/api/catalog(.*)",
  "/api/playback(.*)",
  "/api/progress(.*)",
  "/api/library(.*)",
  "/api/admin(.*)",
  "/api/watch-party(.*)",
])

const isWebhookRoute = createRouteMatcher([
  "/api/webhooks(.*)",
  "/api/cloudflare/stream/webhook(.*)",
])

/**
 * Do not catch `auth.protect()` — Clerk throws a control-flow redirect that includes
 * satellite `returnBackUrl`. A plain redirect to www/login drops that and users land
 * on whatever default path is set in Clerk (e.g. dashboard.worldstreetgold.com).
 *
 * For APIs, `protect()` would 404 unauthenticated requests; use `userId` + 401 instead.
 */
const clerkMw = clerkMiddleware(async (auth, req) => {
  if (isWebhookRoute(req)) {
    return NextResponse.next()
  }

  if (isProtectedApi(req)) {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    return NextResponse.next()
  }

  if (!isPublicRoute(req)) {
    await auth.protect()
  }
})

export default function middleware(req: NextRequest, event: Parameters<typeof clerkMw>[1]) {
  if (isDevAuthBypassEnabled()) {
    return NextResponse.next()
  }
  return clerkMw(req, event)
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
}
