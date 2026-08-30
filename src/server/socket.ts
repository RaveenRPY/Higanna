import type { Server, Socket } from "socket.io";
import {
  getRoom,
  ensureTurnClock,
  hostCreate,
  joinRoom,
  kickFromLobby,
  leaveRoom,
  pass,
  play,
  setLobbyReady,
  setRoomUpdateListener,
  startGame,
  stopGame,
  tribute,
} from "./rooms";
import { toClientView } from "../lib/engine";

type PlayerSocket = Socket & {
  playerId?: string;
  roomCode?: string;
  playerName?: string;
};

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

export function attachGameSocket(io: Server) {
  setRoomUpdateListener((code) => emitRoom(io, code));

  io.on("connection", (socket: PlayerSocket) => {
    socket.on("create", ({ name, playerId }: { name: string; playerId: string }) => {
      if (!playerId || !name?.trim()) {
        socket.emit("state", { error: "Enter a name." });
        return;
      }
      if (socket.roomCode && getRoom(socket.roomCode)) {
        emitRoom(io, socket.roomCode);
        return;
      }
      const view = hostCreate(playerId, name);
      socket.playerId = playerId;
      socket.roomCode = view.code;
      socket.playerName = name;
      socket.join(view.code);
      socket.join(`player:${playerId}`);
      incLive(view.code, playerId);
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
        incLive(result.code, playerId);
        emitRoom(io, result.code);
      },
    );

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
        const result = play(socket.roomCode, socket.playerId, cardIds, jokerAs ?? {});
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

    socket.on("tribute", ({ cardId }: { cardId: string }) => {
      if (!socket.roomCode || !socket.playerId) return;
      const result = tribute(socket.roomCode, socket.playerId, cardId);
      if ("error" in result) {
        socket.emit("toast", result.error);
        return;
      }
      emitRoom(io, result.code);
    });

    socket.on("disconnect", () => {
      if (!socket.roomCode || !socket.playerId) return;
      const code = socket.roomCode;
      const playerId = socket.playerId;
      setTimeout(() => {
        if (decLive(code, playerId) > 0) return;
        leaveRoom(code, playerId);
        const room = getRoom(code);
        if (room) emitRoom(io, code);
        else io.to(code).emit("state", { error: "The room was closed." });
      }, 1500);
    });
  });
}

const live = new Map<string, number>();

function liveKey(code: string, playerId: string) {
  return `${code}:${playerId}`;
}

function incLive(code: string, playerId: string) {
  const key = liveKey(code, playerId);
  live.set(key, (live.get(key) ?? 0) + 1);
}

function decLive(code: string, playerId: string): number {
  const key = liveKey(code, playerId);
  const next = Math.max(0, (live.get(key) ?? 1) - 1);
  if (next === 0) live.delete(key);
  else live.set(key, next);
  return next;
}
