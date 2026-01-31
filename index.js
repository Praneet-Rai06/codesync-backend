const crypto = require("crypto");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

//New 
app.get("/", (req, res) => {
  res.status(200).send("CodeSync backend is running 🚀");
});


const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

/* ================= IN-MEMORY STORE ================= */

const rooms = {};
// roomId -> {
//   ownerId: socketId,
//   users: [{ id, name }],
//   pending: [{ id, name }]
// }

const roomFiles = {}; // roomId -> filesTree

const defaultFiles = {
  src: {
    type: "folder",
    children: {
      "index.js": {
        type: "file",
        content:
          "// Welcome to CodeSync 🚀\nconsole.log('Hello from CodeSync');",
      },
    },
  },
};

/* ================= SOCKET LOGIC ================= */

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  /* ================= CREATE ROOM ================= */
  socket.on("create-room", ({ username }) => {
    const roomId = crypto
      .randomBytes(3)
      .toString("hex")
      .toUpperCase(); // 6-char room id

    socket.join(roomId);
    socket.roomId = roomId;
    socket.username = username;
    socket.isOwner = true;

    rooms[roomId] = {
  ownerId: socket.id,
  users: [{ id: socket.id, name: username }],
};

    roomFiles[roomId] = defaultFiles;

    socket.emit("room-created", { roomId });
    socket.emit("files-init", roomFiles[roomId]);
    io.to(roomId).emit("users-update", rooms[roomId].users);

    console.log(`Room created: ${roomId}`);
  });

  /* ================= JOIN ROOM (AUTO-ACCEPT) ================= */
  socket.on("join-room", ({ roomId, username }) => {
  const room = rooms[roomId];
  if (!room) {
    socket.emit("join-rejected");
    return;
  }

  socket.join(roomId);
  socket.roomId = roomId;
  socket.username = username;

  room.users.push({ id: socket.id, name: username });

  // send files immediately
  if (!roomFiles[roomId]) {
    roomFiles[roomId] = {
      src: {
        type: "folder",
        children: {
          "index.js": {
            type: "file",
            content:
              "// Welcome to CodeSync 🚀\nconsole.log('Hello from CodeSync');",
          },
        },
      },
    };
  }

  socket.emit("files-init", roomFiles[roomId]);
  io.to(roomId).emit("users-update", room.users);

  console.log(`User ${username} joined room ${roomId}`);
});

  /* ================= FILE TREE SYNC ================= */
  socket.on("files-update", ({ roomId, files }) => {
    roomFiles[roomId] = files;
    socket.to(roomId).emit("files-update", files);
  });

  /* ================= CHAT ================= */
  socket.on("chat-message", ({ user, text }) => {
  if (!socket.roomId) return;
  if (!rooms[socket.roomId]) return;

  io.to(socket.roomId).emit("chat-message", {
    user,
    text,
  });
});


  /* ================= DISCONNECT ================= */
  socket.on("disconnect", () => {
  const roomId = socket.roomId;
  if (!roomId || !rooms[roomId]) return;

  const room = rooms[roomId];

  // remove user by socket id
  room.users = room.users.filter(
    (u) => u.id !== socket.id
  );

  io.to(roomId).emit("users-update", room.users);

  // cleanup empty room
  if (room.users.length === 0) {
    delete rooms[roomId];
    delete roomFiles[roomId];
  }

  console.log(`Client disconnected: ${socket.id}`);
});
});

/* ================= SERVER ================= */
const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`✅ Backend running on port ${PORT}`);
});

