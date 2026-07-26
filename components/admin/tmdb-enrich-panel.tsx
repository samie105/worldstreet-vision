"use client"

import * as React from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"

import { cn, formatDuration } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { TmdbAttribution } from "@/components/layout/tmdb-attribution"
import {
  applyTmdbEnrichment,
  getTmdbEnrichmentPreview,
  searchTmdbForTitle,
  type TmdbCandidate,
} from "@/lib/actions/catalog-enrich"
import {
  ENRICHABLE_FIELDS,
  type EnrichableField,
  type EnrichmentFields,
  type MatchConfidence,
} from "@/lib/tmdb/match"
import type { CatalogTitle } from "@/lib/catalog/types"

const CONFIDENCE_VARIANT: Record<MatchConfidence, React.ComponentProps<typeof Badge>["variant"]> = {
  high: "new",
  medium: "outline",
  low: "muted",
}

const FIELD_LABELS: Record<EnrichableField, string> = {
  posterUrl: "Poster",
  backdropUrl: "Backdrop",
  synopsis: "Synopsis",
  tagline: "Tagline",
  cast: "Cast",
  director: "Director",
  genres: "Genres",
  durationSeconds: "Runtime",
  maturityRating: "Certification",
  releaseYear: "Release year",
}

type Step = "candidates" | "diff"

interface TmdbEnrichPanelProps {
  title: CatalogTitle
}

/**
 * Per-title TMDB enrichment: "Find on TMDB" → candidate picker with poster
 * thumbnails → side-by-side current-vs-incoming diff where the admin picks
 * exactly which fields to overwrite. Hand-filled fields default to unchecked
 * so curated copy is never clobbered by accident.
 */
