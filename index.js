import { Server } from "socket.io";
import dotenv from "dotenv";
import { generateRoomId } from "./misc.js";
import { getGameCoins, handlePickedCoin } from "./fns/coin.js";
dotenv.config();

const rooms = new Map();
const MAX_ROOM_SIZE = 6;

const io = new Server({
  cors: {
    origin: process.env.ORIGIN,
  },
});

io.listen(process.env.PORT || 3001);

const getRoomPlayers = (roomId) => {
  const room = rooms.get(roomId);
  if (!room || !room.players) return [];
  return Array.from(room.players.values()).filter((p) => p.isConnected);
};

const createRoom = (id) => {
  const room = generateRoomId();
  rooms.set(room, {
    creator: id,
    inGame: false,
    coins: getGameCoins(),
    players: new Map(),
  });

  return room;
};

const addPlayerToRoom = (room, name, socketId, isSpectator) => {
  if (!rooms.has(room)) return;
  const roomPlayers = rooms.get(room).players;
  const position = [0, 0, 0];
  roomPlayers.set(socketId, {
    id: socketId,
    name,
    coins: 0,
    position,
    rotation: 0,
    isSpectator,
    isConnected: true,
    removeTimeoutId: null,
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
  socket.emit("id", socket.id);

  socket.on("createRoom", ({ isSpectator, name }) => {
    room = createRoom(socket.id);
    socket.join(room);
    console.log("Create Room", room);

    addPlayerToRoom(room, name, socket.id, isSpectator);
    console.log(rooms.get(room));

    socket.emit("created", { room, isSpectator });
    socket.emit("id", socket.id);
  });

  socket.on("cancelRoom", () => {
    console.log("delete room", room);
    removeRoom(room);
    io.to(room).emit("roomDisconnected");
    socket.leave(room);
  });

  socket.on("joinRoom", ({ roomName, isSpectator, name }) => {
    console.log("Join Room", roomName);
    const targetRoom = rooms.get(roomName);
    if (!rooms.has(roomName))
      return socket.emit("error", "Room dose not exist.");

    if (targetRoom.players.size >= MAX_ROOM_SIZE)
      return socket.emit("error", "Room Is Full.");

    room = roomName;
    socket.join(room);
    addPlayerToRoom(room, name, socket.id, isSpectator);

    socket.emit("id", socket.id);
    socket.emit("joined", { isSpectator, id: socket.id, roomId: room });
    io.to(room).emit("players", getRoomPlayers(room));
    if (rooms.get(room).inGame) {
      socket.emit("started");
      socket.emit("players", getRoomPlayers(room));
      socket.emit("coins", rooms.get(room).coins);
    }
  });

  socket.on("leaveRoom", () => {
    console.log("leave room", room);
    removePlayerFromRoom(room, socket.id);

    if (rooms.get(room)) {
      io.to(room).emit("players", getRoomPlayers(room));
    }

    socket.leave(room);
  });

  socket.on("start", () => {
    console.log("start game", room);
    if (!rooms.has(room))
      return socket.emit("roomDisconnected", "Room dose not exist.");

    rooms.get(room).inGame = true;
    io.to(room).emit("started");
    io.to(room).emit("players", getRoomPlayers(room));
    io.to(room).emit("coins", rooms.get(room).coins);
  });

  socket.on("coinPicked", ({ coinPosition }) => {
    console.log("Coin picked", coinPosition);
    if (!rooms.has(room)) return;
    const idx = rooms
      .get(room)
      .coins.findIndex(
        (c) =>
          c[0] === coinPosition[0] &&
          c[1] === coinPosition[1] &&
          c[2] === coinPosition[2]
      );
    if (idx === -1) return;

    rooms.get(room).players.get(socket.id).coins += 1;
    io.to(room).emit(
      "coins",
      handlePickedCoin(coinPosition, rooms.get(room).coins)
    );
    io.to(room).emit("players", getRoomPlayers(room));
  });

  socket.on("move", ({ position, rotation }) => {
    if (!rooms.has(room))
      return socket.emit("roomDisconnected", "Room dose not exist.");
    updatePlayerPositionInRoom(room, socket.id, position, rotation);
    io.to(room).emit("players", getRoomPlayers(room));
  });

  socket.on("reconnect", ({ playerId, roomId }) => {
    room = roomId;
    console.log("Player Reconnect", playerId, roomId);
    if (!rooms.has(room)) return socket.emit("reconnect_error", "room ended");

    const targetRoom = rooms.get(room);
    if (!targetRoom.players.has(playerId))
      return socket.emit("reconnect_error", "Your Session Expired");

    const player = targetRoom.players.get(playerId);
    player.isConnected = true;
    player.id = socket.id;
    player.position = [0, 0, 0];

    let isCreator = false;
    if (playerId === targetRoom.creator) isCreator = true;

    if (player.removeTimeoutId) {
      clearTimeout(player.removeTimeoutId);
      player.removeTimeoutId = null;
    }

    targetRoom.players.set(socket.id, { ...player });
    targetRoom.creator = socket.id;
    targetRoom.players.delete(playerId);
    socket.join(room);

    socket.emit("reconnected", {
      inGame: targetRoom.inGame,
      isSpectator: player.isSpectator,
      newId: socket.id,
      isCreator,
      room,
    });

    socket.emit("coins", rooms.get(room).coins);
    socket.emit("players", getRoomPlayers(room));
    io.to(room).emit("players", getRoomPlayers(room));
  });

  socket.on("disconnect", () => {
    console.log("Player Disconnect", socket.id);
    if (!rooms.has(room)) return;

    const player = rooms.get(room).players.get(socket.id);
    player.isConnected = false;

    io.to(room).emit("players", getRoomPlayers(room));
    socket.leave(room);

    player.removeTimeoutId = setTimeout(() => {
      if (!rooms.has(room)) return;
      if (rooms.get(room).players.size > 1) {
        removePlayerFromRoom(room, socket.id);
      } else {
        removeRoom(room);
        // io.to(room).emit("roomDisconnected");
      }
    }, 300000);
  });
});

io.engine.on("connection_error", (err) => {
  console.error("Connection error:", err);
});
