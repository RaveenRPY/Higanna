import {
  RANKS,
  SUITS,
  type Card,
  type ClientView,
  type JokerDeclaration,
  type Pattern,
  type Play,
  type Player,
  type Rank,
  type RoomState,
  type Suit,
} from "./types";

export const MAX_STRENGTH = RANKS.indexOf("2");
export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 12;
/** Seconds each player gets to act on their turn. */
export const TURN_DURATION_MS = 60_000;
/** Same-pattern consecutive plays needed before the pattern locks. */
export const PATTERN_LOCK_AFTER = 3;

export function rankValue(rank: Rank): number {
  return RANKS.indexOf(rank);
}

export function cardStrength(card: Card): number {
  const rank = effectiveRank(card);
  if (rank) return rankValue(rank);
  // Undeclared joker in hand (tribute / sorting only) — still strongest.
  // During play, jokers must be declared before strength is used.
  if (card.joker) return MAX_STRENGTH;
  return 0;
}

export function cardLabel(card: Card): string {
  if (card.joker) {
    if (card.asRank && card.asSuit) {
      const suit =
        card.asSuit === "hearts"
          ? "♥"
          : card.asSuit === "diamonds"
            ? "♦"
            : card.asSuit === "clubs"
              ? "♣"
              : "♠";
      return `Joker→${card.asRank}${suit}`;
    }
    return "Joker";
  }
  const suit =
    card.suit === "hearts"
      ? "♥"
      : card.suit === "diamonds"
        ? "♦"
        : card.suit === "clubs"
          ? "♣"
          : "♠";
  return `${card.rank}${suit}`;
}

function effectiveRank(card: Card): Rank | undefined {
  return card.joker ? card.asRank : card.rank;
}

function effectiveSuit(card: Card): Suit | undefined {
  return card.joker ? card.asSuit : card.suit;
}

function requireJokerFaces(cards: Card[]): string | null {
  for (const c of cards) {
    if (c.joker && (!c.asRank || !c.asSuit)) {
      return "Choose which card each joker represents.";
    }
  }
  return null;
}

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function deckCount(playerCount: number): number {
  if (playerCount <= 5) return 1;
  if (playerCount <= 10) return 2;
  return 3;
}

export function createDeck(decks = 1): Card[] {
  const cards: Card[] = [];
  for (let d = 0; d < decks; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push({ id: `${d}-${suit}-${rank}`, suit, rank });
      }
    }
    cards.push({ id: `${d}-joker-red`, joker: true });
    cards.push({ id: `${d}-joker-black`, joker: true });
  }
  return cards;
}

export function sortHand(hand: Card[]): Card[] {
  const suitOrder = { hearts: 0, diamonds: 1, clubs: 2, spades: 3 };
  return [...hand].sort((a, b) => {
    if (a.joker && b.joker) return a.id.localeCompare(b.id);
    if (a.joker) return 1;
    if (b.joker) return -1;
    const rv = rankValue(a.rank!) - rankValue(b.rank!);
    if (rv !== 0) return rv;
    return (suitOrder[a.suit!] ?? 0) - (suitOrder[b.suit!] ?? 0);
  });
}

export function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function createRoom(code: string, host: { id: string; name: string }): RoomState {
  return {
    code,
    hostId: host.id,
    phase: "lobby",
    players: [
      {
        id: host.id,
        name: host.name,
        hand: [],
        role: null,
        finishOrder: null,
        connected: true,
        isHost: true,
        passed: false,
        lobbyReady: true,
      },
    ],
    currentTurnId: null,
    turnDeadlineAt: null,
    lastPlay: null,
    trickPlays: [],
    patternStreak: 0,
    trickPlayCount: 0,
    patternLocked: false,
    log: [`${host.name} created the room`],
    round: 0,
    announcement: null,
    pendingClose: null,
  };
}

export function addPlayer(
  state: RoomState,
  player: { id: string; name: string },
): RoomState | { error: string } {
  const existing = state.players.find((p) => p.id === player.id);
  if (existing) {
    return {
      ...state,
      players: state.players.map((p) =>
        p.id === player.id ? { ...p, name: player.name, connected: true } : p,
      ),
    };
  }
  if (state.phase !== "lobby") {
    return { error: "The game has already started. You cannot join this room now." };
  }
  if (state.players.length >= MAX_PLAYERS) {
    return { error: "This room is full." };
  }
  if (state.players.some((p) => p.name === player.name)) {
    return { error: "That name is already taken." };
  }
  return {
    ...state,
    players: [
      ...state.players,
      {
        id: player.id,
        name: player.name,
        hand: [],
        role: null,
        finishOrder: null,
        connected: true,
        isHost: false,
        passed: false,
        lobbyReady: false,
      },
    ],
    log: [`${player.name} joined`, ...state.log].slice(0, 40),
  };
}

