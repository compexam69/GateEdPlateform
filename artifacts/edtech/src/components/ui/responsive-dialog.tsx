import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { createPortal } from "react-dom";

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 639px)").matches : false
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isMobile;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * On mobile (< 640px): renders as a bottom sheet via a portal.
 * On desktop (≥ 640px): renders as a centred shadcn Dialog.
 * Zero animations fighting — each variant uses its own DOM strategy.
 */
export function ResponsiveDialog({ open, onOpenChange, title, children, className }: Props) {
  const isMobile = useIsMobile();

  // ── Desktop: standard Dialog ──────────────────────────────────────────────
  if (!isMobile) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={cn("sm:max-w-lg", className)}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          {children}
        </DialogContent>
      </Dialog>
    );
  }

  // ── Mobile: portal bottom sheet ───────────────────────────────────────────
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />
      {/* Sheet */}
      <div
        className={cn(
          "relative bg-background rounded-t-2xl shadow-2xl",
          "max-h-[88vh] flex flex-col",
          className
        )}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-3 pt-1 border-b border-border shrink-0">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            onClick={() => onOpenChange(false)}
            className="p-2 rounded-lg hover:bg-muted transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {/* Scrollable body */}
        <div className="overflow-y-auto px-4 pt-4 pb-10 flex-1">{children}</div>
      </div>
    </div>,
    document.body
  );
}
