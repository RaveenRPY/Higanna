# හිගන්නා

Realtime multiplayer card game built with Next.js and Socket.IO.

## Run locally

```bash
cd higanna
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Same Wi‑Fi on a phone: use your computer IP, e.g. `http://192.168.1.10:3000`.

Host creates a room, others join with the room code. Minimum 3 players. Host starts the game.

## Rules

- Rank order: **3 4 5 6 7 8 9 10 J Q K A 2**. **2 is highest**.
- **Joker** can replace any card. Played as a single, it counts as 2 and closes the round.
- Lead with: one card, 2–4 of a kind, or a same-suit consecutive run (e.g. Heart 3-4-5-6 or Heart J-Q-K).
- Follow the same pattern with a strictly higher value, any suit. Otherwise **Pass**.
- A 2 (or Joker as 2) closes the round; that player leads the next round.
- First out: **King (රජු)**. Second: **Queen (රැජින)**. Last with cards: **Beggar (හිගන්නා)**.
- Next deal: beggar gives their best card (Joker or highest) to the king. King gives any card back. Queen leads.
