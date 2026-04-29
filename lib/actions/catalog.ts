"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { requireAdminUser } from "@/lib/auth/clerk"
import { connectDB } from "@/lib/db/mongodb"
import VisionAsset from "@/models/VisionAsset"
import VisionRail from "@/models/VisionRail"
import VisionTitle from "@/models/VisionTitle"
import { createCloudflareDirectUpload } from "@/lib/video/cloudflare-stream"
import { slugify } from "@/lib/utils"
import { serializeRail, serializeTitle } from "@/lib/catalog/serializers"
import type { CatalogRail, CatalogTitle } from "@/lib/catalog/types"

const titleInputSchema = z.object({
  title: z.string().min(1).max(200),
  tagline: z.string().max(280).optional(),
  synopsis: z.string().max(4_000).optional(),
  slug: z.string().max(120).optional(),
  genres: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  cast: z.array(z.string()).default([]),
  director: z.string().max(160).optional(),
  releaseYear: z.number().int().min(1900).max(2100).optional(),
  durationSeconds: z.number().int().min(0).max(60 * 60 * 24).optional(),
  maturityRating: z.enum(["g", "pg", "pg13", "r"]).optional(),
  status: z.enum(["draft", "scheduled", "published", "archived"]).optional(),
  publishAt: z.string().nullable().optional(),
  posterUrl: z.string().url().optional().or(z.literal("")),
  backdropUrl: z.string().url().optional().or(z.literal("")),
  collectionSlug: z.string().nullable().optional(),
  weight: z.number().int().optional(),
})

export type TitleInput = z.infer<typeof titleInputSchema>

export interface CatalogResult<T> {
  success: boolean
  data?: T
  error?: string
}

export async function createTitle(
  input: TitleInput,
): Promise<CatalogResult<CatalogTitle>> {
  try {
    await requireAdminUser()
    const parsed = titleInputSchema.parse(input)
    await connectDB()

    const slugSeed = parsed.slug?.trim() || parsed.title
    const slug = slugify(slugSeed)
    if (!slug) return { success: false, error: "Invalid slug" }

    const exists = await VisionTitle.findOne({ slug })
    if (exists) return { success: false, error: "Slug already exists" }

    const title = await VisionTitle.create({
      slug,
      title: parsed.title,
      tagline: parsed.tagline ?? "",
      synopsis: parsed.synopsis ?? "",
      genres: parsed.genres,
      tags: parsed.tags,
      cast: parsed.cast,
      director: parsed.director ?? "",
      releaseYear: parsed.releaseYear ?? new Date().getFullYear(),
      durationSeconds: parsed.durationSeconds ?? 0,
      maturityRating: parsed.maturityRating ?? "pg13",
      status: parsed.status ?? "draft",
      publishAt: parsed.publishAt ? new Date(parsed.publishAt) : null,
      posterUrl: parsed.posterUrl ?? "",
      backdropUrl: parsed.backdropUrl ?? "",
      collectionSlug: parsed.collectionSlug ?? null,
      weight: parsed.weight ?? 0,
      searchTerms: buildSearchTerms(parsed),
    })

    revalidatePath("/admin/catalog")
    revalidatePath("/")
    return { success: true, data: serializeTitle(title) }
  } catch (error) {
    return errorResult(error)
  }
}

export async function updateTitle(
  id: string,
  input: Partial<TitleInput>,
): Promise<CatalogResult<CatalogTitle>> {
  try {
    await requireAdminUser()
    const parsed = titleInputSchema.partial().parse(input)
    await connectDB()

    const update: Record<string, unknown> = { ...parsed }
    if (parsed.publishAt !== undefined) {
      update.publishAt = parsed.publishAt ? new Date(parsed.publishAt) : null
    }
    if (parsed.title || parsed.tagline || parsed.synopsis || parsed.genres || parsed.tags) {
      update.searchTerms = buildSearchTerms(parsed)
    }

    const doc = await VisionTitle.findByIdAndUpdate(id, { $set: update }, { new: true })
    if (!doc) return { success: false, error: "Title not found" }

    revalidatePath("/admin/catalog")
    revalidatePath(`/title/${doc.slug}`)
    revalidatePath("/")
    return { success: true, data: serializeTitle(doc) }
  } catch (error) {
    return errorResult(error)
  }
}