export function removePlayer(state: RoomState, playerId: string): RoomState | null {
  if (state.phase === "lobby") {
    const players = state.players.filter((p) => p.id !== playerId);
    if (players.length === 0) return null;
    let hostId = state.hostId;
    if (playerId === state.hostId) {
      hostId = players[0].id;
      players[0] = { ...players[0], isHost: true, lobbyReady: true };
    }
    return { ...state, hostId, players };
  }
  const disconnected: RoomState = {
    ...state,
    players: state.players.map((p) =>
      p.id === playerId ? { ...p, connected: false } : p,
    ),
  };
  if (disconnected.phase === "playing" && disconnected.currentTurnId === playerId) {
    // Never auto-pass — only skip this seat so others can still choose to pass/play.
    const nid = nextPlayableId(disconnected, playerId);
    return { ...disconnected, currentTurnId: nid };
  }
  return disconnected;
}

function player(state: RoomState, id: string): Player | undefined {
  return state.players.find((p) => p.id === id);
}

function activePlayers(state: RoomState): Player[] {
  return state.players.filter((p) => p.hand.length > 0);
}

function turnPlayers(state: RoomState): Player[] {
  return state.players.filter((p) => p.hand.length > 0 && p.connected);
}

/**
 * Walk the table seat order (join order = circle order) clockwise from `fromId`,
 * returning the next player who matches `predicate`. Never jumps to an arbitrary
 * filtered[0] — that skipped seats and caused wrong turn passes.
 */
function nextInSeatOrder(
  state: RoomState,
  fromId: string,
  predicate: (p: Player) => boolean,
): string | null {
  const seats = state.players;
  const n = seats.length;
  if (n === 0) return null;
  let start = seats.findIndex((p) => p.id === fromId);
  if (start < 0) start = 0;
  for (let step = 1; step <= n; step++) {
    const candidate = seats[(start + step) % n];
    if (predicate(candidate)) return candidate.id;
  }
  return null;
}

function nextActiveId(state: RoomState, fromId: string): string | null {
  return (
    nextInSeatOrder(
      state,
      fromId,
      (p) => p.hand.length > 0 && p.connected,
    ) ?? nextInSeatOrder(state, fromId, (p) => p.hand.length > 0)
  );
}

/** Next player who still has cards, is connected, and has not passed this trick. */
function nextPlayableId(state: RoomState, fromId: string): string | null {
  return nextInSeatOrder(
    state,
    fromId,
    (p) => p.hand.length > 0 && p.connected && !p.passed,
  );
}

function interpretSet(cards: Card[]): { pattern: Pattern; strength: number } | null {
  if (cards.length < 2 || cards.length > 4) return null;
  const ranks = cards.map(effectiveRank);
  if (ranks.some((r) => !r)) return null;
  const rank = ranks[0]!;
  if (ranks.some((r) => r !== rank)) return null;
  return { pattern: { kind: "set", count: cards.length }, strength: rankValue(rank) };
}

function interpretRun(cards: Card[]): { pattern: Pattern; strength: number } | null {
  // Allow 2-card runs (two consecutive ranks of the same suit).
  if (cards.length < 2) return null;
  const ranks = cards.map(effectiveRank);
  const suits = cards.map(effectiveSuit);
  if (ranks.some((r) => !r) || suits.some((s) => !s)) return null;
  if (new Set(ranks).size !== ranks.length) return null;
  const suit = suits[0]!;
  if (suits.some((s) => s !== suit)) return null;
  const values = ranks.map((r) => rankValue(r!));
  const sorted = [...values].sort((a, b) => a - b);
  const len = cards.length;
  let bestEnd = -1;
  for (let start = 0; start <= RANKS.length - len; start++) {
    const end = start + len - 1;
    if (sorted.every((v) => v >= start && v <= end)) {
      bestEnd = end;
    }
  }
  if (bestEnd < 0) return null;
  return { pattern: { kind: "run", length: len }, strength: bestEnd };
}

