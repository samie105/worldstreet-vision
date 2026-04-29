import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"
import { NextResponse, type NextRequest } from "next/server"

import { isDevAuthBypassEnabled } from "@/lib/auth/dev-bypass"

const isProduction = process.env.NODE_ENV === "production"
const LOGIN_URL = isProduction
  ? "https://www.worldstreetgold.com/login"
  : "/login"

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

const clerkMw = clerkMiddleware(async (auth, req) => {
  if (isWebhookRoute(req)) {
    return NextResponse.next()
  }

  if (!isPublicRoute(req)) {
    try {
      await auth.protect()
    } catch {
      if (isProduction) {
        return NextResponse.redirect(LOGIN_URL)
      }
      return NextResponse.redirect(new URL(LOGIN_URL, req.url))
    }
  }

  if (isProtectedApi(req)) {
    try {
      await auth.protect()
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
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
