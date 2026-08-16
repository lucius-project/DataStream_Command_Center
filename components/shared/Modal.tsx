"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

// Shared modal shell — every modal in the tech-performance/service-desk
// feature area (InfoButton, DrilldownStat, ActivityTimelineModal,
// TechScoreBadge's breakdown, TechScoreTrendModal, HealthScoreBreakdownModal,
// AnswerRateTrendModal) used to hand-roll this same backdrop+panel shape
// with none of role="dialog"/aria-modal/aria-labelledby, Escape-to-close,
// a focus trap, or focus return on close. One wrapper fixes all seven at
// once instead of patching each copy separately.
export function Modal({
  title,
  subtitle,
  onClose,
  children,
  maxWidthClassName = "max-w-md",
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  maxWidthClassName?: string;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
    // Intentionally mount-once: onClose is stable enough in every caller
    // (either a useState setter or a simple prop) that re-binding this
    // per-render would just churn the listener for no behavioral gain.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/60" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative flex max-h-[85vh] w-full ${maxWidthClassName} flex-col gap-3 overflow-y-auto rounded-lg border border-border bg-panel p-5 shadow-xl focus:outline-none`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="font-display text-base font-semibold text-text">
              {title}
            </h2>
            {subtitle && <div className="mt-0.5 font-data text-[11px] text-text-faint">{subtitle}</div>}
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="shrink-0 rounded p-1 text-text-faint hover:bg-panel-raised hover:text-text"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
