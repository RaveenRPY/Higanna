import type { Card } from "./types";

export function cardImageSrc(card: Card): string {
  // Declared joker face shows as the represented card on the table.
  if (card.joker && card.asRank && card.asSuit) {
    return `/cards/${card.asSuit}-${card.asRank}.svg`;
  }
  if (card.joker) {
    return card.id.includes("black")
      ? "/cards/joker-blue.svg"
      : "/cards/joker-color.svg";
  }
  return `/cards/${card.suit}-${card.rank}.svg`;
}
