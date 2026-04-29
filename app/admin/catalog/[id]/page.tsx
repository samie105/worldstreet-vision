import { notFound } from "next/navigation"

import { connectDB } from "@/lib/db/mongodb"
import VisionTitle from "@/models/VisionTitle"
import { serializeTitle } from "@/lib/catalog/serializers"
import { TitleEditor } from "@/components/admin/title-editor"
import { TitleAssetsManager } from "@/components/admin/title-assets-manager"
import { getAssetsForTitle } from "@/lib/catalog/queries"

interface AdminTitlePageProps {
  params: Promise<{ id: string }>
}

export default async function AdminTitlePage({ params }: AdminTitlePageProps) {
  const { id } = await params
  await connectDB()
  const doc = await VisionTitle.findById(id)
  if (!doc) notFound()
  const title = serializeTitle(doc)
  const assets = await getAssetsForTitle(title._id)

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <div>
        <h2 className="text-lg font-semibold">Edit title</h2>
        <p className="text-sm text-muted-foreground">{title.slug}</p>
      </div>
      <TitleEditor mode="edit" initialTitle={title} />
      <TitleAssetsManager title={title} assets={assets} />
    </div>
  )
}
