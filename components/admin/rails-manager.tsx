"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { upsertRail } from "@/lib/actions/catalog"
import type { CatalogRail } from "@/lib/catalog/types"

const RAIL_KINDS: CatalogRail["kind"][] = [
  "manual",
  "trending",
  "newest",
  "continue",
  "genre",
]

export function RailsManager({ initialRails }: { initialRails: CatalogRail[] }) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const [editing, setEditing] = React.useState<CatalogRail | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const onSave = (form: CatalogRail) => {
    setError(null)
    startTransition(async () => {
      const result = await upsertRail(form)
      if (!result.success) {
        setError(result.error ?? "Failed to save")
        return
      }
      setEditing(null)
      router.refresh()
    })
  }

  return (
    <div className="grid gap-4 md:grid-cols-[1fr_360px]">
      <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
        <table className="min-w-full divide-y divide-border/60 text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Label</th>
              <th className="px-3 py-2 text-left">Kind</th>
              <th className="px-3 py-2 text-left">Position</th>
              <th className="px-3 py-2 text-left">Active</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {initialRails.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No rails configured yet.
                </td>
              </tr>
            ) : (
              initialRails.map((rail) => (
                <tr key={rail._id} className="hover:bg-muted/30">
                  <td className="px-3 py-2">
                    <p className="text-sm font-medium">{rail.label}</p>
                    <p className="text-xs text-muted-foreground">{rail.slug}</p>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="muted">{rail.kind}</Badge>
                  </td>
                  <td className="px-3 py-2 text-xs tabular-nums">{rail.position}</td>
                  <td className="px-3 py-2">
                    <Badge variant={rail.isActive ? "new" : "muted"}>
                      {rail.isActive ? "active" : "hidden"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button size="xs" variant="outline" onClick={() => setEditing(rail)}>
                      Edit
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-border/60 bg-card p-4">
        <h3 className="text-sm font-semibold">
          {editing ? `Edit “${editing.label}”` : "New rail"}
        </h3>
        <RailForm
          key={editing?._id ?? "new"}
          initial={editing}
          onCancel={() => setEditing(null)}
          onSave={onSave}
          pending={pending}
        />
        {error ? (
          <p className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  )
}

function RailForm({
  initial,
  onSave,
  onCancel,
  pending,
}: {
  initial: CatalogRail | null
  onSave: (form: CatalogRail) => void
  onCancel: () => void
  pending: boolean
}) {
  const [form, setForm] = React.useState<CatalogRail>(() => ({
    _id: initial?._id ?? "",
    slug: initial?.slug ?? "",
    label: initial?.label ?? "",
    kind: initial?.kind ?? "manual",
    position: initial?.position ?? 100,
    isActive: initial?.isActive ?? true,
    manualSlugs: initial?.manualSlugs ?? [],
    genreFilter: initial?.genreFilter ?? null,
  }))

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSave(form)
      }}
      className="mt-3 flex flex-col gap-2"
    >
      <Input
        value={form.label}
        onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
        placeholder="Label, e.g. Featured tonight"
        required
      />
      <Input
        value={form.slug}
        onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value }))}
        placeholder="Slug (auto if blank)"
      />
      <select
        value={form.kind}
        onChange={(e) =>
          setForm((p) => ({ ...p, kind: e.target.value as CatalogRail["kind"] }))
        }
        className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30"
      >
        {RAIL_KINDS.map((kind) => (
          <option key={kind} value={kind} className="bg-background">
            {kind}
          </option>
        ))}
      </select>
      {form.kind === "manual" ? (
        <textarea
          value={form.manualSlugs.join("\n")}
          onChange={(e) =>
            setForm((p) => ({
              ...p,
              manualSlugs: e.target.value
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean),
            }))
          }
          rows={5}
          placeholder="One title slug per line"
          className="rounded-lg border border-input bg-transparent px-3 py-2 text-sm dark:bg-input/30"
        />
      ) : null}
      {form.kind === "genre" ? (
        <Input
          value={form.genreFilter ?? ""}
          onChange={(e) => setForm((p) => ({ ...p, genreFilter: e.target.value }))}
          placeholder="Genre filter, e.g. Drama"
        />
      ) : null}
      <Input
        type="number"
        value={form.position}
        onChange={(e) => setForm((p) => ({ ...p, position: Number(e.target.value) || 0 }))}
        placeholder="Position"
      />
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={form.isActive}
          onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))}
        />
        Active
      </label>
      <div className="mt-2 flex items-center gap-2">
        <Button size="sm" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save rail"}
        </Button>
        {initial ? (
          <Button size="sm" variant="ghost" type="button" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  )
}
