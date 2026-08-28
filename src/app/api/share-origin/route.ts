import { networkInterfaces } from "os";
import { NextResponse } from "next/server";

function lanAddress(): string | null {
  const nets = networkInterfaces();
  for (const entries of Object.values(nets)) {
    if (!entries) continue;
    for (const net of entries) {
      if (net.family !== "IPv4" || net.internal) continue;
      // Prefer common private LAN ranges
      if (
        net.address.startsWith("192.168.") ||
        net.address.startsWith("10.") ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(net.address)
      ) {
        return net.address;
      }
    }
  }
  for (const entries of Object.values(nets)) {
    if (!entries) continue;
    for (const net of entries) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return null;
}

export async function GET() {
  const port = Number(process.env.PORT || 3000);
  const host = lanAddress() || "localhost";
  const origin = `http://${host}:${port}`;
  return NextResponse.json({ host, port, origin });
}
