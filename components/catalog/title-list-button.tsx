"use client"

import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Bookmark01Icon, Tick02Icon } from "@hugeicons/core-free-icons"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useProfile } from "@/components/profile-provider"

interface TitleListButtonProps {
  titleId: string
  className?: string
}

export function TitleListButton({ titleId, className }: TitleListButtonProps) {
  const { profile, toggleMyList } = useProfile()
  const [pending, setPending] = React.useState(false)
  const inList = profile?.myList?.includes(titleId) ?? false

  const onClick = async () => {
    setPending(true)
    try {
      await toggleMyList(titleId)
    } finally {
      setPending(false)
    }
  }

  return (
    <Button
      onClick={onClick}
      variant="outline"
      size="lg"
      disabled={pending}
      className={cn("rounded-full", className)}
    >
      <HugeiconsIcon
        icon={inList ? Tick02Icon : Bookmark01Icon}
        strokeWidth={2}
        className="size-4"
      />
      {inList ? "In My List" : "My List"}
    </Button>
  )
}
