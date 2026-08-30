"use client";

import { useEffect, useState } from "react";

/** True below the Tailwind `sm` breakpoint. Defaults to true for SSR (this game is mostly mobile). */
export function useNarrow(query = "(max-width: 639px)"): boolean {
  const [narrow, setNarrow] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia(query);
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [query]);

  return narrow;
}
