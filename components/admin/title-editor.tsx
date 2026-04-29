"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  createTitle,
  deleteTitle,
  updateTitle,
  type TitleInput,
} from "@/lib/actions/catalog"
import type { CatalogTitle } from "@/lib/catalog/types"

type EditorMode = "create" | "edit"

interface TitleEditorProps {
  mode: EditorMode
  initialTitle?: CatalogTitle
}

const STATUSES: CatalogTitle["status"][] = ["draft", "scheduled", "published", "archived"]
const RATINGS: CatalogTitle["maturityRating"][] = ["g", "pg", "pg13", "r"]

export function TitleEditor({ mode, initialTitle }: TitleEditorProps) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)

  const [form, setForm] = React.useState<TitleInput>(() => ({
    title: initialTitle?.title ?? "",
    tagline: initialTitle?.tagline ?? "",
    synopsis: initialTitle?.synopsis ?? "",
    slug: initialTitle?.slug ?? "",
    genres: initialTitle?.genres ?? [],
    tags: initialTitle?.tags ?? [],
    cast: initialTitle?.cast ?? [],
    director: initialTitle?.director ?? "",
    releaseYear: initialTitle?.releaseYear ?? new Date().getFullYear(),
    durationSeconds: initialTitle?.durationSeconds ?? 0,
    maturityRating: initialTitle?.maturityRating ?? "pg13",
    status: initialTitle?.status ?? "draft",
    publishAt: initialTitle?.publishAt ?? null,
    posterUrl: initialTitle?.posterUrl ?? "",
    backdropUrl: initialTitle?.backdropUrl ?? "",
    weight: initialTitle?.weight ?? 0,
  }))

  const update = <K extends keyof TitleInput>(key: K, value: TitleInput[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      const action = mode === "create"
        ? () => createTitle(form)
        : () => updateTitle(initialTitle!._id, form)
      const result = await action()
      if (!result.success || !result.data) {
        setError(result.error ?? "Failed to save")
        return
      }
      if (mode === "create") {
        router.push(`/admin/catalog/${result.data._id}`)
      } else {
        router.refresh()
      }
    })
  }

  const handleDelete = () => {
    if (!initialTitle) return
    if (!confirm(`Delete “${initialTitle.title}”? This cannot be undone.`)) return
    startTransition(async () => {
      const result = await deleteTitle(initialTitle._id)
      if (result.success) {
        router.push("/admin/catalog")
        router.refresh()
      } else {
        setError(result.error ?? "Failed to delete")
      }
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-5 rounded-xl border border-border/60 bg-card p-5"
    >
      <Field label="Title">
        <Input value={form.title} onChange={(e) => update("title", e.target.value)} required />
      </Field>
      <Field label="Tagline">
        <Input value={form.tagline ?? ""} onChange={(e) => update("tagline", e.target.value)} />
      </Field>
      <Field label="Synopsis">
        <textarea
          value={form.synopsis ?? ""}
          onChange={(e) => update("synopsis", e.target.value)}
          rows={4}
          className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
        />
      </Field>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Slug" hint="Auto-generated from title if left blank.">
          <Input value={form.slug ?? ""} onChange={(e) => update("slug", e.target.value)} />
        </Field>
        <Field label="Director">
          <Input value={form.director ?? ""} onChange={(e) => update("director", e.target.value)} />
        </Field>
        <Field label="Genres" hint="Comma-separated">
          <Input
            value={form.genres.join(", ")}
            onChange={(e) => update("genres", splitCsv(e.target.value))}
          />
        </Field>
        <Field label="Tags" hint="Comma-separated">
          <Input
            value={form.tags.join(", ")}
            onChange={(e) => update("tags", splitCsv(e.target.value))}
          />
        </Field>
        <Field label="Cast" hint="Comma-separated">
          <Input
            value={form.cast.join(", ")}
            onChange={(e) => update("cast", splitCsv(e.target.value))}
          />
        </Field>
        <Field label="Release year">
          <Input
            type="number"
            value={form.releaseYear ?? ""}
            onChange={(e) => update("releaseYear", Number(e.target.value) || undefined)}
          />
        </Field>
        <Field label="Duration (seconds)">
          <Input
            type="number"
            value={form.durationSeconds ?? 0}
            onChange={(e) => update("durationSeconds", Number(e.target.value) || 0)}
          />
        </Field>
        <Field label="Sort weight" hint="Higher comes first on rails.">
          <Input
            type="number"
            value={form.weight ?? 0}
            onChange={(e) => update("weight", Number(e.target.value) || 0)}
          />
        </Field>
        <Field label="Maturity rating">
          <Select
            value={form.maturityRating ?? "pg13"}
            options={RATINGS.map((r) => ({ value: r, label: r.toUpperCase() }))}
            onChange={(value) => update("maturityRating", value as TitleInput["maturityRating"])}
          />
        </Field>
        <Field label="Status">
          <Select
            value={form.status ?? "draft"}
            options={STATUSES.map((s) => ({ value: s, label: s }))}
            onChange={(value) => update("status", value as TitleInput["status"])}
          />
        </Field>
        <Field label="Publish at">
          <Input
            type="datetime-local"
            value={form.publishAt ? toLocalInput(form.publishAt) : ""}
            onChange={(e) =>
              update("publishAt", e.target.value ? new Date(e.target.value).toISOString() : null)
            }
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Poster URL">
          <Input value={form.posterUrl ?? ""} onChange={(e) => update("posterUrl", e.target.value)} />
        </Field>
        <Field label="Backdrop URL">
          <Input value={form.backdropUrl ?? ""} onChange={(e) => update("backdropUrl", e.target.value)} />
        </Field>
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button type="submit" disabled={pending} size="sm">
          {pending ? "Saving…" : mode === "create" ? "Create title" : "Save changes"}
        </Button>
        {mode === "edit" && initialTitle ? (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={pending}
          >
            Delete title
          </Button>
        ) : null}
      </div>
    </form>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-center justify-between text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
        {hint ? <span className="text-[10px] normal-case text-muted-foreground/70">{hint}</span> : null}
      </span>
      {children}
    </label>
  )
}

function Select<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className={cn(
        "h-9 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 dark:bg-input/30",
      )}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value} className="bg-background">
          {option.label}
        </option>
      ))}
    </select>
  )
}

function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

function toLocalInput(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const tz = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - tz).toISOString().slice(0, 16)
}
