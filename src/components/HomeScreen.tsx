"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getPlayerName, setPlayerName } from "@/lib/socket";

export function HomeScreen() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setName(getPlayerName());
  }, []);

  function saveName() {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError("Enter a name with at least 2 characters.");
      return false;
    }
    setPlayerName(trimmed);
    setError("");
    return true;
  }

  function createRoom() {
    if (!saveName()) return;
    router.push("/room/new");
  }

  function joinRoom() {
    if (!saveName()) return;
    if (code.trim().length < 4) {
      setError("Enter a room code.");
      return;
    }
    router.push(`/room/${code.trim().toUpperCase()}`);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (code.trim().length >= 4) joinRoom();
    else createRoom();
  }

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-[#14080a] text-amber-50">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,#6b1d25_0%,transparent_55%),radial-gradient(ellipse_at_bottom,#1a3d2e_0%,transparent_50%)]" />
      <div className="pointer-events-none absolute -left-24 top-16 h-56 w-56 rounded-full bg-amber-600/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 bottom-10 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl" />

      <main className="relative mx-auto flex min-h-dvh w-full max-w-[420px] flex-col px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
        <header className="shrink-0 pt-6 text-center sm:pt-10">
          <p className="text-[10px] font-medium uppercase tracking-[0.38em] text-amber-400/75">Card game</p>
          <h1 className="mt-3 font-serif text-[3.5rem] leading-[0.95] text-amber-200 drop-shadow-[0_4px_20px_rgba(212,175,55,0.25)] sm:text-7xl">
            හිඟන්නා
          </h1>
        </header>

        <form
          onSubmit={onSubmit}
          className="mt-8 flex flex-1 flex-col justify-center"
        >
          <div className="rounded-[24px] border border-amber-300/20 bg-black/40 p-5 shadow-[0_24px_70px_rgba(0,0,0,0.45)] backdrop-blur-xl">
            <label htmlFor="home-name" className="block text-[11px] font-medium uppercase tracking-[0.22em] text-amber-400/80">
              Your name
            </label>
            <input
              id="home-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              autoComplete="nickname"
              autoCapitalize="words"
              enterKeyHint="go"
              className="mt-2 min-h-12 w-full rounded-2xl border border-amber-500/20 bg-[#1b0e10] px-4 text-base text-amber-50 outline-none ring-amber-400/40 placeholder:text-amber-100/30 focus:ring-2"
            />

            <button
              type="button"
              onClick={createRoom}
              className="mt-5 min-h-12 w-full rounded-2xl bg-linear-to-b from-amber-300 to-amber-500 text-base font-semibold text-zinc-950 shadow-[0_10px_30px_rgba(212,175,55,0.25)]"
            >
              Create room
            </button>

            <div className="my-4 flex items-center gap-3 text-[11px] uppercase tracking-[0.18em] text-amber-100/35">
              <div className="h-px flex-1 bg-amber-100/15" />
              join
              <div className="h-px flex-1 bg-amber-100/15" />
            </div>

            <label htmlFor="home-code" className="sr-only">
              Room code
            </label>
            <input
              id="home-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ROOM CODE"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              className="min-h-12 w-full rounded-2xl border border-amber-500/20 bg-[#1b0e10] px-4 text-center font-mono text-base tracking-[0.28em] text-amber-50 outline-none ring-amber-400/40 placeholder:tracking-normal placeholder:text-amber-100/30 focus:ring-2"
            />
            <button
              type="button"
              onClick={joinRoom}
              className="mt-2 min-h-12 w-full rounded-2xl border border-amber-400/40 bg-amber-300/5 text-base font-semibold text-amber-100"
            >
              Join room
            </button>

            {error ? <p className="mt-3 text-center text-sm text-red-300">{error}</p> : null}
          </div>
        </form>

        <details className="mt-5 mb-2 rounded-2xl border border-amber-200/12 bg-black/25 open:bg-black/40">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-sm font-medium text-amber-200 [&::-webkit-details-marker]:hidden">
            How to play
            <span className="text-amber-200/50" aria-hidden>
              ▾
            </span>
          </summary>
          <div className="max-h-[min(52dvh,420px)] space-y-4 overflow-y-auto px-4 pb-4 text-sm leading-relaxed text-amber-100/75">
            <p>
              රජු · රැජින · හිඟන්නා — a shedding game. The last player holding cards becomes හිඟන්නා.
            </p>
            <div>
              <p className="font-semibold text-amber-200">Rank order</p>
              <p className="mt-1">3 4 5 6 7 8 9 10 J Q K A 2. 2 is the highest.</p>
            </div>
            <ul className="list-disc space-y-2 pl-5">
              <li>When you play a Joker, you must choose which card it represents.</li>
              <li>
                The leader may play a single, 2–4 cards of the same rank, or a same-suit consecutive run (2+ cards).
              </li>
              <li>
                After the lead, followers must play the same pattern at a higher rank. Sets can be 2, 3, or 4
                cards of one rank.
              </li>
              <li>
                Pattern lock: only the first three plays of a trick can lock it. If those three are consecutive
                ranks (example: 4 → 5 → 6, or 3,3 → 4,4 → 5,5), the pattern locks and later players must
                continue consecutive. If the third player jumps higher (example: 4 → 5 → 8), there is no lock —
                any higher same pattern stays legal.
              </li>
              <li>
                A 2 is only legal as the next consecutive rank after A (or as a lead). Playing that 2 closes the
                trick.
              </li>
              <li>
                If you pass, you cannot play again in that trick until someone closes it (with a 2 after A, or
                when everyone else passes).
              </li>
              <li>First out is රජු, second is රැජින, last with cards is හිඟන්නා.</li>
              <li>Next game: හිඟන්නා chooses a card for රජු. රජු gives any card back. රැජින leads.</li>
              <li>The host starts after every other player taps Ready. Minimum 3 players. The host can remove a player from the lobby.</li>
            </ul>
          </div>
        </details>
      </main>
    </div>
  );
}