function interpretLead(cards: Card[]): { pattern: Pattern; strength: number } | { error: string } {
  if (cards.length === 1) {
    return { pattern: { kind: "single" }, strength: cardStrength(cards[0]) };
  }
  const set = interpretSet(cards);
  const run = interpretRun(cards);
  if (set && run) {
    const ranks = cards.map(effectiveRank);
    const sameRank = ranks.every((r) => r && r === ranks[0]);
    if (sameRank) return set;
    return run;
  }
  if (set) return set;
  if (run) return run;
  return {
    error:
      "To lead, play a single, 2–4 cards of the same rank, or a same-suit consecutive run (2+ cards).",
  };
}

export function interpretPlay(
  cards: Card[],
  required: Play | null,
  opts: { patternLocked?: boolean } = {},
): { pattern: Pattern; strength: number } | { error: string } {
  if (cards.length === 0) return { error: "Select cards to play." };
  const missing = requireJokerFaces(cards);
  if (missing) return { error: missing };
  if (!required) return interpretLead(cards);

  const patternLocked = Boolean(opts.patternLocked);

  const beatSamePattern = (
    result: { pattern: Pattern; strength: number },
  ): { pattern: Pattern; strength: number } | { error: string } => {
    if (result.strength <= required.strength) {
      return { error: "Play a higher rank of the same pattern, or pass." };
    }
    if (patternLocked) {
      // Locked after 3 consecutive ascending plays — only the next rank is legal.
      if (result.strength === required.strength + 1) return result;
      return {
        error: "Pattern is locked — play the next consecutive rank, or pass.",
      };
    }
    // Not locked yet: any higher same-pattern play is OK (pairs / triples / quads / etc.).
    return result;
  };

  if (required.pattern.kind === "single") {
    if (cards.length !== 1) return { error: "This round needs exactly one card." };
    return beatSamePattern({
      pattern: { kind: "single" },
      strength: cardStrength(cards[0]),
    });
  }

  if (required.pattern.kind === "set") {
    if (cards.length !== required.pattern.count) {
      return { error: `Play ${required.pattern.count} cards of the same rank.` };
    }
    const set = interpretSet(cards);
    if (!set) return { error: "Those cards must be the same rank. Declare jokers to match." };
    return beatSamePattern(set);
  }

  if (cards.length !== required.pattern.length) {
    return { error: `Play a run of ${required.pattern.length} cards.` };
  }
  const run = interpretRun(cards);
  if (!run) {
    return {
      error: "Play consecutive ranks of one suit. Declare each joker to fill a gap.",
    };
  }
  return beatSamePattern(run);
}

function nextPatternStreak(
  prev: RoomState,
  play: { strength: number },
): number {
  if (!prev.lastPlay) return 1;
  const streak = prev.patternStreak ?? 0;
  if (play.strength === prev.lastPlay.strength + 1) {
    return streak + 1;
  }
  // Jump to a higher rank while unlocked — streak restarts at this play.
  return 1;
}

function patternLabel(pattern: Pattern): string {
  if (pattern.kind === "single") return "singles";
  if (pattern.kind === "set") {
    if (pattern.count === 2) return "pairs";
    if (pattern.count === 3) return "triples";
    if (pattern.count === 4) return "quads";
    return `${pattern.count}-of-a-kind`;
  }
  return `runs of ${pattern.length}`;
}

function highestCard(hand: Card[]): Card {
  return [...hand].sort((a, b) => {
    if (a.joker && !b.joker) return -1;
    if (!a.joker && b.joker) return 1;
    return cardStrength(b) - cardStrength(a);
  })[0];
}

function deal(state: RoomState): RoomState {
  const decks = createDeck(deckCount(state.players.length));
  const shuffled = shuffle(decks);
  const n = state.players.length;
  const per = Math.floor(shuffled.length / n);
  const dealt = shuffled.slice(0, per * n);
  const players = state.players.map((p, i) => ({
    ...p,
    hand: dealt.slice(i * per, (i + 1) * per),
    finishOrder: null,
    passed: false,
  }));
  return { ...state, players, lastPlay: null, trickPlays: [], patternStreak: 0, trickPlayCount: 0, patternLocked: false };
}

