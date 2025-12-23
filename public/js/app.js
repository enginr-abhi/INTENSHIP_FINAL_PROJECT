// public/js/app.js — FINAL DEBUG & FOCUS FIXED VERSION (PERCENTAGE SCALING)
const socket = window.socket;

const SHARER_WIDTH = 1920;
const SHARER_HEIGHT = 1080;

// 🔥 KEY REPEAT PREVENTER (Fixes the flooding issue)
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
  if (!sharerId || !viewerId) return;

  const remoteVideo = document.getElementById("remote-video");
  if (!remoteVideo) return;

  const rect = remoteVideo.getBoundingClientRect();
  let eventPayload = null;

  /* ============ MOUSE EVENTS ============ */
  if (e.type.startsWith("mouse") || e.type === "dblclick" || e.type === "contextmenu") {
    // Mouse context menu and default behavior prevention
    if (e.type === "contextmenu") e.preventDefault();
    
    if (!rect.width || !rect.height) return;

    const xPercent = (e.clientX - rect.left) / rect.width;
    const yPercent = (e.clientY - rect.top) / rect.height;

    eventPayload = {
      type: e.type,
      x: xPercent,
      y: yPercent,
      button: e.button, 
      w: rect.width,
      h: rect.height,
    };

    if (e.type === "mousedown" || e.type === "dblclick") {
      console.log(`🎯 ${e.type.toUpperCase()} SENT! X-Ratio:${xPercent.toFixed(3)} Y-Ratio:${yPercent.toFixed(3)}`);
    }
  } 
  /* ============ KEYBOARD EVENTS (FIXED) ============ */
  else if (e.type === "keydown" || e.type === "keyup") {
    const keyCode = e.keyCode || e.which;

    if (e.type === "keydown") {
      if (pressedKeys.has(keyCode)) return; // 🛑 AGAR KEY PEHLE SE DABI HAI TOH IGNORE KARO
      pressedKeys.add(keyCode);
    } else if (e.type === "keyup") {
      pressedKeys.delete(keyCode); // ✅ KEY CHHOD DI, AB DOBARA DABANE PAR HI JAYEGA
    }

    eventPayload = {
      type: e.type,
      keyCode: keyCode,
      key: e.key,
    };
    console.log(`⌨️ KEY EVENT: ${e.type} - Key: ${e.key}`);
  }

  if (!eventPayload) return;

  socket.emit("control-input", {
    targetId: sharerId,
    senderId: viewerId,
    event: eventPayload,
  });

  console.log("🎮 CONTROL SENT TO SERVER:", eventPayload.type);
}

/* ======================================
   INIT AFTER DOM READY
====================================== */
document.addEventListener("DOMContentLoaded", () => {
  console.log("✅ DOM Loaded. Initializing Control System...");

  setTimeout(() => {
    const userElement = document.getElementById("current-user-id");
    const viewerId = userElement?.dataset.userId;
    const path = window.location.pathname;

    if (!viewerId) {
      console.error("❌ Viewer ID missing");
      return;
    }

    socket.emit("user-online", {
      userId: viewerId,
      name: window.CURRENT_USER_NAME || "User",
      isOnline: true
    });

    if (path.startsWith("/view/")) {
      const sharerId = path.split("/").pop();
      const remoteVideo = document.getElementById("remote-video");
      const status = document.getElementById("connection-status");

      if (status) {
        status.innerText = "Status: Connecting to Agent...";
        status.style.color = "orange";
      }

      socket.on("receive-screen-data", (data) => {
        if (!data?.image || !remoteVideo) return;
        const imgSrc = data.image.startsWith("data:image") ? data.image : `data:image/jpeg;base64,${data.image}`;
        remoteVideo.src = imgSrc;

        if (status && status.innerText !== "Status: LIVE") {
          status.innerText = "Status: LIVE";
          status.style.color = "green";
        }
      });

      const boundControl = (e) => sendControlEvent(e, sharerId, viewerId);

      remoteVideo.setAttribute("tabindex", "0");

      remoteVideo.addEventListener("mousedown", (e) => {
        remoteVideo.focus(); 
        boundControl(e);
      });

      remoteVideo.addEventListener("dblclick", boundControl);
      remoteVideo.addEventListener("mouseup", boundControl);
      
      // Mousemove logic (optimized on server, but can be used here too)
      remoteVideo.addEventListener("mousemove", (e) => {
        if (e.buttons === 1) boundControl(e);
      });

      remoteVideo.addEventListener("contextmenu", boundControl);

      // 🔥 Keyboard listeners
      remoteVideo.addEventListener("keydown", boundControl);
      remoteVideo.addEventListener("keyup", boundControl);

      document.getElementById("stop-viewing-btn")?.addEventListener("click", handleDisconnect);
    }
  }, 400);
});