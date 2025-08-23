import { ReactNode, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

export function PageTransition({ children, className }: PageTransitionProps) {
  const [location] = useLocation();
  const [displayLocation, setDisplayLocation] = useState(location);
  const [transitionStage, setTransitionStage] = useState<"fadeIn" | "fadeOut">("fadeIn");

  useEffect(() => {
    if (location !== displayLocation) {
      setTransitionStage("fadeOut");
      const timeout = setTimeout(() => {
        setDisplayLocation(location);
        setTransitionStage("fadeIn");
      }, 200);
      return () => clearTimeout(timeout);
    }
  }, [location, displayLocation]);

  return (
    <div
      className={cn(
        "transition-all duration-300",
        transitionStage === "fadeIn" 
          ? "opacity-100 translate-y-0" 
          : "opacity-0 -translate-y-2",
        className
      )}
    >
      {children}
    </div>
  );
}

export function AnimatedSection({ 
  children, 
  className,
  delay = 0,
  animation = "fade-in-up"
}: { 
  children: ReactNode;
  className?: string;
  delay?: number;
  animation?: "fade-in-up" | "fade-in" | "scale-in" | "slide-in-right";
}) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, delay);
    return () => clearTimeout(timer);
  }, [delay]);

  const animationClasses = {
    "fade-in-up": "translate-y-4 opacity-0",
    "fade-in": "opacity-0",
    "scale-in": "scale-95 opacity-0",
    "slide-in-right": "translate-x-4 opacity-0"
  };

  return (
    <div
      className={cn(
        "transition-all duration-500 ease-out",
        !isVisible && animationClasses[animation],
        isVisible && "translate-y-0 translate-x-0 opacity-100 scale-100",
        className
      )}
    >
      {children}
    </div>
  );
}