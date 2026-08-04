import { SignIn } from "@clerk/nextjs"

import { safeReturnPath } from "@/lib/auth/safe-return-path"

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string }>
}) {
  const sp = await searchParams
  const returnTo = safeReturnPath(sp.redirect_url) ?? "/"
  const signUpHref =
    returnTo !== "/"
      ? `/register?redirect_url=${encodeURIComponent(returnTo)}`
      : "/register"
  return (
    <div className="vision-stage flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
            WorldStreet
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-vision-stage-foreground">
            Vision
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to stream originals and exclusives on Vision.
          </p>
        </div>
        <SignIn
          appearance={{
            elements: {
              card: "bg-card border border-border/40 shadow-2xl",
              footer: "hidden",
            },
          }}
          path="/login"
          routing="path"
          signUpUrl={signUpHref}
          forceRedirectUrl={returnTo}
        />
      </div>
    </div>
  )
}
