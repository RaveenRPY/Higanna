"use client";

const HAS_SINHALA = /[\u0D80-\u0DFF]/;

/** Unicode Sinhala + Latin, using Yaldevi / Noto (not legacy DL encoding). */
export function SiText({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <span
      className={["si-text", className].filter(Boolean).join(" ")}
      lang={HAS_SINHALA.test(children) ? "si" : undefined}
    >
      {children}
    </span>
  );
}
