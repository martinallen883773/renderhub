import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
}

export function CardHover({ children, className }: CardProps) {
  return (
    <div
      className={cn(
        "bg-card rounded-2xl border border-border/50 shadow-sm p-6 md:p-8 transition-all duration-300 hover:shadow-lg hover:border-primary/20",
        className
      )}
    >
      {children}
    </div>
  );
}
