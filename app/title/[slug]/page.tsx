import { notFound } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import { HugeiconsIcon } from "@hugeicons/react"
import { PlayIcon, UserMultipleIcon } from "@hugeicons/core-free-icons"

import { getAuthUser } from "@/lib/auth/clerk"
import { getAssetsForTitle, getTitleBySlug, listRelatedTitles } from "@/lib/catalog/queries"
import { getMockTitleBySlug } from "@/lib/catalog/mock-data"
import { Badge } from "@/components/ui/badge"
import { TitleListButton } from "@/components/catalog/title-list-button"
import { SeriesEpisodes } from "@/components/catalog/series-episodes"
import { TitleRail } from "@/components/catalog/title-rail"
import { formatDuration } from "@/lib/utils"
import { connectDB } from "@/lib/db/mongodb"
import VisionWatchProgress from "@/models/VisionWatchProgress"

interface PageProps {
  params: Promise<{ slug: string }>
}

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params
  const title = await getTitleBySlug(slug)
  if (!title) return { title: "Not found" }
  return {
    title: title.title,
    description: title.tagline || title.synopsis.slice(0, 160),
    openGraph: {
      title: title.title,
      description: title.tagline || title.synopsis.slice(0, 160),
      images: title.backdropUrl ? [{ url: title.backdropUrl }] : undefined,
    },
  }
}

export default async function TitlePage({ params }: PageProps) {
  const { slug } = await params
  const baseTitle = await getTitleBySlug(slug)
  if (!baseTitle) notFound()
  // Demo titles use `demo-title-*` ids and carry a full `seasons` tree in
  // mock-data. Real Mongo titles win even if the slug also exists in mocks.
  const mockTitle = getMockTitleBySlug(slug)
  const isDemoCatalogTitle = baseTitle._id.startsWith("demo-title-")
  const title =
    baseTitle.kind === "series" && mockTitle && isDemoCatalogTitle ? mockTitle : baseTitle

  const [assets, viewer, related] = await Promise.all([
    getAssetsForTitle(title._id),
    getAuthUser(),
    listRelatedTitles(title.slug, title.genres, 14),
  ])

  let progressSeconds = 0
  if (viewer && title.mainAssetId) {
    try {
      await connectDB()
      const progress = await VisionWatchProgress.findOne({
        authUserId: viewer.userId,
        titleId: title._id,
        assetId: title.mainAssetId,
      })
      progressSeconds = progress?.positionSeconds ?? 0
    } catch {
      progressSeconds = 0
    }
  }

  const trailer = assets.find((a) => a._id === title.trailerAssetId && a.status === "ready")
  const main = assets.find((a) => a._id === title.mainAssetId && a.status === "ready")

  return (
    <div className="flex flex-col">
      <section className="relative isolate -mt-14 md:-mt-16">
        <div className="relative h-[62vh] min-h-[440px] w-full">
          {title.backdropUrl ? (
            <Image
              src={title.backdropUrl}
              alt=""
              fill
              priority
              className="object-cover"
              unoptimized
            />
          ) : (
            <div className="absolute inset-0 vision-stage" />
          )}
          <div className="absolute inset-0 hidden bg-[linear-gradient(180deg,transparent_45%,color-mix(in_oklch,var(--color-background)_60%,transparent)_75%,var(--color-background)_100%)] dark:block" />
          <div className="absolute inset-0 hidden bg-[linear-gradient(90deg,rgba(0,0,0,0.6)_0%,rgba(0,0,0,0.2)_45%,transparent_75%)] dark:block" />
        </div>
        <div className="mx-auto -mt-32 max-w-[1400px] px-4 md:-mt-40 md:px-12">
          <div className="flex flex-col gap-3 text-foreground">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="premium">Worldstreet Original</Badge>
              <Badge variant="muted">{title.maturityRating.toUpperCase()}</Badge>
              <Badge variant="muted">{title.releaseYear}</Badge>
              <Badge variant="muted" className="capitalize">
                {title.kind}
              </Badge>
              {title.kind === "movie" && title.durationSeconds > 0 ? (
                <Badge variant="muted">{formatDuration(title.durationSeconds)}</Badge>
              ) : title.kind === "series" && title.seasons ? (
                <Badge variant="muted">
                  {title.seasons.length} season{title.seasons.length === 1 ? "" : "s"}
                </Badge>
              ) : null}
            </div>
            <h1
              data-testid="title-name"
              className="text-balance text-4xl font-semibold leading-tight text-foreground md:text-5xl dark:text-white"
              style={{ overflowWrap: "anywhere" }}
            >
              {title.title}
            </h1>
            {title.tagline ? (
              <p className="text-balance text-base text-muted-foreground md:text-lg dark:text-white/80">
                {title.tagline}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {main ? (
                <Link
                  href={`/watch/${main._id}${progressSeconds > 5 ? `?t=${Math.floor(progressSeconds)}` : ""}`}
                  data-testid="title-play"
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  <HugeiconsIcon icon={PlayIcon} strokeWidth={2.5} className="size-4" />
                  {progressSeconds > 5 ? "Resume" : title.kind === "series" ? "Play S1 · E1" : "Play"}
                </Link>
              ) : (
                <button
                  disabled
                  className="inline-flex items-center gap-2 rounded-full bg-muted px-5 py-2.5 text-sm font-semibold text-muted-foreground"
                >
                  Coming soon
                </button>
              )}
              {trailer ? (
                <Link
                  href={`/watch/${trailer._id}`}
                  className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-semibold hover:bg-accent"
                >
                  Watch trailer
                </Link>
              ) : null}
              {main ? (
                <Link
                  href={`/watch/${main._id}?party=new`}
                  data-testid="title-watch-together"
                  className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-semibold hover:bg-accent"
                >
                  <HugeiconsIcon icon={UserMultipleIcon} strokeWidth={2} className="size-4" />
                  Watch together
                </Link>
              ) : null}
              <TitleListButton titleId={title._id} />
            </div>
            <div className="mt-6 grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <h2 className="mb-2 text-sm font-medium uppercase tracking-wider text-muted-foreground">
                  Overview
                </h2>
                <p className="text-pretty text-sm leading-relaxed text-foreground/85 md:text-base [text-wrap:pretty]">
                  {title.synopsis || "No synopsis provided."}
                </p>
              </div>
              <div className="space-y-3 rounded-xl border border-border/60 bg-card p-4">
                <Detail label="Cast" value={title.cast.join(", ") || "—"} />
                <Detail label="Director" value={title.director || "—"} />
                <Detail label="Genres" value={title.genres.join(", ") || "—"} />
                <Detail label="Release" value={title.releaseYear ? String(title.releaseYear) : "—"} />
              </div>
            </div>

            {title.kind === "series" ? <SeriesEpisodes title={title} /> : null}
          </div>
        </div>
      </section>

      {related.length > 0 ? (
        <div className="border-t border-border/40 bg-background pb-16 pt-10">
          <TitleRail label="More like this" titles={related} href="/browse" />
        </div>
      ) : null}
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm text-foreground/90">{value}</p>
    </div>
  )
}
