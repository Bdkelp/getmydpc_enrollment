import { cn } from "@/lib/utils";

interface LoadingSpinnerProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  variant?: "default" | "dots";
}

export function LoadingSpinner({ 
  className, 
  size = "md",
  variant = "default" 
}: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: "w-4 h-4",
    md: "w-6 h-6",
    lg: "w-8 h-8"
  };

  if (variant === "dots") {
    return (
      <div className={cn("flex space-x-1", className)}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={cn(
              "rounded-full bg-primary animate-pulse",
              sizeClasses[size].replace("w-", "w-").replace("h-", "h-").split(" ")[0].replace("w-", "w-1.5 h-1.5"),
              i === 0 && "animation-delay-0",
              i === 1 && "[animation-delay:150ms]",
              i === 2 && "[animation-delay:300ms]"
            )}
          />
        ))}
      </div>
    );
  }

  return (
    <div 
      className={cn(
        "animate-spin border-2 border-primary/20 border-t-primary rounded-full",
        sizeClasses[size],
        className
      )}
      aria-label="Loading"
    />
  );
}
