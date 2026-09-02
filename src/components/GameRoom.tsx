"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { AppBackground } from "@/components/AppBackground";
import { BrandMark } from "@/components/BrandMark";
import { BackFan, CardFan, CARD_SIZE, PlayingCard, TablePlayStack, type CardSize } from "@/components/PlayingCard";
import { JoinRoomScreen } from "@/components/JoinRoomScreen";
import { DealAnimation, dealAnimationMs } from "@/components/DealAnimation";
import {
  CardFlightLayer,
  estimateHandCardRect,
  estimateTableCenterRect,
  estimateYouSeatPreviewRect,
  measureFlightRect,
  type CardFlight,
} from "@/components/CardFlight";
import { MIN_PLAYERS, sortHand, TURN_DURATION_MS, beggarTributeCardIds, isValidBeggarTribute } from "@/lib/engine";
import { getShareLink, copyText } from "@/lib/shareLink";
import { getPlayerId, getPlayerName, getSocket } from "@/lib/socket";
import {
  RoleCelebrationLayer,
  RoleCrown,
  useRoleCelebrations,
  playerHasRoleBadge,
} from "@/components/RoleCelebration";
import {
  flyTowardCenter,
  LobbyReactionBurst,
  ReactionButton,
  ReactionPicker,
  reactionsForPlayer,
  SeatReactionBurst,
  useTableReactions,
  type LiveReaction,
} from "@/components/PlayerReactions";
import { useNarrow } from "@/lib/useNarrow";
import { clearGameStarted, markGameStarted } from "@/components/SplashScreen";
import { SfxButton, useGameSfx } from "@/components/GameSfx";
import { playSfx } from "@/lib/sounds";
import { RANKS, SUITS, type Card, type ClientView, type JokerDeclaration, type PublicPlayer, type Rank, type Suit } from "@/lib/types";

const ROUND_MSG_MS = 2800;

const ROLE_LABEL: Record<string, string> = {
  king: "රජු",
  queen: "රැජින",
  beggar: "හිඟන්නා",
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
}: {
  endsAt: number | null | undefined;
  compact?: boolean;
}) {
  const remaining = useTurnRemaining(endsAt);
  const prevSec = useRef<number | null>(null);
  const ms = remaining ?? 0;
  const urgent = endsAt != null && ms <= 10_000;
  const sec = Math.ceil(ms / 1000);

  useEffect(() => {
    if (!urgent || sec <= 0) {
      prevSec.current = urgent ? 0 : null;
      return;
    }
    if (prevSec.current !== sec) {
      playSfx("tick");
      prevSec.current = sec;
    }
  }, [urgent, sec]);

  if (endsAt == null) return null;
  return (
    <div
      className={[
        "turn-timer inline-flex items-center justify-center rounded-full border font-semibold shadow-sm",
        urgent
          ? "turn-timer-urgent border-red-300/60 bg-red-950/80 text-red-100"
          : "border-amber-300/50 bg-black/75 text-amber-50",
        compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-0.5 text-[11px]",
      ].join(" ")}
      aria-label={`Turn time remaining ${formatTurnClock(ms)}`}
    >
      {formatTurnClock(ms)}
    </div>
  );
}

