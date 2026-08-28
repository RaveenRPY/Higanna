"use client";

import { useId, type CSSProperties } from "react";
import type { Suit } from "@/lib/types";

const RED = "#d32f2f";
const BLACK = "#1c1c1c";

export function suitColor(suit?: Suit) {
  return suit === "hearts" || suit === "diamonds" ? RED : BLACK;
}

export function SuitPip({
  suit,
  fill,
  className,
  style,
  ornate = false,
}: {
  suit: Suit;
  fill: string;
  className?: string;
  style?: CSSProperties;
  ornate?: boolean;
}) {
  const uid = useId().replace(/:/g, "");
  const g = `pip-${uid}`;
  return (
    <svg viewBox="0 0 100 110" className={className} style={style} aria-hidden>
      <defs>
        <radialGradient id={g} cx="38%" cy="32%" r="70%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="42%" stopColor={fill} />
          <stop offset="100%" stopColor={fill === RED ? "#8e1515" : "#000"} />
        </radialGradient>
      </defs>
      {suit === "hearts" ? (
        <path
          fill={`url(#${g})`}
          d="M50 96C18 70 4 50 4 30 4 16 16 6 30 6c8 0 14 4 20 12C56 10 62 6 70 6c14 0 26 10 26 24 0 20-14 40-46 66Z"
        />
      ) : null}
      {suit === "diamonds" ? (
        <path fill={`url(#${g})`} d="M50 4 94 55 50 106 6 55Z" />
      ) : null}
      {suit === "spades" ? (
        <g fill={`url(#${g})`}>
          <path d="M50 4C28 28 6 46 6 64c0 14 12 24 26 24 6 0 12-2 18-8 6 6 12 8 18 8 14 0 26-10 26-24 0-18-22-36-44-60Z" />
          <path d="M50 72c-6 10-12 26-12 34h24c0-8-6-24-12-34Z" />
        </g>
      ) : null}
      {suit === "clubs" ? (
        <g fill={`url(#${g})`}>
          <circle cx="50" cy="28" r="20" />
          <circle cx="28" cy="52" r="20" />
          <circle cx="72" cy="52" r="20" />
          <path d="M50 52c-6 12-12 30-12 40h24c0-10-6-28-12-40Z" />
        </g>
      ) : null}
      {ornate && suit === "spades" ? (
        <g fill="#fff" opacity="0.85">
          <path d="M50 22c-6 10-4 16 0 22 4-6 6-12 0-22Z" />
          <circle cx="50" cy="54" r="4" />
          <path d="M38 58c8 4 16 4 24 0-8 8-16 8-24 0Z" />
        </g>
      ) : null}
    </svg>
  );
}

function SuitGroup({ suit, fill }: { suit: Suit; fill: string }) {
  if (suit === "hearts") {
    return (
      <path
        fill={fill}
        d="M50 96C18 70 4 50 4 30 4 16 16 6 30 6c8 0 14 4 20 12C56 10 62 6 70 6c14 0 26 10 26 24 0 20-14 40-46 66Z"
      />
    );
  }
  if (suit === "diamonds") return <path fill={fill} d="M50 4 94 55 50 106 6 55Z" />;
  if (suit === "spades") {
    return (
      <g fill={fill}>
        <path d="M50 4C28 28 6 46 6 64c0 14 12 24 26 24 6 0 12-2 18-8 6 6 12 8 18 8 14 0 26-10 26-24 0-18-22-36-44-60Z" />
        <path d="M50 72c-6 10-12 26-12 34h24c0-8-6-24-12-34Z" />
      </g>
    );
  }
  return (
    <g fill={fill}>
      <circle cx="50" cy="28" r="20" />
      <circle cx="28" cy="52" r="20" />
      <circle cx="72" cy="52" r="20" />
      <path d="M50 52c-6 12-12 30-12 40h24c0-10-6-28-12-40Z" />
    </g>
  );
}

function Filigree({ id }: { id: string }) {
  return (
    <pattern id={id} width="28" height="28" patternUnits="userSpaceOnUse">
      <path
        d="M14 2c4 6 8 8 12 12-4 4-8 6-12 12-4-6-8-8-12-12C6 10 10 8 14 2Z"
        fill="none"
        stroke="#9eb9d2"
        strokeWidth="0.8"
      />
      <circle cx="14" cy="14" r="2.2" fill="none" stroke="#b7cde0" strokeWidth="0.7" />
      <path d="M2 14h8M18 14h8M14 2v8M14 18v8" stroke="#c5d8ea" strokeWidth="0.6" />
    </pattern>
  );
}

function JackFigure() {
  return (
    <g stroke="#111" strokeWidth="1.1" strokeLinejoin="round">
      <path fill="#1d3f86" d="M28 108 48 70h44l22 38" />
      <path fill="#c62828" d="M48 70h44l-6 16H54Z" />
      <path fill="#f2c14e" d="M58 86h24v10H58Z" />
      <ellipse cx="78" cy="48" rx="16" ry="20" fill="#f3d2b3" />
      <path fill="#1d3f86" d="M62 36c0-16 10-24 22-22 8 10 6 22 2 30H70c-6-2-8-6-8-8Z" />
      <path fill="#c62828" d="M68 28h22v6H68Z" />
      <path fill="#f2c14e" d="M72 22h8v8h-8Z" />
      <path fill="none" d="M84 48h6" />
      <circle cx="86" cy="46" r="1.4" fill="#111" stroke="none" />
      <path fill="#c4c8ce" d="M34 40 22 78h10l16-30Z" />
      <path fill="#8d6e3d" d="M22 78h10v18H22Z" />
      <path fill="#c62828" d="M70 108h20v4H70Z" />
    </g>
  );
}

