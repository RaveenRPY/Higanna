"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { BackFan, CardBack, CardFan, PlayingCard, TablePlayStack } from "@/components/PlayingCard";
import { JoinRoomScreen } from "@/components/JoinRoomScreen";
import {
  CardFlightLayer,
  estimateHandCardRect,
  estimateTableCenterRect,
  estimateYouSeatPreviewRect,
  measureFlightRect,
  type CardFlight,
} from "@/components/CardFlight";
import { sortHand, TURN_DURATION_MS } from "@/lib/engine";
import { getShareLink, copyText } from "@/lib/shareLink";
import { getPlayerId, getPlayerName, getSocket } from "@/lib/socket";
import { RANKS, SUITS, type Card, type ClientView, type JokerDeclaration, type PublicPlayer, type Rank, type Suit } from "@/lib/types";

const ROLE_LABEL: Record<string, string> = {
  king: "රජු",
  queen: "රැජින",
  beggar: "හිගන්නා",
};

const SUIT_MARK: Record<Suit, string> = {
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  spades: "♠",
};

function formatTurnClock(remainingMs: number): string {
  const sec = Math.max(0, Math.ceil(remainingMs / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function useTurnRemaining(endsAt: number | null | undefined): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!endsAt) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [endsAt]);
  if (!endsAt) return null;
  return Math.max(0, endsAt - now);
}

function TurnTimerBadge({
  endsAt,
  compact = false,
  large = false,
}: {
  endsAt: number | null | undefined;
  compact?: boolean;
  large?: boolean;
}) {
  const remaining = useTurnRemaining(endsAt);
  if (endsAt == null) return null;
  const ms = remaining ?? 0;
  const urgent = ms <= 10_000;
  return (
    <div
      className={[
        "turn-timer inline-flex items-center justify-center rounded-full border font-semibold shadow-sm",
        urgent
          ? "turn-timer-urgent border-red-300/60 bg-red-950/80 text-red-100"
          : "border-amber-300/50 bg-black/75 text-amber-50",
        large ? "min-w-[4.5rem] px-3 py-1.5 text-base tracking-wide" : compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-0.5 text-[11px]",
      ].join(" ")}
      aria-label={`Turn time remaining ${formatTurnClock(ms)}`}
    >
      {formatTurnClock(ms)}
    </div>
  );
}

function seatStyle(index: number, total: number): CSSProperties {
  const angle = Math.PI / 2 + (2 * Math.PI * index) / Math.max(total, 1);
  const x = 50 + 44 * Math.cos(angle);
  const y = 48 + 36 * Math.sin(angle);
  return { left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -50%)" };
}

