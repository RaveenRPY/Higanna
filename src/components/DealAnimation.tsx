"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { CardBack, CARD_SIZE } from "@/components/PlayingCard";
import { estimateHandCardRect, type FlightRect } from "@/components/CardFlight";
import { playSfx } from "@/lib/sounds";

const WINDUP_MS = 280;
const STAGGER_MS = 52;
const FLIGHT_MS = 440;
const TAIL_MS = 320;
const MAX_FLIGHTS = 48;

export type DealSeat = {
  id: string;
  isYou: boolean;
};

export function dealAnimationMs(seatCount: number, cardsEach = 0): number {
  const seats = Math.max(seatCount, 1);
  const rounds = dealRounds(seats, cardsEach);
  return WINDUP_MS + Math.max(0, seats * rounds - 1) * STAGGER_MS + FLIGHT_MS + TAIL_MS;
}

function dealRounds(seats: number, cardsEach = 0): number {
  const cap = Math.max(6, Math.floor(MAX_FLIGHTS / Math.max(seats, 1)));
  if (cardsEach > 0) return Math.min(cardsEach, cap);
  return cap;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function tableRect(): DOMRect | null {
  return document.querySelector("[data-game-table]")?.getBoundingClientRect() ?? null;
}

function deckRect(): FlightRect {
  const { w, h } = CARD_SIZE.sm;
  const table = tableRect();
  if (!table) {
    return {
      x: window.innerWidth / 2 - w / 2,
      y: window.innerHeight * 0.38 - h / 2,
      w,
      h,
      angle: 0,
    };
  }
  return {
    x: table.left + table.width / 2 - w / 2,
    y: table.top + table.height / 2 - h / 2,
    w,
    h,
    angle: 0,
  };
}

function seatCatchRect(playerId: string, index: number, total: number): FlightRect {
  const { w, h } = CARD_SIZE.sm;
  const catcher = document.querySelector(`[data-seat-catch="${playerId}"]`);
  const seat = document.querySelector(`[data-seat-id="${playerId}"]`);
  const el = catcher ?? seat;
  if (el) {
    const r = el.getBoundingClientRect();
    return {
      x: r.left + r.width / 2 - w / 2,
      y: r.top + r.height / 2 - h / 2,
      w,
      h,
      angle: ((index % 5) - 2) * 6,
    };
  }
  const table = tableRect();
  const angle = Math.PI / 2 + (2 * Math.PI * index) / Math.max(total, 1);
  const cx = table
    ? table.left + table.width * (0.5 + 0.44 * Math.cos(angle))
    : window.innerWidth * (0.5 + 0.32 * Math.cos(angle));
  const cy = table
    ? table.top + table.height * (0.48 + 0.36 * Math.sin(angle))
    : window.innerHeight * (0.42 + 0.28 * Math.sin(angle));
  return { x: cx - w / 2, y: cy - h / 2, w, h, angle: 0 };
}

function youHandRect(received: number): FlightRect {
  const compact = window.innerWidth < 640;
  const size = compact ? "md" : "lg";
  const measured = document.querySelector("[data-hand-root]");
  const next = estimateHandCardRect(Math.max(received + 1, 1), received, size, compact);
  if (measured) return next;
  const { w, h } = CARD_SIZE[size];
  return {
    x: window.innerWidth / 2 - w / 2,
    y: window.innerHeight * 0.82 - h / 2,
    w,
    h,
    angle: 0,
  };
}

type Flyer = {
  key: number;
  from: FlightRect;
  to: FlightRect;
  durationMs: number;
};

export function DealAnimation({
  seats,
  cardsEach = 0,
  onCardLanded,
  onDone,
}: {
  seats: DealSeat[];
  cardsEach?: number;
  onCardLanded: (playerId: string) => void;
  onDone: () => void;
}) {
  const onLandedRef = useRef(onCardLanded);
  const onDoneRef = useRef(onDone);
  const seatsRef = useRef(seats);
  onLandedRef.current = onCardLanded;
  onDoneRef.current = onDone;
  seatsRef.current = seats;

  const [from, setFrom] = useState<FlightRect | null>(null);
  const [flyers, setFlyers] = useState<Flyer[]>([]);
  const [remaining, setRemaining] = useState(8);
  const flyerSeq = useRef(0);
  const seatKey = seats.map((s) => s.id).join("|");

  useEffect(() => {
    if (prefersReducedMotion()) {
      onDoneRef.current();
      return;
    }

    let cancelled = false;
    const timers: number[] = [];
    const seatList = seatsRef.current.length > 0 ? seatsRef.current : [{ id: "you", isYou: true }];
    const rounds = dealRounds(seatList.length, cardsEach);
    const total = seatList.length * rounds;

    const start = () => {
      if (cancelled) return;
      const origin = deckRect();
      setFrom(origin);
      setRemaining(Math.min(8, total));

      let spawned = 0;
      let youSpawned = 0;
      for (let round = 0; round < rounds; round++) {
        for (let i = 0; i < seatList.length; i++) {
          const seat = seatList[i]!;
          const delay = WINDUP_MS + spawned * STAGGER_MS;
          const index = spawned;
          spawned += 1;
          const youIndex = seat.isYou ? youSpawned++ : 0;

          timers.push(
            window.setTimeout(() => {
              if (cancelled) return;
              const fromRect = deckRect();
              const to = seat.isYou
                ? youHandRect(youIndex)
                : seatCatchRect(seat.id, i, seatList.length);
              flyerSeq.current += 1;
              const flyer: Flyer = {
                key: flyerSeq.current,
                from: fromRect,
                to,
                durationMs: FLIGHT_MS,
              };
              setFlyers((cur) => [...cur, flyer]);
              setRemaining(Math.max(0, Math.min(8, total - index - 1)));
              playSfx("deal");
            }, delay),
          );

          timers.push(
            window.setTimeout(() => {
              if (cancelled) return;
              onLandedRef.current(seat.id);
            }, delay + FLIGHT_MS - 40),
          );
        }
      }

      timers.push(
        window.setTimeout(() => {
          if (!cancelled) onDoneRef.current();
        }, dealAnimationMs(seatList.length, cardsEach)),
      );
    };

    const kick = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(start);
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(kick);
      for (const t of timers) window.clearTimeout(t);
    };
  }, [seatKey, cardsEach]);

  if (!from) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-70">
      <div
        className="absolute h-40 w-40 rounded-full bg-amber-300/15 blur-3xl"
        style={{
          left: from.x + from.w / 2,
          top: from.y + from.h / 2,
          transform: "translate(-50%, -50%)",
        }}
      />

      {remaining > 0 ? (
        <div
          className="absolute"
          style={{ left: from.x, top: from.y, width: from.w, height: from.h }}
        >
          {Array.from({ length: remaining }, (_, layer) => (
            <div
              key={layer}
              className="absolute"
              style={{
                left: layer * 1.2,
                top: -layer * 1.4,
                zIndex: layer,
                transform: `rotate(${layer * 1.4 - 2}deg)`,
              }}
            >
              <CardBack size="sm" className="relative!" style={{ position: "relative" }} />
            </div>
          ))}
        </div>
      ) : null}

      {flyers.map((flyer) => (
        <DealFlyer
          key={flyer.key}
          flyer={flyer}
          onDone={() => setFlyers((cur) => cur.filter((f) => f.key !== flyer.key))}
        />
      ))}
    </div>
  );
}

