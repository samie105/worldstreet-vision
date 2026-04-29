"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  React.useEffect(() => {
    console.error("[vision/global-error]", error)
  }, [error])

  return (
    <div className="vision-stage flex min-h-dvh items-center justify-center px-4 text-center">
      <div className="max-w-md">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
          Something went wrong
        </p>
        <h1 className="mt-2 text-2xl font-semibold">We couldn’t load this page</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {error.message || "An unexpected error occurred. Try again in a moment."}
        </p>
        {error.digest ? (
          <p className="mt-1 font-mono text-[11px] text-muted-foreground/70">{error.digest}</p>
        ) : null}
        <div className="mt-4 flex justify-center gap-2">
          <Button onClick={reset}>Try again</Button>
          <Button variant="outline" onClick={() => (window.location.href = "/")}>Go home</Button>
        </div>
      </div>
    </div>
  )
}