export function GameRoom({
  codeParam,
  inviteJoin = false,
}: {
  codeParam: string;
  /** True only for Share / invite links (`?join=1`). Host create never sets this. */
  inviteJoin?: boolean;
}) {
  const router = useRouter();
  const roomCode = codeParam === "new" ? "new" : codeParam.trim().toUpperCase();
  const joinedSessionKey = `higanna-joined-${roomCode}`;
  const [joinName, setJoinName] = useState<string | null>(null);
  const [needsJoinGate, setNeedsJoinGate] = useState(false);
  const [gateReady, setGateReady] = useState(roomCode === "new");
  const [view, setView] = useState<ClientView | null>(null);
  const [toast, setToast] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [dealing, setDealing] = useState(false);
  const [dealTick, setDealTick] = useState(0);
  const [tablePlays, setTablePlays] = useState<{ playerName: string; cards: Card[] }[]>([]);
  const [roundCloseMsg, setRoundCloseMsg] = useState("");
  const [jokerPrompt, setJokerPrompt] = useState<Card[] | null>(null);
  const [jokerAs, setJokerAs] = useState<Record<string, JokerDeclaration>>({});
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false);
  const [leavingIds, setLeavingIds] = useState<string[]>([]);
  const [ghostIds, setGhostIds] = useState<string[]>([]);
  const [flights, setFlights] = useState<CardFlight[]>([]);
  const [fallbackTurnEndsAt, setFallbackTurnEndsAt] = useState<number | null>(null);
  const flightSeq = useRef(0);
  const flightsRef = useRef<CardFlight[]>([]);
  flightsRef.current = flights;
  const joined = useRef(false);
  const prevRound = useRef(0);
  const lastTrackedPlay = useRef("");
  const lastAnnouncement = useRef("");

  useEffect(() => {
    if (roomCode === "new") {
      if (!getPlayerName()) router.replace("/");
      setNeedsJoinGate(false);
      setGateReady(true);
      return;
    }
    // Name page only for invite/share links — never for host lobby navigation.
    const alreadyJoined = Boolean(sessionStorage.getItem(joinedSessionKey));
    setNeedsJoinGate(inviteJoin && !alreadyJoined);
    setGateReady(true);
  }, [roomCode, router, joinedSessionKey, inviteJoin]);

  useEffect(() => {
    if (!gateReady || needsJoinGate) return;
    const name = joinName || getPlayerName();
    if (!name) {
      if (inviteJoin) {
        setNeedsJoinGate(true);
        return;
      }
      router.replace("/");
      return;
    }

    const socket = getSocket();
    const playerId = getPlayerId();

    function onState(next: ClientView & { error?: string }) {
      if (next.error && !next.code) {
        setToast(next.error);
        if (inviteJoin) {
          sessionStorage.removeItem(joinedSessionKey);
          joined.current = false;
          setNeedsJoinGate(true);
          setView(null);
        }
        return;
      }
      setView(next);
      if (roomCode === "new" && next.code) {
        sessionStorage.setItem(`higanna-joined-${next.code}`, "1");
        router.replace(`/room/${next.code}`);
        return;
      }
      // After invite join, drop ?join=1 so refresh stays in the lobby.
      if (inviteJoin && next.code) {
        sessionStorage.setItem(`higanna-joined-${next.code}`, "1");
        router.replace(`/room/${next.code}`);
      }
    }
    function onToast(msg: string) {
      setLeavingIds((ids) => {
        if (ids.length > 0) {
          queueMicrotask(() => setSelected(ids));
        }
        return [];
      });
      setGhostIds([]);
      setFlights([]);
      setToast(msg);
    }

    socket.on("state", onState);
    socket.on("toast", onToast);

    if (!joined.current) {
      joined.current = true;
      if (roomCode === "new") {
        socket.emit("create", { name, playerId });
      } else {
        socket.emit("join", { code: roomCode, name, playerId });
      }
    }

    return () => {
      socket.off("state", onState);
      socket.off("toast", onToast);
    };
  }, [roomCode, router, needsJoinGate, joinName, joinedSessionKey, gateReady, inviteJoin]);

  useEffect(() => {
    if (!view) return;
    const ids = new Set(view.you?.hand.map((c) => c.id) ?? []);
    setSelected((cur) => cur.filter((id) => ids.has(id)));
    if (
      view.round > 0 &&
      view.round !== prevRound.current &&
      (view.phase === "playing" || view.phase === "tribute")
    ) {
      prevRound.current = view.round;
      setDealing(true);
      setDealTick((n) => n + 1);
      const t = window.setTimeout(() => setDealing(false), 2400);
      return () => window.clearTimeout(t);
    }
    if (view.round === 0) prevRound.current = 0;
  }, [view]);

  useEffect(() => {
    if (!view) return;
    if (view.phase === "lobby") {
      setTablePlays([]);
      lastTrackedPlay.current = "";
      return;
    }
    if (!view.lastPlay) {
      setTablePlays([]);
      lastTrackedPlay.current = "";
      return;
    }
    const sig = `${view.round}:${view.lastPlay.playerId}:${view.lastPlay.cards.map((c) => c.id).join(",")}:${view.lastPlay.strength}`;
    if (sig === lastTrackedPlay.current) return;
    lastTrackedPlay.current = sig;
    setTablePlays((cur) => [...cur.slice(-4), { playerName: view.lastPlay!.playerName, cards: view.lastPlay!.cards }]);
  }, [view]);

  useEffect(() => {
    if (!view?.announcement) return;
    if (view.announcement === lastAnnouncement.current) return;
    lastAnnouncement.current = view.announcement;
    setRoundCloseMsg(view.announcement);
    const t = window.setTimeout(() => setRoundCloseMsg(""), 3200);
    return () => window.clearTimeout(t);
  }, [view?.announcement]);

  const youId = view?.you?.id;
  const seated = useMemo(() => {
    if (!view) return [];
    const players = view.players;
    const idx = players.findIndex((p) => p.id === youId);
    if (idx < 0) return players;
    return [...players.slice(idx), ...players.slice(0, idx)];
  }, [view, youId]);

  const myTurn = view?.currentTurnId === youId;
  const isKing = view?.you?.role === "king";
  const canPick = view?.phase === "playing" || (view?.phase === "tribute" && isKing);
  const turnActive =
    Boolean(view?.currentTurnId) &&
    !view?.closing &&
    (view?.phase === "playing" || view?.phase === "tribute");

  useEffect(() => {
    if (!turnActive || !view?.currentTurnId) {
      setFallbackTurnEndsAt(null);
      return;
    }
    if (view.turnEndsAt) {
      setFallbackTurnEndsAt(null);
      return;
    }
    setFallbackTurnEndsAt(Date.now() + TURN_DURATION_MS);
  }, [turnActive, view?.currentTurnId, view?.turnEndsAt, view?.phase]);

  const turnEndsAt = view?.turnEndsAt ?? fallbackTurnEndsAt;
  const turnPlayerName = view?.players.find((p) => p.id === view.currentTurnId)?.name;
  const displayHand = useMemo(() => {
    if (!view?.you) return [];
    return dealing ? view.you.hand : sortHand(view.you.hand);
  }, [view?.you, dealing]);

  function spawnFlight(partial: Omit<CardFlight, "key" | "durationMs"> & { durationMs?: number }) {
    flightSeq.current += 1;
    const key = `fly-${flightSeq.current}-${partial.card.id}`;
    const durationMs = partial.durationMs ?? 380;
    setGhostIds((g) => (g.includes(partial.card.id) ? g : [...g, partial.card.id]));
    setFlights((cur) => [...cur.filter((f) => f.card.id !== partial.card.id), { ...partial, key, durationMs }]);
  }

  function endFlight(key: string) {
    const done = flightsRef.current.find((f) => f.key === key);
    if (done) {
      setGhostIds((g) => g.filter((id) => id !== done.card.id));
    }
    // Keep flyer one frame so the settled card paints underneath first.
    requestAnimationFrame(() => {
      setFlights((cur) => cur.filter((f) => f.key !== key));
    });
  }

  function toggle(id: string) {
    const card = displayHand.find((c) => c.id === id);
    if (!card || !view || ghostIds.includes(id) || flights.some((f) => f.card.id === id)) return;

    const isSelected = selected.includes(id);

    if (view.phase === "tribute") {
      if (isSelected) {
        const from =
          measureFlightRect(`[data-preview-card="${id}"]`, "md") ??
          estimateYouSeatPreviewRect(1, 0);
        const willBeVisible = displayHand.filter((c) => c.id === id || !selected.includes(c.id));
        const index = Math.max(0, willBeVisible.findIndex((c) => c.id === id));
        // Mount hand slot first, then measure exact landing rect.
        flushSync(() => {
          setGhostIds((g) => (g.includes(id) ? g : [...g, id]));
          setSelected([]);
        });
        const to =
          measureFlightRect(`[data-hand-card="${id}"]`, "lg") ??
          estimateHandCardRect(willBeVisible.length, index);
        spawnFlight({ card, from, to });
        return;
      }
      const from =
        measureFlightRect(`[data-hand-card="${id}"]`, "lg") ??
        estimateHandCardRect(displayHand.filter((c) => !selected.includes(c.id)).length || 1, 0);
      flushSync(() => {
        setGhostIds((g) => (g.includes(id) ? g : [...g, id]));
        setSelected([id]);
      });
      const to =
        measureFlightRect(`[data-preview-card="${id}"]`, "md") ?? estimateYouSeatPreviewRect(1, 0);
      spawnFlight({ card, from, to });
      return;
    }

    if (isSelected) {
      const idx = selected.indexOf(id);
      const from =
        measureFlightRect(`[data-preview-card="${id}"]`, "md") ??
        estimateYouSeatPreviewRect(selected.length, idx);
      const willBeVisible = displayHand.filter((c) => c.id === id || !selected.includes(c.id));
      const index = Math.max(0, willBeVisible.findIndex((c) => c.id === id));
      flushSync(() => {
        setGhostIds((g) => (g.includes(id) ? g : [...g, id]));
        setSelected((cur) => cur.filter((x) => x !== id));
      });
      const to =
        measureFlightRect(`[data-hand-card="${id}"]`, "lg") ??
        estimateHandCardRect(willBeVisible.length, index);
      spawnFlight({ card, from, to });
      return;
    }

    const handVisible = displayHand.filter((c) => !selected.includes(c.id));
    const handIndex = handVisible.findIndex((c) => c.id === id);
    const from =
      measureFlightRect(`[data-hand-card="${id}"]`, "lg") ??
      estimateHandCardRect(handVisible.length, Math.max(0, handIndex));
    const nextLen = selected.length + 1;
    // Preview swaps in (badge → cards) before we measure, so flight lands on the real slot.
    flushSync(() => {
      setGhostIds((g) => (g.includes(id) ? g : [...g, id]));
      setSelected((cur) => [...cur, id]);
    });
    const to =
      measureFlightRect(`[data-preview-card="${id}"]`, "md") ??
      estimateYouSeatPreviewRect(nextLen, nextLen - 1);
    spawnFlight({ card, from, to });
  }

  useEffect(() => {
    if (!view?.you || leavingIds.length === 0) return;
    const hand = new Set(view.you.hand.map((c) => c.id));
    if (leavingIds.every((id) => !hand.has(id))) setLeavingIds([]);
  }, [view?.you?.hand, leavingIds]);

  function submitPlay(declarations: Record<string, JokerDeclaration> = {}) {
    const ids = [...selected];
    if (ids.length === 0) return;
    const playCardsList = displayHand.filter((c) => ids.includes(c.id));
    const tableTo = estimateTableCenterRect();

    // Measure preview slots before clearing selection, then keep ids ghosted until flight lands.
    const fromRects = playCardsList.map((card, i) => ({
      card,
      from:
        measureFlightRect(`[data-preview-card="${card.id}"]`, "md") ??
        estimateYouSeatPreviewRect(playCardsList.length, i),
      i,
    }));

    setLeavingIds(ids);
    setSelected([]);
    setGhostIds((g) => [...new Set([...g, ...ids])]);

    fromRects.forEach(({ card, from, i }) => {
      spawnFlight({
        card,
        from,
        to: {
          x: tableTo.x + (i - (playCardsList.length - 1) / 2) * 28,
          y: tableTo.y - 8,
          w: tableTo.w,
          h: tableTo.h,
          angle: (i - (playCardsList.length - 1) / 2) * 4,
        },
        durationMs: 420 + i * 45,
      });
    });

    getSocket().emit("play", { cardIds: ids, jokerAs: declarations });
    setJokerPrompt(null);
    setJokerAs({});
  }

  function onPlayClick() {
    if (!view?.you || selected.length === 0) return;
    const jokers = view.you.hand.filter((c) => selected.includes(c.id) && c.joker);
    if (jokers.length === 0) {
      submitPlay();
      return;
    }
    const initial: Record<string, JokerDeclaration> = {};
    for (const j of jokers) {
      initial[j.id] = jokerAs[j.id] ?? { rank: "A", suit: "spades" };
    }
    setJokerAs(initial);
    setJokerPrompt(jokers);
  }

  if (!gateReady) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#14080a] text-amber-100">
        <p className="animate-pulse text-sm tracking-wide">Loading...</p>
      </div>
    );
  }

  if (needsJoinGate && roomCode !== "new") {
    return (
      <>
        {toast ? <ErrorDialog message={toast} onDismiss={() => setToast("")} /> : null}
        <JoinRoomScreen
          code={roomCode}
          onJoin={(name) => {
            sessionStorage.setItem(joinedSessionKey, "1");
            setJoinName(name);
            setToast("");
            setNeedsJoinGate(false);
          }}
        />
      </>
    );
  }

  if (!view) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#14080a] text-amber-100">
        <div className="rounded-2xl border border-amber-400/20 bg-black/30 px-6 py-4 shadow-2xl">
          <p className="animate-pulse text-sm tracking-wide">Joining room...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#12070a] text-amber-50">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,#6b1d25_0%,transparent_58%),radial-gradient(ellipse_at_bottom,#1a3d2e_0%,transparent_52%)]" />
      <header className="relative z-20 mx-auto mt-4 flex w-[calc(100%-1.5rem)] max-w-6xl items-center justify-between gap-3 rounded-2xl border border-amber-300/15 bg-black/30 px-4 py-3 shadow-[0_16px_40px_rgba(0,0,0,0.35)] backdrop-blur-md sm:px-5">
        <button
          type="button"
          onClick={() => router.push("/")}
          className="rounded-xl border border-amber-200/20 bg-amber-300/5 px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-amber-200/80 hover:bg-amber-300/10 hover:text-amber-100"
        >
          ← Home
        </button>
        <div className="text-center">
          <div className="font-serif text-2xl text-amber-200 sm:text-3xl">හිගන්නා</div>
          <div className="mt-0.5 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={async () => {
                const ok = await copyText(view.code);
                if (ok) {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1500);
                }
              }}
              className="text-[10px] tracking-[0.35em] text-amber-400 hover:text-amber-300 sm:text-xs"
            >
              {view.code} {copied ? "copied" : "copy"}
            </button>
            <button
              type="button"
              onClick={async () => {
                const link = await getShareLink(view.code);
                const ok = await copyText(link);
                if (ok) {
                  setLinkCopied(true);
                  window.setTimeout(() => setLinkCopied(false), 1500);
                }
              }}
              className="rounded-lg border border-amber-300/30 bg-amber-300/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200 hover:bg-amber-300/20 sm:text-xs"
            >
              {linkCopied ? "Link copied" : "Share"}
            </button>
          </div>
        </div>
        <div className="rounded-xl border border-amber-200/15 bg-amber-100/5 px-3 py-1.5 text-right text-[11px] uppercase tracking-wide text-amber-100/70 sm:text-xs">
          {view.phase === "lobby"
            ? "Lobby"
            : view.phase === "tribute"
              ? "Tribute"
              : view.phase === "finished"
                ? "Over"
                : `Round ${view.round}`}
        </div>
      </header>

      {toast ? <ErrorDialog message={toast} onDismiss={() => setToast("")} /> : null}

      {roundCloseMsg ? (
        <div className="pointer-events-none fixed inset-0 z-40 grid place-items-center px-4">
          <div className="round-close-pop rounded-3xl border border-amber-300/40 bg-black/80 px-8 py-6 text-center shadow-[0_24px_70px_rgba(0,0,0,0.55)] backdrop-blur-md">
            <p className="text-xs uppercase tracking-[0.35em] text-amber-400/90">Round closed</p>
            <p className="mt-2 font-serif text-2xl text-amber-100 sm:text-3xl">{roundCloseMsg}</p>
          </div>
        </div>
      ) : null}

      {jokerPrompt ? (
        <JokerDeclareModal
          jokers={jokerPrompt}
          value={jokerAs}
          onChange={setJokerAs}
          onCancel={() => {
            setJokerPrompt(null);
            setJokerAs({});
          }}
          onConfirm={() => submitPlay(jokerAs)}
        />
      ) : null}

      {stopConfirmOpen ? (
        <ConfirmModal
          title="Stop the game?"
          message="Everyone will return to the lobby. Hands and roles will be cleared."
          confirmLabel="Stop game"
          cancelLabel="Keep playing"
          danger
          onCancel={() => setStopConfirmOpen(false)}
          onConfirm={() => {
            setStopConfirmOpen(false);
            getSocket().emit("stop", {
              code: view.code,
              playerId: getPlayerId(),
            });
            setSelected([]);
            setTablePlays([]);
            setJokerPrompt(null);
            setRoundCloseMsg("");
          }}
        />
      ) : null}

      {view.phase === "lobby" ? (
        <div key="lobby" className="phase-enter">
          <Lobby
            view={view}
            linkCopied={linkCopied}
            onShare={async () => {
              const link = await getShareLink(view.code);
              const ok = await copyText(link);
              if (ok) {
                setLinkCopied(true);
                window.setTimeout(() => setLinkCopied(false), 1500);
              }
            }}
          />
        </div>
      ) : (
        <div key={`table-${view.phase}`} className="phase-enter relative mx-auto mt-4 h-[min(58vh,500px)] w-[calc(100%-1.5rem)] max-w-6xl" data-game-table>
          <div className="absolute inset-0 rounded-[46%] border-10 border-[#5a3a18] bg-[radial-gradient(ellipse_at_center,#1f7a52_0%,#0c3d2c_62%,#08281d_100%)] shadow-[inset_0_0_80px_rgba(0,0,0,0.45),0_20px_60px_rgba(0,0,0,0.45)]" />
          <div className="absolute left-1/2 top-1/2 z-10 w-[min(92%,480px)] -translate-x-1/2 -translate-y-1/2 text-center">
            {tablePlays.length > 0 ? (
              <TablePlayStack plays={tablePlays} size="md" ghostIds={ghostIds} />
            ) : (
              <p className="font-serif text-lg text-emerald-50/90">
                {view.phase === "tribute"
                  ? "රජු gives a card to හිගන්නා"
                  : view.phase === "finished"
                    ? "Round over"
                    : "Table is empty — lead"}
              </p>
            )}
          </div>

          {dealing ? <DealBurst key={dealTick} seats={seated.length} /> : null}

          {turnActive ? (
            <div className="pointer-events-none absolute left-1/2 top-3 z-30 flex -translate-x-1/2 flex-col items-center gap-1">
              <TurnTimerBadge endsAt={turnEndsAt} large />
              <div className="rounded-full border border-amber-200/25 bg-black/55 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-100/90">
                {myTurn ? "Your turn" : `${turnPlayerName ?? "Player"}'s turn`}
              </div>
              {view.lastPlay ? (
                <div
                  className={[
                    "rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                    view.patternLocked
                      ? "border border-amber-300/50 bg-amber-300/20 text-amber-100"
                      : "border border-white/15 bg-black/45 text-amber-100/70",
                  ].join(" ")}
                >
                  {view.patternLocked
                    ? "Pattern locked — consecutive only"
                    : view.trickPlayCount < 3
                      ? `Opening chain ${view.patternStreak}/3`
                      : "No lock — any higher OK"}
                </div>
              ) : null}
            </div>
          ) : null}

          {seated.map((p, i) => (
            <Seat
              key={p.id}
              player={p}
              style={seatStyle(i, seated.length)}
              isYou={p.id === youId}
              isTurn={p.id === view.currentTurnId && !view.closing}
              turnEndsAt={p.id === view.currentTurnId && !view.closing ? turnEndsAt : null}
              previewCards={
                p.id === youId && selected.length > 0
                  ? displayHand.filter((c) => selected.includes(c.id))
                  : undefined
              }
              ghostIds={ghostIds}
              onPreviewClick={canPick ? toggle : undefined}
            />
          ))}
        </div>
      )}

      {view.phase === "finished" ? (
        <div key="results" className="phase-enter">
          <Results view={view} />
        </div>
      ) : null}

      <CardFlightLayer flights={flights} onFlightEnd={endFlight} />

      <section
        className={[
          "relative z-20 mx-auto mt-3 w-[calc(100%-1.5rem)] max-w-6xl rounded-[28px] border border-amber-300/15 bg-black/30 px-4 pb-7 pt-4 shadow-[0_20px_45px_rgba(0,0,0,0.35)] backdrop-blur-md sm:px-5",
          (myTurn && !view.closing && !view.you?.passed) || (view.phase === "tribute" && isKing)
            ? "turn-hand-attention"
            : "",
        ].join(" ")}
      >
        {view.you ? (
          <>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-amber-100/85">
                  {view.phase === "tribute" && isKing
                    ? "You are රජු — pick a card for හිගන්නා"
                    : view.closing
                      ? "Round closing…"
                      : view.you.passed
                        ? "You passed — wait until this round closes"
                        : myTurn
                          ? "Your turn — play or pass"
                          : "Your hand"}
                </p>
                {(myTurn && !view.closing && !view.you.passed) ||
                (view.phase === "tribute" && isKing) ? (
                  <TurnTimerBadge endsAt={turnEndsAt} />
                ) : null}
              </div>
              <div className="flex gap-2">
                {view.phase === "playing" && myTurn && !view.you.passed && !view.closing ? (
                  <>
                    <button
                      type="button"
                      onClick={onPlayClick}
                      disabled={selected.length === 0}
                      className="rounded-full bg-linear-to-b from-amber-300 to-amber-500 px-5 py-2 text-sm font-semibold text-zinc-950 shadow-[0_8px_24px_rgba(212,175,55,0.25)] disabled:opacity-40"
                    >
                      Play
                    </button>
                    <button
                      type="button"
                      onClick={() => getSocket().emit("pass")}
                      disabled={!view.lastPlay}
                      className="rounded-full border border-amber-200/30 bg-amber-100/5 px-5 py-2 text-sm text-amber-100 disabled:opacity-40"
                    >
                      Pass
                    </button>
                  </>
                ) : null}
                {view.phase === "tribute" && isKing ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (selected.length !== 1) {
                        setToast("Select exactly one card.");
                        window.setTimeout(() => setToast(""), 3000);
                        return;
                      }
                      getSocket().emit("tribute", { cardId: selected[0] });
                    }}
                    className="rounded-full bg-linear-to-b from-amber-300 to-amber-500 px-5 py-2 text-sm font-semibold text-zinc-950 shadow-[0_8px_24px_rgba(212,175,55,0.25)]"
                  >
                    Give to හිගන්නා
                  </button>
                ) : null}
                {view.you.isHost && (view.phase === "lobby" || view.phase === "finished") ? (
                  <button
                    type="button"
                    onClick={() => getSocket().emit("start")}
                    className="rounded-full bg-linear-to-b from-emerald-300 to-emerald-500 px-5 py-2 text-sm font-semibold text-emerald-950 shadow-[0_8px_24px_rgba(16,185,129,0.25)]"
                  >
                    {view.phase === "finished" ? "New round" : "Start game"}
                  </button>
                ) : null}
                {view.you.isHost && view.phase !== "lobby" ? (
                  <button
                    type="button"
                    onClick={() => setStopConfirmOpen(true)}
                    className="rounded-full border border-red-300/40 bg-red-950/40 px-5 py-2 text-sm font-semibold text-red-100 hover:bg-red-900/50"
                  >
                    Stop game
                  </button>
                ) : null}
              </div>
            </div>

            <CardFan
              cards={displayHand}
              size="lg"
              selectedIds={selected}
              leavingIds={leavingIds}
              ghostIds={ghostIds}
              onSelect={canPick ? toggle : undefined}
              dealIn={dealing}
              emptyLabel="No cards in hand"
            />
          </>
        ) : null}

      </section>
    </div>
  );
}