function DealFlyer({ flyer, onDone }: { flyer: Flyer; onDone: () => void }) {
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

    const dx = flyer.to.x + flyer.to.w / 2 - (flyer.from.x + flyer.from.w / 2);
    const dy = flyer.to.y + flyer.to.h / 2 - (flyer.from.y + flyer.from.h / 2);
    const scale = flyer.to.w / Math.max(flyer.from.w, 1);
    const spin = dx >= 0 ? 160 : -160;
    const arc = Math.min(48, Math.hypot(dx, dy) * 0.12);

    const anim = node.animate(
      [
        {
          transform: "translate(0px, 0px) rotate(0deg) scale(1)",
          opacity: 1,
        },
        {
          transform: `translate(${dx * 0.42}px, ${dy * 0.38 - arc}px) rotate(${spin * 0.45}deg) scale(1.06)`,
          opacity: 1,
          offset: 0.42,
        },
        {
          transform: `translate(${dx}px, ${dy}px) rotate(${flyer.to.angle + spin * 0.15}deg) scale(${scale})`,
          opacity: 0,
        },
      ],
      {
        duration: flyer.durationMs,
        easing: "cubic-bezier(0.18, 0.84, 0.22, 1)",
        fill: "forwards",
      },
    );

    anim.onfinish = done;
    const t = window.setTimeout(done, flyer.durationMs + 80);
    return () => {
      window.clearTimeout(t);
      anim.cancel();
    };
  }, [flyer.key, flyer.durationMs, flyer.from, flyer.to]);

  return (
    <div
      ref={nodeRef}
      className="absolute will-change-transform"
      style={
        {
          left: flyer.from.x,
          top: flyer.from.y,
          width: flyer.from.w,
          height: flyer.from.h,
          zIndex: 80,
          transformOrigin: "center center",
          filter: "drop-shadow(0 10px 16px rgba(0,0,0,0.45))",
        } as CSSProperties
      }
    >
      <CardBack size="sm" className="relative! h-full! w-full!" style={{ position: "relative", width: "100%", height: "100%" }} />
    </div>
  );
}
