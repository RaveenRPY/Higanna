"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AppBackground } from "@/components/AppBackground";
import { BrandMark } from "@/components/BrandMark";
import { getPlayerName, setPlayerName } from "@/lib/socket";

export function HomeScreen() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [howToOpen, setHowToOpen] = useState(false);
  const [howToVisible, setHowToVisible] = useState(false);

  useEffect(() => {
    setName(getPlayerName());
  }, []);

  useEffect(() => {
    if (howToOpen) {
      setHowToVisible(true);
      return;
    }
    if (!howToVisible) return;
    const t = window.setTimeout(() => setHowToVisible(false), 280);
    return () => window.clearTimeout(t);
  }, [howToOpen, howToVisible]);

  useEffect(() => {
    if (!howToOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setHowToOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [howToOpen]);

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
    <div className="page-enter app-shell text-amber-50">
      <AppBackground />

      <main className="relative z-10 mx-auto flex min-h-dvh w-full max-w-[420px] flex-col px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(5.5rem,env(safe-area-inset-bottom))]">
        <header className="shrink-0 pt-6 text-center sm:pt-10">
          <p className="text-[10px] font-medium uppercase tracking-[0.38em] text-amber-400/75">Card game</p>
          <h1 className="mt-3 flex justify-center">
            <BrandMark size="hero" priority className="drop-shadow-[0_4px_20px_rgba(212,175,55,0.25)]" />
          </h1>
        </header>

        <form
          onSubmit={onSubmit}
          className="flex flex-1 flex-col items-center justify-center"
        >
          <div className="w-full rounded-[24px] border border-amber-300/20 bg-black/40 p-5 shadow-[0_24px_70px_rgba(0,0,0,0.45)] backdrop-blur-xl">
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
      </main>

      <button
        type="button"
        onClick={() => {
          setHowToVisible(true);
          setHowToOpen(true);
        }}
        className="fixed z-40 flex size-14 items-center justify-center rounded-full border border-amber-200/30 bg-[#2a1418]/92 text-amber-200 shadow-[0_12px_32px_rgba(0,0,0,0.45)] backdrop-blur-md hover:border-amber-300/50 hover:bg-[#3a1c22] hover:text-amber-100"
        style={{
          right: "max(1rem, env(safe-area-inset-right))",
          bottom: "max(1rem, env(safe-area-inset-bottom))",
        }}
        aria-label="How to play"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className="h-7 w-7"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z"
          />
        </svg>
      </button>

      {howToVisible ? (
        <div
          className={[
            "how-to-overlay fixed inset-0 z-50 flex items-end justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center sm:px-4 sm:pb-0",
            howToOpen ? "how-to-overlay--open" : "how-to-overlay--close",
          ].join(" ")}
          onClick={() => setHowToOpen(false)}
          role="presentation"
        >
          <div
            className={[
              "how-to-panel flex max-h-[min(85dvh,640px)] w-full max-w-md flex-col rounded-3xl border border-amber-300/25 bg-[#1a0c10] shadow-[0_24px_70px_rgba(0,0,0,0.55)]",
              howToOpen ? "how-to-panel--open" : "how-to-panel--close",
            ].join(" ")}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="how-to-play-title"
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-amber-200/10 px-5 pb-3 pt-5 sm:px-6 sm:pt-6">
              <div>
                <BrandMark size="mark" className="opacity-90" />
                <h2 id="how-to-play-title" className="mt-2 font-serif text-2xl text-amber-100">
                  How to play
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setHowToOpen(false)}
                className="grid size-10 shrink-0 place-items-center rounded-full bg-white/6 text-amber-100/80 hover:bg-white/10"
                aria-label="Close"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm leading-relaxed text-amber-100/75 sm:px-6">
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
                  If you pass, you cannot play again in that trick. When everyone else has passed, the remaining
                  player can keep playing solo or tap End round to take the lead.
                </li>
                <li>First out is රජු, second is රැජින, last with cards is හිඟන්නා.</li>
                <li>Next game: හිඟන්නා chooses a card for රජු. රජු gives any card back. රැජින leads.</li>
                <li>
                  The host starts after every other player taps Ready. Minimum 3 players. The host can remove a
                  player from the lobby.
                </li>
              </ul>
            </div>

            <div className="shrink-0 border-t border-amber-200/10 px-5 py-4 sm:px-6">
              <button
                type="button"
                onClick={() => setHowToOpen(false)}
                className="min-h-12 w-full rounded-full bg-linear-to-b from-amber-300 to-amber-500 text-base font-semibold text-zinc-950"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
