import { SignUp } from "@clerk/nextjs"

import { safeReturnPath } from "@/lib/auth/safe-return-path"

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string }>
}) {
  const sp = await searchParams
  const returnTo = safeReturnPath(sp.redirect_url) ?? "/"
  const signInHref =
    returnTo !== "/"
      ? `/login?redirect_url=${encodeURIComponent(returnTo)}`
      : "/login"
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
            Create your account to start streaming on Vision.
          </p>
        </div>
        <SignUp
          appearance={{
            elements: {
              card: "bg-card border border-border/40 shadow-2xl",
              footer: "hidden",
            },
          }}
          path="/register"
          routing="path"
          signInUrl={signInHref}
          forceRedirectUrl={returnTo}
        />
      </div>
    </div>
  )
}
