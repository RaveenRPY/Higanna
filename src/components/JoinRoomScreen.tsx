"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getPlayerName, setPlayerName } from "@/lib/socket";

export function JoinRoomScreen({
  code,
  onJoin,
}: {
  code: string;
  onJoin: (name: string) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setName(getPlayerName());
  }, []);

  function submit(e?: FormEvent) {
    e?.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError("Enter a name with at least 2 characters.");
      return;
    }
    setPlayerName(trimmed);
    setError("");
    onJoin(trimmed);
  }

  return (
    <div className="page-enter relative min-h-dvh overflow-x-hidden bg-[#14080a] text-amber-50">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,#6b1d25_0%,transparent_55%),radial-gradient(ellipse_at_bottom,#1a3d2e_0%,transparent_50%)]" />
      <div className="pointer-events-none absolute -left-20 top-24 h-64 w-64 rounded-full bg-amber-600/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 bottom-10 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />

      <main className="relative mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-12">
        <form
          onSubmit={submit}
          className="rounded-[22px] border border-amber-300/20 bg-[linear-gradient(140deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:rounded-[28px] sm:p-8"
        >
          <button
            type="button"
            onClick={() => router.push("/")}
            className="inline-flex min-h-11 items-center text-xs uppercase tracking-wide text-amber-200/60 hover:text-amber-100"
          >
            ← Home
          </button>

          <h1 className="mt-5 font-serif text-[2.65rem] leading-none text-amber-200 sm:mt-6 sm:text-6xl">හිඟන්නා</h1>
          <p className="mt-3 text-sm text-amber-100/70">Join this room — enter your name to sit at the table.</p>

          <div className="mt-6 rounded-2xl border border-amber-400/25 bg-black/30 px-4 py-3 text-center">
            <p className="text-[10px] uppercase tracking-[0.35em] text-amber-400/80">Room</p>
            <p className="mt-1 font-mono text-2xl tracking-[0.28em] text-amber-100">{code}</p>
          </div>

          <label className="mt-6 block text-xs uppercase tracking-widest text-amber-400/80">Your name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            autoFocus
            autoComplete="nickname"
            enterKeyHint="go"
            className="mt-2 min-h-12 w-full rounded-2xl border border-amber-500/20 bg-[#1b0e10] px-4 py-3 text-amber-50 outline-none ring-amber-400/40 placeholder:text-amber-100/30 focus:ring-2"
          />

          {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}

          <button
            type="submit"
            className="mt-6 min-h-12 w-full rounded-2xl bg-linear-to-b from-amber-300 to-amber-500 py-3.5 text-base font-semibold tracking-wide text-zinc-950 shadow-[0_10px_30px_rgba(212,175,55,0.25)] transition hover:brightness-105 sm:text-sm"
          >
            Join room
          </button>
        </form>
      </main>
    </div>
  );
}
