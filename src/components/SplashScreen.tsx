"use client";

import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { SPLASH_LOGO_SRC } from "@/lib/brand";

const SPLASH_MS = 2000;
const FADE_MS = 400;

export function gameStartedSessionKey(code: string) {
  return `higanna-game-started-${code.toUpperCase()}`;
}

export function markGameStarted(code: string) {
  sessionStorage.setItem(gameStartedSessionKey(code), "1");
}

export function clearGameStarted(code: string) {
  sessionStorage.removeItem(gameStartedSessionKey(code));
}

function roomCodeFromPath(pathname: string | null): string | null {
  if (!pathname?.startsWith("/room/")) return null;
  const code = pathname.slice("/room/".length).split("/")[0]?.trim();
  if (!code || code === "new") return null;
  return code.toUpperCase();
}

/** Skip splash only when refreshing mid-match — lobby refresh still shows splash. */
function shouldSkipSplash(pathname: string | null): boolean {
  if (typeof window === "undefined") return false;
  const code = roomCodeFromPath(pathname);
  if (!code) return false;
  return sessionStorage.getItem(gameStartedSessionKey(code)) === "1";
}

/**
 * Splash on first load and on refresh (home or room lobby).
 * App content mounts underneath immediately so the handoff after splash is seamless.
 */
export function AppBoot({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [phase, setPhase] = useState<"splash" | "leaving" | "done">("splash");
  const [progressOn, setProgressOn] = useState(false);

  useLayoutEffect(() => {
    if (shouldSkipSplash(pathname)) {
      setPhase("done");
    }
  }, [pathname]);

  useEffect(() => {
    if (shouldSkipSplash(pathname)) return;
    if (phase !== "splash") return;

    const start = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setProgressOn(true));
    });
    const leaveTimer = window.setTimeout(() => setPhase("leaving"), SPLASH_MS);
    const doneTimer = window.setTimeout(() => setPhase("done"), SPLASH_MS + FADE_MS);
    return () => {
      window.cancelAnimationFrame(start);
      window.clearTimeout(leaveTimer);
      window.clearTimeout(doneTimer);
    };
    // Initial boot only — client nav should not re-trigger a 2s splash.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div
        className={[
          "app-boot-stage min-h-full",
          phase !== "done" ? "app-boot-stage--splash" : "",
        ].join(" ")}
      >
        {children}
      </div>

      {phase !== "done" ? (
        <div
          className={["splash-boot", phase === "leaving" ? "splash-boot--fade" : ""].join(" ")}
          aria-hidden={phase !== "splash"}
        >
          <div className="splash-boot__bg" aria-hidden="true">
            <div className="app-bg__base" />
            <div className="app-bg__mesh" />
            <div className="app-bg__sheen" />
            <div className="app-bg__orb app-bg__orb--amber" />
            <div className="app-bg__orb app-bg__orb--emerald" />
            <div className="app-bg__orb app-bg__orb--rose" />
            <div className="app-bg__vignette" />
          </div>
          <div className="splash-boot__inner">
            <img
              src={SPLASH_LOGO_SRC}
              alt=""
              width={280}
              height={280}
              className="splash-boot__logo"
              decoding="async"
              fetchPriority="high"
              draggable={false}
            />
            <div className="splash-boot__progress-wrap">
              <div
                className="splash-boot__progress-track"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progressOn ? 100 : 0}
                aria-label="Loading"
              >
                <div
                  className="splash-boot__progress-bar"
                  style={{ width: progressOn ? "100%" : "0%" }}
                />
              </div>
              <p className="splash-boot__label">Loading</p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
