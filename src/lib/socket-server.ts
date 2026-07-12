import type { Server as SocketIOServer } from "socket.io";

export function getIO(): SocketIOServer | null {
  return (globalThis as Record<string, unknown>).__io as SocketIOServer | null;
}

export function emitTokenUpdate(data: {
  tokenId: number;
  displayNumber: string;
  newState: string;
  level: number;
  cabinId?: number | null;
  cabinName?: string | null;
}) {
  const io = getIO();
  if (!io) return;

  // Emit to all connected clients
  io.emit("token:updated", data);

  // If called, also emit specific event for TV display and audio
  if (data.newState === "CALLED") {
    io.emit("token:called", {
      tokenNumber: data.displayNumber,
      cabinName: data.cabinName,
      level: data.level,
    });
  }

  // Emit queue refresh signal
  io.emit("queue:refresh", { timestamp: Date.now() });
}

export function emitCabinStatus(data: {
  cabinId: number;
  cabinName: string;
  isActive: boolean;
  currentToken?: string | null;
}) {
  const io = getIO();
  if (!io) return;
  io.emit("cabin:status", data);
}
