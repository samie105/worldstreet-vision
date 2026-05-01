import { notFound } from "next/navigation"

import { getAuthUser } from "@/lib/auth/clerk"
import { getWatchPartyForParticipant } from "@/lib/actions/watch-party"
import { getAssetById, getTitleById, listRelatedTitles } from "@/lib/catalog/queries"
import type { CatalogTitle } from "@/lib/catalog/types"
import { getMockNextEpisode, getMockTitleById } from "@/lib/catalog/mock-data"
import { signCloudflarePlayback } from "@/lib/video/cloudflare-stream"
import { connectDB } from "@/lib/db/mongodb"
import VisionWatchProgress from "@/models/VisionWatchProgress"
import { WatchExperience } from "@/components/player/watch-experience"
import { withPartyQueryOnWatchHref } from "@/lib/watch-party/watch-url"

interface WatchPageProps {
  params: Promise<{ assetId: string }>
  searchParams: Promise<{ t?: string; party?: string; token?: string }>
}

export const dynamic = "force-dynamic"

export default async function WatchPage({ params, searchParams }: WatchPageProps) {
  const [{ assetId }, query] = await Promise.all([params, searchParams])
  const viewer = await getAuthUser()
  if (!viewer) notFound()

  const asset = await getAssetById(assetId)
  if (!asset || asset.status !== "ready" || (!asset.cloudflareVideoUid && !asset.demoPlaybackUrl)) {
    notFound()
  }

  const title = asset.titleId ? await getTitleById(asset.titleId) : null

  // Use a 6-hour TTL so the signed manifest URL stays valid for the full
  // length of any movie/episode and any watch-party session (max 6h).
  const PLAYBACK_TOKEN_TTL_SECONDS = 60 * 60 * 6
  const bundle = asset.demoPlaybackUrl
    ? {
        videoUid: asset.cloudflareVideoUid ?? asset._id,
        token: asset.cloudflareVideoUid ?? asset._id,
        signed: false,
        expiresAt: 0,
        hlsUrl: asset.demoPlaybackUrl,
        posterUrl: asset.demoPosterUrl ?? "",
        iframeUrl: "",
      }
    : signCloudflarePlayback(asset.cloudflareVideoUid!, asset.signed, PLAYBACK_TOKEN_TTL_SECONDS)
  let resumeAt = 0
  let partyInitialIsPlaying: boolean | null = null
  let partyPlaybackResolved = false

  let partyGuestHint = false
  let partyHostHint = false

  const partyCode = query.party
  if (partyCode && partyCode !== "new") {
    const party = await getWatchPartyForParticipant(partyCode, query.token)
    if (party.success && party.data) {
      resumeAt = party.data.playback.positionSeconds
      partyInitialIsPlaying = party.data.playback.isPlaying
      partyPlaybackResolved = true
      const isHost = party.data.hostId === viewer.userId
      partyGuestHint = !isHost
      partyHostHint = isHost
    }
  }

  if (!partyPlaybackResolved) {
    const tParam = Number(query.t ?? 0)
    if (!Number.isNaN(tParam) && tParam > 0) resumeAt = tParam
  }

  if (!partyPlaybackResolved && (!resumeAt || Number.isNaN(resumeAt)) && title) {
    try {
      await connectDB()
      const progress = await VisionWatchProgress.findOne({
        authUserId: viewer.userId,
        titleId: title._id,
        assetId: asset._id,
      })
      resumeAt = progress?.positionSeconds ?? 0
    } catch {
      resumeAt = 0
    }
  }

  let episodeLabel: string | null = null
  let nextUp: { label: string; href: string; thumbnailUrl?: string } | null = null
  if (title?.kind === "series") {
    const fullTitle = getMockTitleById(title._id) ?? title
    const seasons = fullTitle.seasons ?? []
    for (const season of seasons) {
      const episode = season.episodes.find((ep) => ep.assetId === asset._id)
      if (episode) {
        episodeLabel = `${title.title} · S${season.number} · E${episode.episodeNumber} — ${episode.title.replace(/^Episode \d+:\s*/, "")}`
        break
      }
    }
    const next = getMockNextEpisode(asset._id)
    if (next) {
      nextUp = {
        label: `S${next.episode.seasonNumber} · E${next.episode.episodeNumber} — ${next.episode.title.replace(/^Episode \d+:\s*/, "")}`,
        href: `/watch/${next.episode.assetId}`,
        thumbnailUrl: next.episode.thumbnailUrl,
      }
    }
  }

  if (nextUp && partyCode && partyCode !== "new") {
    nextUp = {
      ...nextUp,
      href: withPartyQueryOnWatchHref(nextUp.href, partyCode),
    }
  }

  let relatedTitles: CatalogTitle[] = []
  if (title) {
    relatedTitles = await listRelatedTitles(title.slug, title.genres, 18)
  }

  return (
    <WatchExperience
      asset={asset}
      title={title}
      playback={bundle}
      resumeAt={resumeAt}
      partyMode={query.party ?? null}
      partyToken={query.token ?? null}
      partyInitialIsPlaying={partyInitialIsPlaying}
      partyGuestHint={partyGuestHint}
      partyHostHint={partyHostHint}
      episodeLabel={episodeLabel}
      nextUp={nextUp}
      relatedTitles={relatedTitles}
    />
  )
}
