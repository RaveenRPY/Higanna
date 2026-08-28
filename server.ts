import { createServer } from "http";
import { networkInterfaces } from "os";
import { parse } from "url";
import next from "next";
import { Server } from "socket.io";
import { attachGameSocket } from "./src/server/socket";

const dev = process.env.NODE_ENV !== "production";
const listenHost = process.env.HOSTNAME || "0.0.0.0";
const port = Number(process.env.PORT || 3000);
// Bind Next to all interfaces so HMR websockets work over LAN IP.
const hostname = "0.0.0.0";

function lanAddress(): string | null {
  const nets = networkInterfaces();
  for (const entries of Object.values(nets)) {
    if (!entries) continue;
    for (const net of entries) {
      if (net.family !== "IPv4" || net.internal) continue;
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

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url || "", true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(httpServer, {
    cors: { origin: "*" },
  });
  attachGameSocket(io);

  httpServer.listen(port, listenHost, () => {
    const lan = lanAddress();
    console.log(`හිගන්නා ready on http://localhost:${port}`);
    if (lan) console.log(`Share on LAN: http://${lan}:${port}`);
  });
});
