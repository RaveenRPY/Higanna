/** Shared animated backdrop for home, join, and game screens. */
export function AppBackground() {
  return (
    <div className="app-bg" aria-hidden>
      <div className="app-bg__base" />
      <div className="app-bg__mesh" />
      <div className="app-bg__sheen" />
      <div className="app-bg__orb app-bg__orb--amber" />
      <div className="app-bg__orb app-bg__orb--emerald" />
      <div className="app-bg__orb app-bg__orb--rose" />
      <div className="app-bg__vignette" />
    </div>
  );
}
