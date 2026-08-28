"use client";

import { useEffect, useState } from "react";
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

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#14080a] text-amber-50">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,#6b1d25_0%,transparent_55%),radial-gradient(ellipse_at_bottom,#1a3d2e_0%,transparent_50%)]" />
      <div className="pointer-events-none absolute -left-24 top-20 h-72 w-72 rounded-full bg-amber-600/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 bottom-8 h-80 w-80 rounded-full bg-emerald-500/10 blur-3xl" />
      <main className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-6 py-10 lg:px-10">
        <div className="rounded-[28px] border border-amber-300/20 bg-[linear-gradient(140deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-8 lg:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.05fr_1fr] lg:items-start">
            <section>
              <p className="mb-4 text-xs uppercase tracking-[0.32em] text-amber-400/80">
                Multiplayer card game
              </p>
              <h1 className="font-serif text-6xl leading-none text-amber-200 drop-shadow-[0_4px_20px_rgba(212,175,55,0.25)] sm:text-7xl">
                හිගන්නා
              </h1>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-amber-100/70">
                රජු · රැජින · හිගන්නා - a fast-paced shedding game where the last player holding cards becomes
                හිගන්නා.
              </p>
              <div className="mt-6 rounded-2xl border border-amber-400/20 bg-black/25 p-4 text-xs leading-relaxed text-amber-100/75">
                <p className="font-semibold text-amber-200">Rank order</p>
                <p className="mt-1">3 4 5 6 7 8 9 10 J Q K A 2 (2 is highest).</p>
              </div>
            </section>

            <section className="rounded-3xl border border-amber-500/20 bg-black/35 p-6 shadow-2xl">
          <label className="block text-xs uppercase tracking-widest text-amber-400/80">Your name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className="mt-2 w-full rounded-2xl border border-amber-500/20 bg-[#1b0e10] px-4 py-3 text-amber-50 outline-none ring-amber-400/40 placeholder:text-amber-100/30 focus:ring-2"
          />

          <button
            type="button"
            onClick={() => {
              if (!saveName()) return;
              router.push("/room/new");
            }}
            className="mt-6 w-full rounded-2xl bg-linear-to-b from-amber-300 to-amber-500 py-3.5 text-sm font-semibold tracking-wide text-zinc-950 shadow-[0_10px_30px_rgba(212,175,55,0.25)] transition hover:brightness-105"
          >
            Create room · Host
          </button>

          <div className="my-6 flex items-center gap-3 text-xs text-amber-100/40">
            <div className="h-px flex-1 bg-amber-100/15" />
            or join
            <div className="h-px flex-1 bg-amber-100/15" />
          </div>

          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ROOM CODE"
              className="w-full rounded-2xl border border-amber-500/20 bg-[#1b0e10] px-4 py-3 tracking-[0.3em] text-amber-50 outline-none ring-amber-400/40 placeholder:tracking-normal placeholder:text-amber-100/30 focus:ring-2"
            />
            <button
              type="button"
              onClick={() => {
                if (!saveName()) return;
                if (code.trim().length < 4) {
                  setError("Enter a room code.");
                  return;
                }
                router.push(`/room/${code.trim().toUpperCase()}`);
              }}
              className="rounded-2xl border border-amber-400/40 px-5 text-sm font-semibold text-amber-200 hover:bg-amber-400/10"
            >
              Join
            </button>
          </div>
          {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
            </section>
          </div>
        </div>

        <details className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-amber-100/70">
          <summary className="cursor-pointer text-amber-200">How to play</summary>
          <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed">
            <li>Rank order: 3 4 5 6 7 8 9 10 J Q K A 2. 2 is the highest. When you play a Joker, you must choose which card it represents.</li>
            <li>
              The leader may play a single, 2–4 cards of the same rank, or a same-suit consecutive run (2+ cards).
            </li>
            <li>
              After the lead, followers must play the same pattern at a higher rank. Sets can be 2, 3,
              or 4 cards of one rank.
            </li>
            <li>
              Pattern lock: only the first three plays of a trick can lock it. If those three are
              consecutive ranks (example: 4 → 5 → 6, or 3,3 → 4,4 → 5,5), the pattern locks and later
              players must continue consecutive. If the third player jumps higher (example: 4 → 5 → 8),
              there is no lock for that trick — any higher same pattern stays legal.
            </li>
            <li>
              A 2 is only legal as the next consecutive rank after A (or as a lead). Playing that 2
              closes the trick.
            </li>
            <li>
              If you pass, you cannot play again in that trick until someone closes it (with a 2 after
              A, or when everyone else passes).
            </li>
            <li>First out is රජු, second is රැජින, last with cards is හිගන්නා.</li>
            <li>Next game: හිගන්නා gives their best card to රජු. රජු gives any card back. රැජින leads.</li>
            <li>The host starts the game. Minimum 3 players.</li>
          </ul>
        </details>
      </main>
    </div>
  );
}
