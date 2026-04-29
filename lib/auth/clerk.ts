import { env } from "@/lib/env"
import { DEV_AUTH_USER, isDevAuthBypassEnabled } from "@/lib/auth/dev-bypass"
import { auth, currentUser } from "@/lib/auth/runtime"

export interface VisionAuthUser {
  userId: string
  email: string
  firstName: string
  lastName: string
  imageUrl: string
  role: VisionRole
}

export type VisionRole = "user" | "admin"

/**
 * Resolve the current Clerk user for server contexts (Server Actions,
 * Route Handlers, RSC). Returns null if there is no active session.
 */
export async function getAuthUser(): Promise<VisionAuthUser | null> {
  if (isDevAuthBypassEnabled()) {
    return {
      userId: DEV_AUTH_USER.userId,
      email: DEV_AUTH_USER.email,
      firstName: DEV_AUTH_USER.firstName,
      lastName: DEV_AUTH_USER.lastName,
      imageUrl: DEV_AUTH_USER.imageUrl,
      role: DEV_AUTH_USER.role,
    }
  }

  const { userId } = await auth()
  if (!userId) return null

  const user = await currentUser()
  if (!user) return null

  const email = user.emailAddresses[0]?.emailAddress ?? ""
  const role = resolveRole(user.publicMetadata?.role, email)

  return {
    userId: user.id,
    email,
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    imageUrl: user.imageUrl ?? "",
    role,
  }
}

/**
 * Throws `UnauthorizedError` if there is no signed-in user. Useful inside
 * server actions where we want a single guard at the top.
 */
export async function requireAuthUser(): Promise<VisionAuthUser> {
  const user = await getAuthUser()
  if (!user) throw new UnauthorizedError()
  return user
}

export async function requireAdminUser(): Promise<VisionAuthUser> {
  const user = await requireAuthUser()
  if (user.role !== "admin") throw new ForbiddenError()
  return user
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized")
    this.name = "UnauthorizedError"
  }
}

export class ForbiddenError extends Error {
  constructor() {
    super("Forbidden")
    this.name = "ForbiddenError"
  }
}

function resolveRole(metaRole: unknown, email: string): VisionRole {
  if (typeof metaRole === "string" && metaRole.toLowerCase() === "admin") {
    return "admin"
  }
  if (env.adminEmails.length > 0 && email && env.adminEmails.includes(email.toLowerCase())) {
    return "admin"
  }
  return "user"
}
