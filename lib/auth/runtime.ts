/**
 * Auth runtime helpers. When `DEV_AUTH_BYPASS=true` is set in the environment
 * we hand back a deterministic dev user instead of consulting Clerk. This lets
 * us iterate on the product UI and run Playwright end-to-end tests without
 * needing a sign-in flow. The bypass is automatically disabled in production
 * regardless of the env value.
 *
 * IMPORTANT: never enable this flag in a deployed production environment.
 */
import "server-only"

import { auth as clerkAuth, currentUser as clerkCurrentUser } from "@clerk/nextjs/server"

import { DEV_AUTH_USER, isDevAuthBypassEnabled } from "@/lib/auth/dev-bypass"

interface AuthResult {
  userId: string | null
}

interface CurrentUserResult {
  id: string
  emailAddresses: { emailAddress: string }[]
  firstName: string | null
  lastName: string | null
  imageUrl: string | null
  publicMetadata: Record<string, unknown>
}

export function isDevAuthBypass(): boolean {
  return isDevAuthBypassEnabled()
}

/**
 * Server-side auth wrapper. Use this in server actions and route handlers
 * instead of importing `auth()` from `@clerk/nextjs/server` directly so we
 * always honour the dev bypass.
 */
export async function auth(): Promise<AuthResult> {
  if (isDevAuthBypass()) {
    return { userId: DEV_AUTH_USER.userId }
  }
  const result = await clerkAuth()
  return { userId: result.userId ?? null }
}

export async function currentUser(): Promise<CurrentUserResult | null> {
  if (isDevAuthBypass()) {
    return {
      id: DEV_AUTH_USER.userId,
      emailAddresses: [{ emailAddress: DEV_AUTH_USER.email }],
      firstName: DEV_AUTH_USER.firstName,
      lastName: DEV_AUTH_USER.lastName,
      imageUrl: DEV_AUTH_USER.imageUrl,
      publicMetadata: { role: DEV_AUTH_USER.role },
    }
  }
  const user = await clerkCurrentUser()
  if (!user) return null
  return {
    id: user.id,
    emailAddresses: user.emailAddresses.map((e) => ({ emailAddress: e.emailAddress })),
    firstName: user.firstName,
    lastName: user.lastName,
    imageUrl: user.imageUrl ?? null,
    publicMetadata: user.publicMetadata as Record<string, unknown>,
  }
}