function DealBurst({ seats }: { seats: number }) {
  const seatCount = Math.max(seats, 1);
  // One card per seat per pass — a few passes around the table.
  const passes = 5;
  const cards = seatCount * passes;

  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      <div className="deal-aura absolute left-1/2 top-1/2 h-40 w-40 rounded-full bg-amber-300/20 blur-2xl" />

      {/* Center deck */}
      <div className="deal-deck absolute left-1/2 top-1/2 z-20 h-[74px] w-[54px]">
        {[0, 1, 2].map((layer) => (
          <div
            key={layer}
            className="absolute left-1/2 top-1/2"
            style={{
              transform: `translate(calc(-50% + ${layer * 1.5}px), calc(-50% - ${layer * 1.5}px)) rotate(${layer * 2 - 2}deg)`,
              zIndex: layer,
            }}
          >
            <CardBack size="sm" className="relative!" style={{ position: "relative" }} />
          </div>
        ))}
      </div>

      {Array.from({ length: cards }, (_, i) => {
        const seat = i % seatCount;
        // Match seatStyle angles so cards fly toward each player badge.
        const angle = Math.PI / 2 + (2 * Math.PI * seat) / seatCount;
        const dx = Math.cos(angle) * 195;
        const dy = Math.sin(angle) * 155;
        const rot = `${((seat * 17 + i * 9) % 36) - 18}deg`;
        return (
          <div
            key={i}
            className="deal-fly absolute left-1/2 top-1/2 z-10"
            style={
              {
                "--dx": `${dx}px`,
                "--dy": `${dy}px`,
                "--rot": rot,
                animationDelay: `${120 + i * 70}ms`,
              } as CSSProperties
            }
          >
            <CardBack size="sm" className="relative!" style={{ position: "relative" }} />
          </div>
        );
      })}
    </div>
  );
}

