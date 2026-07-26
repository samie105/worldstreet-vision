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
  applyEnrichment,
  getEnrichmentPreview,
  searchMetadataForTitle,
  type EnrichSource,
  type EnrichSourceRef,
  type MetadataCandidate,
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

const SOURCE_LABELS: Record<EnrichSource, string> = {
  tmdb: "TMDB",
  omdb: "OMDb",
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
  /**
   * Providers with an API key on this deploy, resolved server-side. Omit to let
   * the first search discover them (the server picks a default either way).
   */
  sources?: EnrichSource[]
}

/**
 * Per-title metadata enrichment: pick a provider → "Find on TMDB/OMDb" →
 * candidate picker with poster thumbnails → side-by-side current-vs-incoming
 * diff where the admin picks exactly which fields to overwrite. Hand-filled
 * fields default to unchecked so curated copy is never clobbered by accident.
 *
 * Providers are not interchangeable: OMDb has no backdrop and no tagline, so
 * those rows render disabled instead of pretending an empty value is data.
 */
export function TmdbEnrichPanel({ title, sources }: TmdbEnrichPanelProps) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [step, setStep] = React.useState<Step>("candidates")
  const [pending, startTransition] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)
  const [available, setAvailable] = React.useState<EnrichSource[]>(sources ?? [])
  const [source, setSource] = React.useState<EnrichSource>(sources?.[0] ?? "tmdb")
  const [candidates, setCandidates] = React.useState<MetadataCandidate[] | null>(null)
  const [selected, setSelected] = React.useState<MetadataCandidate | null>(null)
  const [incoming, setIncoming] = React.useState<EnrichmentFields | null>(null)
  const [unavailable, setUnavailable] = React.useState<EnrichableField[]>([])
  const [checked, setChecked] = React.useState<Set<EnrichableField>>(new Set())

  const linked = title.tmdbId ? "tmdb" : title.imdbId ? "omdb" : null

  const openAndSearch = () => {
    setOpen(true)
    setStep("candidates")
    setError(null)
    setCandidates(null)
    setSelected(null)
    setIncoming(null)
    startTransition(async () => {
      // Only pin the provider once we know which ones are configured —
      // otherwise let the server pick its default and tell us what it used.
      const result = await searchMetadataForTitle(
        title._id,
        available.length > 0 ? { source } : undefined,
      )
      if (!result.success || !result.data) {
        setError(result.error ?? "Search failed")
        return
      }
      setAvailable(result.data.availableSources)
      setSource(result.data.source)
      setCandidates(result.data.candidates)
    })
  }

  const selectSource = (next: EnrichSource) => {
    if (next === source) return
    setSource(next)
    setError(null)
    setCandidates(null)
    setSelected(null)
    setIncoming(null)
    setStep("candidates")
  }

  const selectCandidate = (candidate: MetadataCandidate) => {
    setError(null)
    setSelected(candidate)
    startTransition(async () => {
      const result = await getEnrichmentPreview(title._id, candidateRef(candidate))
      if (!result.success || !result.data) {
        setError(result.error ?? `Failed to load ${SOURCE_LABELS[candidate.source]} details`)
        return
      }
      setIncoming(result.data.incoming)
      setUnavailable(result.data.unavailableFields)
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
      const result = await applyEnrichment(title._id, candidateRef(selected), [...checked])
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
          <h3 className="text-sm font-semibold">Metadata enrichment</h3>
          <p className="text-xs text-muted-foreground">
            {linked
              ? `Linked to ${linkLabel(title)}. Re-match to pull fresh fields.`
              : `Match this title on ${SOURCE_LABELS[source]} to pull poster, synopsis, cast and more.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {title.tmdbId ? (
            <Badge variant="new" data-testid="tmdb-linked-badge">
              TMDB #{title.tmdbId}
            </Badge>
          ) : null}
          {title.imdbId ? (
            <Badge variant="new" data-testid="omdb-linked-badge">
              IMDb {title.imdbId}
            </Badge>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={openAndSearch}
            data-testid="tmdb-find-button"
          >
            {`${linked ? "Re-match" : "Find"} on ${SOURCE_LABELS[source]}`}
          </Button>
        </div>
      </div>

      <SourcePicker available={available} source={source} onSelect={selectSource} />
      <ProviderAttribution source={source} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85dvh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {step === "candidates"
                ? `Find on ${SOURCE_LABELS[source]}`
                : "Review incoming fields"}
            </DialogTitle>
            <DialogDescription>
              {step === "candidates"
                ? `Candidates for “${title.title}”${title.releaseYear ? ` (${title.releaseYear})` : ""}. Pick the right film — low-confidence matches are never applied automatically.`
                : `Choose which fields to overwrite with ${SOURCE_LABELS[source]} data. Hand-filled fields start unchecked.`}
            </DialogDescription>
          </DialogHeader>

          <SourcePicker available={available} source={source} onSelect={selectSource} inDialog />

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
              source={source}
              onSelect={selectCandidate}
              selectedKey={selected ? candidateKey(selected) : null}
            />
          ) : null}

          {step === "diff" && incoming && selected ? (
            <FieldDiff
              title={title}
              incoming={incoming}
              checked={checked}
              unavailable={unavailable}
              source={selected.source}
              onToggle={toggleField}
            />
          ) : null}

          <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
            <ProviderAttribution source={source} className="max-w-[60%]" />
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

// ── Provider picker ──────────────────────────────────────────────────────────

/** Only ever offers providers that actually have a key on this deploy. */
function SourcePicker({
  available,
  source,
  onSelect,
  inDialog = false,
}: {
  available: EnrichSource[]
  source: EnrichSource
  onSelect: (source: EnrichSource) => void
  inDialog?: boolean
}) {
  if (available.length === 0) return null
  return (
    <div
      className={cn("flex items-center gap-2", inDialog && "pt-1")}
      data-testid="tmdb-source-picker"
    >
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Source
      </span>
      <div className="flex items-center gap-1 rounded-lg border border-border/60 p-0.5">
        {available.map((option) => (
          <button
            key={option}
            type="button"
            data-testid={`tmdb-source-${option}`}
            aria-pressed={option === source}
            onClick={() => onSelect(option)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              option === source
                ? "bg-primary/10 text-foreground"
                : "text-muted-foreground hover:bg-accent",
            )}
          >
            {SOURCE_LABELS[option]}
          </button>
        ))}
      </div>
    </div>
  )
}

/** TMDB's terms require their attribution line — only shown for TMDB data. */
function ProviderAttribution({ source, className }: { source: EnrichSource; className?: string }) {
  if (source === "tmdb") return <TmdbAttribution className={className} />
  return (
    <p
      data-testid="omdb-attribution"
      className={cn("text-[11px] leading-snug text-muted-foreground", className)}
    >
      Metadata from OMDb (omdbapi.com). OMDb has no backdrop or tagline data.
    </p>
  )
}

// ── Candidate picker ─────────────────────────────────────────────────────────

function CandidateList({
  candidates,
  pending,
  source,
  onSelect,
  selectedKey,
}: {
  candidates: MetadataCandidate[] | null
  pending: boolean
  source: EnrichSource
  onSelect: (candidate: MetadataCandidate) => void
  selectedKey: string | null
}) {
  if (pending && candidates === null) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Searching {SOURCE_LABELS[source]}…
      </p>
    )
  }
  if (candidates === null) return null
  if (candidates.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {source === "tmdb"
          ? "No TMDB movies matched this title. Series and originals won’t match — TMDB search covers films only."
          : "No OMDb records matched this title. Originals won’t match — try the other provider or fill the fields by hand."}
      </p>
    )
  }
  return (
    <ul className="flex flex-col gap-2" data-testid="tmdb-candidate-list">
      {candidates.map((candidate) => {
        const key = candidateKey(candidate)
        return (
          <li key={key}>
            <button
              type="button"
              data-testid="tmdb-candidate"
              disabled={pending}
              onClick={() => onSelect(candidate)}
              className={cn(
                "flex w-full items-start gap-3 rounded-lg border border-border/60 p-2.5 text-left transition-colors",
                "hover:bg-accent disabled:opacity-60",
                selectedKey === key && "border-primary/60 bg-primary/5",
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
                  <Badge variant="muted" data-testid="tmdb-candidate-source">
                    {SOURCE_LABELS[candidate.source]}
                    {candidate.mediaType && candidate.mediaType !== "movie"
                      ? ` · ${candidate.mediaType}`
                      : ""}
                  </Badge>
                </div>
                {candidate.originalTitle && candidate.originalTitle !== candidate.title ? (
                  <p className="truncate text-xs text-muted-foreground">
                    Original: {candidate.originalTitle}
                  </p>
                ) : null}
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                  {candidate.overview ||
                    (candidate.imdbId
                      ? `IMDb ${candidate.imdbId} — synopsis loads when you select it.`
                      : "No overview available.")}
                </p>
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

// ── Field diff ───────────────────────────────────────────────────────────────

function FieldDiff({
  title,
  incoming,
  checked,
  unavailable,
  source,
  onToggle,
}: {
  title: CatalogTitle
  incoming: EnrichmentFields
  checked: Set<EnrichableField>
  unavailable: EnrichableField[]
  source: EnrichSource
  onToggle: (field: EnrichableField) => void
}) {
  return (
    <div className="flex flex-col gap-1.5" data-testid="tmdb-field-diff">
      <div className="grid grid-cols-[1.25rem_7rem_1fr_1fr] items-center gap-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span />
        <span>Field</span>
        <span>Current</span>
        <span>From {SOURCE_LABELS[source]}</span>
      </div>
      {ENRICHABLE_FIELDS.map((field) => {
        const unsupported = unavailable.includes(field)
        const incomingEmpty = !hasValue(incoming[field])
        const disabled = unsupported || incomingEmpty
        const isChecked = checked.has(field)
        return (
          <label
            key={field}
            className={cn(
              "grid grid-cols-[1.25rem_7rem_1fr_1fr] items-start gap-2 rounded-lg border border-border/60 p-2",
              disabled ? "opacity-50" : "cursor-pointer hover:bg-accent/40",
              isChecked && !disabled && "border-primary/50 bg-primary/5",
            )}
          >
            <input
              type="checkbox"
              checked={isChecked}
              disabled={disabled}
              onChange={() => onToggle(field)}
              data-testid={`tmdb-field-${field}`}
              className="mt-0.5 size-3.5 accent-[var(--primary)]"
            />
            <span className="pt-0.5 text-xs font-medium">{FIELD_LABELS[field]}</span>
            <FieldValue field={field} value={currentValue(title, field)} />
            {unsupported ? (
              <span
                data-testid={`tmdb-field-unavailable-${field}`}
                className="text-xs text-muted-foreground/70"
              >
                not available from {SOURCE_LABELS[source]}
              </span>
            ) : (
              <FieldValue field={field} value={incoming[field]} incoming />
            )}
          </label>
        )
      })}
      <p className="px-1 pt-1 text-[11px] text-muted-foreground">
        Unchecked fields keep their current values. Empty {SOURCE_LABELS[source]} fields can’t be
        applied.
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

/** Stable identity for a candidate across both providers. */
function candidateKey(candidate: MetadataCandidate): string {
  return candidate.source === "tmdb" ? `tmdb:${candidate.tmdbId}` : `omdb:${candidate.imdbId}`
}

function candidateRef(candidate: MetadataCandidate): EnrichSourceRef {
  return candidate.source === "tmdb"
    ? { source: "tmdb", tmdbId: candidate.tmdbId }
    : { source: "omdb", imdbId: candidate.imdbId }
}

function linkLabel(title: CatalogTitle): string {
  const parts: string[] = []
  if (title.tmdbId) parts.push(`TMDB #${title.tmdbId}`)
  if (title.imdbId) parts.push(`IMDb ${title.imdbId}`)
  return parts.join(" and ")
}

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
 * Fields default to checked only when the current value is empty and the
 * provider has something to offer — hand-filled fields always start unchecked,
 * and fields the provider cannot supply are empty so they stay unchecked too.
 */
function defaultChecked(title: CatalogTitle, incoming: EnrichmentFields): Set<EnrichableField> {
  const next = new Set<EnrichableField>()
  for (const field of ENRICHABLE_FIELDS) {
    if (!hasValue(currentValue(title, field)) && hasValue(incoming[field])) {
      next.add(field)
    }
  }
  return next
}
