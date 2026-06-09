import React from "react";
import { cn } from "@/lib/utils";

const sizeMap = {
  sm: {
    flag: "w-4 h-3",
    text: "text-sm",
    gap: "gap-1.5",
  },
  md: {
    flag: "w-6 h-4",
    text: "text-base",
    gap: "gap-2",
  },
  lg: {
    flag: "w-8 h-6",
    text: "text-lg",
    gap: "gap-2.5",
  },
};

export const TeamWithFlag = ({
  teamName,
  flagCode,
  size = "md",
  className,
}) => {
  const { flag, text, gap } = sizeMap[size];

  return (
    <span
      className={cn(
        "inline-flex items-center",
        gap,
        className
      )}
      title={teamName}
    >
      <span
        className={cn("fi", `fi-${flagCode.toLowerCase()}`, flag)}
        aria-hidden="true"
      />
      <span className={cn("font-medium whitespace-nowrap", text)}>
        {teamName}
      </span>
    </span>
  );
};
