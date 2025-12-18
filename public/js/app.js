// public/js/app.js — FINAL (SCREEN VIEW + FULL CONTROL)
// ✅ Mouse + Keyboard control
// ✅ Focus fixed
// ✅ preventDefault fixed
// ✅ Demo ready

const socket = window.socket;

// Agent (sharer) real screen resolution
const SHARER_WIDTH = 1920;
const SHARER_HEIGHT = 1080;

function handleDisconnect() {
    alert("Session ended. Redirecting to dashboard.");
    window.location.href = "/dashboard";
}

/* ======================================
   SEND CONTROL EVENT TO SERVER
====================================== */
function sendControlEvent(e, sharerId, viewerId) {
    if (!window.location.pathname.startsWith("/view/")) return;
    if (!sharerId || !viewerId) return;

    const remoteVideo = document.getElementById("remote-video");
    if (!remoteVideo) return;

    // 🔥 VERY IMPORTANT
    e.preventDefault();

    const rect = remoteVideo.getBoundingClientRect();
    let eventPayload = null;

    /* ============ MOUSE EVENTS ============ */
    if (e.type.startsWith("mouse")) {
        if (!rect.width || !rect.height) return;

        const x = Math.round((e.clientX - rect.left) * (SHARER_WIDTH / rect.width));
        const y = Math.round((e.clientY - rect.top) * (SHARER_HEIGHT / rect.height));

        eventPayload = {
            type: e.type,
            x,
            y,
            w: SHARER_WIDTH,
            h: SHARER_HEIGHT
        };
    }

    /* ============ KEYBOARD EVENTS ============ */
    else if (e.type === "keydown" || e.type === "keyup") {
        eventPayload = {
            type: e.type,
            keyCode: e.keyCode || e.which,
            key: e.key
        };
    }

    if (!eventPayload) return;

    socket.emit("control-input", {
        targetId: sharerId,   // USER2 (agent)
        senderId: viewerId,   // USER1 (viewer)
        event: eventPayload
    });

    // 🧪 Debug (demo ke baad hata sakta hai)
    console.log("🎮 CONTROL SENT:", eventPayload.type);
}

/* ======================================
   INIT AFTER DOM READY
====================================== */
document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {

        const userElement = document.getElementById("current-user-id");
        const viewerId = userElement?.dataset.userId;
        const path = window.location.pathname;

        if (!viewerId) {
            console.error("❌ Viewer ID missing");
            return;
        }

        // Viewer online
        socket.emit("user-online", {
            userId: viewerId,
            name: window.CURRENT_USER_NAME || "User"
        });

        /* ============ VIEWER MODE ============ */
        if (path.startsWith("/view/")) {

            const sharerId = path.split("/").pop();
            const remoteVideo = document.getElementById("remote-video");
            const status = document.getElementById("connection-status");

            if (status) {
                status.innerText = "Status: Connecting to Agent...";
                status.style.color = "orange";
            }

            /* ===== SCREEN RECEIVE ===== */
            socket.off("receive-screen-data");
            socket.on("receive-screen-data", (data) => {
                if (!data?.image || !remoteVideo) return;

                const imgSrc = data.image.startsWith("data:image")
                    ? data.image
                    : `data:image/jpeg;base64,${data.image}`;

                remoteVideo.src = imgSrc;

                // 🔥 keyboard capture
                remoteVideo.focus();

                if (status && status.innerText !== "Status: LIVE") {
                    status.innerText = "Status: LIVE";
                    status.style.color = "green";
                    console.log("📺 Screen LIVE");
                }
            });

            /* ===== CONTROL BINDINGS ===== */
            const boundControl = (e) =>
                sendControlEvent(e, sharerId, viewerId);

            // ---- Mouse ----
            remoteVideo.addEventListener("mousedown", boundControl);
            remoteVideo.addEventListener("mouseup", boundControl);
            remoteVideo.addEventListener("mousemove", (e) => {
                if (e.buttons === 1) boundControl(e);
            });

            remoteVideo.addEventListener("contextmenu", (e) => e.preventDefault());

            // ---- Keyboard (🔥 MOST IMPORTANT PART) ----
            remoteVideo.setAttribute("tabindex", "0");
            remoteVideo.focus();

            remoteVideo.addEventListener("keydown", boundControl);
            remoteVideo.addEventListener("keyup", boundControl);

            // ---- Stop ----
            document
                .getElementById("stop-viewing-btn")
                ?.addEventListener("click", handleDisconnect);
        }

    }, 300);
});
