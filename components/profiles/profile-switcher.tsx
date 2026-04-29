"use client"

import Link from "next/link"
import Image from "next/image"
import { motion } from "motion/react"

import { cn } from "@/lib/utils"
import { useViewerProfiles } from "@/lib/profiles/store"

interface ProfileSwitcherProps {
  variant?: "popover" | "card"
}

export function ProfileSwitcher({ variant = "popover" }: ProfileSwitcherProps) {
  const { profiles, activeProfileId, selectProfile, clearActive } = useViewerProfiles()

  return (
    <div
      className={cn(
        variant === "popover" ? "px-1 pb-1 pt-2" : "p-3",
      )}
    >
      <p className="mb-2 px-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        Switch profile
      </p>
      <div className="grid grid-cols-3 gap-2">
        {profiles.map((profile) => (
          <motion.button
            key={profile.id}
            whileHover={{ y: -2 }}
            onClick={() => selectProfile(profile.id)}
            className={cn(
              "group flex flex-col items-center gap-1.5 rounded-md p-1.5 text-center transition",
              "hover:bg-accent",
            )}
          >
            <span
              className={cn(
                "relative flex size-12 overflow-hidden rounded-lg",
                activeProfileId === profile.id && "ring-2 ring-foreground",
              )}
              style={{ background: profile.avatarColor }}
            >
              <Image
                src={profile.avatarImageUrl}
                alt=""
                fill
                sizes="48px"
                className="object-cover"
              />
            </span>
            <span className="text-[11px] font-medium leading-tight">{profile.name}</span>
          </motion.button>
        ))}
      </div>
      <Link
        href="/settings#profiles"
        onClick={() => clearActive()}
        className="mt-2 block rounded-md px-2 py-1.5 text-center text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        Manage profiles
      </Link>
    </div>
  )
}
