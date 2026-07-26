import Link from "next/link"

import { TmdbAttribution } from "@/components/layout/tmdb-attribution"

export function SiteFooter() {
  return (
    <footer
      data-testid="site-footer"
      className="border-t border-border/40 bg-background px-4 pb-24 pt-8 md:px-10 md:pb-10"
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold tracking-tight">Worldstreet Vision</p>
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Worldstreet. All rights reserved.
          </p>
          <Link
            href="https://www.themoviedb.org/"
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
          >
            Metadata provided by TMDB
          </Link>
        </div>
        <TmdbAttribution className="max-w-xs" />
      </div>
    </footer>
  )
}
