"use client"

import * as React from "react"
import Image from "next/image"
import { motion } from "motion/react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Add01Icon, Edit02Icon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/components/auth-provider"
import { useProfile } from "@/components/profile-provider"
import { useViewerProfiles } from "@/lib/profiles/store"
import { PROFILE_ART_IMAGES } from "@/lib/profiles/avatar-art"
import { cn } from "@/lib/utils"

export default function SettingsPage() {
  const { user, signOut } = useAuth()
  const { profile, updateProfile } = useProfile()
  const {
    profiles,
    activeProfileId,
    selectProfile,
    clearActive,
    addProfile,
    updateProfile: updateViewer,
    removeProfile,
  } = useViewerProfiles()

  const [pending, setPending] = React.useState(false)
  const [displayName, setDisplayName] = React.useState<string | null>(null)
  const displayNameValue = displayName ?? profile?.displayName ?? ""

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPending(true)
    try {
      await updateProfile({ displayName: displayNameValue })
    } finally {
      setPending(false)
    }
  }

  const setPreference = (
    key: keyof NonNullable<typeof profile>["preferences"],
    value: unknown,
  ) => updateProfile({ preferences: { [key]: value } as Record<string, unknown> })

  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 md:px-8">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Account</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Personalise Vision for your taste. Changes save automatically where possible.
        </p>
      </header>

      <section
        id="profiles"
        className="mb-6 flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-5"
      >
        <header className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Viewer profiles</h2>
            <p className="text-xs text-muted-foreground">
              Up to 5 profiles share your subscription. Each has its own list and recommendations.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() =>
              void addProfile({
                name: `Viewer ${profiles.length + 1}`,
                avatarColor: "#1e293b",
                avatarImageUrl:
                  PROFILE_ART_IMAGES[profiles.length % PROFILE_ART_IMAGES.length]!,
                isKid: false,
              })
            }
            disabled={profiles.length >= 5}
          >
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="size-4" />
            Add profile
          </Button>
        </header>
        <ul className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          {profiles.map((p) => (
            <motion.li
              key={p.id}
              layout
              className={cn(
                "flex items-center gap-3 rounded-lg border bg-background p-3",
                p.id === activeProfileId ? "border-primary" : "border-border",
              )}
            >
              <span
                className="relative flex size-12 shrink-0 overflow-hidden rounded-md"
                style={{ background: p.avatarColor }}
                aria-hidden
              >
                <Image src={p.avatarImageUrl} alt="" fill sizes="48px" className="object-cover" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {p.isKid ? "Kids profile" : "Adult"}
                </p>
              </div>
              <div className="flex flex-col gap-1">
                {activeProfileId === p.id ? (
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                    Active
                  </span>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => selectProfile(p.id)}>
                    Use
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    void updateViewer(p.id, {
                      name: window.prompt("Profile name", p.name) || p.name,
                    })
                  }
                >
                  <HugeiconsIcon icon={Edit02Icon} strokeWidth={2} className="size-3.5" />
                  Rename
                </Button>
                {profiles.length > 1 ? (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      if (window.confirm(`Delete profile "${p.name}"?`)) void removeProfile(p.id)
                    }}
                  >
                    Delete
                  </Button>
                ) : null}
              </div>
            </motion.li>
          ))}
        </ul>
        <Button
          variant="outline"
          size="sm"
          onClick={() => clearActive()}
          className="self-start"
          data-testid="switch-profile"
        >
          Switch profile
        </Button>
      </section>

      <form
        onSubmit={handleSave}
        className="mb-6 flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-5"
      >
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Display name
          </label>
          <Input value={displayNameValue} onChange={(e) => setDisplayName(e.target.value)} />
          <p className="text-xs text-muted-foreground">
            Shown to friends in watch parties and on your profile menu.
          </p>
        </div>
        <Button size="sm" type="submit" disabled={pending} className="self-start">
          {pending ? "Saving…" : "Save"}
        </Button>
      </form>

      <section className="mb-6 flex flex-col gap-2 rounded-xl border border-border/60 bg-card p-5">
        <h2 className="text-sm font-semibold">Playback preferences</h2>
        <Toggle
          label="Auto-play previews on hover"
          value={profile?.preferences.autoplayPreviews ?? true}
          onChange={(value) => setPreference("autoplayPreviews", value)}
        />
        <Toggle
          label="Captions on by default"
          value={profile?.preferences.captionsByDefault ?? false}
          onChange={(value) => setPreference("captionsByDefault", value)}
        />
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm">Preferred quality</p>
            <p className="text-xs text-muted-foreground">Vision will fall back when bandwidth dips.</p>
          </div>
          <select
            value={profile?.preferences.preferredQuality ?? "auto"}
            onChange={(e) => setPreference("preferredQuality", e.target.value)}
            className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30"
          >
            <option value="auto">Auto</option>
            <option value="1080p">1080p</option>
            <option value="720p">720p</option>
            <option value="480p">480p</option>
          </select>
        </div>
      </section>

      <section className="rounded-xl border border-border/60 bg-card p-5">
        <h2 className="text-sm font-semibold">Account</h2>
        <p className="mt-1 text-xs text-muted-foreground">{user?.email}</p>
        <Button onClick={() => signOut()} variant="destructive" size="sm" className="mt-4">
          Sign out
        </Button>
      </section>
    </div>
  )
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between gap-3 py-1 text-sm">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
          value ? "bg-primary" : "bg-muted"
        }`}
      >
        <span
          className={`inline-block size-4 rounded-full bg-background shadow transition-transform ${
            value ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
    </label>
  )
}
