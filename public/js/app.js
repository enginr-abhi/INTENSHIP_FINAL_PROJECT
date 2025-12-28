/* ========================================================
   public/js/app.js - PRODUCTION READY (FIXED BY GEMINI)
   ======================================================== */
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
    if (!window.location.pathname.startsWith("/view/")) return;
    if (!sharerId || !viewerId || sharerId === "undefined") return; // Safety check

    const remoteVideo = document.getElementById("remote-video");
    if (!remoteVideo) return;

    const rect = remoteVideo.getBoundingClientRect();
    let eventPayload = null;

    /* ============ MOUSE EVENTS ============ */
    if (e.type.startsWith("mouse") || e.type === "dblclick" || e.type === "contextmenu") {
        if (e.type === "contextmenu") e.preventDefault();
        
        if (!rect.width || !rect.height) return;

        // Accurate Percentage Logic (Works on Deployed screens)
        const xPercent = (e.pageX - (rect.left + window.scrollX)) / rect.width;
        const yPercent = (e.pageY - (rect.top + window.scrollY)) / rect.height;

        // Boundary Check
        if (xPercent < 0 || xPercent > 1 || yPercent < 0 || yPercent > 1) return;

        eventPayload = {
            type: e.type,
            x: xPercent,
            y: yPercent,
            button: e.button,
            w: rect.width,
            h: rect.height,
        };

        if (e.type === "mousedown" || e.type === "dblclick") {
            console.log(`🎯 ${e.type.toUpperCase()} SENT! X:${xPercent.toFixed(3)} Y:${yPercent.toFixed(3)}`);
        }
    } 
    /* ============ KEYBOARD EVENTS ============ */
    else if (e.type === "keydown" || e.type === "keyup") {
        const keyCode = e.keyCode || e.which;
        if (e.type === "keydown") {
            if (pressedKeys.has(keyCode)) return; 
            pressedKeys.add(keyCode);
        } else if (e.type === "keyup") {
            pressedKeys.delete(keyCode);
        }
        eventPayload = { type: e.type, keyCode: keyCode, key: e.key };
        console.log(`⌨️ KEY EVENT: ${e.type} - Key: ${e.key}`);
    }

    if (eventPayload && socket.connected) {
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
    console.log("✅ DOM Loaded. Initializing Control System...");

    // 400ms delay to ensure Socket.js has registered the user
    setTimeout(() => {
        const userElement = document.getElementById("current-user-id");
        if (!userElement) {
            console.error("❌ User element missing from DOM");
            return;
        }

        // const currentUserId = userElement.dataset.userId || window.CURRENT_USER_ID;
        const currentUserId = userElement?.dataset.userId || window.CURRENT_USER_ID;
        const role = userElement.dataset.role;
        const peerId = userElement.dataset.peerId || window.location.pathname.split("/").pop();

        console.log(`🚀 App.js Active | Role: ${role} | User: ${currentUserId}`);

        if (role === "viewer" && window.location.pathname.includes("/view/")) {
            const remoteVideo = document.getElementById("remote-video");
            const statusOverlay = document.getElementById("status-overlay");
            const statusText = document.getElementById("connection-status");

            socket.on("receive-screen-data", (data) => {
                if (!data || !data.image || !remoteVideo) return;
                
                // Update Image
                remoteVideo.src = data.image.startsWith("data:image") ? data.image : `data:image/jpeg;base64,${data.image}`;
                
                // UI Fix: Hide overlay and show LIVE status
                if (statusOverlay) statusOverlay.classList.add("hidden");
                if (statusText && statusText.innerText !== "Status: LIVE") {
                    statusText.innerText = "Status: LIVE";
                    statusText.style.color = "#4ade80";
                }
            });

            // Control Handlers
            const boundControl = (e) => sendControlEvent(e, peerId, currentUserId);

            remoteVideo.setAttribute("tabindex", "0");
            remoteVideo.addEventListener("mousedown", (e) => {
                remoteVideo.focus(); 
                boundControl(e);
            });
            remoteVideo.addEventListener("mouseup", boundControl);
            remoteVideo.addEventListener("dblclick", boundControl);
            remoteVideo.addEventListener("contextmenu", boundControl);
            remoteVideo.addEventListener("mousemove", (e) => {
                if (e.buttons === 1) boundControl(e);
            });

            // Keyboard logic
            window.addEventListener("keydown", (e) => {
                if (document.activeElement === remoteVideo) {
                    if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key)) e.preventDefault();
                    boundControl(e);
                }
            });
            window.addEventListener("keyup", (e) => {
                if (document.activeElement === remoteVideo) boundControl(e);
            });

            document.getElementById("stop-viewing-btn")?.addEventListener("click", handleDisconnect);

        } else if (role === "sharer") {
            socket.on("start-sharing", () => {
                const statusBox = document.getElementById("sharing-status");
                if (statusBox) {
                    statusBox.innerText = "✅ Status: Agent Connected! Sharing Screen...";
                    statusBox.style.color = "green";
                }
            });
            document.getElementById("stop-sharing-btn")?.addEventListener("click", handleDisconnect);
        }
    }, 400);
});