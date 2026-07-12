import { createServer } from "http";
import next from "next";
import { Server as SocketIOServer } from "socket.io";
import { Server as EngineServer } from "engine.io";

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = parseInt(process.env.PORT ?? "3000", 10);

const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

app.prepare().then(() => {
  const upgradeHandler = app.getUpgradeHandler();

  const engine = new EngineServer({
    path: "/api/socketio",
    addTrailingSlash: false,
    cors: { origin: "*" },
  });

  const io = new SocketIOServer();
  io.bind(engine);

  (globalThis as Record<string, unknown>).__io = io;

  io.on("connection", (socket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id}`);

    socket.on("join", (room: string) => {
      socket.join(room);
      console.log(`[Socket.IO] ${socket.id} joined room: ${room}`);
    });

    socket.on("disconnect", () => {
      console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
    });
  });

  // Single request handler — no double-handling
  const httpServer = createServer((req, res) => {
    if (req.url?.startsWith("/api/socketio")) {
      engine.handleRequest(req, res);
    } else {
      handler(req, res);
    }
  });

  httpServer.on("upgrade", (req, socket, head) => {
    if (req.url?.startsWith("/api/socketio")) {
      engine.handleUpgrade(req, socket, head);
    } else {
      upgradeHandler(req, socket, head);
    }
  });

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> Socket.IO listening on /api/socketio`);
  });
});
