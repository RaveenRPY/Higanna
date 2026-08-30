"use client";

import { useEffect, useRef, useState } from "react";
import { PlayingCard, CARD_SIZE, type CardSize } from "@/components/PlayingCard";
import type { Card } from "@/lib/types";

export type FlightRect = {
  x: number;
  y: number;
  w: number;
  h: number;
  angle: number;
};

export type CardFlight = {
  key: string;
  card: Card;
  from: FlightRect;
  to: FlightRect;
  durationMs: number;
};

/** Logical card rect + angle from `data-card-angle`. */
export function measureFlightRect(selector: string, size: CardSize): FlightRect | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const { w, h } = CARD_SIZE[size];
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const angle = Number((el as HTMLElement).dataset.cardAngle ?? "0") || 0;
  return { x: cx - w / 2, y: cy - h / 2, w, h, angle };
}

export function estimateYouSeatPreviewRect(count: number, index: number, size: CardSize = "md"): FlightRect {
  const seat = document.querySelector("[data-you-seat]");
  const table = document.querySelector("[data-game-table]");
  const base = (seat ?? table)?.getBoundingClientRect();
  const { w, h } = CARD_SIZE[size];
  const mid = (count - 1) / 2;
  const angle = (index - mid) * 5;
  const gap = 6;
  if (!base) {
    return {
      x: window.innerWidth / 2 - (count * (w + gap) - gap) / 2 + index * (w + gap),
      y: window.innerHeight * 0.62,
      w,
      h,
      angle,
    };
  }
  const rowW = count * w + Math.max(0, count - 1) * gap;
  const left = base.left + base.width / 2 - rowW / 2;
  const x = left + index * (w + gap);
  const y = seat ? base.top : base.top + base.height * 0.72;
  return { x, y, w, h, angle };
}

/** Estimate where a card will sit in the hand fan after layout. */
export function estimateHandCardRect(
  visibleCount: number,
  index: number,
  size: CardSize = "lg",
  compact = false,
): FlightRect {
  const root = document.querySelector("[data-hand-root]");
  const { w, h } = CARD_SIZE[size];
  const r = root?.getBoundingClientRect();
  const n = Math.max(visibleCount, 1);
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
  const boxW = r?.width ?? 400;
  const minStep = compact ? 14 : 18;
  const maxStep = n <= 1 ? 0 : Math.max(minStep, (Math.max(boxW, w) - w - 12) / (n - 1));
  const step = Math.min(preferred, maxStep);
  const dx = (index - mid) * step;
  const angle = (index - mid) * rotStep;
  const cx = (r ? r.left + r.width / 2 : window.innerWidth / 2) + dx;
  const cy = r ? r.bottom - 6 - h / 2 : window.innerHeight * 0.85;
  return { x: cx - w / 2, y: cy - h / 2, w, h, angle };
}

export function estimateTableCenterRect(size: CardSize = "md"): FlightRect {
  const table = document.querySelector("[data-game-table]");
  const r = table?.getBoundingClientRect();
  const { w, h } = CARD_SIZE[size];
  if (!r) {
    return { x: window.innerWidth / 2 - w / 2, y: window.innerHeight * 0.4, w, h, angle: 0 };
  }
  return {
    x: r.left + r.width / 2 - w / 2,
    y: r.top + r.height / 2 - h / 2,
    w,
    h,
    angle: 0,
  };
}

export function CardFlightLayer({
  flights,
  onFlightEnd,
}: {
  flights: CardFlight[];
  onFlightEnd: (key: string) => void;
}) {
  return (
    <div className="pointer-events-none fixed inset-0 z-[80]">
      {flights.map((f) => (
        <FlyingCard key={f.key} flight={f} onDone={() => onFlightEnd(f.key)} />
      ))}
    </div>
  );
}

function FlyingCard({ flight, onDone }: { flight: CardFlight; onDone: () => void }) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return;

    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      onDoneRef.current();
    };

    const fromCx = flight.from.x + flight.from.w / 2;
    const fromCy = flight.from.y + flight.from.h / 2;
    const toCx = flight.to.x + flight.to.w / 2;
    const toCy = flight.to.y + flight.to.h / 2;
    const dx = toCx - fromCx;
    const dy = toCy - fromCy;
    const scale = flight.to.w / Math.max(flight.from.w, 1);

    const anim = node.animate(
      [
        {
          transform: `translate(0px, 0px) rotate(${flight.from.angle}deg) scale(1)`,
        },
        {
          transform: `translate(${dx}px, ${dy}px) rotate(${flight.to.angle}deg) scale(${scale})`,
        },
      ],
      {
        duration: flight.durationMs,
        easing: "cubic-bezier(0.22, 0.82, 0.2, 1)",
        fill: "forwards",
      },
    );

    anim.onfinish = done;
    const t = window.setTimeout(done, flight.durationMs + 120);
    return () => {
      window.clearTimeout(t);
      anim.cancel();
    };
  }, [flight.key, flight.durationMs, flight.from, flight.to]);

  return (
    <div
      ref={nodeRef}
      className="absolute will-change-transform"
      style={{
        left: flight.from.x,
        top: flight.from.y,
        width: flight.from.w,
        height: flight.from.h,
        zIndex: 90,
        transformOrigin: "center center",
        transform: `rotate(${flight.from.angle}deg)`,
        filter: "drop-shadow(0 12px 20px rgba(0,0,0,0.4))",
      }}
    >
      <PlayingCard
        card={flight.card}
        size="lg"
        className="relative! h-full! w-full!"
        style={{ position: "relative", width: "100%", height: "100%" }}
      />
    </div>
  );
}
