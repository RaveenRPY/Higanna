"use client";

import { useEffect, useRef, useState } from "react";
import { getPlayerId } from "@/lib/socket";
import {
  isSfxMuted,
  playSfx,
  setSfxMuted,
  subscribeSfx,
  unlockAudio,
} from "@/lib/sounds";
import type { ClientView } from "@/lib/types";

export function useGameSfx(view: ClientView | null, dealing: boolean, toast: string) {
  const primed = useRef(false);
  const roomRef = useRef<string | null>(null);
  const prev = useRef<{
    phase: ClientView["phase"] | null;
    turnId: string | null;
    playCount: number;
    passed: string;
    locked: boolean;
    closing: boolean;
    counts: string;
    dealing: boolean;
    toast: string;
  }>({
    phase: null,
    turnId: null,
    playCount: 0,
    passed: "",
    locked: false,
    closing: false,
    counts: "",
    dealing: false,
    toast: "",
  });

  useEffect(() => {
    if (!view) {
      primed.current = false;
      roomRef.current = null;
      return;
    }
    if (roomRef.current !== view.code) {
      roomRef.current = view.code;
      primed.current = false;
    }

    const youId = getPlayerId();
    const plays = view.trickPlays ?? (view.lastPlay ? [view.lastPlay] : []);
    const passed = view.players
      .filter((p) => p.passed)
      .map((p) => p.id)
      .sort()
      .join(",");
    const snapshot = {
      phase: view.phase,
      turnId: view.currentTurnId,
      playCount: plays.length,
      passed,
      locked: view.patternLocked,
      closing: view.closing,
      counts: view.players.map((p) => `${p.id}:${p.cardCount}`).join("|"),
      dealing,
      toast,
    };

    if (!primed.current) {
      primed.current = true;
      prev.current = snapshot;
      return;
    }

    const last = prev.current;

    if (last.phase === "lobby" && (view.phase === "playing" || view.phase === "tribute")) {
      playSfx("shuffle");
    }

    if (plays.length > last.playCount) {
      playSfx("play");
    }

    if (passed !== last.passed && passed.length > last.passed.length) {
      playSfx("pass");
    }

    if (!dealing && last.dealing && view.currentTurnId === youId && !view.closing) {
      playSfx("yourTurn");
    } else if (
      !dealing &&
      view.currentTurnId === youId &&
      view.currentTurnId !== last.turnId &&
      !view.closing &&
      (view.phase === "playing" || view.phase === "tribute")
    ) {
      playSfx("yourTurn");
    }

    if (view.patternLocked && !last.locked) playSfx("patternLock");
    if (view.closing && !last.closing) playSfx("trickWin");

    if (
      view.phase === "tribute" &&
      last.phase === "tribute" &&
      snapshot.counts !== last.counts
    ) {
      playSfx("tribute");
    }

    if (view.phase === "finished" && last.phase !== "finished") {
      window.setTimeout(() => playSfx("gameOver"), 280);
    }

    if (toast && toast !== last.toast) playSfx("error");

    prev.current = snapshot;
  }, [view, dealing, toast]);
}

export function SfxButton() {
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    setMuted(isSfxMuted());
    return subscribeSfx(() => setMuted(isSfxMuted()));
  }, []);

  return (
    <button
      type="button"
      onClick={() => {
        const next = !muted;
        setSfxMuted(next);
        unlockAudio();
        if (!next) playSfx("select");
      }}
      className="grid size-11 shrink-0 place-items-center rounded-full bg-white/6 text-base text-amber-100/80 hover:bg-white/10"
      aria-label={muted ? "Unmute sound" : "Mute sound"}
      title={muted ? "Sound off" : "Sound on"}
    >
      {muted ? (
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M11 5 6.5 9H3v6h3.5L11 19V5Z"
          />
          <path stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" d="m16 10 5 5M21 10l-5 5" />
        </svg>
      ) : (
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M11 5 6.5 9H3v6h3.5L11 19V5Z"
          />
          <path
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            d="M15.5 8.5a5 5 0 0 1 0 7M18.2 6.2a8.5 8.5 0 0 1 0 11.6"
          />
        </svg>
      )}
    </button>
  );
}