export async function deleteTitle(id: string): Promise<CatalogResult<true>> {
  try {
    await requireAdminUser()
    await connectDB()
    await VisionTitle.findByIdAndDelete(id)
    await VisionAsset.updateMany({ titleId: id }, { $set: { titleId: null } })
    revalidatePath("/admin/catalog")
    revalidatePath("/")
    return { success: true, data: true }
  } catch (error) {
    return errorResult(error)
  }
}

interface CreateUploadInput {
  titleId: string | null
  kind: "trailer" | "feature" | "preview" | "extra"
  signed?: boolean
}

export async function createCloudflareStreamDirectUpload(
  input: CreateUploadInput,
): Promise<CatalogResult<{ uploadUrl: string; assetId: string }>> {
  try {
    const admin = await requireAdminUser()
    await connectDB()

    const title = input.titleId ? await VisionTitle.findById(input.titleId) : null
    const upload = await createCloudflareDirectUpload({
      title: title?.title ?? "Worldstreet Vision upload",
      requireSignedUrls: input.signed !== false,
    })

    const externalId = `vision_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 8)}`
    const asset = await VisionAsset.create({
      externalId,
      titleId: input.titleId,
      kind: input.kind,
      status: "uploading",
      cloudflareVideoUid: upload.videoUid,
      signed: input.signed !== false,
      uploadedBy: admin.userId,
    })

    return {
      success: true,
      data: { uploadUrl: upload.uploadUrl, assetId: String(asset._id) },
    }
  } catch (error) {
    return errorResult(error)
  }
}

export async function attachAssetToTitle(
  titleId: string,
  assetId: string,
  role: "trailer" | "feature",
): Promise<CatalogResult<CatalogTitle>> {
  try {
    await requireAdminUser()
    await connectDB()
    const update =
      role === "trailer"
        ? { trailerAssetId: assetId }
        : { mainAssetId: assetId }
    const title = await VisionTitle.findByIdAndUpdate(titleId, { $set: update }, { new: true })
    if (!title) return { success: false, error: "Title not found" }
    await VisionAsset.findByIdAndUpdate(assetId, { $set: { titleId: titleId } })
    revalidatePath("/admin/catalog")
    revalidatePath(`/title/${title.slug}`)
    return { success: true, data: serializeTitle(title) }
  } catch (error) {
    return errorResult(error)
  }
}

export async function upsertRail(
  rail: Partial<CatalogRail> & { label: string; slug?: string },
): Promise<CatalogResult<CatalogRail>> {
  try {
    await requireAdminUser()
    await connectDB()

    const slug = slugify(rail.slug ?? rail.label)
    if (!slug) return { success: false, error: "Invalid slug" }

    const doc = await VisionRail.findOneAndUpdate(
      { slug },
      {
        $set: {
          label: rail.label,
          kind: rail.kind ?? "manual",
          manualSlugs: rail.manualSlugs ?? [],
          genreFilter: rail.genreFilter ?? null,
          position: rail.position ?? 100,
          isActive: rail.isActive ?? true,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )
    revalidatePath("/")
    revalidatePath("/admin/rails")
    return { success: true, data: serializeRail(doc) }
  } catch (error) {
    return errorResult(error)
  }
}

function buildSearchTerms(input: Partial<TitleInput>): string[] {
  const parts = [
    input.title,
    input.tagline,
    input.synopsis,
    ...(input.genres ?? []),
    ...(input.tags ?? []),
    ...(input.cast ?? []),
    input.director,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
  return Array.from(new Set(parts.split(/[^a-z0-9]+/g).filter((s) => s.length > 2))).slice(0, 64)
}

function errorResult<T>(error: unknown): CatalogResult<T> {
  if (error instanceof z.ZodError) {
    return { success: false, error: error.errors.map((e) => e.message).join(", ") }
  }
  if (error instanceof Error) {
    if (error.name === "UnauthorizedError") return { success: false, error: "Unauthorized" }
    if (error.name === "ForbiddenError") return { success: false, error: "Forbidden" }
    console.error("[vision/catalog]", error)
    return { success: false, error: error.message }
  }
  return { success: false, error: "Unknown error" }
}