function QueenFigure() {
  return (
    <g stroke="#111" strokeWidth="1.1" strokeLinejoin="round">
      <path fill="#1d3f86" d="M30 108 52 68h48l22 40" />
      <path fill="#c62828" d="M52 68h48v14H52Z" />
      <path fill="#c62828" d="M58 20 78 8l20 12-6 16H64Z" />
      <ellipse cx="78" cy="46" rx="17" ry="20" fill="#f3d2b3" />
      <path fill="#c62828" d="M60 40c4 22 32 22 36 0-2 18-34 18-36 0Z" opacity="0.85" />
      <path fill="#f2c14e" d="M64 18h28v8H64Z" />
      <circle cx="86" cy="44" r="1.4" fill="#111" stroke="none" />
      <path fill="none" d="M84 46c2 4 8 4 10 0" />
      <path fill="#c62828" d="M108 70c-8 4-10 14-6 22 8-8 12-16 6-22Z" />
      <circle cx="108" cy="68" r="4" fill="#c62828" />
    </g>
  );
}

function KingFigure() {
  return (
    <g stroke="#111" strokeWidth="1.1" strokeLinejoin="round">
      <path fill="#c62828" d="M26 108 50 66h52l24 42" />
      <path fill="#1d3f86" d="M50 66h52v18H50Z" />
      <path fill="#f2c14e" d="M54 18 78 6l24 12-4 14H58Z" />
      <ellipse cx="78" cy="46" rx="18" ry="20" fill="#f3d2b3" />
      <path fill="#6a4a32" d="M62 56c6 14 26 14 32 0-8 10-24 10-32 0Z" />
      <circle cx="72" cy="44" r="1.5" fill="#111" stroke="none" />
      <circle cx="86" cy="44" r="1.5" fill="#111" stroke="none" />
      <path fill="none" d="M74 52h10" />
      <path fill="#c4c8ce" d="M108 18v70h8V40Z" />
      <path fill="#c4c8ce" d="M104 18h16l-8 10Z" />
    </g>
  );
}

export function CourtArt({ rank, suit }: { rank: "J" | "Q" | "K"; suit: Suit }) {
  const uid = useId().replace(/:/g, "");
  const Figure = rank === "J" ? JackFigure : rank === "Q" ? QueenFigure : KingFigure;
  const color = suitColor(suit);
  return (
    <svg viewBox="0 0 160 224" className="h-full w-full" aria-hidden>
      <defs>
        <Filigree id={`fil-${uid}`} />
        <clipPath id={`top-${uid}`}>
          <rect x="0" y="0" width="160" height="112" />
        </clipPath>
      </defs>
      <rect x="6" y="8" width="148" height="208" rx="5" fill={`url(#fil-${uid})`} stroke="#8eacc6" strokeWidth="1.4" />
      <g clipPath={`url(#top-${uid})`}>
        <Figure />
      </g>
      <g transform="rotate(180 80 112)" clipPath={`url(#top-${uid})`}>
        <Figure />
      </g>
      <line x1="14" y1="112" x2="146" y2="112" stroke="#8eacc6" strokeWidth="1" />
      <g transform="translate(118,18) scale(0.22)">
        <SuitGroup suit={suit} fill={color} />
      </g>
      <g transform="translate(42,206) scale(0.22) rotate(180)">
        <SuitGroup suit={suit} fill={color} />
      </g>
    </svg>
  );
}

function Jester({ mono }: { mono: boolean }) {
  const hat = mono ? ["#1e4d8c", "#4aa3c7", "#163a6b"] : ["#d32f2f", "#f2c14e", "#1d3f86"];
  const face = mono ? "#d9eef7" : "#f3d2b3";
  const nose = mono ? "#4aa3c7" : "#d32f2f";
  const ruff = mono ? "#1e4d8c" : "#d32f2f";
  return (
    <g stroke="#111" strokeWidth="1.1" strokeLinejoin="round">
      <path fill={hat[0]} d="M80 48 44 8l8 36Z" />
      <path fill={hat[1]} d="M80 48 80 2l10 46Z" />
      <path fill={hat[2]} d="M80 48 116 8l-8 36Z" />
      <circle cx="44" cy="8" r="5" fill={hat[1]} />
      <circle cx="80" cy="2" r="5" fill={hat[0]} />
      <circle cx="116" cy="8" r="5" fill={hat[1]} />
      <ellipse cx="80" cy="62" rx="22" ry="24" fill={face} />
      <circle cx="72" cy="58" r="2" fill="#111" stroke="none" />
      <circle cx="90" cy="58" r="2" fill="#111" stroke="none" />
      <path fill="none" d="M72 72c6 6 12 6 18 0" />
      <circle cx="80" cy="66" r="4" fill={nose} stroke="none" />
      <path fill={ruff} d="M50 84c10 14 50 14 60 0-16 8-44 8-60 0Z" />
      <path fill={mono ? "#4aa3c7" : "#f2c14e"} d="M58 84h44v8H58Z" />
    </g>
  );
}

export function JokerArt({ mono }: { mono: boolean }) {
  const uid = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 160 224" className="h-full w-full" aria-hidden>
      <defs>
        <clipPath id={`jt-${uid}`}>
          <rect x="0" y="0" width="160" height="112" />
        </clipPath>
      </defs>
      <rect x="22" y="12" width="116" height="200" rx="6" fill={mono ? "#eaf4fb" : "#fff8e8"} stroke="#8eacc6" />
      <g clipPath={`url(#jt-${uid})`}>
        <Jester mono={mono} />
      </g>
      <g transform="rotate(180 80 112)" clipPath={`url(#jt-${uid})`}>
        <Jester mono={mono} />
      </g>
    </svg>
  );
}
