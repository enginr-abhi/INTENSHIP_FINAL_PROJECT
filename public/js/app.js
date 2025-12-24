const socket = window.socket;
let pressedKeys = new Set();

function handleDisconnect() {
    console.log("⚠️ Session closing...");
    alert("Session ended. Redirecting to dashboard.");
    window.location.href = "/dashboard";
}

/* ======================================
   SEND CONTROL EVENT TO SERVER
====================================== */
function sendControlEvent(e, sharerId, viewerId) {
    const remoteVideo = document.getElementById("remote-video");
    if (!remoteVideo || !sharerId || !viewerId) return;

    const rect = remoteVideo.getBoundingClientRect();
    let eventPayload = null;

    // Mouse Events Logic
    if (e.type.startsWith("mouse") || e.type === "dblclick" || e.type === "contextmenu") {
        if (e.type === "contextmenu") e.preventDefault();
        
        // Exact percentage calculation including scroll offset
        const xPercent = (e.clientX - rect.left) / rect.width;
        const yPercent = (e.clientY - rect.top) / rect.height;

        // Boundary check (Coordinate image ke bahar na jaye)
        if (xPercent < 0 || xPercent > 1 || yPercent < 0 || yPercent > 1) return;

        eventPayload = {
            type: e.type,
            x: xPercent,
            y: yPercent,
            button: e.button, // 0: Left, 2: Right
        };
    } 
    // Keyboard Events Logic
    else if (e.type === "keydown" || e.type === "keyup") {
        const keyCode = e.keyCode || e.which;

        if (e.type === "keydown") {
            if (pressedKeys.has(keyCode)) return; 
            pressedKeys.add(keyCode);
        } else if (e.type === "keyup") {
            pressedKeys.delete(keyCode);
        }

        eventPayload = {
            type: e.type,
            keyCode: keyCode,
            key: e.key,
        };
    }

    if (eventPayload) {
        socket.emit("control-input", {
            targetId: sharerId,
            senderId: viewerId,
            event: eventPayload,
        });
    }
}

/* ======================================
   INIT AFTER DOM READY
====================================== */
document.addEventListener("DOMContentLoaded", () => {
    const userElement = document.getElementById("current-user-id");
    if (!userElement) return;

    const currentUserId = userElement.dataset.userId;
    const role = userElement.dataset.role;
    const peerId = userElement.dataset.peerId;

    // Notify server user is online in screen room
    socket.emit("user-online", {
        userId: currentUserId,
        name: window.CURRENT_USER_NAME || "User"
    });

    if (role === "viewer") {
        const remoteVideo = document.getElementById("remote-video");
        const statusOverlay = document.getElementById("status-overlay");
        const statusText = document.getElementById("connection-status");

        socket.on("receive-screen-data", (data) => {
            if (!data.image) return;
            
            // Update Image
            remoteVideo.src = data.image.startsWith("data:image") ? data.image : `data:image/jpeg;base64,${data.image}`;
            
            // Hide Overlay on first frame
            if (statusOverlay) statusOverlay.classList.add("hidden");
            if (statusText) {
                statusText.innerText = "Status: LIVE";
                statusText.style.color = "#4ade80"; // Green
            }
        });

        // Event Listeners for Control
        const boundControl = (e) => sendControlEvent(e, peerId, currentUserId);

        remoteVideo.addEventListener("mousedown", boundControl);
        remoteVideo.addEventListener("mouseup", boundControl);
        remoteVideo.addEventListener("dblclick", boundControl);
        remoteVideo.addEventListener("contextmenu", boundControl);
        
        // Dragging/Moving (optimized)
        remoteVideo.addEventListener("mousemove", (e) => {
            if (e.buttons === 1) boundControl(e);
        });

        // Global Keyboard Listeners (sirf tab kaam karenge jab user viewing area mein ho)
        window.addEventListener("keydown", (e) => {
            if (document.activeElement === remoteVideo || e.target === remoteVideo) {
                if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key)) e.preventDefault();
                boundControl(e);
            }
        });
        window.addEventListener("keyup", boundControl);

        document.getElementById("stop-viewing-btn")?.addEventListener("click", handleDisconnect);

    } else if (role === "sharer") {
        // Sharer Side: Agent Connection Status
        socket.on("start-sharing", (data) => {
            const statusBox = document.getElementById("sharing-status");
            if (statusBox) {
                statusBox.innerText = "✅ Status: Agent Connected! Sharing Screen...";
                statusBox.classList.replace("text-red-600", "text-green-600");
                statusBox.classList.replace("bg-yellow-100", "bg-green-100");
            }
        });

        document.getElementById("stop-sharing-btn")?.addEventListener("click", handleDisconnect);
    }
});