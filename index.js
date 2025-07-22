import { v4 as uuid } from "uuid";
import { Server } from "socket.io";
import dotenv from "dotenv";
import { getGameCoins, handlePickedCoin } from "./coinOptions.js";
dotenv.config();

const rooms = new Map(); // roomName -> Map of players

const io = new Server({
  cors: {
    origin: process.env.ORIGIN,
  },
});

io.listen(process.env.PORT || 3001);

// Generate a short unique ID (8 characters)
function generateRoomId() {
  return uuid().split("-")[0]; // Takes first part of UUID
}

const getRoomPlayers = (roomId) => {
  const room = rooms.get(roomId);
  if (!room || !room.players) return [];
  return Array.from(room.players.values());
};

const addPlayerToRoom = (room, socketId) => {
  if (!rooms.has(room)) return;
  const roomPlayers = rooms.get(room).players;
  const position = [0, 0, 0];
  roomPlayers.set(socketId, {
    id: socketId,
    coins: 0,
    position,
    rotation: 0,
  });
};

const removePlayerFromRoom = (room, socketId) => {
  const roomObj = rooms.get(room);
  if (roomObj && roomObj.players) {
    roomObj.players.delete(socketId);
    if (roomObj.players.size === 0) rooms.delete(room);
  }
};

const removeRoom = (room) => {
  rooms.delete(room);
};

const updatePlayerPositionInRoom = (room, socketId, position, rotation) => {
  const roomPlayers = rooms.get(room)?.players;
  if (roomPlayers) {
    const player = roomPlayers.get(socketId);
    if (player) {
      player.position = position;
      player.rotation = rotation;
    }
  }
};

io.on("connection", (socket) => {
  let room = null;

  socket.on("createRoom", () => {
    room = generateRoomId();
    console.log("Create Room", room);
    socket.join(room);
    rooms.set(room, {
      creator: socket.id,
      inGame: false,
      coins: getGameCoins(),
      players: new Map(),
    });
    const roomPlayers = rooms.get(room).players;
    const position = [10, 0, 0];
    roomPlayers.set(socket.id, {
      id: socket.id,
      coins: 0,
      position,
      rotation: 0,
    });

    socket.emit("id", socket.id);
    socket.emit("created", room);
  });

  socket.on("cancelRoom", () => {
    console.log("delete room", room);
    removeRoom(room);

    io.to(room).emit("roomDisconnected");
    socket.leave(room);
  });

  socket.on("joinRoom", (roomId) => {
    console.log("Join Room", roomId);
    if (!rooms.has(roomId)) return socket.emit("error", "Room dose not exist.");
    room = roomId;
    socket.join(room);
    addPlayerToRoom(room, socket.id);

    socket.emit("id", socket.id);
    io.to(room).emit("playersCount", rooms.get(room).players.size);
    io.to(room).emit("players", getRoomPlayers(room, socket.id));
    if (rooms.get(room).inGame) {
      socket.emit("started");
      socket.emit("players", getRoomPlayers(room, socket.id));
    }
  });

  socket.on("leaveRoom", () => {
    console.log("leave room", room);
    removePlayerFromRoom(room, socket.id);

    io.to(room).emit("playersCount", rooms.get(room).players.size);

    socket.leave(room);
  });

  socket.on("start", () => {
    console.log("start game", room);
    if (!rooms.has(room))
      return socket.emit("roomDisconnected", "Room dose not exist.");

    rooms.get(room).inGame = true;
    io.to(room).emit("started");
    io.to(room).emit("players", getRoomPlayers(room, socket.id));
    io.to(room).emit("coins", rooms.get(room).coins);
  });

  socket.on("coinPicked", ({ coinPosition }) => {
    if (!rooms.has(room)) return;
    const idx = rooms
      .get(room)
      .coins.findIndex(
        (c) =>
          c[0] === coinPosition[0] &&
          c[1] === coinPosition[1] &&
          c[2] === coinPosition[2]
      );
    if (idx === -1) return; // Coin already picked

    rooms.get(room).players.get(socket.id).coins += 1;
    io.to(room).emit(
      "coins",
      handlePickedCoin(coinPosition, rooms.get(room).coins)
    );
    io.to(room).emit("players", getRoomPlayers(room, socket.id));
  });

  socket.on("move", ({ position, rotation }) => {
    if (!rooms.has(room))
      return socket.emit("roomDisconnected", "Room dose not exist.");
    updatePlayerPositionInRoom(room, socket.id, position, rotation);
    io.to(room).emit("players", getRoomPlayers(room, socket.id));
  });

  socket.on("disconnect", () => {
    console.log("Player Disconnect");
    if (!rooms.has(room)) return;
    if (
      rooms.get(room).creator !== socket.id &&
      rooms.get(room).players.size > 1
    ) {
      rooms.get(room).creator = rooms
        .get(room)
        .players.values()
        .next().value.id;

      removePlayerFromRoom(room, socket.id);
      io.to(room).emit("players", Array.from(rooms.get(room).players.values()));
    } else {
      removeRoom(room);
      io.to(room).emit("roomDisconnected");
    }
  });
});

io.engine.on("connection_error", (err) => {
  console.error("Connection error:", err);
});
