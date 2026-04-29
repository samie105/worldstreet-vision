import { notFound } from "next/navigation"

import { getAuthUser } from "@/lib/auth/clerk"
import { getAssetsForTitle, getTitleBySlug, listRelatedTitles } from "@/lib/catalog/queries"
import { getMockTitleBySlug } from "@/lib/catalog/mock-data"
import { TitleDetailHero } from "@/components/catalog/title-detail-hero"
import { SeriesEpisodes } from "@/components/catalog/series-episodes"
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
  const mockTitle = getMockTitleBySlug(slug)
  const isDemoCatalogTitle = baseTitle._id.startsWith("demo-title-")
  const title =
    baseTitle.kind === "series" && mockTitle && isDemoCatalogTitle ? mockTitle : baseTitle

  const [assets, viewer, related] = await Promise.all([
    getAssetsForTitle(title._id),
    getAuthUser(),
    listRelatedTitles(title.slug, title.genres, 18),
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

  const resumeQS = progressSeconds > 5 ? `?t=${Math.floor(progressSeconds)}` : ""
  const mainHref = main ? `/watch/${main._id}${resumeQS}` : null
  const trailerHref = trailer ? `/watch/${trailer._id}` : null
  const watchTogetherHref = main ? `/watch/${main._id}?party=new` : null

  return (
    <div className="flex flex-col">
      <TitleDetailHero
        title={title}
        related={related}
        resumeProgressSeconds={progressSeconds}
        mainHref={mainHref}
        trailerHref={trailerHref}
        watchTogetherHref={watchTogetherHref}
      />

      {title.kind === "series" ? (
        <div className="border-t border-border/40 bg-background px-4 py-12 md:px-12">
          <SeriesEpisodes title={title} />
        </div>
      ) : null}
    </div>
  )
}
