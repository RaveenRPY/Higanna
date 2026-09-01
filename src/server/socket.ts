import type { Server, Socket } from "socket.io";
import {
  getRoom,
  ensureTurnClock,
  hostCreate,
  joinRoom,
  kickFromLobby,
  leaveRoom,
  markOffline,
  pass,
  play,
  endRound,
  setLobbyReady,
  setRoomUpdateListener,
  startGame,
  stopGame,
  tribute,
} from "./rooms";
import { toClientView } from "../lib/engine";
import { isSafeReactionId, isValidReaction, sanitizeComment, REACTION_COOLDOWN_MS } from "../lib/reactions";

type PlayerSocket = Socket & {
  playerId?: string;
  roomCode?: string;
  playerName?: string;
};

/** Keep players in the game while the app is backgrounded; only go offline after a long absence. */
const DISCONNECT_GRACE_MS = 30 * 60 * 1000;

function emitRoom(io: Server, code: string) {
  const room = ensureTurnClock(code) ?? getRoom(code);
  if (!room) {
    io.to(code).emit("state", { error: "The room was closed." });
    return;
  }
  for (const p of room.players) {
    io.to(`player:${p.id}`).emit("state", toClientView(room, p.id));
  }
}

function presenceKey(code: string, playerId: string) {
  return `${code}:${playerId}`;
}

const socketCounts = new Map<string, number>();
const offlineTimers = new Map<string, ReturnType<typeof setTimeout>>();
const lastReactionAt = new Map<string, number>();

function clearOfflineTimer(key: string) {
  const timer = offlineTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    offlineTimers.delete(key);
  }
}

function trackSocketJoin(code: string, playerId: string) {
  const key = presenceKey(code, playerId);
  socketCounts.set(key, (socketCounts.get(key) ?? 0) + 1);
  clearOfflineTimer(key);
}

function trackSocketDisconnect(io: Server, code: string, playerId: string) {
  const key = presenceKey(code, playerId);
  const next = Math.max(0, (socketCounts.get(key) ?? 1) - 1);
  if (next === 0) {
    socketCounts.delete(key);
    clearOfflineTimer(key);
    const timer = setTimeout(() => {
      offlineTimers.delete(key);
      if ((socketCounts.get(key) ?? 0) > 0) return;
      markOffline(code, playerId);
      const room = getRoom(code);
      if (room) emitRoom(io, code);
    }, DISCONNECT_GRACE_MS);
    offlineTimers.set(key, timer);
  } else {
    socketCounts.set(key, next);
  }
}

