export const RANKS = [
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
  "A",
  "2",
] as const;

export const SUITS = ["hearts", "diamonds", "clubs", "spades"] as const;

export type Rank = (typeof RANKS)[number];
export type Suit = (typeof SUITS)[number];

export type Card = {
  id: string;
  suit?: Suit;
  rank?: Rank;
  joker?: boolean;
  /** Declared face when a joker is played. */
  asRank?: Rank;
  asSuit?: Suit;
};

export type JokerDeclaration = {
  rank: Rank;
  suit: Suit;
};

export type Role = "king" | "queen" | "beggar";

export type Pattern =
  | { kind: "single" }
  | { kind: "set"; count: number }
  | { kind: "run"; length: number };

export type Play = {
  playerId: string;
  playerName: string;
  cards: Card[];
  pattern: Pattern;
  strength: number;
};

export type Phase = "lobby" | "tribute" | "playing" | "finished";

export type Player = {
  id: string;
  name: string;
  hand: Card[];
  role: Role | null;
  finishOrder: number | null;
  connected: boolean;
  isHost: boolean;
  passed: boolean;
  /** Guest is ready to start (host is always treated as ready). */
  lobbyReady: boolean;
};

export type PendingClose = {
  leaderId: string;
  message: string;
  /** How long to keep the last play on the table before closing. */
  delayMs: number;
};

export type RoomState = {
  code: string;
  hostId: string;
  phase: Phase;
  players: Player[];
  currentTurnId: string | null;
  /** Absolute ms when the current turn times out (server clock). */
  turnDeadlineAt: number | null;
  lastPlay: Play | null;
  /** Every play in the current trick, oldest first (shown stacked on the table). */
  trickPlays: Play[];
  /**
   * Length of the current consecutive (+1 rank) chain this trick.
   * Used with trickPlayCount — lock only if the first 3 plays are consecutive.
   */
  patternStreak: number;
  /** How many plays have happened in the current trick. */
  trickPlayCount: number;
  /**
   * Sticky for the trick: set only when the first 3 plays are consecutive ascending.
   * If those three do not lock, this stays false for the rest of the trick.
   */
  patternLocked: boolean;
  log: string[];
  round: number;
  announcement: string | null;
  /** Trick is frozen while the last play is shown; then resolvePendingClose runs. */
  pendingClose: PendingClose | null;
};

export type PublicPlayer = {
  id: string;
  name: string;
  cardCount: number;
  role: Role | null;
  finishOrder: number | null;
  connected: boolean;
  isHost: boolean;
  passed: boolean;
  lobbyReady: boolean;
};

export type ClientView = {
  code: string;
  phase: Phase;
  players: PublicPlayer[];
  currentTurnId: string | null;
  /** Absolute ms when the current turn times out (same clock as Date.now() on client). */
  turnEndsAt: number | null;
  lastPlay: Play | null;
  /** Every play in the current trick, oldest first. */
  trickPlays: Play[];
  log: string[];
  round: number;
  hostId: string;
  announcement: string | null;
  /** True while last play is held on the table before the round closes. */
  closing: boolean;
  /**
   * Consecutive +1 chain length this trick (opening window is first 3 plays).
   */
  patternStreak: number;
  /** Plays so far in this trick. */
  trickPlayCount: number;
  /**
   * True once the first three plays of the trick locked a consecutive pattern.
   */
  patternLocked: boolean;
  you: {
    id: string;
    name: string;
    hand: Card[];
    isHost: boolean;
    role: Role | null;
    passed: boolean;
    lobbyReady: boolean;
  } | null;
  error?: string;
};
