import { BRAND_NAME, MINI_LOGO_SRC } from "@/lib/brand";

type BrandMarkSize = "hero" | "title" | "header" | "mark";

/** Intrinsic pixel size used for layout reservation (avoids CLS / header jump). */
const INTRINSIC: Record<BrandMarkSize, { w: number; h: number }> = {
  hero: { w: 280, h: 96 },
  title: { w: 200, h: 56 },
  header: { w: 132, h: 32 },
  mark: { w: 140, h: 36 },
};

const SIZE_CLASS: Record<BrandMarkSize, string> = {
  hero: "h-35 w-auto max-w-[min(86vw,280px)] sm:35",
  title: "h-11 w-auto max-w-[200px] sm:h-14",
  header: "h-12 w-auto max-w-[8.25rem] sm:h-12",
  mark: "h-9 w-auto max-w-[8.75rem]",
};

/**
 * App brand mark — use instead of rendering the game name as text in UI chrome.
 * Role labels (රජු / රැජින / හිඟන්නා) stay as text.
 */
export function BrandMark({
  size = "header",
  className = "",
  priority = false,
}: {
  size?: BrandMarkSize;
  className?: string;
  priority?: boolean;
}) {
  const dim = INTRINSIC[size];
  return (
    <span
      className={["brand-mark-wrap inline-flex shrink-0 items-center justify-center", className]
        .filter(Boolean)
        .join(" ")}
      style={{ height: dim.h }}
    >
      <img
        src={MINI_LOGO_SRC}
        alt={BRAND_NAME}
        width={dim.w}
        height={dim.h}
        className={["brand-mark select-none object-contain object-center", SIZE_CLASS[size]].join(" ")}
        draggable={false}
        decoding={priority ? "sync" : "async"}
        fetchPriority={priority ? "high" : "auto"}
      />
    </span>
  );
}
