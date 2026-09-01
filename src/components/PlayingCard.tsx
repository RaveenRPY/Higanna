"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { cardImageSrc } from "@/lib/cardAssets";
import { cardLabel } from "@/lib/engine";
import type { Card } from "@/lib/types";

export type CardSize = "sm" | "md" | "lg";

export const CARD_SIZE: Record<CardSize, { w: number; h: number }> = {
  // Match public/cards SVG aspect (~29.67 × 40.7)
  sm: { w: 54, h: 74 },
  md: { w: 80, h: 110 },
  lg: { w: 111, h: 152 },
};

/** Keep corner curve proportional so md preview matches lg hand. */
const CARD_RADIUS: Record<CardSize, number> = {
  sm: Math.round((10 * 54) / 111),
  md: Math.round((10 * 80) / 111),
  lg: 10,
};

const SIZE = CARD_SIZE;

function CardFace({ card }: { card: Card }) {
  return (
    <img
      src={cardImageSrc(card)}
      alt={cardLabel(card)}
      className="h-full w-full object-cover"
      draggable={false}
    />
  );
}

export function PlayingCard({
  card,
  size = "md",
  selected = false,
  dimmed = false,
  lifted = false,
  highlighted = false,
  onClick,
  className = "",
  style,
}: {
  card: Card;
  size?: CardSize;
  selected?: boolean;
  dimmed?: boolean;
  highlighted?: boolean;
  lifted?: boolean;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
}) {
  const s = SIZE[size];
  const radius = CARD_RADIUS[size];
  const inner = (
    <div
      className={[
        "relative h-full w-full overflow-hidden bg-white",
        selected ? "ring-2 ring-amber-400" : "",
        highlighted && !selected ? "tribute-card-glow ring-2 ring-amber-300" : "",
      ].join(" ")}
      style={{
        borderRadius: radius,
        boxShadow: "2px 3px 10px rgba(0,0,0,0.28)",
      }}
    >
      <CardFace card={card} />
      {card.joker && card.asRank && card.asSuit ? (
        <span className="absolute bottom-1 right-1 rounded bg-amber-400 px-1 py-0.5 text-[9px] font-bold leading-none text-zinc-950">
          J
        </span>
      ) : null}
    </div>
  );

  const box: CSSProperties = { width: s.w, height: s.h, ...style };
  const cls = [
    "playing-card relative origin-bottom select-none overflow-visible border-0 bg-transparent p-0",
    onClick ? "cursor-pointer" : "cursor-default",
    selected || lifted ? "z-20" : "",
    dimmed ? "opacity-40" : "",
    className,
  ].join(" ");

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls} style={box}>
        {inner}
      </button>
    );
  }
  return (
    <div className={cls} style={box}>
      {inner}
    </div>
  );
}

export function CardBack({
  size = "md",
  className = "",
  style,
}: {
  size?: CardSize;
  className?: string;
  style?: CSSProperties;
}) {
  const s = SIZE[size];
  return (
    <div
      className={["overflow-hidden bg-white", className].join(" ")}
      style={{
        width: s.w,
        height: s.h,
        borderRadius: CARD_RADIUS[size],
        boxShadow: "2px 3px 10px rgba(0,0,0,0.28)",
        ...style,
      }}
    >
      <img src="/cards/card_back.svg" alt="" className="h-full w-full object-cover" draggable={false} />
    </div>
  );
}

