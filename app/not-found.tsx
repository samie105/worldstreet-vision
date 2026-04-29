import Link from "next/link"

export default function NotFound() {
  return (
    <div className="vision-stage flex min-h-dvh items-center justify-center px-4 text-center">
      <div className="max-w-md">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">404</p>
        <h1 className="mt-2 text-3xl font-semibold">This title is missing</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you were looking for is no longer available, or it never existed in this universe.
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Back to Vision
        </Link>
      </div>
    </div>
  )
}
