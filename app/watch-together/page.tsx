import Link from "next/link"

import { connectDB } from "@/lib/db/mongodb"
import VisionWatchParty from "@/models/VisionWatchParty"
import { getAuthUser } from "@/lib/auth/clerk"
import { getTitleById } from "@/lib/catalog/queries"
import { Badge } from "@/components/ui/badge"
import { relativeTime } from "@/lib/utils"
import { listDevWatchPartiesForUser } from "@/lib/watch-party/dev-in-memory"
import type { IVisionWatchParty } from "@/models/VisionWatchParty"

export const dynamic = "force-dynamic"

interface PartyListSession {
  inviteCode: string
  assetId: string
  titleId: string
  status: string
  participants: { authUserId: string }[]
  updatedAt: Date
}

export default async function WatchTogetherPage() {
  const user = await getAuthUser()
  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center text-sm text-muted-foreground">
        Sign in to host or join watch parties.
      </div>
    )
  }

  let mongoSessions: IVisionWatchParty[] = []
  try {
    await connectDB()
    mongoSessions = await VisionWatchParty.find({
      "participants.authUserId": user.userId,
      expiresAt: { $gt: new Date() },
    })
      .sort({ updatedAt: -1 })
      .limit(20)
      .lean()
  } catch {
    mongoSessions = []
  }

  const devRows = listDevWatchPartiesForUser(user.userId)
  const fromMongo: PartyListSession[] = mongoSessions.map((session) => ({
    inviteCode: session.inviteCode,
    assetId: session.assetId,
    titleId: session.titleId,
    status: session.status,
    participants: session.participants,
    updatedAt: session.updatedAt,
  }))
  const fromDev: PartyListSession[] = devRows.map((row) => ({
    inviteCode: row.inviteCode,
    assetId: row.assetId,
    titleId: row.titleId,
    status: row.status,
    participants: row.participants,
    updatedAt: row.updatedAt,
  }))

  const byCode = new Map<string, PartyListSession>()
  for (const row of fromDev) {
    if (row.status !== "ended") byCode.set(row.inviteCode, row)
  }
  for (const row of fromMongo) {
    if (row.status !== "ended") byCode.set(row.inviteCode, row)
  }
  const merged = [...byCode.values()].sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
  )

  const enriched = await Promise.all(
    merged.map(async (session) => {
      const title = await getTitleById(session.titleId)
      return { session, title }
    }),
  )

  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 md:px-8">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">WorldStreet Vision</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Watch Together</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Host a synchronised viewing experience for your crew. Pick something from the library and
          tap “Watch together” to spin up a party.
        </p>
      </header>

      {enriched.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 bg-card/60 px-4 py-12 text-center text-sm text-muted-foreground">
          You don’t have any active parties yet. Open a title and start one from the watch screen.
          <div className="mt-3">
            <Link
              href="/browse"
              className="rounded-full bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              Find something to watch
            </Link>
          </div>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {enriched.map(({ session, title }) => (
            <li
              key={session.inviteCode}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card p-4"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {title?.title ?? "WorldStreet Vision"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {session.participants.length} member{session.participants.length === 1 ? "" : "s"} ·
                  updated {relativeTime(session.updatedAt)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={session.status === "ended" ? "muted" : "new"}>
                  {session.status}
                </Badge>
                <Link
                  href={`/watch/${session.assetId}?party=${session.inviteCode}`}
                  className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
                >
                  Open
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