export function TmdbEnrichPanel({ title }: TmdbEnrichPanelProps) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [step, setStep] = React.useState<Step>("candidates")
  const [pending, startTransition] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)
  const [candidates, setCandidates] = React.useState<TmdbCandidate[] | null>(null)
  const [selected, setSelected] = React.useState<TmdbCandidate | null>(null)
  const [incoming, setIncoming] = React.useState<EnrichmentFields | null>(null)
  const [checked, setChecked] = React.useState<Set<EnrichableField>>(new Set())

  const openAndSearch = () => {
    setOpen(true)
    setStep("candidates")
    setError(null)
    setCandidates(null)
    setSelected(null)
    setIncoming(null)
    startTransition(async () => {
      const result = await searchTmdbForTitle(title._id)
      if (!result.success || !result.data) {
        setError(result.error ?? "Search failed")
        return
      }
      setCandidates(result.data.candidates)
    })
  }

  const selectCandidate = (candidate: TmdbCandidate) => {
    setError(null)
    setSelected(candidate)
    startTransition(async () => {
      const result = await getTmdbEnrichmentPreview(title._id, candidate.tmdbId)
      if (!result.success || !result.data) {
        setError(result.error ?? "Failed to load TMDB details")
        return
      }
      setIncoming(result.data.incoming)
      setChecked(defaultChecked(title, result.data.incoming))
      setStep("diff")
    })
  }

  const toggleField = (field: EnrichableField) => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(field)) next.delete(field)
      else next.add(field)
      return next
    })
  }

  const apply = () => {
    if (!selected) return
    setError(null)
    startTransition(async () => {
      const result = await applyTmdbEnrichment(title._id, selected.tmdbId, [...checked])
      if (!result.success) {
        setError(result.error ?? "Failed to apply enrichment")
        return
      }
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <section
      data-testid="tmdb-enrich-panel"
      className="flex flex-col gap-4 rounded-xl border border-border/60 bg-card p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">TMDB metadata</h3>
          <p className="text-xs text-muted-foreground">
            {title.tmdbId
              ? `Linked to TMDB #${title.tmdbId}. Re-match to pull fresh fields.`
              : "Match this title to TMDB to pull poster, backdrop, synopsis, cast and more."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {title.tmdbId ? (
            <Badge variant="new" data-testid="tmdb-linked-badge">
              TMDB #{title.tmdbId}
            </Badge>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={openAndSearch}
            data-testid="tmdb-find-button"
          >
            {title.tmdbId ? "Re-match on TMDB" : "Find on TMDB"}
          </Button>
        </div>
      </div>
      <TmdbAttribution />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85dvh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {step === "candidates" ? "Find on TMDB" : "Review incoming fields"}
            </DialogTitle>
            <DialogDescription>
              {step === "candidates"
                ? `Candidates for “${title.title}”${title.releaseYear ? ` (${title.releaseYear})` : ""}. Pick the right film — low-confidence matches are never applied automatically.`
                : `Choose which fields to overwrite with TMDB data. Hand-filled fields start unchecked.`}
            </DialogDescription>
          </DialogHeader>

          {error ? (
            <p
              data-testid="tmdb-error"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              {error}
            </p>
          ) : null}

          {step === "candidates" ? (
            <CandidateList
              candidates={candidates}
              pending={pending}
              onSelect={selectCandidate}
              selectedId={selected?.tmdbId ?? null}
            />
          ) : null}

          {step === "diff" && incoming && selected ? (
            <FieldDiff
              title={title}
              incoming={incoming}
              checked={checked}
              onToggle={toggleField}
            />
          ) : null}

          <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
            <TmdbAttribution className="max-w-[60%]" />
            <div className="flex items-center gap-2">
              {step === "diff" ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => {
                      setStep("candidates")
                      setError(null)
                    }}
                    data-testid="tmdb-back-button"
                  >
                    Back
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={pending || checked.size === 0}
                    onClick={apply}
                    data-testid="tmdb-apply-button"
                  >
                    {pending
                      ? "Applying…"
                      : `Apply ${checked.size} field${checked.size === 1 ? "" : "s"}`}
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}

// ── Candidate picker ─────────────────────────────────────────────────────────

function CandidateList({
  candidates,
  pending,
  onSelect,
  selectedId,
}: {
  candidates: TmdbCandidate[] | null
  pending: boolean
  onSelect: (candidate: TmdbCandidate) => void
  selectedId: number | null
}) {
  if (pending && candidates === null) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Searching TMDB…</p>
  }
  if (candidates === null) return null
  if (candidates.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No TMDB movies matched this title. Series and originals won&apos;t match — TMDB search
        covers films only.
      </p>
    )
  }
  return (
    <ul className="flex flex-col gap-2" data-testid="tmdb-candidate-list">
      {candidates.map((candidate) => (
        <li key={candidate.tmdbId}>
          <button
            type="button"
            data-testid="tmdb-candidate"
            disabled={pending}
            onClick={() => onSelect(candidate)}
            className={cn(
              "flex w-full items-start gap-3 rounded-lg border border-border/60 p-2.5 text-left transition-colors",
              "hover:bg-accent disabled:opacity-60",
              selectedId === candidate.tmdbId && "border-primary/60 bg-primary/5",
            )}
          >
            <div className="relative h-[69px] w-[46px] shrink-0 overflow-hidden rounded-md bg-muted">
              {candidate.posterThumbUrl ? (
                <Image
                  src={candidate.posterThumbUrl}
                  alt=""
                  fill
                  sizes="46px"
                  className="object-cover"
                  unoptimized
                />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-medium">{candidate.title}</span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {candidate.year ?? "—"}
                </span>
                <Badge variant={CONFIDENCE_VARIANT[candidate.confidence]}>
                  {candidate.confidence} · {candidate.score.toFixed(2)}
                </Badge>
              </div>
              {candidate.originalTitle && candidate.originalTitle !== candidate.title ? (
                <p className="truncate text-xs text-muted-foreground">
                  Original: {candidate.originalTitle}
                </p>
              ) : null}
              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                {candidate.overview || "No overview available."}
              </p>
            </div>
          </button>
        </li>
      ))}
    </ul>
  )
}

// ── Field diff ───────────────────────────────────────────────────────────────

function FieldDiff({
  title,
  incoming,
  checked,
  onToggle,
}: {
  title: CatalogTitle
  incoming: EnrichmentFields
  checked: Set<EnrichableField>
  onToggle: (field: EnrichableField) => void
}) {
  return (
    <div className="flex flex-col gap-1.5" data-testid="tmdb-field-diff">
      <div className="grid grid-cols-[1.25rem_7rem_1fr_1fr] items-center gap-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span />
        <span>Field</span>
        <span>Current</span>
        <span>From TMDB</span>
      </div>
      {ENRICHABLE_FIELDS.map((field) => {
        const incomingEmpty = !hasValue(incoming[field])
        const isChecked = checked.has(field)
        return (
          <label
            key={field}
            className={cn(
              "grid grid-cols-[1.25rem_7rem_1fr_1fr] items-start gap-2 rounded-lg border border-border/60 p-2",
              incomingEmpty ? "opacity-50" : "cursor-pointer hover:bg-accent/40",
              isChecked && !incomingEmpty && "border-primary/50 bg-primary/5",
            )}
          >
            <input
              type="checkbox"
              checked={isChecked}
              disabled={incomingEmpty}
              onChange={() => onToggle(field)}
              data-testid={`tmdb-field-${field}`}
              className="mt-0.5 size-3.5 accent-[var(--primary)]"
            />
            <span className="pt-0.5 text-xs font-medium">{FIELD_LABELS[field]}</span>
            <FieldValue field={field} value={currentValue(title, field)} />
            <FieldValue field={field} value={incoming[field]} incoming />
          </label>
        )
      })}
      <p className="px-1 pt-1 text-[11px] text-muted-foreground">
        Unchecked fields keep their current values. Empty TMDB fields can&apos;t be applied.
      </p>
    </div>
  )
}

function FieldValue({
  field,
  value,
  incoming = false,
}: {
  field: EnrichableField
  value: unknown
  incoming?: boolean
}) {
  if (!hasValue(value)) {
    return <span className="text-xs text-muted-foreground/60">—</span>
  }
  if (field === "posterUrl") {
    return (
      <span className="relative block h-[72px] w-12 overflow-hidden rounded-md bg-muted">
        <Image src={String(value)} alt="" fill sizes="48px" className="object-cover" unoptimized />
      </span>
    )
  }
  if (field === "backdropUrl") {
    return (
      <span className="relative block h-[45px] w-20 overflow-hidden rounded-md bg-muted">
        <Image src={String(value)} alt="" fill sizes="80px" className="object-cover" unoptimized />
      </span>
    )
  }
  if (field === "durationSeconds") {
    return <span className="text-xs tabular-nums">{formatDuration(Number(value))}</span>
  }
  if (field === "maturityRating") {
    return <span className="text-xs uppercase">{String(value)}</span>
  }
  if (Array.isArray(value)) {
    return <span className={cn("line-clamp-2 text-xs", incoming && "text-foreground")}>{value.join(", ")}</span>
  }
  return <span className={cn("line-clamp-3 text-xs", incoming && "text-foreground")}>{String(value)}</span>
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function currentValue(title: CatalogTitle, field: EnrichableField): unknown {
  switch (field) {
    case "posterUrl":
      return title.posterUrl
    case "backdropUrl":
      return title.backdropUrl
    case "synopsis":
      return title.synopsis
    case "tagline":
      return title.tagline
    case "cast":
      return title.cast
    case "director":
      return title.director
    case "genres":
      return title.genres
    case "durationSeconds":
      return title.durationSeconds
    case "maturityRating":
      return title.maturityRating
    case "releaseYear":
      return title.releaseYear
  }
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === "string") return value.trim() !== ""
  if (typeof value === "number") return value !== 0
  if (Array.isArray(value)) return value.length > 0
  return true
}

/**
 * Fields default to checked only when the current value is empty and TMDB has
 * something to offer — hand-filled fields always start unchecked.
 */
function defaultChecked(
  title: CatalogTitle,
  incoming: EnrichmentFields,
): Set<EnrichableField> {
  const next = new Set<EnrichableField>()
  for (const field of ENRICHABLE_FIELDS) {
    if (!hasValue(currentValue(title, field)) && hasValue(incoming[field])) {
      next.add(field)
    }
  }
  return next
}
