import { redirect } from "next/navigation"
import Link from "next/link"

import { getRealAuthUser } from "@/lib/auth/clerk"
import { getTitleById } from "@/lib/catalog/queries"
import { joinWatchParty } from "@/lib/actions/watch-party"
import { ensureProfileForUser } from "@/lib/actions/profile"

interface InvitePageProps {
  params: Promise<{ code: string }>
  searchParams: Promise<{ token?: string }>
}

export default async function InvitePage({ params, searchParams }: InvitePageProps) {
  const [{ code }, sp] = await Promise.all([params, searchParams])
  const token = sp.token
  const returnPath = `/invite/${encodeURIComponent(code)}${token ? `?token=${encodeURIComponent(token)}` : ""}`
  const loginHref = `/login?redirect_url=${encodeURIComponent(returnPath)}`
  const registerHref = `/register?redirect_url=${encodeURIComponent(returnPath)}`

  const viewer = await getRealAuthUser()
  if (!viewer) {
    return (
      <div className="vision-stage flex min-h-dvh items-center justify-center px-4 text-center">
        <div className="max-w-md">
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
            Watch Together
          </p>
          <h1 className="mt-2 text-2xl font-semibold">Sign in to join</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in with your Worldstreet account to join this watch party. After you sign in, you&apos;ll
            return here on Vision automatically.
          </p>
          <div className="mt-6 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
            <Link
              href={loginHref}
              className="inline-flex w-full items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 sm:w-auto"
            >
              Sign in
            </Link>
            <Link
              href={registerHref}
              className="inline-flex w-full items-center justify-center rounded-full border border-border bg-card px-5 py-2.5 text-sm font-medium hover:bg-accent sm:w-auto"
            >
              Create account
            </Link>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Party code <span className="font-mono text-foreground">{code}</span>
          </p>
        </div>
      </div>
    )
  }

  if (!token) {
    return (
      <InviteError message="This invite link is missing a token. Ask the host for a fresh link." />
    )
  }

  // Make sure the viewer has a Vision profile before joining \u2014 watch-party
  // presence and chat both rely on the profile\u2019s display name and avatar.
  // First-time joiners would otherwise show up as anonymous in the panel.
  await ensureProfileForUser(viewer)

  const result = await joinWatchParty(code, token)
  if (!result.success || !result.data) {
    return <InviteError message={result.error ?? "Could not join this watch party."} />
  }

  const snap = result.data
  const title = await getTitleById(snap.titleId)
  const slugParam = title ? `&title=${encodeURIComponent(title.slug)}` : ""
  // Preserve the invite token in the URL so that re-opening the watch page
  // (or sharing the resulting link) still auto-joins the guest if they were
  // somehow removed from `participants`. The token is already considered a
  // bearer credential while the party is live; expiry is enforced server-side.
  redirect(`/watch/${snap.assetId}?party=${snap.inviteCode}&token=${encodeURIComponent(token)}${slugParam}`)
}

function InviteError({ message }: { message: string }) {
  return (
    <div className="vision-stage flex min-h-dvh items-center justify-center px-4 text-center">
      <div className="max-w-md">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Watch Together</p>
        <h1 className="mt-2 text-2xl font-semibold">Couldn&apos;t join</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Back to Vision
        </Link>
      </div>
    </div>
  )
}