export function attachGameSocket(io: Server) {
  setRoomUpdateListener((code) => emitRoom(io, code));

  io.on("connection", (socket: PlayerSocket) => {
    socket.on("create", ({ name, playerId }: { name: string; playerId: string }) => {
      if (!playerId || !name?.trim()) {
        socket.emit("state", { error: "Enter a name." });
        return;
      }
      if (socket.roomCode && getRoom(socket.roomCode)) {
        trackSocketJoin(socket.roomCode, playerId);
        emitRoom(io, socket.roomCode);
        return;
      }
      const view = hostCreate(playerId, name);
      socket.playerId = playerId;
      socket.roomCode = view.code;
      socket.playerName = name;
      socket.join(view.code);
      socket.join(`player:${playerId}`);
      trackSocketJoin(view.code, playerId);
      emitRoom(io, view.code);
    });

    socket.on(
      "join",
      ({ code, name, playerId }: { code: string; name: string; playerId: string }) => {
        if (!playerId || !name?.trim() || !code) {
          socket.emit("state", { error: "Enter a name and room code." });
          return;
        }
        const result = joinRoom(code.trim().toUpperCase(), playerId, name);
        if ("error" in result) {
          socket.emit("state", result);
          return;
        }
        socket.playerId = playerId;
        socket.roomCode = result.code;
        socket.playerName = name;
        socket.join(result.code);
        socket.join(`player:${playerId}`);
        trackSocketJoin(result.code, playerId);
        emitRoom(io, result.code);
      },
    );

    socket.on("leave", ({ code, playerId }: { code?: string; playerId?: string }) => {
      const roomCode = code || socket.roomCode;
      const id = playerId || socket.playerId;
      if (!roomCode || !id) return;
      const key = presenceKey(roomCode, id);
      clearOfflineTimer(key);
      socketCounts.delete(key);
      leaveRoom(roomCode, id);
      const room = getRoom(roomCode);
      if (room) emitRoom(io, roomCode);
      else io.to(roomCode).emit("state", { error: "The room was closed." });
    });

    socket.on("start", () => {
      if (!socket.roomCode || !socket.playerId) return;
      const result = startGame(socket.roomCode, socket.playerId);
      if ("error" in result) {
        socket.emit("toast", result.error);
        return;
      }
      emitRoom(io, result.code);
    });

    socket.on(
      "lobbyReady",
      ({
        code,
        playerId,
        ready,
      }: {
        code?: string;
        playerId?: string;
        ready?: boolean;
      }) => {
        const roomCode = code || socket.roomCode;
        const id = playerId || socket.playerId;
        if (!roomCode || !id) {
          socket.emit("toast", "Not connected to a room.");
          return;
        }
        socket.roomCode = roomCode;
        socket.playerId = id;
        const result = setLobbyReady(roomCode, id, Boolean(ready));
        if ("error" in result) {
          socket.emit("toast", result.error);
          return;
        }
        emitRoom(io, result.code);
      },
    );

    socket.on("kick", ({ playerId: targetId }: { playerId?: string }) => {
      if (!socket.roomCode || !socket.playerId || !targetId) return;
      const code = socket.roomCode;
      const result = kickFromLobby(code, socket.playerId, targetId);
      if ("error" in result) {
        socket.emit("toast", result.error);
        return;
      }
      io.to(`player:${targetId}`).emit("kicked", "The host removed you from the room.");
      void io.in(`player:${targetId}`).socketsLeave(code);
      emitRoom(io, result.code);
    });

    socket.on("stop", (payload?: { code?: string; playerId?: string }) => {
      const code = payload?.code || socket.roomCode;
      const playerId = payload?.playerId || socket.playerId;
      if (!code || !playerId) {
        socket.emit("toast", "Not connected to a room.");
        return;
      }
      socket.roomCode = code;
      socket.playerId = playerId;
      const result = stopGame(code, playerId);
      if ("error" in result) {
        socket.emit("toast", result.error);
        return;
      }
      emitRoom(io, result.code);
    });

    socket.on(
      "play",
      ({
        cardIds,
        jokerAs,
      }: {
        cardIds: string[];
        jokerAs?: Record<string, { rank: string; suit: string }>;
      }) => {
        if (!socket.roomCode || !socket.playerId) return;
        let jokerDeclarations: Record<string, any> = {};
        if (jokerAs) {
          jokerDeclarations = Object.fromEntries(
            Object.entries(jokerAs).map(([id, value]) => [
              id,
              {
                rank: value.rank as
                  | "3"
                  | "4"
                  | "5"
                  | "6"
                  | "7"
                  | "8"
                  | "9"
                  | "10"
                  | "J"
                  | "Q"
                  | "K"
                  | "A"
                  | "2",
                suit: value.suit as "spades" | "hearts" | "clubs" | "diamonds",
              },
            ]),
          );
        }
        const result = play(socket.roomCode, socket.playerId, cardIds, jokerDeclarations);
        if ("error" in result) {
          socket.emit("toast", result.error);
          return;
        }
        emitRoom(io, result.code);
      },
    );

    socket.on("pass", () => {
      if (!socket.roomCode || !socket.playerId) return;
      const result = pass(socket.roomCode, socket.playerId);
      if ("error" in result) {
        socket.emit("toast", result.error);
        return;
      }
      emitRoom(io, result.code);
    });

    socket.on("endRound", () => {
      if (!socket.roomCode || !socket.playerId) return;
      const result = endRound(socket.roomCode, socket.playerId);
      if ("error" in result) {
        socket.emit("toast", result.error);
        return;
      }
      emitRoom(io, result.code);
    });

    socket.on("tribute", ({ cardId }: { cardId: string }) => {
      if (!socket.roomCode || !socket.playerId) return;
      const result = tribute(socket.roomCode, socket.playerId, cardId);
      if ("error" in result) {
        socket.emit("toast", result.error);
        return;
      }
      emitRoom(io, result.code);
    });

    socket.on(
      "reaction",
      ({ kind, value, id }: { kind?: string; value?: string; id?: string }) => {
        if (!socket.roomCode || !socket.playerId) return;
        if (!isValidReaction(kind, value)) return;
        const key = presenceKey(socket.roomCode, socket.playerId);
        const now = Date.now();
        if (now - (lastReactionAt.get(key) ?? 0) < REACTION_COOLDOWN_MS) return;
        lastReactionAt.set(key, now);
        const room = getRoom(socket.roomCode);
        const player = room?.players.find((p) => p.id === socket.playerId);
        const playerName = player?.name || socket.playerName || "Player";
        const reactionId = isSafeReactionId(id)
          ? id
          : `r-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        const cleanedValue = kind === "comment" ? sanitizeComment(value) : value;
        if (!cleanedValue) return;
        io.to(socket.roomCode).emit("reaction", {
          id: reactionId,
          playerId: socket.playerId,
          playerName,
          kind,
          value: cleanedValue,
        });
      },
    );

    socket.on("disconnect", () => {
      if (!socket.roomCode || !socket.playerId) return;
      trackSocketDisconnect(io, socket.roomCode, socket.playerId);
    });
  });
}
