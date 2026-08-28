import {
  addPlayer,
  autoActOnTimeout,
  createRoom,
  generateRoomCode,
  kingGiveCard,
  passTurn,
  playCards,
  removePlayer,
  resolvePendingClose,
  startMatch,
  stopMatch,
  syncTurnDeadline,
  toClientView,
} from "../lib/engine";
import type { ClientView, JokerDeclaration, RoomState } from "../lib/types";

const rooms = new Map<string, RoomState>();
const closeTimers = new Map<string, ReturnType<typeof setTimeout>>();
const turnTimers = new Map<string, ReturnType<typeof setTimeout>>();

type MutateResult =
  | { viewFor: (id?: string) => ClientView; code: string; closeAfterMs?: number }
  | { error: string };

function uniqueCode(): string {
  for (let i = 0; i < 20; i++) {
    const code = generateRoomCode();
    if (!rooms.has(code)) return code;
  }
  return generateRoomCode() + generateRoomCode().slice(0, 2);
}

function clearCloseTimer(code: string) {
  const t = closeTimers.get(code);
  if (t) {
    clearTimeout(t);
    closeTimers.delete(code);
  }
}

function clearTurnTimer(code: string) {
  const t = turnTimers.get(code);
  if (t) {
    clearTimeout(t);
    turnTimers.delete(code);
  }
}

let onRoomUpdated: ((code: string) => void) | null = null;

/** Socket layer registers this so delayed closes / turn timeouts rebroadcast state. */
export function setRoomUpdateListener(fn: ((code: string) => void) | null) {
  onRoomUpdated = fn;
}

function schedulePendingClose(code: string, delayMs: number) {
  clearCloseTimer(code);
  const timer = setTimeout(() => {
    closeTimers.delete(code);
    const room = rooms.get(code);
    if (!room?.pendingClose) return;
    const next = syncTurnDeadline(room, resolvePendingClose(room));
    rooms.set(code, next);
    scheduleTurnTimeout(code, next);
    onRoomUpdated?.(code);
  }, delayMs);
  closeTimers.set(code, timer);
}

function scheduleTurnTimeout(code: string, room: RoomState) {
  clearTurnTimer(code);
  if (!room.turnDeadlineAt || !room.currentTurnId || room.pendingClose) return;
  const delay = Math.max(0, room.turnDeadlineAt - Date.now());
  const expectedPlayer = room.currentTurnId;
  const expectedDeadline = room.turnDeadlineAt;
  const timer = setTimeout(() => {
    turnTimers.delete(code);
    const live = rooms.get(code);
    if (!live) return;
    if (live.currentTurnId !== expectedPlayer) return;
    if (live.turnDeadlineAt !== expectedDeadline) return;
    if (live.pendingClose) return;
    const result = mutate(code, (r) => autoActOnTimeout(r, expectedPlayer));
    if (!("error" in result)) onRoomUpdated?.(code);
  }, delay);
  turnTimers.set(code, timer);
}

export function hostCreate(playerId: string, name: string): ClientView {
  const code = uniqueCode();
  const room = createRoom(code, { id: playerId, name: name.trim() || "Host" });
  rooms.set(code, room);
  return toClientView(room, playerId);
}

export function joinRoom(
  code: string,
  playerId: string,
  name: string,
): ClientView | { error: string } {
  const room = rooms.get(code.toUpperCase());
  if (!room) return { error: "Room not found. Check the code." };
  const joined = addPlayer(room, { id: playerId, name: name.trim() || "Player" });
  if ("error" in joined) return joined;
  const withClock = syncTurnDeadline(room, joined);
  rooms.set(withClock.code, withClock);
  scheduleTurnTimeout(withClock.code, withClock);
  return toClientView(withClock, playerId);
}

export function leaveRoom(code: string, playerId: string): void {
  const room = rooms.get(code);
  if (!room) return;
  const next = removePlayer(room, playerId);
  if (!next) {
    clearCloseTimer(code);
    clearTurnTimer(code);
    rooms.delete(code);
    return;
  }
  const withClock = syncTurnDeadline(room, next);
  rooms.set(code, withClock);
  scheduleTurnTimeout(code, withClock);
}

export function mutate(
  code: string,
  fn: (room: RoomState) => RoomState | { error: string },
): MutateResult {
  const room = rooms.get(code);
  if (!room) return { error: "Room not found." };
  const raw = fn(room);
  if ("error" in raw) return { error: raw.error };
  const next = syncTurnDeadline(room, raw);
  rooms.set(code, next);
  const closeAfterMs = next.pendingClose?.delayMs;
  if (closeAfterMs != null && next.pendingClose) {
    schedulePendingClose(code, closeAfterMs);
  } else if (!next.pendingClose) {
    clearCloseTimer(code);
  }
  scheduleTurnTimeout(code, next);
  return {
    code,
    viewFor: (id?: string) => toClientView(next, id),
    closeAfterMs,
  };
}

export function startGame(code: string, playerId: string) {
  clearCloseTimer(code);
  clearTurnTimer(code);
  return mutate(code, (room) => startMatch(room, playerId));
}

export function stopGame(code: string, playerId: string) {
  clearCloseTimer(code);
  clearTurnTimer(code);
  return mutate(code, (room) => stopMatch(room, playerId));
}

export function play(
  code: string,
  playerId: string,
  cardIds: string[],
  jokerAs: Record<string, JokerDeclaration> = {},
) {
  return mutate(code, (room) => playCards(room, playerId, cardIds, jokerAs));
}

export function pass(code: string, playerId: string) {
  return mutate(code, (room) => passTurn(room, playerId));
}

export function tribute(code: string, playerId: string, cardId: string) {
  return mutate(code, (room) => kingGiveCard(room, playerId, cardId));
}

export function getRoom(code: string): RoomState | undefined {
  return rooms.get(code);
}

/** Backfill a missing turn deadline (e.g. after hot reload) and keep the timeout armed. */
export function ensureTurnClock(code: string): RoomState | undefined {
  const room = rooms.get(code);
  if (!room) return undefined;
  const next = syncTurnDeadline(room, room);
  if (next.turnDeadlineAt !== room.turnDeadlineAt || next !== room) {
    rooms.set(code, next);
    scheduleTurnTimeout(code, next);
  }
  return next;
}
