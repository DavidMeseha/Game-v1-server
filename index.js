// api/socket.js
import { Server } from "socket.io";

export default function handler(req, res) {
  if (res.socket.server.io) {
    console.log("Socket is already running");
    res.end();
    return;
  }

  const io = new Server(res.socket.server);

  io.on("connection", (socket) => {
    console.log("New connection:", socket.id);

    players.push({
      id: socket.id,
      position: [0, 0, 0],
      rotation: 0,
    });

    io.emit(
      "players",
      players.filter((player) => player.id !== socket.id)
    );
    socket.emit("id", socket.id);

    socket.on("move", ({ position, rotation }) => {
      const targetPlayer = players.findIndex(
        (player) => player.id === socket.id
      );
      players[targetPlayer].position = position;
      players[targetPlayer].rotation = rotation;
      io.emit("players", players);
    });

    socket.on("disconnect", () => {
      players.splice(
        players.findIndex((player) => player.id === socket.id),
        1
      );
    });
  });

  res.socket.server.io = io;
  res.end();
}
