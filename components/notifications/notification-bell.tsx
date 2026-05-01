"use client"

import * as React from "react"
import Image from "next/image"
import Link from "next/link"
import { motion, AnimatePresence } from "motion/react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Notification01Icon,
  CheckmarkCircle02Icon,
  SparklesIcon,
  PlayIcon,
  UserMultipleIcon,
  StarIcon,
} from "@hugeicons/core-free-icons"

import { cn, relativeTime } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  buildSeedNotifications,
  type VisionNotification,
  type VisionNotificationKind,
} from "@/lib/notifications/types"
import type { CatalogTitle } from "@/lib/catalog/types"

interface NotificationBellProps {
  recommendations: CatalogTitle[]
  triggerClassName?: string
}

const KIND_ICON: Record<VisionNotificationKind, typeof PlayIcon> = {
  recommendation: SparklesIcon,
  "new-release": StarIcon,
  "watch-party": UserMultipleIcon,
  system: CheckmarkCircle02Icon,
  "continue-watching": PlayIcon,
}

const TONE_CLASS = {
  primary: "bg-primary/15 text-primary",
  info: "bg-sky-500/15 text-sky-400",
  success: "bg-emerald-500/15 text-emerald-400",
  warning: "bg-amber-500/15 text-amber-400",
} as const

export function NotificationBell({ recommendations, triggerClassName }: NotificationBellProps) {
  const [items, setItems] = React.useState<VisionNotification[]>(() =>
    buildSeedNotifications(recommendations),
  )
  const [open, setOpen] = React.useState(false)

  const unread = items.filter((item) => !item.read).length

  const markAllRead = () => {
    setItems((prev) => prev.map((item) => ({ ...item, read: true })))
  }

  const markRead = (id: string) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, read: true } : item)))
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className={cn("relative rounded-full", triggerClassName)}
            aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ""}`}
          />
        }
      >
        <HugeiconsIcon icon={Notification01Icon} strokeWidth={2} className="size-4" />
        {unread > 0 ? (
          <motion.span
            layout
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow-md shadow-rose-900/40"
            aria-hidden
          >
            {unread > 9 ? "9+" : unread}
          </motion.span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={10}
        className={cn(
          "flex min-h-0 w-[min(96vw,420px)] flex-col overflow-hidden p-0",
          "max-md:max-h-[min(76dvh,30rem)] md:max-h-[min(560px,calc(100vh-3rem))]",
        )}
      >
        <div className="flex shrink-0 items-center justify-between px-4 py-2.5">
          <div>
            <p className="text-sm font-semibold">Notifications</p>
            <p className="text-[11px] text-muted-foreground">
              {unread > 0 ? `${unread} new` : "You're all caught up"}
            </p>
          </div>
          {unread > 0 ? (
            <Button variant="ghost" size="sm" onClick={markAllRead}>
              Mark all read
            </Button>
          ) : null}
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain py-1.5 slim-scroll">
          <AnimatePresence initial={false}>
            {items.map((item) => (
              <motion.li
                key={item.id}
                layout
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 8 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
              >
                <NotificationRow
                  notification={item}
                  onRead={markRead}
                  onNavigate={() => setOpen(false)}
                />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
        <div className="shrink-0 bg-background/35 px-4 py-2 text-center dark:bg-white/[0.06]">
          <Link
            href="/settings#notifications"
            className="text-[11px] text-muted-foreground hover:text-foreground"
            onClick={() => setOpen(false)}
          >
            Notification preferences
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function NotificationRow({
  notification,
  onRead,
  onNavigate,
}: {
  notification: VisionNotification
  onRead: (id: string) => void
  onNavigate: () => void
}) {
  const Icon = KIND_ICON[notification.kind] ?? SparklesIcon
  const tone = TONE_CLASS[notification.tone ?? "primary"]

  const Content = (
    <div
      className={cn(
        "flex gap-3 px-3 py-2.5 transition-colors",
        notification.read ? "" : "bg-primary/[0.05]",
        "hover:bg-accent/40",
      )}
      onClick={() => {
        if (!notification.read) onRead(notification.id)
        onNavigate()
      }}
      role="link"
      tabIndex={0}
    >
      {notification.thumbnailUrl ? (
        <div className="relative size-14 shrink-0 overflow-hidden rounded-md bg-muted">
          <Image
            src={notification.thumbnailUrl}
            alt=""
            fill
            sizes="56px"
            className="object-cover"
            unoptimized
          />
          <div
            className={cn(
              "absolute inset-x-0 bottom-0 h-7 bg-gradient-to-t from-black/70 to-transparent",
            )}
          />
          <div className="absolute inset-0 flex items-end p-1">
            <span
              className={cn(
                "rounded-full p-1 text-white shadow",
                "bg-black/55 backdrop-blur",
              )}
            >
              <HugeiconsIcon icon={Icon} strokeWidth={2} className="size-3" />
            </span>
          </div>
        </div>
      ) : (
        <div
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full",
            tone,
          )}
        >
          <HugeiconsIcon icon={Icon} strokeWidth={2} className="size-4" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold leading-snug">{notification.title}</p>
        <p className="line-clamp-2 text-[12px] leading-snug text-muted-foreground">
          {notification.body}
        </p>
        <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          {relativeTime(notification.createdAt)}
        </p>
      </div>
      {!notification.read ? (
        <span aria-hidden className="mt-1 size-2 shrink-0 rounded-full bg-primary" />
      ) : null}
    </div>
  )

  if (notification.href) {
    return (
      <Link href={notification.href} className="block">
        {Content}
      </Link>
    )
  }
  return Content
}
