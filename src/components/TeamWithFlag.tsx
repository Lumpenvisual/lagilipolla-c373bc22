import { cn } from "@/lib/utils";
import { getFlagCode } from "@/utils/countryFlags";

const sizeClasses = {
  sm: "w-4 h-3",
  md: "w-6 h-4",
  lg: "w-8 h-6",
} as const;

const textSizeClasses = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-lg",
} as const;

type TeamWithFlagProps = {
  teamName: string;
  flagCode?: string;
  size?: keyof typeof sizeClasses;
  className?: string;
  /** Permite que el nombre envuelva en varias líneas (para columnas angostas en móvil). */
  wrap?: boolean;
};

export const TeamWithFlag = ({
  teamName,
  flagCode,
  size = "md",
  className,
  wrap = false,
}: TeamWithFlagProps) => {
  const code = flagCode || getFlagCode(teamName);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <img
        src={`/flags/${code}.svg`}
        alt={teamName}
        className={cn(sizeClasses[size], "shrink-0 object-cover rounded-sm")}
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
        loading="lazy"
      />
      <span
        className={cn(
          "font-medium",
          wrap ? "min-w-0 whitespace-normal break-words" : "whitespace-nowrap",
          textSizeClasses[size],
        )}
      >
        {teamName}
      </span>
    </div>
  );
};
