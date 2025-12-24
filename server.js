const path = require("path");
const http = require("http");
const express = require("express");
const session = require("express-session");
const MongoDBStore = require("connect-mongodb-session")(session);
const { Server } = require("socket.io");
const mongoose = require("mongoose");

// ✅ FIX 1: Model ko yahan require kar lo taaki 'User' hamesha registered rahe
const User = require("./models/user"); 

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
const lastControlTime = new Map();

// Filter logic: Dashboard par wahi dikhenge jo login hain (Agents nahi)
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

    socket.on("user-online", async (data) => { 
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

        try {
            // ✅ FIX 2: seedha User use karo kyunki upar require kar liya hai
            await User.findByIdAndUpdate(userId, { isOnline: true });
        } catch (err) {
            console.log("❌ DB Online Update Error:", err.message);
        }

        console.log(`✅ ${isAgent ? 'AGENT' : 'USER'} Online: ${userId}`);
        io.emit("update-user-list", getUserList());

        // Agar User1 connect hua, check karo koi Agent uska wait kar raha hai kya
        if (!isAgent) {
            pendingShares.forEach((vId, sId) => {
                if (vId === userId) {
                    const agent = activeUsers.get(`${sId}_agent`);
                    if (agent) {
                        io.to(agent.socketId).emit("start-sharing", { targetId: userId });
                    }
                }
            });
        }

        // Agar Agent connect hua, check karo viewer ready hai kya
        if (isAgent && pendingShares.has(userId)) {
            const viewerId = pendingShares.get(userId);
            io.to(socket.id).emit("start-sharing", { targetId: viewerId });
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
        const now = Date.now();
        const lastTime = lastControlTime.get(socket.id) || 0;
        if (data.event && data.event.type === 'mousemove') {
            if (now - lastTime < 30) return; 
            lastControlTime.set(socket.id, now);
        }
        const agentKey = `${data.targetId}_agent`;
        const agentTarget = activeUsers.get(agentKey);
        const socketId = agentTarget ? agentTarget.socketId : activeUsers.get(data.targetId.toString())?.socketId;

        if (socketId) {
            io.to(socketId).emit("receive-control-input", {
                senderId: data.senderId,
                event: data.event
            });
        }
    });

    socket.on("disconnect", async () => {
        for (const [key, info] of activeUsers.entries()) {
            if (info.socketId === socket.id) {
                try {
                    const actualId = info.originalId || key.replace('_agent', '');
                    await User.findByIdAndUpdate(actualId, { isOnline: false });
                } catch (err) {}
                activeUsers.delete(key);
                break;
            }
        }
        io.emit("update-user-list", getUserList());
    });
});

app.use(errorsController.pageNotFound);

mongoose.connect(DB_PATH).then(() => {
    console.log("✅ DB Connected");
    // ✅ FIX 3: Render ke liye '0.0.0.0' hatado, sirf PORT kaafi hai
    server.listen(PORT, () => console.log(`🚀 Server running on ${PORT}`));
}).catch(err => console.log("❌ DB Error:", err));