function beginTribute(state: RoomState): RoomState {
  const beggar = state.players.find((p) => p.role === "beggar");
  const king = state.players.find((p) => p.role === "king");
  if (!beggar || !king || beggar.hand.length === 0 || king.id === beggar.id) {
    return {
      ...state,
      phase: "playing",
      currentTurnId: queenOrFallback(state),
    };
  }
  return {
    ...state,
    phase: "tribute",
    currentTurnId: beggar.id,
    log: [
      `හිඟන්නා (${beggar.name}) must choose a card for රජු (${king.name}).`,
      ...state.log,
    ].slice(0, 40),
    announcement: `හිඟන්නා — choose a card for රජු.`,
  };
}

function queenOrFallback(state: RoomState): string {
  const queen = state.players.find((p) => p.role === "queen" && p.hand.length > 0);
  if (queen) return queen.id;
  const host = state.players.find((p) => p.id === state.hostId);
  return host?.id ?? state.players[0].id;
}

export function setPlayerLobbyReady(
  state: RoomState,
  playerId: string,
  ready: boolean,
): RoomState | { error: string } {
  if (state.phase !== "lobby") return { error: "Ready is only used in the lobby." };
  if (playerId === state.hostId) return { error: "The host is always ready." };
  const actor = player(state, playerId);
  if (!actor) return { error: "Player not found." };
  return {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? { ...p, lobbyReady: ready } : p)),
  };
}

export function kickPlayer(
  state: RoomState,
  hostId: string,
  targetId: string,
): RoomState | { error: string } {
  if (state.phase !== "lobby") return { error: "You can only remove players before the game starts." };
  if (hostId !== state.hostId) return { error: "Only the host can remove a player." };
  if (targetId === hostId) return { error: "You cannot remove yourself." };
  const target = player(state, targetId);
  if (!target) return { error: "Player not found." };
  const next = removePlayer(state, targetId);
  if (!next) return { error: "Could not remove that player." };
  return {
    ...next,
    log: [`${target.name} was removed by the host.`, ...next.log].slice(0, 40),
  };
}

export function startMatch(state: RoomState, requesterId: string): RoomState | { error: string } {
  if (requesterId !== state.hostId) return { error: "Only the host can start the game." };
  if (state.phase !== "lobby" && state.phase !== "finished") {
    return { error: "The game cannot be started right now." };
  }
  if (state.players.filter((p) => p.connected).length < MIN_PLAYERS) {
    return { error: `At least ${MIN_PLAYERS} players are required.` };
  }
  if (state.phase === "lobby") {
    const waiting = state.players.filter((p) => p.connected && p.id !== state.hostId && !p.lobbyReady);
    if (waiting.length > 0) {
      return { error: "Everyone must be ready before you can start." };
    }
  }
  const seated = {
    ...state,
    players: state.players.filter((p) => p.connected),
    round: state.round + 1,
    announcement: null,
    pendingClose: null,
    lastPlay: null,
    trickPlays: [],
  };
  if (seated.hostId !== seated.players[0].id && !seated.players.some((p) => p.id === seated.hostId)) {
    seated.hostId = seated.players[0].id;
    seated.players[0] = { ...seated.players[0], isHost: true };
  }
  const dealt = deal(seated);
  const hadRoles = dealt.players.some((p) => p.role);
  if (hadRoles) {
    const tributed = beginTribute(dealt);
    return tributed;
  }
  return {
    ...dealt,
    phase: "playing",
    currentTurnId: dealt.hostId,
    log: [`Round ${dealt.round} started. ${player(dealt, dealt.hostId)?.name} leads.`, ...dealt.log].slice(
      0,
      40,
    ),
  };
}

export function stopMatch(state: RoomState, requesterId: string): RoomState | { error: string } {
  if (requesterId !== state.hostId) return { error: "Only the host can stop the game." };
  if (state.phase === "lobby") return { error: "The game has not started." };

  const host = player(state, state.hostId);
  return {
    ...state,
    phase: "lobby",
    currentTurnId: null,
    turnDeadlineAt: null,
    lastPlay: null,
    trickPlays: [],
    patternStreak: 0,
    trickPlayCount: 0,
    patternLocked: false,
    pendingClose: null,
    announcement: `${host?.name ?? "Host"} stopped the game.`,
    players: state.players.map((p) => ({
      ...p,
      hand: [],
      role: null,
      finishOrder: null,
      passed: false,
      isHost: p.id === state.hostId,
      lobbyReady: p.id === state.hostId,
    })),
    log: [`${host?.name ?? "Host"} stopped the game. Back to lobby.`, ...state.log].slice(0, 40),
  };
}

