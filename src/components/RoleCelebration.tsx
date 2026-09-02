"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ClientView, PublicPlayer, Role } from "@/lib/types";
import { playRoleSfx } from "@/lib/sounds";

const ROLE_LABEL: Record<Role, string> = {
  king: "රජු",
  queen: "රැජින",
  beggar: "හිඟන්නා",
};

const ROLE_ASSET: Record<Role, string> = {
  king: "/assets/king-crown.svg",
  queen: "/assets/queen-crown.svg",
  beggar: "/assets/begger.svg",
};

const CONFETTI_PALETTE: Record<Role, string[]> = {
  king: ["#fbbf24", "#f59e0b", "#fde68a", "#fcd34d", "#fff7ed"],
  queen: ["#f472b6", "#e879f9", "#fda4af", "#fbcfe8", "#fef3c7"],
  beggar: ["#a8a29e", "#78716c", "#d6d3d1", "#ca8a04", "#fef9c3"],
};

export function RoleCrown({
  role,
  compact = false,
  className = "",
}: {
  role: Role;
  compact?: boolean;
  className?: string;
}) {
  const size =
    role === "beggar"
      ? compact
        ? 26
        : 34
      : compact
        ? 34
        : 44;

  return (
    <div
      className={["role-crown-float pointer-events-none flex flex-col items-center", className].join(" ")}
      aria-hidden
    >
      <img
        src={ROLE_ASSET[role]}
        alt=""
        width={size}
        height={size}
        className={[
          "role-crown-shine object-contain",
          role === "king"
            ? "drop-shadow-[0_4px_10px_rgba(251,191,36,0.55)]"
            : role === "queen"
              ? "drop-shadow-[0_4px_10px_rgba(244,114,182,0.5)]"
              : "drop-shadow-[0_4px_10px_rgba(120,113,108,0.45)]",
        ].join(" ")}
        draggable={false}
      />
      <span
        className={[
          "mt-0.5 rounded-full font-semibold uppercase tracking-wide",
          compact ? "px-1 py-px text-[7px]" : "px-1.5 py-0.5 text-[8px]",
          role === "king"
            ? "bg-amber-400/25 text-amber-100"
            : role === "queen"
              ? "bg-pink-400/20 text-pink-100"
              : "bg-stone-400/20 text-stone-200",
        ].join(" ")}
      >
        {ROLE_LABEL[role]}
      </span>
    </div>
  );
}

type ConfettiBurst = {
  id: number;
  role: Role;
  playerName: string;
};

function ConfettiOverlay({ burst, onDone }: { burst: ConfettiBurst; onDone: () => void }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: 42 }, (_, i) => ({
        id: i,
        left: `${8 + Math.random() * 84}%`,
        delay: `${Math.random() * 0.35}s`,
        duration: `${2.2 + Math.random() * 1.1}s`,
        color: CONFETTI_PALETTE[burst.role][i % CONFETTI_PALETTE[burst.role].length],
        rotate: `${Math.random() * 360}deg`,
        drift: `${-40 + Math.random() * 80}px`,
        size: 5 + Math.floor(Math.random() * 5),
      })),
    [burst.role],
  );

  useEffect(() => {
    const t = window.setTimeout(onDone, 3200);
    return () => window.clearTimeout(t);
  }, [onDone]);

  return (
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden" aria-hidden>
      <div className="role-title-pop absolute left-1/2 top-[18%] w-[min(90%,320px)] -translate-x-1/2 rounded-3xl border border-white/15 bg-black/55 px-4 py-3 text-center shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-md">
        <p className="text-[10px] uppercase tracking-[0.35em] text-amber-300/80">Title found</p>
        <p className="mt-1 font-serif text-xl text-amber-50 sm:text-2xl">
          {ROLE_LABEL[burst.role]} — {burst.playerName}
        </p>
      </div>
      {pieces.map((p) => (
        <span
          key={p.id}
          className="confetti-piece absolute top-0 block rounded-[1px]"
          style={{
            left: p.left,
            width: p.size,
            height: p.size * 1.35,
            backgroundColor: p.color,
            animationDelay: p.delay,
            animationDuration: p.duration,
            ["--confetti-rotate" as string]: p.rotate,
            ["--confetti-drift" as string]: p.drift,
          }}
        />
      ))}
    </div>
  );
}

export function RoleCelebrationLayer({
  bursts,
  onDismiss,
}: {
  bursts: ConfettiBurst[];
  onDismiss: (id: number) => void;
}) {
  if (bursts.length === 0) return null;
  return (
    <>
      {bursts.map((burst) => (
        <ConfettiOverlay key={burst.id} burst={burst} onDone={() => onDismiss(burst.id)} />
      ))}
    </>
  );
}

export function useRoleCelebrations(view: ClientView | null) {
  const prevRolesRef = useRef<Map<string, Role>>(new Map());
  const roundRef = useRef(0);
  const initializedRef = useRef(false);
  const burstIdRef = useRef(0);
  const [bursts, setBursts] = useState<ConfettiBurst[]>([]);

  useEffect(() => {
    if (!view || view.phase === "lobby") {
      prevRolesRef.current = new Map();
      initializedRef.current = false;
      roundRef.current = 0;
      setBursts([]);
      return;
    }

    if (view.round !== roundRef.current) {
      roundRef.current = view.round;
      prevRolesRef.current = new Map(
        view.players.filter((p) => p.role).map((p) => [p.id, p.role!]),
      );
      initializedRef.current = true;
      return;
    }

    if (!initializedRef.current) {
      prevRolesRef.current = new Map(
        view.players.filter((p) => p.role).map((p) => [p.id, p.role!]),
      );
      initializedRef.current = true;
      return;
    }

    const prev = prevRolesRef.current;
    const next = new Map(prev);
    const fresh: ConfettiBurst[] = [];

    for (const p of view.players) {
      if (!p.role) {
        next.delete(p.id);
        continue;
      }
      if (prev.get(p.id) !== p.role) {
        fresh.push({
          id: ++burstIdRef.current,
          role: p.role,
          playerName: p.name,
        });
      }
      next.set(p.id, p.role);
    }

    prevRolesRef.current = next;
    if (fresh.length > 0) {
      for (const burst of fresh) playRoleSfx(burst.role);
      setBursts((current) => [...current, ...fresh]);
    }
  }, [view]);

  const dismissBurst = (id: number) => {
    setBursts((current) => current.filter((b) => b.id !== id));
  };

  return { bursts, dismissBurst };
}

export function playerHasRoleBadge(player: PublicPlayer, phase: ClientView["phase"] | undefined) {
  if (!player.role || !phase || phase === "lobby") return false;
  return true;
}
