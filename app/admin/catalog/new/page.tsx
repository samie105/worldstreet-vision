import { TitleEditor } from "@/components/admin/title-editor"

export default function NewTitlePage() {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Create a new title</h2>
        <p className="text-sm text-muted-foreground">
          Save the metadata first, then attach a trailer and main asset from the uploads section.
        </p>
      </div>
      <TitleEditor mode="create" />
    </div>
  )
}
