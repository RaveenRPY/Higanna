"use client";

import { unicodeToDlManel } from "sinhala-unicode-coverter";
import type { ReactNode } from "react";

const SINHALA = /[\u0D80-\u0DFF\u200D]+/g;

/** Render Unicode Sinhala with apex-a.pura-037 (legacy DL encoding). */
export function SiText({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  const text = children;
  const parts: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(SINHALA)) {
    const start = match.index ?? 0;
    if (start > last) parts.push(text.slice(last, start));
    parts.push(
      <span key={key++} className="font-apex">
        {unicodeToDlManel(match[0])}
      </span>,
    );
    last = start + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  if (className) return <span className={className}>{parts}</span>;
  return <>{parts}</>;
}
