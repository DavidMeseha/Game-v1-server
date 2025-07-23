import { v4 as uuid } from "uuid";

export function getRandomInt(max) {
  return Math.floor(Math.random() * max);
}

export function generateRoomId() {
  return uuid().split("-")[0];
}