function finishIfNeeded(state: RoomState, actorId: string): RoomState {
  const actor = player(state, actorId);
  if (!actor || actor.hand.length > 0) return state;

  const already = state.players.filter((p) => p.finishOrder !== null).length;
  const finishOrder = already + 1;
  let role = actor.role;
  if (finishOrder === 1) role = "king";
  if (finishOrder === 2) role = "queen";

  let next: RoomState = {
    ...state,
    players: state.players.map((p) =>
      p.id === actorId ? { ...p, finishOrder, role, passed: false } : p,
    ),
    log: [
      finishOrder === 1
        ? `${actor.name} went out first — රජු!`
        : finishOrder === 2
          ? `${actor.name} went out second — රැජින!`
          : `${actor.name} went out.`,
      ...state.log,
    ].slice(0, 40),
  };

  const remaining = activePlayers(next);
  if (remaining.length <= 1) {
    if (remaining[0]) {
      next = {
        ...next,
        players: next.players.map((p) =>
          p.id === remaining[0].id ? { ...p, role: "beggar", finishOrder: next.players.length } : p,
        ),
        log: [`${remaining[0].name} was last with cards — හිඟන්නා.`, ...next.log].slice(0, 40),
      };
    }
    return {
      ...next,
      phase: "finished",
      currentTurnId: null,
      lastPlay: null,
      trickPlays: [],
      patternStreak: 0,
      trickPlayCount: 0,
      patternLocked: false,
    };
  }
  return next;
}

function beginTrick(state: RoomState, leaderId: string): RoomState {
  let leader = leaderId;
  if (!player(state, leader) || (player(state, leader)?.hand.length ?? 0) === 0) {
    leader = nextActiveId(state, leaderId) ?? leaderId;
  }
  return {
    ...state,
    lastPlay: null,
    trickPlays: [],
    patternStreak: 0,
    trickPlayCount: 0,
    patternLocked: false,
    currentTurnId: leader,
    pendingClose: null,
    players: state.players.map((p) => ({ ...p, passed: false })),
    announcement: null,
    log: [`New round — ${player(state, leader)?.name} leads.`, ...state.log].slice(0, 40),
  };
}

/** Keep lastPlay on the table; freeze turns until resolvePendingClose. */
function armTrickClose(
  state: RoomState,
  leaderId: string,
  message: string,
  delayMs: number,
): RoomState {
  return {
    ...state,
    currentTurnId: null,
    announcement: null,
    pendingClose: { leaderId, message, delayMs },
  };
}

/** Apply a scheduled trick close after the table hold delay. */
export function resolvePendingClose(state: RoomState): RoomState {
  if (!state.pendingClose) return state;
  const { leaderId, message } = state.pendingClose;
  const begun = beginTrick(state, leaderId);
  return {
    ...begun,
    announcement: message,
    log: [message, ...begun.log].slice(0, 40),
  };
}

function isClosingPlay(play: Play): boolean {
  // Trick closes only when the play reaches top rank (2).
  // A joker never closes by itself — only if the player declared it as a 2
  // (or it is part of a run whose high card is 2).
  if (play.cards.some((c) => c.joker && !c.asRank)) return false;

  if (play.pattern.kind === "single") {
    const c = play.cards[0];
    return (c.joker ? c.asRank : c.rank) === "2";
  }

  if (play.pattern.kind === "set") {
    const c = play.cards[0];
    return (c.joker ? c.asRank : c.rank) === "2";
  }

  // Runs close when the consecutive window ends on 2.
  return play.strength >= MAX_STRENGTH;
}