function Seat({
  player,
  style,
  isYou,
  isTurn,
  turnEndsAt,
  previewCards,
  ghostIds = [],
  onPreviewClick,
}: {
  player: PublicPlayer;
  style: CSSProperties;
  isYou: boolean;
  isTurn: boolean;
  turnEndsAt?: number | null;
  previewCards?: Card[];
  ghostIds?: string[];
  onPreviewClick?: (id: string) => void;
}) {
  const showPreview = Boolean(isYou && previewCards && previewCards.length > 0);
  const ghostSet = new Set(ghostIds);
  const roleLabel = player.role ? ROLE_LABEL[player.role] : player.isHost ? "Host" : null;

  return (
    <div
      className={["absolute z-10 flex flex-col items-center", isTurn ? "turn-seat-glow" : ""].join(
        " ",
      )}
      style={style}
      data-you-seat={isYou ? "1" : undefined}
    >
      {showPreview ? (
        <div className="flex items-end justify-center gap-1.5">
          {previewCards!.map((card, i) => {
            const mid = (previewCards!.length - 1) / 2;
            const ghost = ghostSet.has(card.id);
            return (
              <div
                key={card.id}
                data-preview-card={card.id}
                data-card-angle={(i - mid) * 5}
                className="relative shrink-0"
                style={{
                  width: 80,
                  height: 110,
                  zIndex: i + 1,
                  visibility: ghost ? "hidden" : "visible",
                  pointerEvents: ghost ? "none" : undefined,
                }}
              >
                <div
                  className="absolute inset-0 drop-shadow-[0_10px_20px_rgba(0,0,0,0.5)]"
                  style={{
                    transform: `rotate(${(i - mid) * 5}deg)`,
                    transformOrigin: "center center",
                  }}
                >
                  <PlayingCard
                    card={card}
                    size="md"
                    onClick={onPreviewClick && !ghost ? () => onPreviewClick(card.id) : undefined}
                    className="relative!"
                    style={{ position: "relative" }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div
          className={[
            "rounded-2xl border px-3 py-2 text-center shadow-lg backdrop-blur-sm",
            isTurn
              ? "turn-badge-pulse border-amber-300 bg-linear-to-b from-amber-200 to-amber-400 text-zinc-950"
              : "border-amber-200/15 bg-black/55 text-amber-50",
          ].join(" ")}
        >
          <div className="text-sm font-semibold">
            {player.name}
            {isYou ? " (You)" : ""}
          </div>
          {roleLabel ? (
            <div className="text-[10px] uppercase tracking-wide opacity-80">{roleLabel}</div>
          ) : null}
          {isTurn ? (
            <div className="mt-1 flex justify-center">
              <TurnTimerBadge endsAt={turnEndsAt} compact />
            </div>
          ) : null}
        </div>
      )}
      {isTurn && showPreview ? (
        <div className="mt-1.5">
          <TurnTimerBadge endsAt={turnEndsAt} compact />
        </div>
      ) : null}
      {!isYou ? (
        <div className="mt-2">
          <BackFan count={player.cardCount} size="sm" />
        </div>
      ) : null}
      <div className="mt-1 rounded-full border border-amber-200/25 bg-black/55 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-amber-50 shadow-sm">
        {player.cardCount}
      </div>
      {player.passed ? <div className="mt-1 text-[10px] text-amber-200/70">passed</div> : null}
      {!player.connected ? <div className="mt-1 text-[10px] text-red-300">offline</div> : null}
    </div>
  );
}

function Lobby({
  view,
  linkCopied,
  onShare,
}: {
  view: ClientView;
  linkCopied: boolean;
  onShare: () => void;
}) {
  return (
    <div className="mx-auto mt-6 w-[calc(100%-1.5rem)] max-w-2xl px-1">
      <div className="rounded-3xl border border-amber-500/20 bg-black/35 p-6 shadow-[0_20px_45px_rgba(0,0,0,0.35)] backdrop-blur-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-2xl text-amber-200">Lobby</h2>
            <p className="mt-1 text-sm text-amber-100/60">
              {view.players.length} player{view.players.length === 1 ? "" : "s"}. Minimum 3. The host can start.
            </p>
          </div>
          <button
            type="button"
            onClick={onShare}
            className="rounded-full border border-amber-300/35 bg-amber-300/10 px-4 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-300/20"
          >
            {linkCopied ? "Link copied" : "Share link"}
          </button>
        </div>
        {!view.you?.isHost ? (
          <p className="mt-2 text-sm text-amber-300/80">Waiting for the host to start.</p>
        ) : null}
        <ul className="mt-4 space-y-2">
          {view.players.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between rounded-2xl border border-amber-200/10 bg-amber-100/4 px-4 py-3"
            >
              <span>{p.name}</span>
              <span className="text-xs text-amber-300">{p.isHost ? "Host" : "Ready"}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Results({ view }: { view: ClientView }) {
  const king = view.players.find((p) => p.role === "king");
  const queen = view.players.find((p) => p.role === "queen");
  const beggar = view.players.find((p) => p.role === "beggar");
  return (
    <div className="relative z-20 mx-auto mt-4 w-[calc(100%-1.5rem)] max-w-md rounded-3xl border border-amber-400/30 bg-black/70 p-5 text-center shadow-[0_20px_45px_rgba(0,0,0,0.35)] backdrop-blur">
      <h2 className="font-serif text-2xl text-amber-200">Titles</h2>
      <p className="mt-3 text-amber-100">රජු — {king?.name ?? "—"}</p>
      <p className="text-amber-100">රැජින — {queen?.name ?? "—"}</p>
      <p className="text-amber-300">හිගන්නා — {beggar?.name ?? "—"}</p>
    </div>
  );
}

function ErrorDialog({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    const t = window.setTimeout(() => dismissRef.current(), 2000);
    return () => window.clearTimeout(t);
  }, [message]);

  return (
    <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center px-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="error-dialog-title"
        className="ui-pop pointer-events-auto w-full max-w-[340px] rounded-2xl border border-amber-300/35 bg-[#1a0c10]/92 px-5 py-4 text-center shadow-[0_16px_40px_rgba(0,0,0,0.5)] backdrop-blur-md"
      >
        <div className="error-icon-wrap mx-auto grid h-10 w-10 place-items-center" aria-hidden>
          <svg viewBox="0 0 48 48" className="error-icon h-10 w-10" fill="none">
            <circle cx="24" cy="24" r="22" className="error-icon-ring" strokeWidth="2.5" />
            <path
              className="error-icon-bang"
              d="M24 12v16"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
            <circle className="error-icon-dot" cx="24" cy="36" r="2.5" />
          </svg>
        </div>
        <p className="mt-2.5 text-[10px] uppercase tracking-[0.3em] text-amber-400/90">Cannot play</p>
        <p id="error-dialog-title" className="mt-1.5 font-serif text-base leading-snug text-amber-50">
          {message}
        </p>
      </div>
    </div>
  );
}

function ConfirmModal({
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger = false,
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="ui-pop w-full max-w-md rounded-3xl border border-amber-300/25 bg-[#1a0c10] p-6 shadow-[0_24px_70px_rgba(0,0,0,0.55)]">
        <p className="text-xs uppercase tracking-[0.3em] text-amber-400/80">හිගන්නා</p>
        <h2 className="mt-2 font-serif text-2xl text-amber-100">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-amber-100/65">{message}</p>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-amber-200/25 bg-amber-100/5 px-5 py-2 text-sm text-amber-100 hover:bg-amber-100/10"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={
              danger
                ? "rounded-full border border-red-300/40 bg-linear-to-b from-red-400 to-red-600 px-5 py-2 text-sm font-semibold text-red-50 shadow-[0_8px_24px_rgba(220,38,38,0.25)]"
                : "rounded-full bg-linear-to-b from-amber-300 to-amber-500 px-5 py-2 text-sm font-semibold text-zinc-950"
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function JokerDeclareModal({
  jokers,
  value,
  onChange,
  onCancel,
  onConfirm,
}: {
  jokers: Card[];
  value: Record<string, JokerDeclaration>;
  onChange: (next: Record<string, JokerDeclaration>) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const ready = jokers.every((j) => value[j.id]?.rank && value[j.id]?.suit);

  function setFace(id: string, patch: Partial<JokerDeclaration>) {
    const cur = value[id] ?? { rank: "A" as Rank, suit: "spades" as Suit };
    onChange({ ...value, [id]: { ...cur, ...patch } });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="ui-pop w-full max-w-lg rounded-3xl border border-amber-300/25 bg-[#1a0c10] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.55)] sm:p-6">
        <p className="text-xs uppercase tracking-[0.3em] text-amber-400/80">Joker</p>
        <h2 className="mt-1 font-serif text-2xl text-amber-100">What does this joker represent?</h2>
        <p className="mt-1 text-sm text-amber-100/60">
          Pick a suit and rank for each joker. The round closes only if you choose <span className="text-amber-200">2</span>.
        </p>

        <div className="mt-5 max-h-[60vh] space-y-5 overflow-auto pr-1">
          {jokers.map((joker, idx) => {
            const face = value[joker.id] ?? { rank: "A" as Rank, suit: "spades" as Suit };
            const preview: Card = {
              ...joker,
              asRank: face.rank,
              asSuit: face.suit,
            };
            return (
              <div key={joker.id} className="rounded-2xl border border-amber-200/15 bg-black/30 p-4">
                <div className="flex items-start gap-4">
                  <PlayingCard card={preview} size="md" className="relative!" style={{ position: "relative" }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-amber-100">
                      Joker {jokers.length > 1 ? idx + 1 : ""} → {face.rank}
                      {SUIT_MARK[face.suit]}
                    </p>

                    <p className="mt-3 text-[10px] uppercase tracking-widest text-amber-400/70">Suit</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {SUITS.map((suit) => (
                        <button
                          key={suit}
                          type="button"
                          onClick={() => setFace(joker.id, { suit })}
                          className={[
                            "rounded-xl border px-3 py-1.5 text-sm",
                            face.suit === suit
                              ? "border-amber-300 bg-amber-300 text-zinc-950"
                              : "border-amber-200/20 bg-amber-100/5 text-amber-100",
                            suit === "hearts" || suit === "diamonds" ? "text-red-300" : "",
                            face.suit === suit && (suit === "hearts" || suit === "diamonds")
                              ? "text-zinc-950"
                              : "",
                          ].join(" ")}
                        >
                          {SUIT_MARK[suit]}
                        </button>
                      ))}
                    </div>

                    <p className="mt-3 text-[10px] uppercase tracking-widest text-amber-400/70">Rank</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {RANKS.map((rank) => (
                        <button
                          key={rank}
                          type="button"
                          onClick={() => setFace(joker.id, { rank })}
                          className={[
                            "min-w-9 rounded-xl border px-2.5 py-1.5 text-sm font-semibold",
                            face.rank === rank
                              ? "border-amber-300 bg-amber-300 text-zinc-950"
                              : "border-amber-200/20 bg-amber-100/5 text-amber-100",
                          ].join(" ")}
                        >
                          {rank}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-amber-200/25 px-5 py-2 text-sm text-amber-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!ready}
            className="rounded-full bg-linear-to-b from-amber-300 to-amber-500 px-5 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-40"
          >
            Confirm & play
          </button>
        </div>
      </div>
    </div>
  );
}
