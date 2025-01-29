import { Server } from "socket.io";
import dotenv from "dotenv";
dotenv.config();

const players = [];

const io = new Server({
  cors: {
    origin: process.env.ORIGIN,
  },
});

io.listen(3001);

io.on("connection", (socket) => {
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
    const targetPlayer = players.findIndex((player) => player.id === socket.id);
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
