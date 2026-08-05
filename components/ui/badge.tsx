import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/* House chip grammar: tinted fills (the 14%-chip idiom), fully rounded,
 * no decorative borders in dark — colour carries meaning only. */
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] leading-none transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary/[0.12] text-primary",
        outline: "border-border text-foreground/80 dark:border-transparent dark:bg-accent",
        muted: "border-transparent bg-accent text-muted-foreground",
        destructive: "border-transparent bg-debit-chip text-destructive",
        new: "border-transparent bg-credit-chip text-credit",
        premium: "border-transparent bg-primary/[0.12] text-gold",
      },
    },
    defaultVariants: { variant: "default" },
  },
)

interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
