// ====================== IMPORTS ======================
const path = require("path");
const http = require("http");
const express = require("express");
const session = require("express-session");
const MongoDBStore = require("connect-mongodb-session")(session);
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const User = require("./models/user");

const homeRouter = require("./routes/homeRouter");
const authRouter = require("./routes/authRouter");
const dashboardRouter = require("./routes/dashboardRouter");
const rootDir = require("./utils/pathUtil");
const errorsController = require("./controllers/error");

// ====================== CONFIG ======================
const DB_PATH = "mongodb+srv://root:root@intenshipproject.otfahvy.mongodb.net/users?appName=intenshipProject";
const PORT = process.env.PORT || 8000;

// ====================== APP + SERVER ======================
const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { 
    origin: "*", // Deployed par "*" zyada stable rehta hai agar multi-domain issue ho
    methods: ["GET", "POST"] 
  },
  transports: ["websocket"],
  allowEIO3: true, 
  maxHttpBufferSize: 1e7, 
  pingTimeout: 60000,
  pingInterval: 25000,
});

// ====================== RUNTIME STORES ======================
const activeUsers = new Map(); 
const pendingShares = new Map(); 
const lastControlTime = new Map(); 

// ====================== HELPERS ======================
const getUserList = () =>
  Array.from(activeUsers)
    .filter(([_, info]) => !info.isAgent)
    .map(([_, info]) => ({
      userId: info.originalId,
      name: info.name,
    }));

const getUser = (userId) => activeUsers.get(userId?.toString());

// ====================== EXPRESS ======================
app.set("view engine", "ejs");
app.set("views", "views");

const store = new MongoDBStore({ uri: DB_PATH, collection: "sessions" });

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(
  session({
    secret: "myIntenship",
    resave: false,
    saveUninitialized: false,
    store,
    cookie: { maxAge: 1000 * 60 * 60 * 24 },
  })
);

app.use(express.static(path.join(rootDir, "public")));
app.use("/agent", express.static(path.join(rootDir, "agent")));

app.use(homeRouter);
app.use(authRouter);
app.use(dashboardRouter);

// ====================== SOCKET.IO ======================
io.on("connection", (socket) => {
  console.log("🔌 New Connection:", socket.id);

  socket.on("user-online", async (data) => {
    if (!data?.userId) return;

    const userId = data.userId.toString();
    const isAgent = data.isAgent === true; 
    const storageKey = isAgent ? `${userId}_agent` : userId;

    // Local logic fix: purana socket clean karo agar exist karta hai
    if (activeUsers.has(storageKey)) {
        activeUsers.delete(storageKey);
    }

    activeUsers.set(storageKey, {
      socketId: socket.id,
      name: data.name || (isAgent ? "Remote Agent" : "User"),
      isAgent,
      originalId: userId,
    });

    console.log(`✅ ${isAgent ? "AGENT" : "USER"} Registered: ${storageKey}`);

    try { await User.findByIdAndUpdate(userId, { isOnline: true }); } catch {}

    io.emit("update-user-list", getUserList());

    // 🔥 FIX 1: Auto-resume logic (Viewer reconnection)
    // Jab viewer (Abhishek) wapas aaye, toh Agent (Ankit) ko bolo stream start kare
    if (!isAgent) {
        pendingShares.forEach((vId, sId) => {
            if (vId === userId) {
                const agent = activeUsers.get(`${sId}_agent`);
                if (agent) {
                    io.to(agent.socketId).emit("start-sharing", { targetId: userId });
                    console.log(`🚀 Viewer ${userId} re-connected. Signaling Agent to resume.`);
                }
            }
        });
    }
    
    // 🔥 FIX 2: Agent reconnection logic
    // Jab Agent wapas aaye, toh check karo koi viewer uska wait toh nahi kar raha
    if (isAgent) {
        for (let [sId, vId] of pendingShares) {
            if (sId === userId) {
                console.log(`🎯 Agent ${userId} matched with waiting Viewer: ${vId}`);
                io.to(socket.id).emit("start-sharing", { targetId: vId });
            }
        }
    }
  });

  socket.on("send-share-request", (data) => {
    const target = getUser(data.targetId?.toString());
    if (target?.socketId) {
      io.to(target.socketId).emit("incoming-request", {
        senderId: data.senderId,
        senderName: data.senderName,
      });
    }
  });

  socket.on("request-accepted", (data) => {
    const sharerId = data.sharerId.toString();
    const viewerId = data.viewerId.toString();

    pendingShares.set(sharerId, viewerId);

    const viewer = getUser(viewerId);
    if (viewer) io.to(viewer.socketId).emit("redirect-to-view", { sharerId });

    const agent = activeUsers.get(`${sharerId}_agent`);
    if (agent) {
      console.log(`🤝 Acceptance Sent to Agent: ${agent.socketId}`);
      io.to(agent.socketId).emit("start-sharing", { targetId: viewerId });
    }
  });

  socket.on("screen-update", (data) => {
    if (!data?.targetId || !data?.image) return;
    const target = getUser(data.targetId.toString());
    if (target?.socketId) {
      io.to(target.socketId).emit("receive-screen-data", {
        senderId: data.senderId,
        image: data.image,
      });
    }
  });

  socket.on("control-input", (data) => {
    if (!data?.targetId || !data?.event) return;
    const now = Date.now();
    const last = lastControlTime.get(socket.id) || 0;
    
    if (data.event.type === "mousemove" && now - last < 30) return;
    lastControlTime.set(socket.id, now);

    console.log("📥 Control Event:", data.event.type);

    const agentKey = `${data.targetId}_agent`;
    let agent = activeUsers.get(agentKey);

    // 🔥 FIX 3: Fallback check (Agar agent key na mile toh direct user id try karo)
    if (!agent) {
        agent = activeUsers.get(data.targetId.toString());
    }

    if (agent?.socketId) {
      io.to(agent.socketId).emit("receive-control-input", data.event);
    } else {
        console.log(`⚠️ Target Agent not found for control: ${agentKey}`);
    }
  });

  socket.on("disconnect", async () => {
    for (const [key, info] of activeUsers.entries()) {
      if (info.socketId === socket.id) {
        console.log(`❌ Disconnected: ${key}`);
        activeUsers.delete(key);
        lastControlTime.delete(socket.id);
        try { await User.findByIdAndUpdate(info.originalId, { isOnline: false }); } catch {}
        break;
      }
    }
    io.emit("update-user-list", getUserList());
  });
});

app.use(errorsController.pageNotFound);

mongoose.connect(DB_PATH).then(() => {
    console.log("✅ DB Connected");
    server.listen(PORT, () => console.log(`🚀 Server running on ${PORT}`));
}).catch((err) => console.log("❌ DB Error:", err));