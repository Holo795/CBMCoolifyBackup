import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "danger-ghost";
export type ButtonSize = "xs" | "sm" | "md" | "icon" | "icon-sm";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-foreground shadow-sm hover:bg-accent-hover",
  secondary: "border border-border bg-card text-foreground shadow-sm hover:bg-muted hover:border-border-strong",
  // Kept as an alias of secondary: older call sites use "outline".
  outline: "border border-border bg-card text-foreground shadow-sm hover:bg-muted hover:border-border-strong",
  ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
  danger: "bg-danger text-white shadow-sm hover:opacity-90",
  "danger-ghost": "text-danger hover:bg-danger-soft",
};

const SIZES: Record<ButtonSize, string> = {
  xs: "h-7 gap-1.5 px-2.5 text-xs [&_svg]:size-3.5",
  sm: "h-8 gap-1.5 px-3 text-[13px] [&_svg]:size-3.5",
  md: "h-9 gap-2 px-3.5 text-sm [&_svg]:size-4",
  icon: "size-9 [&_svg]:size-4",
  "icon-sm": "size-7 [&_svg]:size-3.5",
};

export function buttonClass(variant: ButtonVariant = "secondary", size: ButtonSize = "md", className?: string) {
  return cn(
    "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-md font-medium transition-[background-color,border-color,color,box-shadow,opacity]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-50",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

type ButtonProps = React.ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner in place of the leading icon and disables the button. */
  loading?: boolean;
};

export function Button({ className, variant = "secondary", size = "md", loading, disabled, children, type, ...props }: ButtonProps) {
  return (
    <button
      type={type ?? "button"}
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Loader2 className="animate-spin" aria-hidden />}
      {children}
    </button>
  );
}
