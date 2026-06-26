import type * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { initials as toInitials, avatarColor } from "@/app/_lib/format"

const avatarVariants = cva(
  "inline-flex shrink-0 select-none items-center justify-center rounded-full font-medium leading-none",
  {
    variants: {
      size: {
        sm: "size-6 text-xs",
        md: "size-8 text-sm",
        lg: "size-10 text-base",
      },
    },
    defaultVariants: { size: "md" },
  }
)

type AvatarProps = React.ComponentProps<"span"> &
  VariantProps<typeof avatarVariants> & { name: string }

function Avatar({ name, size, className, ...props }: AvatarProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(avatarVariants({ size }), avatarColor(name), className)}
      {...props}
    >
      {toInitials(name)}
    </span>
  )
}

export { Avatar, avatarVariants }
