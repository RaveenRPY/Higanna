export const REACTION_COOLDOWN_MS = 1400;
export const REACTION_EMOJI_MS = 4000;
export const REACTION_PHRASE_MS = 5200;
export const COMMENT_MAX_LEN = 80;

export const REACTION_EMOJIS = [
  { id: "laugh", emoji: "😂", label: "Laugh", src: "/assets/reactions/laugh.png" },
  { id: "fire", emoji: "🔥", label: "Fire", src: "/assets/reactions/fire.png" },
  { id: "clap", emoji: "👏", label: "Clap", src: "/assets/reactions/clap.png" },
  { id: "love", emoji: "❤️", label: "Love", src: "/assets/reactions/love.png" },
  { id: "wow", emoji: "😱", label: "Wow", src: "/assets/reactions/wow.png" },
  { id: "cool", emoji: "😎", label: "Cool", src: "/assets/reactions/cool.png" },
  { id: "cry", emoji: "😭", label: "Cry", src: "/assets/reactions/cry.png" },
  { id: "king", emoji: "👑", label: "King", src: "/assets/reactions/king.png" },
  { id: "joker", emoji: "🃏", label: "Joker", src: "/assets/reactions/joker.png" },
  { id: "party", emoji: "🎉", label: "Party", src: "/assets/reactions/party.png" },
  { id: "flex", emoji: "💪", label: "Strong", src: "/assets/reactions/flex.png" },
  { id: "think", emoji: "🤔", label: "Think", src: "/assets/reactions/think.png" },
  { id: "sleep", emoji: "😴", label: "Sleep", src: "/assets/reactions/sleep.png" },
  { id: "angry", emoji: "😤", label: "Come on", src: "/assets/reactions/angry.png" },
  { id: "target", emoji: "🎯", label: "Nailed it", src: "/assets/reactions/target.png" },
  { id: "skull", emoji: "💀", label: "Dead", src: "/assets/reactions/skull.png" },
] as const;

export const REACTION_PHRASES = [
  { id: "superb", text: "සුපිරියි!" },
  { id: "hurry", text: "ඉක්මන් කරපන්!" },
  { id: "lucky", text: "මොකද වාසනාව!" },
  { id: "king", text: "රජු තමයි!" },
  { id: "beggar", text: "අපොයි හිඟන්නා!" },
  { id: "pass", text: "මම පාස්!" },
  { id: "next", text: "ඊළඟ වටේ බලමු" },
  { id: "wellplayed", text: "Well played" },
  { id: "niceone", text: "Nice one!" },
  { id: "unlucky", text: "Unlucky" },
] as const;

export type ReactionKind = "emoji" | "phrase" | "comment";

export type TableReaction = {
  id: string;
  playerId: string;
  playerName: string;
  kind: ReactionKind;
  value: string;
};

const EMOJI_SET = new Set<string>(REACTION_EMOJIS.map((e) => e.emoji));
const PHRASE_IDS = new Set<string>(REACTION_PHRASES.map((p) => p.id));
const EMOJI_SRC = new Map<string, string>([
  ...REACTION_EMOJIS.map((e) => [e.emoji, e.src] as const),
  ["❤", "/assets/reactions/love.png"],
]);

export function reactionEmojiSrc(emoji: string): string | null {
  return EMOJI_SRC.get(emoji) ?? EMOJI_SRC.get(emoji.replace(/\uFE0F/g, "")) ?? null;
}

export function sanitizeComment(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/[\u0000-\u001F\u007F]/g, "").replace(/\s+/g, " ").trim();
  if (text.length < 1 || text.length > COMMENT_MAX_LEN) return null;
  return text;
}

export function isValidReaction(kind: unknown, value: unknown): kind is ReactionKind {
  if (kind === "emoji") return typeof value === "string" && (EMOJI_SET.has(value) || value === "❤");
  if (kind === "phrase") return typeof value === "string" && PHRASE_IDS.has(value);
  if (kind === "comment") return sanitizeComment(value) != null;
  return false;
}

export function isSafeReactionId(id: unknown): id is string {
  return typeof id === "string" && /^[a-zA-Z0-9._-]{6,80}$/.test(id);
}

export function phraseText(id: string): string | null {
  return REACTION_PHRASES.find((p) => p.id === id)?.text ?? null;
}

export function captionForReaction(kind: ReactionKind, value: string): string | null {
  if (kind === "phrase") return phraseText(value);
  if (kind === "comment") return sanitizeComment(value);
  return null;
}

export function reactionDurationMs(kind: ReactionKind): number {
  return kind === "emoji" ? REACTION_EMOJI_MS : REACTION_PHRASE_MS;
}