export function CardFan({
  cards,
  size = "lg",
  selectedIds = [],
  leavingIds = [],
  ghostIds = [],
  highlightIds = [],
  dimOthers = false,
  onSelect,
  dealIn = false,
  emptyLabel,
  compact = false,
}: {
  cards: Card[];
  size?: CardSize;
  selectedIds?: string[];
  leavingIds?: string[];
  /** Cards mid-flight — keep layout slot but hide the face. */
  ghostIds?: string[];
  /** Cards to emphasize (e.g. හිඟන්නා's highest tribute card). */
  highlightIds?: string[];
  /** When true, non-highlighted cards are faded and not selectable. */
  dimOthers?: boolean;
  onSelect?: (id: string) => void;
  dealIn?: boolean;
  emptyLabel?: string;
  compact?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setBoxW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const selectedSet = new Set(selectedIds);
  const ghostSet = new Set(ghostIds);
  const highlightSet = new Set(highlightIds);
  // Selected cards leave the hand — they preview on your seat instead.
  const visible = cards.filter((c) => !selectedSet.has(c.id));
  const n = visible.length;

  if (n === 0) {
    if (cards.length === 0 && emptyLabel) {
      return (
        <div className="relative mx-auto w-full" data-hand-root>
          <p className={compact ? "py-6 text-center text-sm text-amber-100/50" : "py-10 text-center text-amber-100/50"}>
            {emptyLabel}
          </p>
        </div>
      );
    }
    return (
      <div
        ref={wrapRef}
        className="relative mx-auto w-full"
        style={{ height: SIZE[size].h + 20 }}
        data-hand-root
      />
    );
  }

  // Spread more as the hand shrinks so remaining cards never look stacked.
  const preferred = compact
    ? n <= 4
      ? 28
      : 20
    : n <= 4
      ? 52
      : n <= 8
        ? 42
        : n <= 14
          ? 30
          : 22;
  const rotStep = compact ? 2 : n <= 4 ? 5 : n <= 10 ? 3.4 : n <= 16 ? 2.4 : 1.6;
  const mid = (n - 1) / 2;
  const cardW = SIZE[size].w;
  const minStep = compact ? 14 : 18;
  const maxStep = n <= 1 ? 0 : Math.max(minStep, (Math.max(boxW, cardW) - cardW - 12) / (n - 1));
  const step = Math.min(preferred, maxStep);
  const height = SIZE[size].h + 20;

  return (
    <div ref={wrapRef} className="relative mx-auto w-full overflow-visible" style={{ height }} data-hand-root>
      {visible.map((card, i) => {
        const dx = (i - mid) * step;
        const rot = (i - mid) * rotStep;
        const ghost = ghostSet.has(card.id);
        const highlighted = highlightSet.has(card.id);
        const dimmed = dimOthers && highlightIds.length > 0 && !highlighted;
        const selectable = onSelect && !ghost && !dimmed;
        return (
          <div
            key={card.id}
            className="absolute origin-bottom overflow-visible"
            style={{
              left: "50%",
              bottom: 6,
              width: SIZE[size].w,
              height: SIZE[size].h,
              marginLeft: -SIZE[size].w / 2,
              transform: `translateX(${dx}px)`,
              zIndex: i + 1,
              // visibility avoids opacity fade glitches during flight handoff
              visibility: ghost ? "hidden" : "visible",
              pointerEvents: ghost ? "none" : undefined,
              transition: "transform 280ms cubic-bezier(0.22, 0.82, 0.2, 1)",
            }}
          >
            <div
              data-hand-card={card.id}
              data-card-angle={rot}
              className="h-full w-full origin-center"
              style={{ transform: `rotate(${rot}deg)` }}
            >
              <div
                className={
                  leavingIds.includes(card.id)
                    ? "play-from-hand"
                    : dealIn && i === n - 1
                      ? "deal-card-land"
                      : ""
                }
              >
                <PlayingCard
                  card={card}
                  size={size}
                  highlighted={highlighted}
                  dimmed={dimmed}
                  onClick={selectable ? () => onSelect(card.id) : undefined}
                  className="relative!"
                  style={{ position: "relative" }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function BackFan({
  count,
  size = "sm",
  compact = false,
}: {
  count: number;
  size?: CardSize;
  compact?: boolean;
}) {
  const shown = Math.min(count, compact ? 4 : 8);
  if (count <= 0) return null;
  const step = compact ? 7 : 10;
  const mid = (shown - 1) / 2;
  const width = SIZE[size].w + (shown - 1) * step;
  return (
    <div className="relative" style={{ width, height: SIZE[size].h + 8 }}>
      {Array.from({ length: shown }, (_, i) => (
        <CardBack
          key={i}
          size={size}
          className="absolute"
          style={{
            left: i * step,
            top: Math.abs(i - mid) * 1.2,
            transform: `rotate(${(i - mid) * 2.5}deg)`,
            zIndex: i,
          }}
        />
      ))}
    </div>
  );
}

function wobble(seed: string, salt: number): number {
  let h = salt;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000;
}

/** Messy dropped-card row — uneven gaps, tilt, and vertical jitter (not a neat sort). */
export function PlayRow({ cards, size = "md" }: { cards: Card[]; size?: CardSize }) {
  const n = cards.length;
  const cardW = SIZE[size].w;
  const cardH = SIZE[size].h;
  const baseStep = n <= 1 ? 0 : Math.min(34, Math.max(20, cardW * 0.38));

  const layouts = cards.map((card, i) => {
    const a = wobble(card.id, 1);
    const b = wobble(card.id, 2);
    const c = wobble(card.id, 3);
    const stepJitter = (a - 0.5) * 14;
    const dx = i === 0 ? 0 : i * baseStep + stepJitter + (b - 0.5) * 6;
    const dy = (c - 0.5) * 16;
    const rot = (a - 0.5) * 18 + (i - (n - 1) / 2) * 2.2;
    return { card, dx, dy, rot, z: i + 1 };
  });

  let minX = 0;
  let maxX = cardW;
  let minY = 0;
  let maxY = cardH;
  for (const L of layouts) {
    minX = Math.min(minX, L.dx);
    maxX = Math.max(maxX, L.dx + cardW);
    minY = Math.min(minY, L.dy);
    maxY = Math.max(maxY, L.dy + cardH);
  }

  return (
    <div className="relative mx-auto" style={{ width: maxX - minX + 8, height: maxY - minY + 8 }}>
      {layouts.map(({ card, dx, dy, rot, z }) => (
        <div
          key={card.id}
          className="absolute"
          style={{
            left: dx - minX + 4,
            top: dy - minY + 4,
            width: cardW,
            height: cardH,
            zIndex: z,
            transform: `rotate(${rot}deg)`,
          }}
        >
          <PlayingCard card={card} size={size} className="relative!" style={{ position: "relative" }} />
        </div>
      ))}
    </div>
  );
}

/** Stack of plays on the table — older plays peek from the top so ranks stay visible. */
export function TablePlayStack({
  plays,
  size = "md",
  ghostIds = [],
}: {
  plays: { playerName: string; cards: Card[] }[];
  size?: CardSize;
  /** Hide in-flight plays so the flyer is the only visible copy. */
  ghostIds?: string[];
}) {
  if (plays.length === 0) return null;
  const cardH = SIZE[size].h;
  const peek = Math.round(cardH * 0.26);
  const height = cardH + (plays.length - 1) * peek + 36;
  const lastIdx = plays.length - 1;
  const ghostSet = new Set(ghostIds);

  return (
    <div className="relative mx-auto w-full max-w-md" style={{ height }}>
      {plays.map((play, i) => {
        const seed = play.cards.map((c) => c.id).join("|") || play.playerName;
        const driftX = (wobble(seed, 7) - 0.5) * 28;
        const driftRot = (wobble(seed, 9) - 0.5) * 8;
        const peekJitter = (wobble(seed, 11) - 0.5) * 10;
        const playKey = `${play.playerName}-${play.cards.map((c) => c.id).join("-")}`;
        const isNewest = i === lastIdx;
        // Hide the whole play until every card has finished flying (keeps messy layout intact).
        const playHidden = play.cards.some((c) => ghostSet.has(c.id));
        return (
          <div
            key={playKey}
            className={`table-play-layer absolute left-1/2 w-full${isNewest && !playHidden ? " play-land" : ""}`}
            style={
              {
                top: i * peek + peekJitter,
                zIndex: i + 1,
                visibility: playHidden ? "hidden" : "visible",
                ["--drift-x" as string]: `${driftX}px`,
                ["--drift-rot" as string]: `${driftRot}deg`,
                transform: `translateX(calc(-50% + ${driftX}px)) rotate(${driftRot}deg)`,
              } as CSSProperties
            }
          >
            <PlayRow cards={play.cards} size={size} />
          </div>
        );
      })}
    </div>
  );
}
