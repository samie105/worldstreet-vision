import { connectDB } from "@/lib/db/mongodb"
import VisionRail from "@/models/VisionRail"
import { serializeRail } from "@/lib/catalog/serializers"
import { RailsManager } from "@/components/admin/rails-manager"

export const dynamic = "force-dynamic"

async function loadRails() {
  await connectDB()
  const docs = await VisionRail.find({}).sort({ position: 1 })
  return docs.map(serializeRail)
}

export default async function AdminRailsPage() {
  const rails = await loadRails()
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Curate the home page experience. Rails appear in the order set here for every viewer.
      </p>
      <RailsManager initialRails={rails} />
    </div>
  )
}
