import { getFlagCode } from '@/utils/countryFlags';
import { cn } from "@/lib/utils";

const sizeClasses = {
  sm: "w-4 h-3",
  md: "w-6 h-4",
  lg: "w-8 h-6"
};

const textSizeClasses = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-lg"
};

export const TeamWithFlag = ({ 
  teamName, 
  flagCode,
  size = "md",
  className 
}) => {
  const code = flagCode || getFlagCode(teamName);
  const imgSize = sizeClasses[size];
  const textSize = textSizeClasses[size];

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <img 
        src={`/flags/${code}.svg`}
        alt={teamName}
        className={cn(imgSize, "object-cover rounded-sm")}
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
        loading="lazy"
      />
      <span className={cn("font-medium whitespace-nowrap", textSize)}>
        {teamName}
      </span>
    </div>
  );
};
