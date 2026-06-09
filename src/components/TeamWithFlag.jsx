import { getFlagEmoji } from '@/utils/countryFlags';
import { cn } from "@/lib/utils";

const sizeMap = {
  sm: {
    emoji: "text-lg",
    text: "text-sm",
    gap: "gap-1.5",
  },
  md: {
    emoji: "text-2xl",
    text: "text-base",
    gap: "gap-2",
  },
  lg: {
    emoji: "text-4xl",
    text: "text-lg",
    gap: "gap-2.5",
  },
};

export const TeamWithFlag = ({
  teamName,
  size = "md",
  className,
}) => {
  const emoji = getFlagEmoji(teamName);
  const { emoji: emojiSize, text, gap } = sizeMap[size];

  return (
    <span
      className={cn(
        "inline-flex items-center",
        gap,
        className
      )}
      title={teamName}
    >
      <span className={cn(emojiSize)} aria-hidden="true">
        {emoji}
      </span>
      <span className={cn("font-medium whitespace-nowrap", text)}>
        {teamName}
      </span>
    </span>
  );
};
