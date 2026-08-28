import { networkInterfaces } from "os";
import type { NextConfig } from "next";

function lanHosts(): string[] {
  const hosts: string[] = [];
  const nets = networkInterfaces();
  for (const entries of Object.values(nets)) {
    if (!entries) continue;
    for (const net of entries) {
      if (net.family === "IPv4" && !net.internal) {
        hosts.push(net.address);
      }
    }
  }
  return hosts;
}

const nextConfig: NextConfig = {
  // Allow HMR / assets when opening the app via LAN IP share links.
  allowedDevOrigins: lanHosts(),
};

export default nextConfig;