function seatStyle(index: number, total: number, compact = false): CSSProperties {
  const angle = Math.PI / 2 + (2 * Math.PI * index) / Math.max(total, 1);
  const rx = compact ? 39 : 44;
  const ry = compact ? 33 : 36;
  const x = 50 + rx * Math.cos(angle);
  const y = 48 + ry * Math.sin(angle);
  return { left: `${x}%`, top: `${y}%` };
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
  const narrow = useNarrow();
  const handSize = narrow ? "md" : "lg";
  const previewSize = narrow ? "sm" : "md";
  const tableCardSize = narrow ? "sm" : "md";
  const roomCode = codeParam === "new" ? "new" : codeParam.trim().toUpperCase();
  const joinedSessionKey = `higanna-joined-${roomCode}`;
  const [joinName, setJoinName] = useState<string | null>(null);
  const [needsJoinGate, setNeedsJoinGate] = useState(false);
  const [gateReady, setGateReady] = useState(true);
  const [view, setView] = useState<ClientView | null>(null);
  const [joinError, setJoinError] = useState("");
  const [toast, setToast] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [dealing, setDealing] = useState(false);
  const [dealTick, setDealTick] = useState(0);
  const [dealReceived, setDealReceived] = useState<Record<string, number>>({});
  const [tablePlays, setTablePlays] = useState<{ playerName: string; cards: Card[] }[]>([]);
  const [roundCloseMsg, setRoundCloseMsg] = useState("");
  const [jokerPrompt, setJokerPrompt] = useState<Card[] | null>(null);
  const [jokerAs, setJokerAs] = useState<Record<string, JokerDeclaration>>({});
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [kickTarget, setKickTarget] = useState<{ id: string; name: string } | null>(null);
  const [leavingIds, setLeavingIds] = useState<string[]>([]);
  const [ghostIds, setGhostIds] = useState<string[]>([]);
  const [flights, setFlights] = useState<CardFlight[]>([]);
  const [fallbackTurnEndsAt, setFallbackTurnEndsAt] = useState<number | null>(null);
  const { bursts: roleBursts, dismissBurst: dismissRoleBurst } = useRoleCelebrations(view);
  const {
    live: tableReactions,
    send: sendReaction,
    pickerOpen,
    pickerVisible,
    setPickerOpen,
    cooling: reactionCooling,
    cooldownRatio,
  } = useTableReactions();
  useGameSfx(view, dealing, toast);
  const flightSeq = useRef(0);
  const flightsRef = useRef<CardFlight[]>([]);
  flightsRef.current = flights;
  const joined = useRef(false);
  const prevRound = useRef(0);
  const sawLobby = useRef(false);
  const dealAnimShown = useRef(false);
  const lastTrackedPlay = useRef("");
  const lastAnnouncement = useRef("");
  const dealStartedAt = useRef(0);
  const msgStartedAt = useRef(0);
  const leaveConfirmedRef = useRef(false);
  const activeRoomCodeRef = useRef<string | null>(null);
  activeRoomCodeRef.current = view?.code ?? null;

  function resolveRoomCode() {
    return (
      activeRoomCodeRef.current ??
      (roomCode !== "new" ? roomCode.toUpperCase() : null)
    );
  }

  function requestLeave() {
    if (!view || leaveConfirmedRef.current) return;
    setLeaveConfirmOpen(true);
  }

  function confirmLeave() {
    if (leaveConfirmedRef.current) return;
    leaveConfirmedRef.current = true;
    setLeaveConfirmOpen(false);
    const code = resolveRoomCode();
    if (code) {
      getSocket().emit("leave", { code, playerId: getPlayerId() });
      clearGameStarted(code);
      sessionStorage.removeItem(`higanna-joined-${code}`);
    }
    joined.current = false;
    router.push("/");
  }

  // Trap browser / gesture back while seated in a lobby or match.
  useEffect(() => {
    if (!view || leaveConfirmedRef.current) return;

    const trap = () => {
      window.history.pushState({ higannaLeaveGuard: 1 }, "", window.location.href);
    };
    trap();

    const onPopState = () => {
      if (leaveConfirmedRef.current) return;
      trap();
      setLeaveConfirmOpen(true);
    };

    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, [view?.code]);

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
        joined.current = false;
        setJoinError(next.error);
        setView(null);
        setToast(next.error);
        if (inviteJoin) {
          sessionStorage.removeItem(joinedSessionKey);
          setNeedsJoinGate(true);
        }
        return;
      }
      setJoinError("");
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

    function syncRoom() {
      const code =
        activeRoomCodeRef.current ??
        (roomCode !== "new" ? roomCode.toUpperCase() : null);
      if (code) {
        socket.emit("join", { code, name, playerId });
      } else if (roomCode === "new") {
        socket.emit("create", { name, playerId });
      }
    }

    socket.on("state", onState);
    socket.on("toast", onToast);
    function onKicked(msg: string) {
      leaveConfirmedRef.current = true;
      sessionStorage.removeItem(joinedSessionKey);
      const code =
        activeRoomCodeRef.current ??
        (roomCode !== "new" ? roomCode.toUpperCase() : null);
      if (code) clearGameStarted(code);
      joined.current = false;
      setView(null);
      setToast(typeof msg === "string" && msg ? msg : "The host removed you from the room.");
      router.replace("/");
    }
    socket.on("kicked", onKicked);

    if (!joined.current) joined.current = true;
    if (!joinError) syncRoom();

    const onConnect = () => {
      if (!joinError) syncRoom();
    };
    socket.on("connect", onConnect);

    return () => {
      socket.off("state", onState);
      socket.off("toast", onToast);
      socket.off("kicked", onKicked);
      socket.off("connect", onConnect);
    };
  }, [roomCode, router, needsJoinGate, joinName, joinedSessionKey, gateReady, inviteJoin, joinError]);

  useEffect(() => {
    if (!view) return;
    const ids = new Set(view.you?.hand.map((c) => c.id) ?? []);
    setSelected((cur) => cur.filter((id) => ids.has(id)));
  }, [view]);

  // Splash skips only after this room's match has left the lobby.
  useEffect(() => {
    if (!view?.code) return;
    if (view.phase === "lobby") clearGameStarted(view.code);
    else markGameStarted(view.code);
  }, [view?.code, view?.phase]);

  // Deal animation only on the first share after leaving the lobby — not every round.
  useEffect(() => {
    if (!view) return;
    if (view.round === 0 || view.phase === "lobby") {
      prevRound.current = 0;
      sawLobby.current = true;
      dealAnimShown.current = false;
      setDealing(false);
      return;
    }
    if (view.phase === "finished") {
      prevRound.current = view.round;
      setDealing(false);
      return;
    }
    if (
      view.round !== prevRound.current &&
      (view.phase === "playing" || view.phase === "tribute")
    ) {
      const firstShare = sawLobby.current && !dealAnimShown.current;
      prevRound.current = view.round;
      if (!firstShare) return;
      dealAnimShown.current = true;
      setDealReceived({});
      setDealing(true);
      setDealTick((n) => n + 1);
    }
  }, [view?.round, view?.phase]);

  useEffect(() => {
    if (!dealing) return;
    const ms = dealAnimationMs(Math.max(view?.players.length ?? 1, 1), view?.you?.hand.length ?? 0);
    const t = window.setTimeout(() => setDealing(false), ms);
    return () => window.clearTimeout(t);
    // Player count is sampled when a deal starts (dealTick), not on later roster changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealing, dealTick]);

  useEffect(() => {
    if (!view) return;
    if (view.phase === "lobby") {
      setTablePlays([]);
      lastTrackedPlay.current = "";
      return;
    }
    const plays = view.trickPlays ?? (view.lastPlay ? [view.lastPlay] : []);
    if (plays.length === 0) {
      setTablePlays([]);
      lastTrackedPlay.current = "";
      return;
    }
    const sig = `${view.round}:${plays.map((p) => p.cards.map((c) => c.id).join(",")).join("|")}`;
    if (sig === lastTrackedPlay.current) return;
    lastTrackedPlay.current = sig;
    setTablePlays(plays.map((p) => ({ playerName: p.playerName, cards: p.cards })));
  }, [view]);

  useEffect(() => {
    if (!view?.announcement) {
      lastAnnouncement.current = "";
      return;
    }
    if (view.announcement === lastAnnouncement.current) return;
    lastAnnouncement.current = view.announcement;
    setRoundCloseMsg(view.announcement);
  }, [view?.announcement]);

  useEffect(() => {
    if (!roundCloseMsg) return;
    const t = window.setTimeout(() => setRoundCloseMsg(""), ROUND_MSG_MS);
    return () => window.clearTimeout(t);
  }, [roundCloseMsg]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(""), 2500);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (dealing) dealStartedAt.current = Date.now();
  }, [dealing]);

  useEffect(() => {
    if (roundCloseMsg) msgStartedAt.current = Date.now();
  }, [roundCloseMsg]);

  useEffect(() => {
    if (view?.phase !== "lobby" && view?.phase !== "finished") return;
    setJokerPrompt(null);
    setFlights([]);
    setGhostIds([]);
    setLeavingIds([]);
  }, [view?.phase]);

  useEffect(() => {
    const onVis = () => {
      if (document.hidden) return;
      const name = joinName || getPlayerName();
      if (!name) return;
      const socket = getSocket();
      const playerId = getPlayerId();
      const code =
        activeRoomCodeRef.current ??
        (roomCode !== "new" ? roomCode.toUpperCase() : null);
      if (code) {
        socket.emit("join", { code, name, playerId });
      } else if (roomCode === "new") {
        socket.emit("create", { name, playerId });
      }
      const now = Date.now();
      if (
        dealing &&
        now - dealStartedAt.current >=
        dealAnimationMs(view?.players.length ?? 1, view?.you?.hand.length ?? 0)
      ) {
        setDealing(false);
      }
      if (roundCloseMsg && now - msgStartedAt.current >= ROUND_MSG_MS) {
        setRoundCloseMsg("");
      }
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, [dealing, roundCloseMsg, view?.players.length, roomCode, joinName]);

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
  const isBeggar = view?.you?.role === "beggar";
  const beggarTributePick = view?.phase === "tribute" && myTurn && isBeggar;
  const tributePick = view?.phase === "tribute" && myTurn && (isKing || isBeggar);
  const canPick = !dealing && (view?.phase === "playing" || tributePick);
  const beggarTributeIds = useMemo(() => {
    if (!beggarTributePick || !view?.you) return [];
    return beggarTributeCardIds(view.you.hand);
  }, [beggarTributePick, view?.you]);
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

  useEffect(() => {
    if (!beggarTributePick || beggarTributeIds.length === 0) return;
    if (beggarTributeIds.length === 1) {
      setSelected([beggarTributeIds[0]]);
      return;
    }
    setSelected((cur) => {
      const valid = cur.filter((id) => beggarTributeIds.includes(id));
      return valid.length === 1 ? valid : [];
    });
  }, [beggarTributePick, beggarTributeIds]);

  const turnEndsAt = view?.turnEndsAt ?? fallbackTurnEndsAt;
  const displayHand = useMemo(() => {
    if (!view?.you) return [];
    if (dealing) {
      const n = dealReceived[view.you.id] ?? 0;
      return view.you.hand.slice(0, n);
    }
    return sortHand(view.you.hand);
  }, [view?.you, dealing, dealReceived]);

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
    requestAnimationFrame(() => {
      setFlights((cur) => cur.filter((f) => f.key !== key));
    });
  }

  const flightKeys = flights.map((f) => f.key).join("|");
  useEffect(() => {
    if (!flightKeys) return;
    const maxMs = Math.max(...flightsRef.current.map((f) => f.durationMs), 380) + 280;
    const t = window.setTimeout(() => {
      if (flightsRef.current.length === 0) return;
      setFlights([]);
      setGhostIds([]);
    }, maxMs);
    return () => window.clearTimeout(t);
  }, [flightKeys]);

  function toggle(id: string) {
    const card = displayHand.find((c) => c.id === id);
    if (!card || !view || ghostIds.includes(id) || flights.some((f) => f.card.id === id)) return;

    const isSelected = selected.includes(id);

    if (view.phase === "tribute") {
      if (isBeggar && myTurn && !isValidBeggarTribute(view.you?.hand ?? [], id)) {
        setToast("You must give your highest card to the King.");
        return;
      }
      if (isSelected) {
        if (isBeggar && myTurn && beggarTributeIds.length === 1) return;
        playSfx("deselect");
        const from =
          measureFlightRect(`[data-preview-card="${id}"]`, previewSize) ??
          estimateYouSeatPreviewRect(1, 0, previewSize);
        const willBeVisible = displayHand.filter((c) => c.id === id || !selected.includes(c.id));
        const index = Math.max(0, willBeVisible.findIndex((c) => c.id === id));
        // Mount hand slot first, then measure exact landing rect.
        flushSync(() => {
          setGhostIds((g) => (g.includes(id) ? g : [...g, id]));
          setSelected([]);
        });
        const to =
          measureFlightRect(`[data-hand-card="${id}"]`, handSize) ??
          estimateHandCardRect(willBeVisible.length, index, handSize, narrow);
        spawnFlight({ card, from, to });
        return;
      }
      playSfx("select");
      const from =
        measureFlightRect(`[data-hand-card="${id}"]`, handSize) ??
        estimateHandCardRect(displayHand.filter((c) => !selected.includes(c.id)).length || 1, 0, handSize, narrow);
      flushSync(() => {
        setGhostIds((g) => (g.includes(id) ? g : [...g, id]));
        setSelected([id]);
      });
      const to =
        measureFlightRect(`[data-preview-card="${id}"]`, previewSize) ?? estimateYouSeatPreviewRect(1, 0, previewSize);
      spawnFlight({ card, from, to });
      return;
    }

    if (isSelected) {
      playSfx("deselect");
      const idx = selected.indexOf(id);
      const from =
        measureFlightRect(`[data-preview-card="${id}"]`, previewSize) ??
        estimateYouSeatPreviewRect(selected.length, idx, previewSize);
      const willBeVisible = displayHand.filter((c) => c.id === id || !selected.includes(c.id));
      const index = Math.max(0, willBeVisible.findIndex((c) => c.id === id));
      flushSync(() => {
        setGhostIds((g) => (g.includes(id) ? g : [...g, id]));
        setSelected((cur) => cur.filter((x) => x !== id));
      });
      const to =
        measureFlightRect(`[data-hand-card="${id}"]`, handSize) ??
        estimateHandCardRect(willBeVisible.length, index, handSize, narrow);
      spawnFlight({ card, from, to });
      return;
    }

    playSfx("select");
    const handVisible = displayHand.filter((c) => !selected.includes(c.id));
    const handIndex = handVisible.findIndex((c) => c.id === id);
    const from =
      measureFlightRect(`[data-hand-card="${id}"]`, handSize) ??
      estimateHandCardRect(handVisible.length, Math.max(0, handIndex), handSize, narrow);
    const nextLen = selected.length + 1;
    // Preview swaps in (badge → cards) before we measure, so flight lands on the real slot.
    flushSync(() => {
      setGhostIds((g) => (g.includes(id) ? g : [...g, id]));
      setSelected((cur) => [...cur, id]);
    });
    const to =
      measureFlightRect(`[data-preview-card="${id}"]`, previewSize) ??
      estimateYouSeatPreviewRect(nextLen, nextLen - 1, previewSize);
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
    const tableTo = estimateTableCenterRect(tableCardSize);

    // Measure preview slots before clearing selection, then keep ids ghosted until flight lands.
    const fromRects = playCardsList.map((card, i) => ({
      card,
      from:
        measureFlightRect(`[data-preview-card="${card.id}"]`, previewSize) ??
        estimateYouSeatPreviewRect(playCardsList.length, i, previewSize),
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
      <div className="app-shell grid min-h-dvh place-items-center text-amber-100">
        <AppBackground />
        <p className="relative z-10 animate-pulse text-sm tracking-wide">Loading...</p>
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
            setJoinError("");
            joined.current = false;
            setNeedsJoinGate(false);
          }}
        />
      </>
    );
  }

  if (joinError) {
    return (
      <div className="app-shell grid min-h-dvh place-items-center px-4 text-amber-50">
        <AppBackground />
        <div className="relative z-10 w-full max-w-sm rounded-[22px] border border-amber-300/25 bg-black/60 p-5 text-center shadow-[0_24px_70px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-6">
          <p className="text-[10px] uppercase tracking-[0.35em] text-amber-400/80">Room</p>
          <p className="mt-2 font-mono text-2xl tracking-[0.28em] text-amber-100">{roomCode}</p>
          <p className="mt-4 font-serif text-xl text-amber-100">{joinError}</p>
          <div className="mt-5 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => {
                setJoinError("");
                setToast("");
                joined.current = false;
                setNeedsJoinGate(false);
              }}
              className="min-h-12 w-full rounded-full bg-linear-to-b from-amber-300 to-amber-500 text-base font-semibold text-zinc-950"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => router.push("/")}
              className="min-h-12 w-full rounded-full border border-amber-200/25 bg-white/5 text-base font-medium text-amber-100"
            >
              Go home
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!view) {
    return (
      <div className="app-shell relative flex min-h-dvh flex-col select-none text-amber-50">
        <AppBackground />
        <header className="relative z-20 mx-auto mt-[max(0.35rem,env(safe-area-inset-top))] w-[calc(100%-1rem)] max-w-6xl sm:mt-3 sm:w-[calc(100%-1.5rem)]">
          <div className="flex items-center gap-2.5 rounded-full border border-white/10 bg-black/50 py-2.5 pl-2 pr-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.4)] backdrop-blur-xl">
            <div className="size-11 shrink-0" aria-hidden />
            <div className="pointer-events-none absolute inset-x-14 top-1/2 z-0 flex -translate-y-1/2 flex-col items-center justify-center gap-0 leading-none">
              <BrandMark size="header" priority className="mb-1.5 mt-1.5" />
              <p className="-mt-1 font-mono text-[11px] leading-none tracking-[0.22em] text-amber-400/90 sm:text-xs">
                {roomCode}
              </p>
            </div>
            <span className="flex-1" />
            <div className="size-11 shrink-0" aria-hidden />
          </div>
        </header>
        <div className="flex-1">
          <div className="mx-auto mt-4 w-[calc(100%-1rem)] max-w-lg px-0 pb-[max(1rem,env(safe-area-inset-bottom))] sm:mt-6">
            <div className="lobby-panel rounded-[24px] border border-white/10 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.4)] sm:p-5">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-amber-400/75">Table</p>
                  <h2 className="mt-1 font-serif text-2xl text-amber-200">Lobby</h2>
                </div>
                <p className="animate-pulse text-right text-xs text-amber-100/50">Reconnecting…</p>
              </div>
              <ul className="mt-4 space-y-2" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <li key={i} className="h-[3.25rem] animate-pulse rounded-2xl border border-white/5 bg-white/5" />
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell relative flex min-h-dvh flex-col select-none text-amber-50">
      <AppBackground />
      <header className="relative z-20 mx-auto mt-[max(0.35rem,env(safe-area-inset-top))] w-[calc(100%-1rem)] max-w-6xl sm:mt-3 sm:w-[calc(100%-1.5rem)]">
        <div className="flex items-center gap-2.5 rounded-full border border-white/10 bg-black/50 py-2.5 pl-2 pr-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.4)] backdrop-blur-xl">
          {/* The top bar layout uses absolute centering for the name/code stack, so it's centered regardless of left/right actions */}
          <button
            type="button"
            onClick={requestLeave}
            className="grid size-11 shrink-0 place-items-center rounded-full bg-white/6 text-base text-amber-100/80 hover:bg-white/10"
            aria-label="Leave room"
            style={{ position: "relative", zIndex: 10 }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>

          <div className="pointer-events-none absolute inset-x-14 top-1/2 z-0 flex -translate-y-1/2 flex-col items-center justify-center gap-0 leading-none">
            <BrandMark size="header" priority className="mb-1.5 mt-1.5" />
            <button
              type="button"
              onClick={async () => {
                const ok = await copyText(view.code);
                if (ok) {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1500);
                }
              }}
              className="pointer-events-auto -mt-1 px-0 font-mono text-[11px] leading-none tracking-[0.22em] text-amber-400/90 hover:text-amber-300 sm:text-xs"
            >
              {view.code}
              <span className="ml-1 hidden tracking-normal text-amber-200/40 sm:inline">
                {copied ? "copied" : "tap to copy"}
              </span>
            </button>
          </div>

          <span className="flex-1" />

          <ReactionButton
            onClick={() => setPickerOpen((open) => !open)}
            cooldownRatio={cooldownRatio}
            open={pickerOpen}
          />

          <SfxButton />

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
            className="grid size-11 shrink-0 place-items-center rounded-full bg-white/6 text-base text-amber-100/80 hover:bg-white/10"
            aria-label={linkCopied ? "Copied" : "Share"}
          >
            {linkCopied ? (
              <svg
                className="h-6 w-6"
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path fillRule="evenodd" d="M18 3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1V9a4 4 0 0 0-4-4h-3a1.99 1.99 0 0 0-1 .267V5a2 2 0 0 1 2-2h7Z" clipRule="evenodd"/>
                <path fillRule="evenodd" d="M8 7.054V11H4.2a2 2 0 0 1 .281-.432l2.46-2.87A2 2 0 0 1 8 7.054ZM10 7v4a2 2 0 0 1-2 2H4v6a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3Z" clipRule="evenodd"/>
              </svg>
            ) : (
              <svg
                className="h-6 w-6"
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                fill="none"
                viewBox="0 0 24 24"
              >
                <path
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="2"
                  d="M7.926 10.898 15 7.727m-7.074 5.39L15 16.29M8 12a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Zm12 5.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Zm0-11a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z"
                />
              </svg>
            )}
          </button>
    
     
          {view.you?.isHost && view.phase !== "lobby" ? (
            <button
              type="button"
              onClick={() => setStopConfirmOpen(true)}
              className="grid size-11 shrink-0 place-items-center rounded-full border border-red-300/35 bg-red-950/55 text-red-100"
              aria-label="Stop game"
            >
              <svg
                className="h-6 w-6"
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M7 5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H7Z" />
              </svg>
            </button>
          ) : null}
        </div>
      </header>

      {toast ? <ErrorDialog message={toast} onDismiss={() => setToast("")} /> : null}

      <RoleCelebrationLayer bursts={roleBursts} onDismiss={dismissRoleBurst} />

      {roundCloseMsg ? (
        <div className="pointer-events-none fixed inset-0 z-40 grid place-items-center px-4">
          <div className="round-close-pop mx-4 rounded-3xl border border-amber-300/40 bg-black/80 px-5 py-5 text-center shadow-[0_24px_70px_rgba(0,0,0,0.55)] backdrop-blur-md sm:px-8 sm:py-6">
            <p className="text-[10px] uppercase tracking-[0.35em] text-amber-400/90 sm:text-xs">Notice</p>
            <p className="mt-2 font-serif text-xl text-amber-100 sm:text-3xl">{roundCloseMsg}</p>
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

      {leaveConfirmOpen ? (
        <ConfirmModal
          title={view.phase === "lobby" ? "Leave this room?" : "Leave the game?"}
          message={
            view.phase === "lobby"
              ? "You will be removed from the lobby and need an invite to join again."
              : "You will be removed from this room. The match continues without you."
          }
          confirmLabel="Leave"
          cancelLabel="Stay"
          danger
          onCancel={() => setLeaveConfirmOpen(false)}
          onConfirm={confirmLeave}
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

      {kickTarget ? (
        <ConfirmModal
          title={`Remove ${kickTarget.name}?`}
          message="They will leave this lobby and need a new invite to join again."
          confirmLabel="Remove"
          cancelLabel="Cancel"
          danger
          onCancel={() => setKickTarget(null)}
          onConfirm={() => {
            getSocket().emit("kick", { playerId: kickTarget.id });
            setKickTarget(null);
          }}
        />
      ) : null}

      {view.phase === "lobby" ? (
        <div key="lobby" className="flex-1">
          <Lobby view={view} onKick={(p) => setKickTarget(p)} reactions={tableReactions} />
        </div>
      ) : (
        <div
          key={`table-${view.phase}`}
          className="phase-enter relative mx-auto mt-2 min-h-[200px] w-[calc(100%-0.75rem)] max-w-6xl flex-1 sm:mt-4 sm:min-h-[280px] sm:w-[calc(100%-1.5rem)]"
          data-game-table
        >
          <div className="absolute inset-0 rounded-full bg-[#4a2e12] shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
            <div className="absolute inset-[6px] rounded-full bg-[radial-gradient(ellipse_at_center,#1f7a52_0%,#0c3d2c_62%,#08281d_100%)] shadow-[inset_0_0_80px_rgba(0,0,0,0.45)] ring-1 ring-black/25 sm:inset-[10px]" />
          </div>
          <div className="absolute left-1/2 top-1/2 z-10 w-[min(92%,480px)] -translate-x-1/2 -translate-y-1/2 text-center">
            {dealing ? null : tablePlays.length > 0 ? (
              <TablePlayStack plays={tablePlays} size={tableCardSize} ghostIds={ghostIds} />
            ) : (
              <p className="px-2 font-serif text-sm text-emerald-50/90 sm:text-lg">
                {view.phase === "tribute"
                  ? view.players.find((p) => p.role === "beggar")?.id === view.currentTurnId
                    ? "හිඟන්නා gives their highest card to රජු"
                    : "රජු gives a card to හිඟන්නා"
                  : view.phase === "finished"
                    ? "Round over"
                    : "Table is empty — lead"}
              </p>
            )}
          </div>

          {turnActive && view.lastPlay ? (
            <div className="pointer-events-none absolute left-1/2 top-1 z-30 flex max-w-[92%] -translate-x-1/2 flex-col items-center gap-1 sm:top-3">
              <div
                className={[
                  "rounded-full px-2 py-0.5 text-center text-[9px] font-semibold uppercase tracking-wide sm:px-2.5 sm:text-[10px]",
                  view.patternLocked
                    ? "border border-amber-300/50 bg-amber-300/20 text-amber-100"
                    : "border border-white/15 bg-black/45 text-amber-100/70",
                ].join(" ")}
              >
                {view.patternLocked ? (
                  <>
                    <span className="sm:hidden">Locked — consecutive</span>
                    <span className="hidden sm:inline">Pattern locked — consecutive only</span>
                  </>
                ) : view.trickPlayCount < 3 ? (
                  `Chain ${view.patternStreak}/3`
                ) : (
                  <>
                    <span className="sm:hidden">No lock</span>
                    <span className="hidden sm:inline">No lock — any higher OK</span>
                  </>
                )}
              </div>
            </div>
          ) : null}

          {seated.map((p, i) => {
            const fly = flyTowardCenter(i, seated.length, narrow);
            return (
            <Seat
              key={p.id}
              player={p}
              style={seatStyle(i, seated.length, narrow)}
              compact={narrow}
              previewSize={previewSize}
              isYou={p.id === youId}
              isTurn={p.id === view.currentTurnId && !view.closing}
              showRoleCrown={playerHasRoleBadge(p, view.phase)}
              dealtCount={dealing ? (dealReceived[p.id] ?? 0) : undefined}
              turnEndsAt={p.id === view.currentTurnId && !view.closing ? turnEndsAt : null}
              previewCards={
                p.id === youId && selected.length > 0
                  ? displayHand.filter((c) => selected.includes(c.id))
                  : undefined
              }
              ghostIds={ghostIds}
              onPreviewClick={canPick ? toggle : undefined}
              reactions={reactionsForPlayer(tableReactions, p.id)}
              flyX={fly.x}
              flyY={fly.y}
            />
            );
          })}
        </div>
      )}

      {view.phase === "finished" ? (
        <div key="results" className="phase-enter">
          <Results view={view} />
        </div>
      ) : null}

      {dealing ? (
        <DealAnimation
          key={dealTick}
          seats={seated.map((p) => ({ id: p.id, isYou: p.id === youId }))}
          cardsEach={view.you?.hand.length ?? 0}
          onCardLanded={(playerId) => {
            setDealReceived((cur) => ({ ...cur, [playerId]: (cur[playerId] ?? 0) + 1 }));
          }}
          onDone={() => setDealing(false)}
        />
      ) : null}

      <CardFlightLayer flights={flights} onFlightEnd={endFlight} />

      {view.phase !== "lobby" && view.phase !== "finished" ? (
      <section
        className={[
          "relative z-20 mx-auto mt-2 mb-[max(0.5rem,env(safe-area-inset-bottom))] w-[calc(100%-0.75rem)] max-w-6xl rounded-[22px]  bg-black/30 px-2.5 pb-3 pt-3 shadow-[0_20px_45px_rgba(0,0,0,0.35)] backdrop-blur-md sm:mt-3 sm:mb-4 sm:w-[calc(100%-1.5rem)] sm:rounded-[28px] sm:px-5 sm:pb-7 sm:pt-4",
          (myTurn && !view.closing && !view.you?.passed) || tributePick
            ? "turn-hand-attention"
            : "",
        ].join(" ")}
      >
        {view.you ? (
          <>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <p className="text-xs font-medium text-amber-100/85 sm:text-sm">
                  {dealing
                    ? "Dealing cards…"
                    : view.phase === "tribute" && isBeggar && myTurn
                    ? "You are හිඟන්නා — give your highest card to රජු"
                    : view.phase === "tribute" && isKing && myTurn
                    ? "You are රජු — pick a card for හිඟන්නා"
                    : view.phase === "tribute" && isKing
                      ? "Wait — හිඟන්නා is choosing a card"
                    : view.phase === "tribute" && isBeggar
                      ? "Wait — රජු is giving a card back"
                    : view.phase === "tribute"
                      ? "Tribute — waiting"
                    : view.closing
                      ? "Round closing…"
                      : view.you.passed
                        ? "You passed — wait until this round closes"
                        : myTurn && view.canEndRound
                          ? "Everyone passed — keep playing solo or end the round"
                        : myTurn
                          ? "Your turn — play or pass"
                          : "Your hand"}
                </p>
                {(myTurn && !view.closing && !view.you.passed) || tributePick ? (
                  <TurnTimerBadge endsAt={turnEndsAt} />
                ) : null}
              </div>
            </div>

            <CardFan
              cards={displayHand}
              size={handSize}
              compact={narrow}
              selectedIds={selected}
              leavingIds={leavingIds}
              ghostIds={ghostIds}
              highlightIds={beggarTributePick ? beggarTributeIds : []}
              dimOthers={beggarTributePick}
              onSelect={canPick ? toggle : undefined}
              dealIn={dealing}
              emptyLabel={dealing ? "" : "No cards in hand"}
            />

            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                {view.phase === "playing" && myTurn && !view.you.passed && !view.closing && !dealing ? (
                  <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                    {view.canEndRound ? (
                      <button
                        type="button"
                        onClick={() => getSocket().emit("endRound")}
                        className="min-h-12 rounded-full border border-emerald-300/40 bg-emerald-400/15 px-5 text-base font-semibold text-emerald-100 sm:min-h-0 sm:py-2 sm:text-sm"
                      >
                        End round
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => getSocket().emit("pass")}
                        disabled={!view.lastPlay}
                        className="min-h-12 rounded-full border border-amber-200/30 bg-amber-100/5 px-5 text-base text-amber-100 disabled:opacity-40 sm:min-h-0 sm:py-2 sm:text-sm"
                      >
                        Pass
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={onPlayClick}
                      disabled={selected.length === 0}
                      className="min-h-12 rounded-full bg-linear-to-b from-amber-300 to-amber-500 px-5 text-base font-semibold text-zinc-950 shadow-[0_8px_24px_rgba(212,175,55,0.25)] disabled:opacity-40 sm:min-h-0 sm:py-2 sm:text-sm"
                    >
                      Play
                    </button>
                  </div>
                ) : null}
                {view.phase === "tribute" && tributePick ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (selected.length !== 1) {
                        setToast("Select exactly one card.");
                        window.setTimeout(() => setToast(""), 3000);
                        return;
                      }
                      if (isBeggar && view.you && !isValidBeggarTribute(view.you.hand, selected[0])) {
                        setToast("You must give your highest card to the King.");
                        return;
                      }
                      getSocket().emit("tribute", { cardId: selected[0] });
                      setSelected([]);
                    }}
                    className="min-h-12 w-full rounded-full bg-linear-to-b from-amber-300 to-amber-500 px-5 text-base font-semibold text-zinc-950 shadow-[0_8px_24px_rgba(212,175,55,0.25)] sm:min-h-0 sm:w-auto sm:py-2 sm:text-sm"
                  >
                    {isBeggar ? "Give to රජු" : "Give to හිඟන්නා"}
                  </button>
                ) : null}
            </div>
          </>
        ) : null}

      </section>
      ) : null}

      <ReactionPicker
        open={pickerOpen}
        visible={pickerVisible}
        onClose={() => setPickerOpen(false)}
        onSend={sendReaction}
        cooling={reactionCooling}
      />
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
  dealtCount,
  compact = false,
  previewSize = "md",
  showRoleCrown = false,
  reactions = [],
  flyX = 0,
  flyY = -36,
}: {
  player: PublicPlayer;
  style: CSSProperties;
  isYou: boolean;
  isTurn: boolean;
  turnEndsAt?: number | null;
  previewCards?: Card[];
  ghostIds?: string[];
  onPreviewClick?: (id: string) => void;
  dealtCount?: number;
  compact?: boolean;
  previewSize?: CardSize;
  showRoleCrown?: boolean;
  reactions?: LiveReaction[];
  flyX?: number;
  flyY?: number;
}) {
  const showPreview = Boolean(isYou && previewCards && previewCards.length > 0);
  const ghostSet = new Set(ghostIds);
  const roleLabel =
    !showRoleCrown && player.role ? ROLE_LABEL[player.role] : player.isHost ? "Host" : null;
  const shownCount = dealtCount ?? player.cardCount;
  const slot = CARD_SIZE[previewSize];
  const youLabel = isYou ? (compact ? " · you" : " (You)") : "";

  return (
    <div
      className={["absolute", reactions.length > 0 ? "z-30" : "z-10"].join(" ")}
      style={style}
    >
      <SeatReactionBurst reactions={reactions} flyX={flyX} flyY={flyY} compact={compact} />
      <div
        className={["flex flex-col items-center", isTurn ? "turn-seat-glow" : ""].join(" ")}
        style={{ transform: "translate(-50%, -50%)" }}
        data-seat-id={player.id}
        data-you-seat={isYou ? "1" : undefined}
      >
      {showRoleCrown && player.role ? (
        <RoleCrown role={player.role} compact={compact} className={compact ? "mb-0.5" : "mb-1"} />
      ) : null}
      {showPreview ? (
        <div className={["flex items-end justify-center", compact ? "gap-1" : "gap-1.5"].join(" ")}>
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
                  width: slot.w,
                  height: slot.h,
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
                    size={previewSize}
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
            "text-center shadow-lg backdrop-blur-sm",
            compact
              ? "max-w-[5.75rem] rounded-xl border px-1.5 py-1"
              : "rounded-2xl border px-3 py-2",
            isTurn
              ? "turn-badge-pulse border-amber-300 bg-linear-to-b from-amber-200 to-amber-400 text-zinc-950"
              : "border-amber-200/15 bg-black/55 text-amber-50",
          ].join(" ")}
        >
          <div
            className={[
              "truncate font-semibold",
              compact ? "max-w-[5.25rem] text-[11px]" : "text-sm",
            ].join(" ")}
          >
            {player.name}
            {youLabel}
          </div>
          {roleLabel ? (
            <div className={["uppercase tracking-wide opacity-80", compact ? "text-[8px]" : "text-[10px]"].join(" ")}>
              {roleLabel}
            </div>
          ) : null}
          {isTurn ? (
            <div className="mt-1 flex justify-center">
              <TurnTimerBadge endsAt={turnEndsAt} compact />
            </div>
          ) : null}
        </div>
      )}
      {isTurn && showPreview ? (
        <div className={compact ? "mt-0.5" : "mt-1.5"}>
          <TurnTimerBadge endsAt={turnEndsAt} compact />
        </div>
      ) : null}
      {!isYou ? (
        compact ? (
          <div className="mt-0.5 h-1 w-5" data-seat-catch={player.id} />
        ) : (
          <div className="mt-2" data-seat-catch={player.id}>
            <BackFan count={shownCount} size="sm" />
          </div>
        )
      ) : (
        <div className={compact ? "mt-0.5 h-1 w-6" : "mt-2 h-2 w-8"} data-seat-catch={player.id} />
      )}
      <div
        className={[
          "rounded-full border border-amber-200/25 bg-black/55 font-semibold tabular-nums text-amber-50 shadow-sm",
          compact ? "mt-0.5 px-1.5 py-px text-[10px]" : "mt-1 px-2 py-0.5 text-[11px]",
        ].join(" ")}
      >
        {shownCount}
      </div>
      {player.passed ? (
        <div className={["text-amber-200/70", compact ? "mt-px text-[9px]" : "mt-1 text-[10px]"].join(" ")}>
          passed
        </div>
      ) : null}
      {!player.connected ? (
        <div className={["text-red-300", compact ? "mt-px text-[9px]" : "mt-1 text-[10px]"].join(" ")}>offline</div>
      ) : null}
      </div>
    </div>
  );
}

