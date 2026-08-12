"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

// Mirrors the inline script in layout.tsx: undefined until mount (avoids
// an SSR/client mismatch, since the server can't know the stored/system
// preference), then read from the DOM class that script already applied.
export function ThemeToggle() {
  const [isDark, setIsDark] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    // One-time read of DOM state the pre-hydration script in layout.tsx
    // already applied — genuinely unknowable at server-render time, so
    // this can't be lazy useState init; the resulting single extra
    // render is the intended/unavoidable behavior here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className="flex h-11 w-11 items-center justify-center rounded-md text-text-muted hover:bg-panel-raised hover:text-text"
    >
      {isDark === undefined ? (
        <span className="h-[18px] w-[18px]" />
      ) : isDark ? (
        <Sun size={18} />
      ) : (
        <Moon size={18} />
      )}
    </button>
  );
}
