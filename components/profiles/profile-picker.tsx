"use client"

import * as React from "react"
import Image from "next/image"
import { motion, AnimatePresence } from "motion/react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Add01Icon, Edit02Icon, CheckmarkCircle02Icon, Cancel01Icon } from "@hugeicons/core-free-icons"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useViewerProfiles, type VisionViewerProfile } from "@/lib/profiles/store"
import { PROFILE_ART_IMAGES } from "@/lib/profiles/avatar-art"

const AVATAR_COLORS = [
  "#292524",
  "#1e293b",
  "#14532d",
  "#7c2d12",
  "#4c1d95",
  "#831843",
  "#0c4a6e",
  "#164e63",
]

export function ProfilePicker() {
  const { profiles, selectProfile, addProfile, updateProfile, removeProfile } = useViewerProfiles()
  const [editing, setEditing] = React.useState(false)
  const [creating, setCreating] = React.useState(false)
  const [editingProfile, setEditingProfile] = React.useState<VisionViewerProfile | null>(null)

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 vision-stage opacity-90" />
      <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-col items-center gap-8 px-6 py-16 text-center">
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="text-balance text-3xl font-semibold tracking-tight text-white md:text-5xl"
        >
          Who&apos;s watching?
        </motion.h1>

        <motion.div
          layout
          className="grid w-full grid-cols-3 gap-4 sm:grid-cols-4 md:gap-8"
        >
          <AnimatePresence mode="popLayout">
            {profiles.map((profile) => (
              <motion.div
                key={profile.id}
                layout
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="flex flex-col items-center gap-3"
              >
                <button
                  data-testid="viewer-profile"
                  data-profile-id={profile.id}
                  onClick={() => {
                    if (editing) {
                      setEditingProfile(profile)
                    } else {
                      selectProfile(profile.id)
                    }
                  }}
                  className={cn(
                    "group relative size-24 overflow-hidden rounded-2xl border-2 border-transparent shadow-2xl transition-all md:size-32",
                    editing && "animate-pulse",
                    "hover:border-white",
                  )}
                  style={{ background: profile.avatarColor }}
                  aria-label={`Watch as ${profile.name}`}
                >
                  <Image
                    src={profile.avatarImageUrl}
                    alt=""
                    fill
                    sizes="(max-width: 768px) 96px, 128px"
                    className="object-cover"
                  />
                  {editing ? (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-white">
                      <HugeiconsIcon icon={Edit02Icon} strokeWidth={2} className="size-6" />
                    </span>
                  ) : null}
                </button>
                <p className="text-sm font-medium text-white/90">{profile.name}</p>
                {profile.isKid ? (
                  <span className="rounded-full bg-credit-chip px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-credit">
                    Kids
                  </span>
                ) : null}
              </motion.div>
            ))}
          </AnimatePresence>

          {profiles.length < 5 ? (
            <motion.button
              layout
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              onClick={() => setCreating(true)}
              className="flex flex-col items-center gap-3 text-white/80 hover:text-white"
            >
              <span className="flex size-24 items-center justify-center rounded-2xl border-2 border-dashed border-white/40 bg-white/[0.03] text-white/70 hover:border-white md:size-32">
                <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="size-7" />
              </span>
              <p className="text-sm font-medium">Add profile</p>
            </motion.button>
          ) : null}
        </motion.div>

        <Button
          variant="outline"
          onClick={() => {
            setEditing((value) => !value)
            setEditingProfile(null)
          }}
          className="rounded-full bg-transparent text-white/80 hover:bg-white/10 hover:text-white"
        >
          {editing ? "Done" : "Manage profiles"}
        </Button>
      </div>

      <AnimatePresence>
        {(creating || editingProfile) && (
          <ProfileEditor
            initial={editingProfile ?? null}
            onClose={() => {
              setCreating(false)
              setEditingProfile(null)
            }}
            onSubmit={(values) => {
              if (editingProfile) {
                updateProfile(editingProfile.id, values)
              } else {
                addProfile(values)
              }
              setCreating(false)
              setEditingProfile(null)
            }}
            onDelete={
              editingProfile && profiles.length > 1
                ? () => {
                    removeProfile(editingProfile.id)
                    setEditingProfile(null)
                  }
                : undefined
            }
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function ProfileEditor({
  initial,
  onClose,
  onSubmit,
  onDelete,
}: {
  initial: VisionViewerProfile | null
  onClose: () => void
  onSubmit: (values: Omit<VisionViewerProfile, "id">) => void
  onDelete?: () => void
}) {
  const [name, setName] = React.useState(initial?.name ?? "")
  const [color, setColor] = React.useState(initial?.avatarColor ?? AVATAR_COLORS[0])
  const [avatarImageUrl, setAvatarImageUrl] = React.useState(
    initial?.avatarImageUrl ?? PROFILE_ART_IMAGES[0]!,
  )
  const [isKid, setIsKid] = React.useState(initial?.isKid ?? false)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-20 flex items-center justify-center bg-black/65 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        onClick={(e) => e.stopPropagation()}
        className="mx-4 w-full max-w-md overflow-hidden rounded-2xl border border-border/40 bg-card text-foreground shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-border/40 px-5 py-3">
          <p className="text-sm font-semibold">{initial ? "Edit profile" : "New profile"}</p>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
          </Button>
        </header>
        <div className="space-y-4 p-5">
          <div className="flex items-center gap-4">
            <div
              className="relative size-20 shrink-0 overflow-hidden rounded-2xl"
              style={{ background: color }}
            >
              <Image
                src={avatarImageUrl}
                alt=""
                fill
                sizes="80px"
                className="object-cover"
              />
            </div>
            <div className="flex-1">
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Name
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Profile name"
                maxLength={24}
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Avatar color
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              {AVATAR_COLORS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setColor(value)}
                  className={cn(
                    "size-7 rounded-full border-2 transition",
                    color === value ? "border-foreground" : "border-transparent",
                  )}
                  style={{ background: value }}
                  aria-label={`Pick ${value}`}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Portrait
            </label>
            <div className="mt-2 grid grid-cols-5 gap-2 sm:grid-cols-6">
              {PROFILE_ART_IMAGES.map((url) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => setAvatarImageUrl(url)}
                  className={cn(
                    "relative aspect-square overflow-hidden rounded-lg border-2 transition",
                    avatarImageUrl === url ? "border-primary ring-1 ring-primary" : "border-border",
                  )}
                  aria-label="Select portrait"
                >
                  <Image src={url} alt="" fill sizes="64px" className="object-cover" />
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isKid}
              onChange={(e) => setIsKid(e.target.checked)}
              className="size-4 rounded border-border"
            />
            Kids profile (mature content blocked)
          </label>
        </div>
        <footer className="flex items-center justify-between border-t border-border/40 px-5 py-3">
          {onDelete ? (
            <Button variant="destructive" size="sm" onClick={onDelete}>
              Delete profile
            </Button>
          ) : (
            <span />
          )}
          <Button
            size="sm"
            onClick={() =>
              onSubmit({
                name: name.trim() || "Viewer",
                avatarColor: color,
                avatarImageUrl,
                isKid,
              })
            }
            disabled={!name.trim()}
          >
            <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} />
            Save
          </Button>
        </footer>
      </motion.div>
    </motion.div>
  )
}
