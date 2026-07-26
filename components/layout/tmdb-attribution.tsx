import Image from "next/image"

import { cn } from "@/lib/utils"

/**
 * TMDB attribution required by their API terms: logo plus the exact line
 * "This product uses the TMDB API but is not endorsed or certified by TMDB."
 * Rendered in the site footer and on every admin surface showing TMDB data.
 */
export function TmdbAttribution({ className }: { className?: string }) {
  return (
    <div
      data-testid="tmdb-attribution"
      className={cn("flex items-center gap-2.5", className)}
    >
      <Image
        src="/tmdb-logo.svg"
        alt="TMDB"
        width={40}
        height={16}
        className="h-4 w-10 shrink-0"
        // Raw static asset — the image optimizer rejects SVG without dangerouslyAllowSVG
        unoptimized
      />
      <p className="text-[11px] leading-snug text-muted-foreground">
        This product uses the TMDB API but is not endorsed or certified by TMDB.
      </p>
    </div>
  )
}
