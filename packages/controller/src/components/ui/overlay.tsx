"use client";

import * as React from "react";
import { Dialog as DialogPrimitive, DropdownMenu as Menu, Tooltip as TooltipPrimitive, Tabs as TabsPrimitive } from "radix-ui";
import { X, Check, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { useT } from "@/components/i18n-provider";

/* ------------------------------- Dialog --------------------------------- */

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

/**
 * Centered modal (`side` unset) or a panel sliding from the right (`side="right"`,
 * for longer forms). Title is required for screen readers.
 */
export function DialogContent({
  title,
  description,
  side,
  className,
  children,
  footer,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  side?: "right";
  className?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const t = useT();
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay backdrop-blur-[2px] data-[state=open]:animate-[cbm-fade-in_150ms_ease-out]" />
      <DialogPrimitive.Content
        // Focus the first field when there is one, else the dialog itself (not the close button).
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          const root = e.currentTarget as HTMLElement;
          const field = root.querySelector<HTMLElement>("[autofocus], input:not([type=hidden]):not([disabled]), select, textarea");
          (field ?? root).focus();
        }}
        tabIndex={-1}
        className={cn(
          "fixed z-50 flex flex-col border bg-card text-card-foreground shadow-lg focus:outline-none",
          side === "right"
            ? "inset-y-0 right-0 w-full max-w-lg data-[state=open]:animate-[cbm-slide-in_220ms_cubic-bezier(0.32,0.72,0,1)] sm:rounded-l-xl"
            : "left-1/2 top-1/2 max-h-[85vh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl data-[state=open]:animate-[cbm-pop-in_160ms_ease-out]",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
          <div className="flex min-w-0 flex-col gap-1">
            <DialogPrimitive.Title className="text-[15px] font-semibold tracking-tight">{title}</DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="text-[13px] leading-5 text-muted-foreground">
                {description}
              </DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close className="-mr-1.5 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <X className="size-4" />
            <span className="sr-only">{t("common.close")}</span>
          </DialogPrimitive.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t bg-surface px-5 py-3 sm:rounded-b-xl">{footer}</div>}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/* --------------------------------- Menu --------------------------------- */

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;
export const DropdownMenuSub = Menu.Sub;
export const DropdownMenuRadioGroup = Menu.RadioGroup;

const MENU_SURFACE =
  "z-50 min-w-48 overflow-hidden rounded-lg border bg-card p-1 text-card-foreground shadow-md data-[state=open]:animate-[cbm-pop-in_120ms_ease-out]";
const MENU_ITEM =
  "relative flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-[13px] outline-none transition-colors " +
  "data-[highlighted]:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground";

export function DropdownMenuContent({ className, align = "end", sideOffset = 6, ...props }: React.ComponentProps<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content align={align} sideOffset={sideOffset} className={cn(MENU_SURFACE, className)} {...props} />
    </Menu.Portal>
  );
}

export function DropdownMenuItem({
  className,
  tone,
  ...props
}: React.ComponentProps<typeof Menu.Item> & { tone?: "danger" }) {
  return (
    <Menu.Item
      className={cn(MENU_ITEM, tone === "danger" && "text-danger data-[highlighted]:bg-danger-soft [&_svg]:text-danger", className)}
      {...props}
    />
  );
}

export function DropdownMenuRadioItem({ className, children, ...props }: React.ComponentProps<typeof Menu.RadioItem>) {
  return (
    <Menu.RadioItem className={cn(MENU_ITEM, "pr-8", className)} {...props}>
      {children}
      <Menu.ItemIndicator className="absolute right-2">
        <Check className="size-4" />
      </Menu.ItemIndicator>
    </Menu.RadioItem>
  );
}

export function DropdownMenuSubTrigger({ className, children, ...props }: React.ComponentProps<typeof Menu.SubTrigger>) {
  return (
    <Menu.SubTrigger className={cn(MENU_ITEM, "data-[state=open]:bg-muted", className)} {...props}>
      {children}
      <ChevronRight className="ml-auto" />
    </Menu.SubTrigger>
  );
}

export function DropdownMenuSubContent({ className, ...props }: React.ComponentProps<typeof Menu.SubContent>) {
  return (
    <Menu.Portal>
      <Menu.SubContent sideOffset={6} className={cn(MENU_SURFACE, className)} {...props} />
    </Menu.Portal>
  );
}

export function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof Menu.Label>) {
  return <Menu.Label className={cn("px-2 py-1.5 text-xs font-medium text-muted-foreground", className)} {...props} />;
}

export function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof Menu.Separator>) {
  return <Menu.Separator className={cn("-mx-1 my-1 h-px bg-border", className)} {...props} />;
}

/* -------------------------------- Tooltip ------------------------------- */

export const TooltipProvider = TooltipPrimitive.Provider;

/** Short hint on hover/focus. Wraps a single focusable child. */
/**
 * An `asChild` trigger needs one element it can clone. Children rendered by a
 * server component can reach a client one as a lazy chunk on a large page
 * (React streams big payloads in parts), which Radix can't slot onto: wrap
 * those in a span instead of failing the whole page.
 */
export function slottable(child: React.ReactNode): React.ReactElement {
  return React.isValidElement(child) ? child : <span className="inline-flex">{child}</span>;
}

export function Tooltip({ content, children, side = "top" }: { content: React.ReactNode; children: React.ReactElement; side?: "top" | "bottom" | "left" | "right" }) {
  if (!content) return children;
  return (
    <TooltipPrimitive.Root delayDuration={300}>
      <TooltipPrimitive.Trigger asChild>{slottable(children)}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="z-50 max-w-xs rounded-md bg-foreground px-2 py-1 text-xs leading-5 text-background shadow-md data-[state=delayed-open]:animate-[cbm-fade-in_100ms_ease-out]"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

/* --------------------------------- Tabs --------------------------------- */

export const Tabs = TabsPrimitive.Root;
export const TabsContent = TabsPrimitive.Content;

export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      // The baseline is an inset shadow, not a border: a 1px border inside a
      // fixed height made the (horizontally scrollable) list 1px too short and
      // showed a vertical scrollbar. The scrollbar itself stays hidden; the
      // tabs still scroll sideways on narrow screens.
      className={cn(
        "flex items-center gap-1 overflow-x-auto shadow-[inset_0_-1px_0_var(--color-border)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "relative inline-flex h-10 shrink-0 items-center gap-2 border-b-2 border-transparent px-2.5 text-[13px] font-medium text-muted-foreground transition-colors",
        "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        "data-[state=active]:border-accent data-[state=active]:text-foreground [&_svg]:size-4",
        className,
      )}
      {...props}
    />
  );
}
