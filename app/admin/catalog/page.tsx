import Link from "next/link"

import { connectDB } from "@/lib/db/mongodb"
import VisionTitle from "@/models/VisionTitle"
import { serializeTitle } from "@/lib/catalog/serializers"
import type { CatalogTitle } from "@/lib/catalog/types"
import { CatalogTable } from "@/components/admin/catalog-table"

export const dynamic = "force-dynamic"

async function loadTitles(): Promise<CatalogTitle[]> {
  await connectDB()
  const docs = await VisionTitle.find({}).sort({ updatedAt: -1 }).limit(200)
  return docs.map(serializeTitle)
}

export default async function AdminCatalogPage() {
  const titles = await loadTitles()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {titles.length} title{titles.length === 1 ? "" : "s"} in the library.
        </p>
        <Link
          href="/admin/catalog/new"
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          New title
        </Link>
      </div>
      <CatalogTable titles={titles} />
    </div>
  )
}
