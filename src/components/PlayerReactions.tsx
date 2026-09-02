"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { SiText } from "@/components/SiText";
import {
  REACTION_COOLDOWN_MS,
  REACTION_EMOJIS,
  REACTION_PHRASES,
  COMMENT_MAX_LEN,
  isValidReaction,
  captionForReaction,
  reactionDurationMs,
  reactionEmojiSrc,
  sanitizeComment,
  type ReactionKind,
  type TableReaction,
} from "@/lib/reactions";
import { getPlayerId, getPlayerName, getSocket } from "@/lib/socket";
import { playSfx } from "@/lib/sounds";

const MAX_PER_PLAYER = 3;

export type LiveReaction = TableReaction & { bornAt: number };

function makeReactionId(playerId: string) {
  const rand =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${playerId.slice(0, 8)}-${Date.now().toString(36)}-${rand}`;
}

function sparkleColors(emoji: string): string[] {
  if (emoji === "👑" || emoji === "🎉") return ["#fde68a", "#fbbf24", "#fff7ed", "#f59e0b"];
  if (emoji === "🔥") return ["#fb923c", "#ef4444", "#fde68a", "#f97316"];
  if (emoji === "❤️" || emoji === "❤") return ["#fb7185", "#f43f5e", "#fecdd3", "#fda4af"];
  if (emoji === "💀") return ["#e7e5e4", "#a8a29e", "#fbbf24", "#d6d3d1"];
  if (emoji === "😂") return ["#fde68a", "#38bdf8", "#f472b6", "#fbbf24"];
  return ["#fde68a", "#fbbf24", "#6ee7b7", "#fda4af"];
}

export function ReactionGlyph({
  emoji,
  className = "",
  size = 34,
}: {
  emoji: string;
  className?: string;
  size?: number;
}) {
  const src = reactionEmojiSrc(emoji);
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return (
      <span className={["reaction-emoji-fallback", className].filter(Boolean).join(" ")} aria-hidden>
        {emoji}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      draggable={false}
      onError={() => setBroken(true)}
      style={{ width: size, height: size }}
      className={["reaction-emoji-img", className].filter(Boolean).join(" ")}
    />
  );
}

export function useTableReactions() {
  const [live, setLive] = useState<LiveReaction[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const cooldownRef = useRef(0);

  useEffect(() => {
    const socket = getSocket();
    function onReaction(payload: TableReaction) {
      if (!payload || !isValidReaction(payload.kind, payload.value)) return;
      if (!payload.playerId || !payload.id) return;
      setLive((cur) => {
        if (cur.some((r) => r.id === payload.id)) {
          return cur.map((r) =>
            r.id === payload.id
              ? { ...r, playerName: payload.playerName || r.playerName }
              : r,
          );
        }
        const next: LiveReaction = { ...payload, bornAt: Date.now() };
        const others = cur.filter((r) => r.playerId !== payload.playerId);
        const mine = cur.filter((r) => r.playerId === payload.playerId);
        queueMicrotask(() => playSfx("reaction"));
        return [...others, ...mine.slice(-(MAX_PER_PLAYER - 1)), next];
      });
    }
    socket.on("reaction", onReaction);
    return () => {
      socket.off("reaction", onReaction);
    };
  }, []);

  useEffect(() => {
    if (live.length === 0) return;
    const t = window.setInterval(() => {
      const tNow = Date.now();
      setLive((cur) => cur.filter((r) => tNow - r.bornAt < reactionDurationMs(r.kind) + 80));
    }, 180);
    return () => window.clearInterval(t);
  }, [live.length]);

  useEffect(() => {
    if (pickerOpen) {
      setPickerVisible(true);
      return;
    }
    if (!pickerVisible) return;
    const t = window.setTimeout(() => setPickerVisible(false), 280);
    return () => window.clearTimeout(t);
  }, [pickerOpen, pickerVisible]);

  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 80);
    return () => window.clearInterval(id);
  }, [cooldownUntil]);

  const send = useCallback((kind: ReactionKind, value: string) => {
    const nextValue = kind === "comment" ? sanitizeComment(value) : value;
    if (!nextValue || !isValidReaction(kind, nextValue)) return false;
    if (Date.now() < cooldownRef.current) return false;
    const playerId = getPlayerId();
    const id = makeReactionId(playerId);
    const nextCooldown = Date.now() + REACTION_COOLDOWN_MS;
    cooldownRef.current = nextCooldown;
    const payload: LiveReaction = {
      id,
      playerId,
      playerName: getPlayerName() || "You",
      kind,
      value: nextValue,
      bornAt: Date.now(),
    };
    setLive((cur) => {
      const others = cur.filter((r) => r.playerId !== playerId);
      const mine = cur.filter((r) => r.playerId === playerId);
      return [...others, ...mine.slice(-(MAX_PER_PLAYER - 1)), payload];
    });
    setCooldownUntil(nextCooldown);
    playSfx("reaction");
    getSocket().emit("reaction", { id, kind, value: nextValue });
    setPickerOpen(false);
    return true;
  }, []);

  const cooling = Math.max(0, cooldownUntil - now);
  const cooldownRatio = cooling > 0 ? cooling / REACTION_COOLDOWN_MS : 0;

  return {
    live,
    send,
    pickerOpen,
    pickerVisible,
    setPickerOpen,
    cooling,
    cooldownRatio,
  };
}

export function reactionsForPlayer(live: LiveReaction[], playerId: string) {
  return live.filter((r) => r.playerId === playerId);
}

export function flyTowardCenter(index: number, total: number, compact: boolean) {
  const angle = Math.PI / 2 + (2 * Math.PI * index) / Math.max(total, 1);
  const dist = compact ? 30 : 42;
  return {
    x: Number((-Math.cos(angle) * dist).toFixed(1)),
    y: Number((-Math.sin(angle) * dist * 0.78).toFixed(1)),
  };
}

function PhraseLabel({ text, className }: { text: string; className?: string }) {
  return <SiText className={className}>{text}</SiText>;
}

export function SeatReactionBurst({
  reactions,
  flyX = 0,
  flyY = -36,
  compact = false,
}: {
  reactions: LiveReaction[];
  flyX?: number;
  flyY?: number;
  compact?: boolean;
}) {
  if (reactions.length === 0) return null;
  return (
    <div className="reaction-burst-layer">
      {reactions.map((r, i) => {
        const offset = (i - (reactions.length - 1) / 2) * (compact ? 18 : 22);
        if (r.kind === "emoji") {
          return (
            <EmojiBurst
              key={r.id}
              emoji={r.value}
              flyX={flyX}
              flyY={flyY}
              compact={compact}
              offsetX={offset}
            />
          );
        }
        const text = captionForReaction(r.kind, r.value);
        if (!text) return null;
        return (
          <PhraseBubble
            key={r.id}
            text={text}
            name={r.playerName}
            compact={compact}
            offsetX={offset}
          />
        );
      })}
    </div>
  );
}

function EmojiBurst({
  emoji,
  compact,
  offsetX,
}: {
  emoji: string;
  flyX: number;
  flyY: number;
  compact: boolean;
  offsetX: number;
}) {
  const sparkCount = compact ? 7 : 10;
  const sparks = useMemo(
    () =>
      Array.from({ length: sparkCount }, (_, i) => {
        const angle = ((360 / sparkCount) * i + (i % 2) * 12) * (Math.PI / 180);
        const dist = 22 + (i % 4) * 6;
        return {
          id: i,
          color: sparkleColors(emoji)[i % sparkleColors(emoji).length],
          left: 88 + Math.sin(angle) * dist,
          top: 88 - Math.cos(angle) * dist,
          delay: i * 18,
          size: 3 + (i % 3),
        };
      }),
    [emoji, sparkCount],
  );

  return (
    <div className="reaction-emoji-wrap" style={{ marginLeft: offsetX }}>
      <span className="reaction-emoji-ring" aria-hidden />
      {sparks.map((s) => (
        <span
          key={s.id}
          className="reaction-spark-dot"
          style={{
            backgroundColor: s.color,
            width: s.size,
            height: s.size,
            left: s.left,
            top: s.top,
            animationDelay: `${s.delay}ms`,
          }}
        />
      ))}
      <span
        className={["reaction-emoji", compact ? "reaction-emoji--compact" : ""].join(" ")}
        role="img"
        aria-label={emoji}
      >
        <ReactionGlyph emoji={emoji} size={compact ? 52 : 68} />
      </span>
    </div>
  );
}

function PhraseBubble({
  text,
  name,
  compact,
  offsetX,
}: {
  text: string;
  name: string;
  compact: boolean;
  offsetX: number;
}) {
  return (
    <div
      className={["reaction-phrase-anchor", compact ? "reaction-phrase-anchor--compact" : ""].join(" ")}
      style={{ marginLeft: offsetX }}
    >
      <div className="reaction-phrase-motion">
        <div className="reaction-phrase-card">
          {name ? <p className="reaction-phrase-name">{name}</p> : null}
          <p className="reaction-phrase-text">
            <PhraseLabel text={text} />
          </p>
        </div>
        <span className="reaction-phrase-tail" aria-hidden />
      </div>
    </div>
  );
}

export function LobbyReactionBurst({ reactions }: { reactions: LiveReaction[] }) {
  if (reactions.length === 0) return null;
  const latest = reactions[reactions.length - 1];
  return (
    <div className="reaction-lobby-burst">
      {latest.kind === "emoji" ? (
        <EmojiBurst emoji={latest.value} flyX={8} flyY={-28} compact offsetX={0} />
      ) : (
        (() => {
          const text = captionForReaction(latest.kind, latest.value);
          return text ? <PhraseBubble text={text} name="" compact offsetX={0} /> : null;
        })()
      )}
    </div>
  );
}

function CooldownRing({ ratio }: { ratio: number }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(1, Math.max(0, ratio));
  return (
    <svg className="reaction-fab-cool" viewBox="0 0 44 44" aria-hidden focusable="false">
      <circle
        cx="22"
        cy="22"
        r={r}
        fill="none"
        stroke="rgba(251,191,36,0.85)"
        strokeWidth="3"
        strokeDasharray={String(c)}
        strokeDashoffset={String(c * (1 - clamped))}
        transform="rotate(-90 22 22)"
      />
    </svg>
  );
}

export function ReactionButton({
  onClick,
  cooldownRatio,
  open,
}: {
  onClick: () => void;
  cooldownRatio: number;
  open: boolean;
}) {
  const cooling = cooldownRatio > 0.02;
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "reaction-fab",
        open ? "reaction-fab--open" : "",
      ].join(" ")}
      aria-label="Send a reaction"
      aria-expanded={open}
    >
      {cooling ? <CooldownRing ratio={cooldownRatio} /> : null}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        className="reaction-fab-icon"
        aria-hidden
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z"
        />
        <path strokeLinecap="round" d="M8.4 10.1h.01M15.6 10.1h.01" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.4 14.2c.9 1.3 2.2 1.9 3.6 1.9s2.7-.6 3.6-1.9" />
      </svg>
    </button>
  );
}

export function ReactionPicker({
  open,
  visible,
  onClose,
  onSend,
  cooling,
}: {
  open: boolean;
  visible: boolean;
  onClose: () => void;
  onSend: (kind: ReactionKind, value: string) => boolean;
  cooling: number;
}) {
  const [draft, setDraft] = useState("");
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (open) setDraft("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!visible) return null;
  const locked = cooling > 0;
  const canSendComment = Boolean(sanitizeComment(draft)) && !locked;

  function submitComment(e: FormEvent) {
    e.preventDefault();
    if (!onSend("comment", draft)) return;
    setDraft("");
  }

  return (
    <div
      className={[
        "reaction-overlay",
        open ? "reaction-overlay--open" : "reaction-overlay--close",
      ].join(" ")}
      onClick={onClose}
      role="presentation"
    >
      <div
        className={[
          "reaction-panel",
          open ? "reaction-panel--open" : "reaction-panel--close",
        ].join(" ")}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reaction-picker-title"
      >
        <div className="reaction-panel-head">
          <div>
            <p className="reaction-kicker">Table</p>
            <h2 id="reaction-picker-title" className="reaction-panel-title">
              React
            </h2>
            <p className="reaction-panel-copy">Everyone at the table will see it.</p>
          </div>
          <button type="button" onClick={onClose} className="reaction-close" aria-label="Close">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="reaction-close-icon" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="reaction-panel-body">
          <p className="reaction-kicker">Reactions</p>
          <div className="reaction-emoji-grid">
            {REACTION_EMOJIS.map((item, i) => (
              <button
                key={item.id}
                type="button"
                disabled={locked}
                onClick={() => onSend("emoji", item.emoji)}
                className="reaction-pick-emoji"
                style={{ animationDelay: `${i * 16}ms` }}
                aria-label={item.label}
              >
                <ReactionGlyph emoji={item.emoji} size={40} />
              </button>
            ))}
          </div>

          <p className="reaction-kicker reaction-kicker--spaced">Say to everyone</p>
          <form className="reaction-comment-form" onSubmit={submitComment}>
            <label htmlFor="reaction-comment" className="sr-only">
              Custom comment
            </label>
            <input
              id="reaction-comment"
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, COMMENT_MAX_LEN))}
              maxLength={COMMENT_MAX_LEN}
              placeholder="Type a comment…"
              autoComplete="off"
              enterKeyHint="send"
              className="reaction-comment-input"
            />
            <button type="submit" className="reaction-comment-send" disabled={!canSendComment}>
              Send
            </button>
          </form>
          <p className="reaction-comment-count">
            {draft.trim().length}/{COMMENT_MAX_LEN}
          </p>
          <div className="reaction-phrase-row">
            {REACTION_PHRASES.map((item, i) => (
              <button
                key={item.id}
                type="button"
                disabled={locked}
                onClick={() => onSend("phrase", item.id)}
                className="reaction-pick-phrase"
                style={{ animationDelay: `${i * 22}ms` }}
              >
                <PhraseLabel text={item.text} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
