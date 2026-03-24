import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost" | "destructive";
  size?: "sm" | "md" | "lg";
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "md", disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={cn(
          "inline-flex items-center justify-center rounded-full font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] disabled:pointer-events-none disabled:opacity-50",
          {
            "bg-[var(--accent)] text-[#08120f] shadow-[0_12px_32px_rgba(210,255,114,0.22)] hover:-translate-y-0.5 hover:bg-[#e3ff9b]":
              variant === "default",
            "border border-[var(--line)] bg-white/[0.03] text-[var(--text-primary)] hover:border-[var(--line-strong)] hover:bg-white/[0.06]":
              variant === "outline",
            "bg-transparent text-[var(--text-secondary)] hover:bg-white/[0.05] hover:text-[var(--text-primary)]":
              variant === "ghost",
            "bg-[#d94f4f] text-white hover:bg-[#ea6565]":
              variant === "destructive",
          },
          {
            "h-8 px-3 text-sm": size === "sm",
            "h-11 px-5 text-sm": size === "md",
            "h-12 px-6 text-base": size === "lg",
          },
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";

export { Button };
