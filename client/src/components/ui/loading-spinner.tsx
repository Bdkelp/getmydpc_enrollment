import { cn } from "@/lib/utils";

interface LoadingSpinnerProps {
  className?: string;
}

export function LoadingSpinner({ className }: LoadingSpinnerProps) {
  return (
    <div 
      className={cn(
        "animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full",
        className
      )}
      aria-label="Loading"
    />
  );
}