export function playCards(
  state: RoomState,
  playerId: string,
  cardIds: string[],
  jokerAs: Record<string, JokerDeclaration> = {},
): RoomState | { error: string } {
  if (state.phase !== "playing") return { error: "It is not time to play." };
  if (state.pendingClose) return { error: "This round is closing. Wait a moment." };
  if (state.currentTurnId !== playerId) return { error: "It is not your turn." };
  const actor = player(state, playerId);
  if (!actor) return { error: "Player not found." };
  if (actor.passed) {
    return { error: "You already passed. Wait until this round is closed." };
  }

  const cards: Card[] = [];
  for (const id of cardIds) {
    const card = actor.hand.find((c) => c.id === id);
    if (!card) return { error: "That card is not in your hand." };
    if (cards.some((c) => c.id === id)) return { error: "You selected the same card twice." };
    if (card.joker) {
      const declared = jokerAs[id];
      if (!declared?.rank || !declared?.suit) {
        return { error: "Choose which card each joker represents." };
      }
      if (!(RANKS as readonly string[]).includes(declared.rank)) {
        return { error: "Invalid joker rank." };
      }
      if (!(SUITS as readonly string[]).includes(declared.suit)) {
        return { error: "Invalid joker suit." };
      }
      cards.push({ ...card, asRank: declared.rank, asSuit: declared.suit });
    } else {
      cards.push(card);
    }
  }

  // Sticky lock from earlier in this trick (only the first 3 plays can establish it).
  const patternLocked = Boolean(state.patternLocked);
  const interpreted = interpretPlay(cards, state.lastPlay, { patternLocked });
  if ("error" in interpreted) return interpreted;

  const play: Play = {
    playerId,
    playerName: actor.name,
    cards,
    pattern: interpreted.pattern,
    strength: interpreted.strength,
  };

  const trickPlayCount = (state.trickPlayCount ?? 0) + 1;
  const patternStreak = nextPatternStreak(state, play);
  // Lock only when the opening three plays of the trick are consecutive (e.g. 4→5→6).
  const justLocked =
    !patternLocked &&
    trickPlayCount === PATTERN_LOCK_AFTER &&
    patternStreak === PATTERN_LOCK_AFTER;

  let next: RoomState = {
    ...state,
    // Keep other players' passed flags for this trick — only the player who acts is cleared.
    players: state.players.map((p) =>
      p.id === playerId
        ? {
            ...p,
            hand: p.hand.filter((c) => !cardIds.includes(c.id)),
            passed: false,
          }
        : p,
    ),
    lastPlay: play,
    trickPlays: [...(state.trickPlays ?? []), play],
    patternStreak,
    trickPlayCount,
    patternLocked: patternLocked || justLocked,
    announcement: justLocked
      ? `Pattern locked — ${patternLabel(play.pattern)}. Continue consecutive ranks.`
      : null,
    log: [
      justLocked
        ? `${actor.name} played ${cards.map(cardLabel).join(" ")} — pattern locked (${patternLabel(play.pattern)})!`
        : `${actor.name} played ${cards.map(cardLabel).join(" ")}`,
      ...state.log,
    ].slice(0, 40),
  };

  next = finishIfNeeded(next, playerId);
  if (next.phase === "finished") return next;

  if (isClosingPlay(play)) {
    const closerStillIn = (player(next, playerId)?.hand.length ?? 0) > 0;
    const leader = closerStillIn ? playerId : nextActiveId(next, playerId)!;
    const leaderName = player(next, leader)?.name ?? actor.name;
    // Hold the 2 on the table briefly before clearing the trick.
    return armTrickClose(
      next,
      leader,
      `${actor.name} closed the round! ${leaderName} leads.`,
      2000,
    );
  }

  // If every other active player has already passed, this player wins the trick and leads.
  const othersCanStillPlay = turnPlayers(next).some((p) => p.id !== playerId && !p.passed);
  if (!othersCanStillPlay) {
    const stillIn = (player(next, playerId)?.hand.length ?? 0) > 0;
    const leader = stillIn ? playerId : nextActiveId(next, playerId)!;
    const leaderName = player(next, leader)?.name ?? actor.name;
    return armTrickClose(next, leader, `${leaderName} takes the round! ${leaderName} leads.`, 1000);
  }

  const nxt = nextPlayableId(next, playerId);
  return { ...next, currentTurnId: nxt ?? playerId };
}