function Lobby({
  view,
  onKick,
  reactions,
}: {
  view: ClientView;
  onKick: (player: { id: string; name: string }) => void;
  reactions: LiveReaction[];
}) {
  const connected = view.players.filter((p) => p.connected);
  const readyCount = connected.filter((p) => p.isHost || p.lobbyReady).length;
  const allReady = connected.length > 0 && readyCount === connected.length;
  const canStart = Boolean(view.you?.isHost) && connected.length >= MIN_PLAYERS && allReady;
  const youReady = Boolean(view.you?.isHost || view.you?.lobbyReady);

  return (
    <div className="mx-auto mt-4 w-[calc(100%-1rem)] max-w-lg px-0 pb-[max(1rem,env(safe-area-inset-bottom))] sm:mt-6">
      <div className="lobby-panel rounded-[24px] border border-white/10 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.4)] sm:p-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-amber-400/75">Table</p>
            <h2 className="mt-1 font-serif text-2xl text-amber-200">Lobby</h2>
          </div>
          <p className="text-right text-xs text-amber-100/70">
            {readyCount}/{connected.length} ready
            <span className="mt-0.5 block text-amber-100/45">
              {view.players.length} seated · min {MIN_PLAYERS}
            </span>
          </p>
        </div>

        <ul className="mt-4 space-y-2">
          {view.players.map((p) => {
            const isYou = p.id === view.you?.id;
            const ready = p.connected && (p.isHost || p.lobbyReady);
            const statusClass = !p.connected
              ? "lobby-avatar--offline"
              : ready
                ? "lobby-avatar--ready"
                : "lobby-avatar--waiting";
            const statusLabel = !p.connected
              ? "Offline"
              : p.isHost
                ? "Host"
                : ready
                  ? "Ready"
                  : "Waiting";
            const badgeClass = !p.connected
              ? "lobby-badge--offline"
              : ready
                ? "lobby-badge--ready"
                : "lobby-badge--waiting";
            return (
              <li
                key={p.id}
                className={[
                  "lobby-member relative flex items-center gap-3 overflow-visible rounded-2xl border px-3 py-2.5",
                  ready && p.connected ? "lobby-member--ready" : "lobby-member--waiting",
                ].join(" ")}
              >
                <div
                  className={[
                    "lobby-avatar relative grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold",
                    statusClass,
                  ].join(" ")}
                >
                  {p.name.slice(0, 1).toUpperCase()}
                  <LobbyReactionBurst reactions={reactionsForPlayer(reactions, p.id)} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-amber-50">
                    {p.name}
                    {isYou ? " · you" : ""}
                  </p>
                </div>
                <span
                  className={[
                    "lobby-badge shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide",
                    badgeClass,
                  ].join(" ")}
                >
                  {statusLabel}
                </span>
                {view.you?.isHost && !p.isHost ? (
                  <button
                    type="button"
                    onClick={() => onKick({ id: p.id, name: p.name })}
                    className="min-h-10 shrink-0 rounded-full border border-red-300/40 bg-red-950/80 px-3 text-xs font-semibold text-red-200"
                  >
                    Kick
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>

        {view.you?.isHost ? (
          <>
            <button
              type="button"
              onClick={() => getSocket().emit("start")}
              disabled={!canStart}
              className="mt-4 min-h-12 w-full rounded-full bg-linear-to-b from-emerald-300 to-emerald-500 text-base font-semibold text-emerald-950 shadow-[0_8px_24px_rgba(16,185,129,0.25)] disabled:opacity-40"
            >
              Start game
            </button>
            <p className="mt-2 text-center text-xs text-amber-100/55">
              {connected.length < MIN_PLAYERS
                ? `Need ${MIN_PLAYERS - connected.length} more player${MIN_PLAYERS - connected.length === 1 ? "" : "s"}.`
                : allReady
                  ? "Everyone is ready."
                  : "Wait until every player taps Ready."}
            </p>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                getSocket().emit("lobbyReady", {
                  code: view.code,
                  playerId: getPlayerId(),
                  ready: !youReady,
                });
              }}
              className={
                youReady
                  ? "lobby-ready-btn--on mt-4 min-h-12 w-full rounded-full text-base font-semibold"
                  : "mt-4 min-h-12 w-full rounded-full bg-linear-to-b from-amber-300 to-amber-500 text-base font-semibold text-zinc-950 shadow-[0_8px_24px_rgba(212,175,55,0.25)]"
              }
            >
              {youReady ? "Ready · tap to undo" : "Ready"}
            </button>
            <p className="mt-2 text-center text-xs text-amber-100/55">
              {youReady ? "Waiting for the host to start." : "Tap Ready when you want to play."}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Results({ view }: { view: ClientView }) {
  const king = view.players.find((p) => p.role === "king");
  const queen = view.players.find((p) => p.role === "queen");
  const beggar = view.players.find((p) => p.role === "beggar");
  return (
    <div className="relative z-20 mx-auto mt-3 mb-2 w-[calc(100%-1rem)] max-w-md rounded-[22px] border border-amber-400/30 bg-black/70 p-4 text-center shadow-[0_20px_45px_rgba(0,0,0,0.35)] backdrop-blur sm:mt-4 sm:w-[calc(100%-1.5rem)] sm:rounded-3xl sm:p-5">
      <h2 className="font-serif text-xl text-amber-200 sm:text-2xl">Titles</h2>
      <div className="mt-4 space-y-2">
        <p className="text-base text-amber-100 sm:text-lg">රජු — {king?.name ?? "—"}</p>
        <p className="text-base text-amber-100 sm:text-lg">රැජින — {queen?.name ?? "—"}</p>
        <p className="text-base text-amber-300 sm:text-lg">හිඟන්නා — {beggar?.name ?? "—"}</p>
      </div>
      {view.you?.isHost ? (
        <button
          type="button"
          onClick={() => getSocket().emit("start")}
          className="mt-5 min-h-12 w-full rounded-full bg-linear-to-b from-emerald-300 to-emerald-500 px-5 text-base font-semibold text-emerald-950 shadow-[0_8px_24px_rgba(16,185,129,0.25)] sm:min-h-0 sm:py-2.5 sm:text-sm"
        >
          New round
        </button>
      ) : (
        <p className="mt-4 text-xs text-amber-100/50">Waiting for the host to start the next round.</p>
      )}
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
    <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center sm:px-4 sm:pb-0">
      <button
        type="button"
        onClick={() => dismissRef.current()}
        className="ui-pop pointer-events-auto w-full max-w-[340px] rounded-3xl border border-amber-300/35 bg-[#1a0c10]/92 px-5 py-4 text-center shadow-[0_16px_40px_rgba(0,0,0,0.5)] backdrop-blur-md"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="error-dialog-title"
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
      </button>
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:items-center sm:px-4 sm:pb-0">
      <div className="ui-pop w-full max-w-md rounded-3xl border border-amber-300/25 bg-[#1a0c10] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.55)] sm:p-6">
        <BrandMark size="mark" className="opacity-90" />
        <h2 className="mt-2 font-serif text-xl text-amber-100 sm:text-2xl">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-amber-100/65">{message}</p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:mt-6 sm:flex-row sm:flex-wrap sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-12 rounded-full border border-amber-200/25 bg-amber-100/5 px-5 text-sm text-amber-100 hover:bg-amber-100/10 sm:min-h-0 sm:py-2"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={
              danger
                ? "min-h-12 rounded-full border border-red-300/40 bg-linear-to-b from-red-400 to-red-600 px-5 text-sm font-semibold text-red-50 shadow-[0_8px_24px_rgba(220,38,38,0.25)] sm:min-h-0 sm:py-2"
                : "min-h-12 rounded-full bg-linear-to-b from-amber-300 to-amber-500 px-5 text-sm font-semibold text-zinc-950 sm:min-h-0 sm:py-2"
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
  const compact = useNarrow();
  const ready = jokers.every((j) => value[j.id]?.rank && value[j.id]?.suit);

  function setFace(id: string, patch: Partial<JokerDeclaration>) {
    const cur = value[id] ?? { rank: "A" as Rank, suit: "spades" as Suit };
    onChange({ ...value, [id]: { ...cur, ...patch } });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:items-center sm:px-4 sm:pb-0">
      <div className="ui-pop max-h-[min(92dvh,720px)] w-full max-w-lg overflow-auto rounded-3xl border border-amber-300/25 bg-[#1a0c10] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.55)] sm:p-6">
        <p className="text-xs uppercase tracking-[0.3em] text-amber-400/80">Joker</p>
        <h2 className="mt-1 font-serif text-xl text-amber-100 sm:text-2xl">What does this joker represent?</h2>
        <p className="mt-1 text-sm text-amber-100/60">
          Pick a suit and rank for each joker. The round closes only if you choose <span className="text-amber-200">2</span>.
        </p>

        <div className="mt-4 space-y-4 sm:mt-5 sm:space-y-5">
          {jokers.map((joker, idx) => {
            const face = value[joker.id] ?? { rank: "A" as Rank, suit: "spades" as Suit };
            const preview: Card = {
              ...joker,
              asRank: face.rank,
              asSuit: face.suit,
            };
            return (
              <div key={joker.id} className="rounded-2xl border border-amber-200/15 bg-black/30 p-3 sm:p-4">
                <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start sm:gap-4">
                  <PlayingCard
                    card={preview}
                    size={compact ? "sm" : "md"}
                    className="relative!"
                    style={{ position: "relative" }}
                  />
                  <div className="min-w-0 w-full flex-1">
                    <p className="text-center text-sm font-medium text-amber-100 sm:text-left">
                      Joker {jokers.length > 1 ? idx + 1 : ""} → {face.rank}
                      {SUIT_MARK[face.suit]}
                    </p>

                    <p className="mt-3 text-[10px] uppercase tracking-widest text-amber-400/70">Suit</p>
                    <div className="mt-1.5 grid grid-cols-4 gap-1.5">
                      {SUITS.map((suit) => (
                        <button
                          key={suit}
                          type="button"
                          onClick={() => setFace(joker.id, { suit })}
                          className={[
                            "min-h-11 rounded-xl border text-lg sm:min-h-0 sm:px-3 sm:py-1.5 sm:text-sm",
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
                    <div className="mt-1.5 grid grid-cols-7 gap-1.5">
                      {RANKS.map((rank) => (
                        <button
                          key={rank}
                          type="button"
                          onClick={() => setFace(joker.id, { rank })}
                          className={[
                            "min-h-11 min-w-0 rounded-xl border text-sm font-semibold sm:min-h-0 sm:min-w-9 sm:px-2.5 sm:py-1.5",
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

        <div className="mt-4 flex flex-col-reverse gap-2 sm:mt-5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-12 rounded-full border border-amber-200/25 px-5 text-sm text-amber-100 sm:min-h-0 sm:py-2"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!ready}
            className="min-h-12 rounded-full bg-linear-to-b from-amber-300 to-amber-500 px-5 text-sm font-semibold text-zinc-950 disabled:opacity-40 sm:min-h-0 sm:py-2"
          >
            Confirm & play
          </button>
        </div>
      </div>
    </div>
  );
}
