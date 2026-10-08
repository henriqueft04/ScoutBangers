import { cn } from "@workspace/ui/lib/utils"

interface UserAvatarProps {
  name: string
  avatarUrl: string | null
  className?: string
}

/** A person's photo, or their initial when they have none. */
export function UserAvatar({ name, avatarUrl, className }: UserAvatarProps) {
  return (
    <span
      className={cn(
        "bg-primary text-primary-foreground inline-flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full text-[10px] font-semibold",
        className
      )}
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          className="size-full object-cover"
          referrerPolicy="no-referrer"
        />
      ) : (
        name.charAt(0).toUpperCase()
      )}
    </span>
  )
}
