/**
 * Dev-only auth bypass. The flag is shared between client and server so we
 * also expose a public version. We never honour it when `NODE_ENV` is
 * production, which prevents accidental "open by default" deploys.
 */
export const DEV_AUTH_USER = {
  userId: "dev-user-001",
  email: "tester@worldstreet.dev",
  firstName: "Vision",
  lastName: "Tester",
  imageUrl: "/worldstreet-logo/WorldStreet1x.png",
  role: "admin" as const,
}

export function isDevAuthBypassEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false
  const server = process.env.DEV_AUTH_BYPASS
  const client = process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS
  return server === "true" || client === "true"
}
