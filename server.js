const path = require("path");
const http = require("http");
const express = require("express");
const session = require("express-session");
const MongoDBStore = require("connect-mongodb-session")(session);
const { Server } = require("socket.io");
const mongoose = require("mongoose");

const homeRouter = require("./routes/homeRouter");
const authRouter = require("./routes/authRouter");
const dashboardRouter = require("./routes/dashboardRouter");
const rootDir = require("./utils/pathUtil");
const errorsController = require("./controllers/error");

const DB_PATH = "mongodb+srv://root:root@intenshipproject.otfahvy.mongodb.net/users?appName=intenshipProject";
const PORT = process.env.PORT || 8000;

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
    cors: { origin: "*", methods: ["GET", "POST"] },
    pingTimeout: 60000
});

const activeUsers = new Map(); 
const pendingShares = new Map(); 

// --- THROTTLING LOGIC START ---
const lastControlTime = new Map();
// --- THROTTLING LOGIC END ---

const getUserList = () => Array.from(activeUsers)
    .filter(([_, info]) => !info.isAgent) 
    .map(([userId, info]) => ({ 
        userId: info.originalId || userId, 
        name: info.name 
    }));

const getUser = (userId) => activeUsers.get(userId?.toString());

app.set("view engine", "ejs");
app.set("views", "views");

const store = new MongoDBStore({ uri: DB_PATH, collection: "sessions" });
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ 
    secret: "myIntenship", 
    resave: false, 
    saveUninitialized: false, 
    store, 
    cookie: { maxAge: 1000 * 60 * 60 * 24 } 
}));

app.use(express.static(path.join(rootDir, "public")));
app.use('/agent', express.static(path.join(rootDir, "agent")));

app.use(homeRouter);
app.use(authRouter);
app.use(dashboardRouter);

io.on("connection", (socket) => {
    console.log("🔌 New Connection:", socket.id);

    socket.on("user-online", (data) => {
        if (!data.userId) return;
        const userId = data.userId.toString();
        const isAgent = data.name === "Agent Sharer";

        const storageKey = isAgent ? `${userId}_agent` : userId;

        if (activeUsers.has(storageKey)) {
            activeUsers.delete(storageKey);
        }

        activeUsers.set(storageKey, {
            socketId: socket.id,
            name: data.name || "User",
            isAgent: isAgent,
            originalId: userId 
        });

        console.log(`✅ ${isAgent ? 'AGENT' : 'USER'} Online: ${userId}`);
        io.emit("update-user-list", getUserList());

        if (!isAgent) {
            pendingShares.forEach((vId, sId) => {
                if (vId === userId) {
                    const agent = activeUsers.get(`${sId}_agent`);
                    if (agent) {
                        io.to(agent.socketId).emit("start-sharing", { targetId: userId });
                        console.log(`🚀 Viewer (Abhishek) Re-connected. Telling Agent (Ankit) to start!`);
                    }
                }
            });
        }

        if (isAgent && pendingShares.has(userId)) {
            const viewerId = pendingShares.get(userId);
            io.to(socket.id).emit("start-sharing", { targetId: viewerId });
            console.log(`🎯 Agent (Ankit) matched with Viewer (Abhishek): ${viewerId}`);
        }
    });

    socket.on("send-share-request", (data) => {
        const targetId = data.targetId.toString();
        const target = getUser(targetId);
        
        if (target && target.socketId) {
            io.to(target.socketId).emit("incoming-request", { 
                senderId: data.senderId, 
                senderName: data.senderName 
            });
            console.log(`📩 Request: ${data.senderName} -> ${targetId}`);
        }
    });

    socket.on("request-accepted", (data) => {
        const sharerId = data.sharerId.toString();
        const viewerId = data.viewerId.toString();
        pendingShares.set(sharerId, viewerId);
        
        const viewer = getUser(viewerId);
        if (viewer) {
            io.to(viewer.socketId).emit("redirect-to-view", { sharerId: sharerId });
        }
        console.log(`🤝 Accepted: Sharer ${sharerId} -> Viewer ${viewerId}`);
    });

    socket.on("screen-update", (data) => {
        if (!data.targetId) return;
        const target = activeUsers.get(data.targetId.toString());
        if (target && target.socketId) {
            io.to(target.socketId).emit("receive-screen-data", {
                senderId: data.senderId,
                image: data.image
            });
        }
    });

    socket.on("control-input", (data) => {
        if (!data.targetId) return;

        // --- NEW SAFETY FILTER FOR DEMO ---
        const now = Date.now();
        const lastTime = lastControlTime.get(socket.id) || 0;
        
        // Mouse move ko thoda limit karte hain taaki crash na ho, 
        // par console.log sab chalenge
        if (data.event && data.event.type === 'mousemove') {
            if (now - lastTime < 30) return; // 30ms throttle
            lastControlTime.set(socket.id, now);
        }
        // ----------------------------------

        console.log("📥 Control received on Server:", data.event);
        const agentKey = `${data.targetId}_agent`;
        const agentTarget = activeUsers.get(agentKey);
        
        console.log(`🔎 Searching for Agent with key: ${agentKey}`);
        console.log(`📡 Agent Found: ${agentTarget ? 'YES' : 'NO'}`);
        
        const socketId = agentTarget ? agentTarget.socketId : activeUsers.get(data.targetId.toString())?.socketId;

        if (socketId) {
            io.to(socketId).emit("receive-control-input", {
                senderId: data.senderId,
                event: data.event
            });
        }
    });

    socket.on("disconnect", () => {
        for (const [key, info] of activeUsers.entries()) {
            if (info.socketId === socket.id) {
                console.log("❌ Offline:", key);
                activeUsers.delete(key);
                lastControlTime.delete(socket.id); // Clean up
                break;
            }
        }
        io.emit("update-user-list", getUserList());
    });
});

app.use(errorsController.pageNotFound);

mongoose.connect(DB_PATH).then(() => {
    console.log("✅ DB Connected");
    server.listen(PORT, () => console.log(`🚀 Server: http://localhost:${PORT}`));
}).catch(err => console.log("❌ DB Error:", err));