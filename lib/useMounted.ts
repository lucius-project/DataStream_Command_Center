"use client";

import { useEffect, useState } from "react";

// True only after the client has mounted. Use to gate anything
// locale/timezone/clock-dependent — including values that can't go
// through <ClientText> because they're inside an attribute (aria-label,
// title) rather than element children.
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  // "Has the client mounted" has no mechanism other than this by definition.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  return mounted;
}