export function passTurn(state: RoomState, playerId: string): RoomState | { error: string } {
  if (state.phase !== "playing") return { error: "It is not time to pass." };
  if (state.pendingClose) return { error: "This round is closing. Wait a moment." };
  if (state.currentTurnId !== playerId) return { error: "It is not your turn." };
  if (!state.lastPlay) return { error: "The leader cannot pass. Play a card." };

  const actor = player(state, playerId);
  if (!actor) return { error: "Player not found." };
  if (actor.passed) {
    return { error: "You already passed this round." };
  }

  const marked: RoomState = {
    ...state,
    announcement: null,
    players: state.players.map((p) => (p.id === playerId ? { ...p, passed: true } : p)),
    log: [`${actor.name} passed`, ...state.log].slice(0, 40),
  };

  const closeForLeader = (leaderId: string) => {
    const leaderHasCards = (player(marked, leaderId)?.hand.length ?? 0) > 0;
    const leader = leaderHasCards ? leaderId : nextActiveId(marked, leaderId)!;
    const leaderName = player(marked, leader)?.name ?? "Leader";
    return armTrickClose(marked, leader, `${leaderName} takes the round! ${leaderName} leads.`, 1000);
  };

  // Only count connected players — never treat disconnect as an auto-pass.
  const others = turnPlayers(marked).filter((p) => p.id !== marked.lastPlay!.playerId);
  if (others.length === 0 || others.every((p) => p.passed)) {
    return closeForLeader(marked.lastPlay!.playerId);
  }

  const nxt = nextPlayableId(marked, playerId);
  if (!nxt || nxt === playerId) {
    return closeForLeader(marked.lastPlay!.playerId);
  }
  return { ...marked, currentTurnId: nxt };
}

export function beggarGiveCard(
  state: RoomState,
  playerId: string,
  cardId: string,
): RoomState | { error: string } {
  if (state.phase !== "tribute") return { error: "It is not time for tribute." };
  const beggar = state.players.find((p) => p.role === "beggar");
  const king = state.players.find((p) => p.role === "king");
  if (!beggar || beggar.id !== playerId) return { error: "Only හිඟන්නා can give a card now." };
  if (!king) return { error: "රජු was not found." };
  if (state.currentTurnId !== beggar.id) return { error: "Wait for your turn to give a card." };
  const card = beggar.hand.find((c) => c.id === cardId);
  if (!card) return { error: "That card is not in your hand." };

  const players = state.players.map((p) => {
    if (p.id === beggar.id) return { ...p, hand: sortHand(p.hand.filter((c) => c.id !== cardId)) };
    if (p.id === king.id) return { ...p, hand: sortHand([...p.hand, card]) };
    return p;
  });
  return {
    ...state,
    players,
    currentTurnId: king.id,
    announcement: `රජු — give a card back to හිඟන්නා.`,
    log: [
      `හිඟන්නා (${beggar.name}) gave ${cardLabel(card)} to රජු. රජු must give any card back.`,
      ...state.log,
    ].slice(0, 40),
  };
}

export function kingGiveCard(
  state: RoomState,
  playerId: string,
  cardId: string,
): RoomState | { error: string } {
  if (state.phase !== "tribute") return { error: "It is not time for tribute." };
  const king = state.players.find((p) => p.role === "king");
  const beggar = state.players.find((p) => p.role === "beggar");
  if (!king || king.id !== playerId) return { error: "Only රජු can give a card." };
  if (!beggar) return { error: "හිඟන්නා was not found." };
  if (state.currentTurnId !== king.id) return { error: "Wait — හිඟන්නා is still choosing a card." };
  const card = king.hand.find((c) => c.id === cardId);
  if (!card) return { error: "That card is not in your hand." };

  const queenId = queenOrFallback(state);
  const players = state.players.map((p) => {
    if (p.id === king.id) return { ...p, hand: sortHand(p.hand.filter((c) => c.id !== cardId)), role: null };
    if (p.id === beggar.id) return { ...p, hand: sortHand([...p.hand, card]), role: null };
    return { ...p, role: null };
  });
  return {
    ...state,
    players,
    phase: "playing",
    currentTurnId: queenId,
    lastPlay: null,
    trickPlays: [],
    announcement: null,
    log: [
      `රජු (${king.name}) gave ${cardLabel(card)} to හිඟන්නා. රැජින leads the round.`,
      ...state.log,
    ].slice(0, 40),
  };
}

export function tributeCard(
  state: RoomState,
  playerId: string,
  cardId: string,
): RoomState | { error: string } {
  if (state.phase !== "tribute") return { error: "It is not time for tribute." };
  if (state.currentTurnId !== playerId) return { error: "It is not your turn to give a card." };
  const actor = player(state, playerId);
  if (!actor) return { error: "Player not found." };
  if (actor.role === "beggar") return beggarGiveCard(state, playerId, cardId);
  if (actor.role === "king") return kingGiveCard(state, playerId, cardId);
  return { error: "You are not giving a card." };
}

