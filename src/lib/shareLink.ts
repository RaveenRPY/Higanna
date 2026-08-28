/** Build an invite join link using the host machine LAN IP when possible. */
export async function getShareLink(roomCode: string): Promise<string> {
  // `join=1` opens the name-only invite page for guests (host lobby skips that).
  const path = `/room/${roomCode}?join=1`;
  try {
    const res = await fetch("/api/share-origin", { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as { origin?: string };
      if (data.origin) return `${data.origin}${path}`;
    }
  } catch {
    // fall through
  }

  const { protocol, hostname, port } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return `${protocol}//${hostname}${port ? `:${port}` : ""}${path}`;
  }
  return `${window.location.origin}${path}`;
}

/** Copy text even when Clipboard API is blocked (HTTP LAN, denied permission). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to legacy path
  }

  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.top = "0";
    el.style.left = "0";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.focus();
    el.select();
    el.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    if (ok) return true;
  } catch {
    // fall through
  }

  // Last resort: let the user copy manually.
  window.prompt("Copy this link:", text);
  return false;
}