export function toClientView(state: RoomState, viewerId?: string): ClientView {
  const you = viewerId ? state.players.find((p) => p.id === viewerId) : undefined;
  return {
    code: state.code,
    phase: state.phase,
    hostId: state.hostId,
    round: state.round,
    currentTurnId: state.currentTurnId,
    turnEndsAt: state.turnDeadlineAt,
    lastPlay: state.lastPlay,
    trickPlays:
      state.trickPlays && state.trickPlays.length > 0
        ? state.trickPlays
        : state.lastPlay
          ? [state.lastPlay]
          : [],
    patternStreak: state.patternStreak ?? 0,
    trickPlayCount: state.trickPlayCount ?? 0,
    patternLocked: Boolean(state.patternLocked),
    log: state.log,
    announcement: state.announcement,
    closing: Boolean(state.pendingClose),
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      cardCount: p.hand.length,
      role: p.role,
      finishOrder: p.finishOrder,
      connected: p.connected,
      isHost: p.id === state.hostId,
      passed: p.passed,
      lobbyReady: Boolean(p.isHost || p.lobbyReady || p.id === state.hostId),
    })),
    you: you
      ? {
          id: you.id,
          name: you.name,
          hand: you.hand,
          isHost: you.id === state.hostId,
          role: you.role,
          passed: you.passed,
          lobbyReady: Boolean(you.id === state.hostId || you.lobbyReady),
        }
      : null,
  };
}

/** Keep / reset the per-turn countdown when the active player changes. */
export function syncTurnDeadline(prev: RoomState | null, next: RoomState, now = Date.now()): RoomState {
  const active =
    (next.phase === "playing" || next.phase === "tribute") &&
    Boolean(next.currentTurnId) &&
    !next.pendingClose;

  if (!active) {
    return next.turnDeadlineAt == null ? next : { ...next, turnDeadlineAt: null };
  }

  const turnChanged =
    !prev ||
    prev.currentTurnId !== next.currentTurnId ||
    prev.phase !== next.phase ||
    Boolean(prev.pendingClose) !== Boolean(next.pendingClose);

  if (turnChanged || next.turnDeadlineAt == null) {
    return { ...next, turnDeadlineAt: now + TURN_DURATION_MS };
  }
  return next;
}

/** Auto pass / auto lead / auto tribute when the turn clock expires. */
export function autoActOnTimeout(state: RoomState, playerId: string): RoomState | { error: string } {
  if (state.pendingClose) return { error: "This round is closing." };
  if (state.currentTurnId !== playerId) return { error: "It is not your turn." };

  if (state.phase === "tribute") {
    const actor = player(state, playerId);
    if (!actor || actor.hand.length === 0) return { error: "No cards to give." };
    const card =
      actor.role === "beggar"
        ? highestCard(actor.hand)
        : [...actor.hand].sort((a, b) => cardStrength(a) - cardStrength(b))[0];
    const result = tributeCard(state, playerId, card.id);
    if ("error" in result) return result;
    return {
      ...result,
      log: [`${actor.name} timed out — auto gave a card.`, ...result.log].slice(0, 40),
    };
  }

  if (state.phase !== "playing") return { error: "It is not time to play." };

  if (state.lastPlay) {
    const result = passTurn(state, playerId);
    if ("error" in result) return result;
    const name = player(state, playerId)?.name ?? "Player";
    return {
      ...result,
      log: [`${name} timed out — auto passed.`, ...result.log].slice(0, 40),
    };
  }

  const actor = player(state, playerId);
  if (!actor || actor.hand.length === 0) return { error: "No cards to play." };
  const card = [...actor.hand].sort((a, b) => cardStrength(a) - cardStrength(b))[0];
  const jokerAs: Record<string, JokerDeclaration> = {};
  if (card.joker) {
    jokerAs[card.id] = { rank: "3", suit: "clubs" };
  }
  const result = playCards(state, playerId, [card.id], jokerAs);
  if ("error" in result) return result;
  return {
    ...result,
    log: [`${actor.name} timed out — auto played.`, ...result.log].slice(0, 40),
  };
}
