// public/js/app.js — FINAL DEBUG & FOCUS FIXED VERSION (PERCENTAGE SCALING)
const socket = window.socket;

// 🔥 Note: Agent side logic handles actual resolution now via percentages
const SHARER_WIDTH = 1920;
const SHARER_HEIGHT = 1080;

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

  // 🔥 Stop browser from opening context menus or scrolling
  e.preventDefault();

  const rect = remoteVideo.getBoundingClientRect();
  let eventPayload = null;

  /* ============ MOUSE EVENTS ============ */
  if (e.type.startsWith("mouse") || e.type === "dblclick") {
    if (!rect.width || !rect.height) return;

    // 🔥 THE MASTER FIX: Percentage calculation
    // Isse viewer ki window size (half/full) ka koi asar nahi hoga
    const xPercent = (e.clientX - rect.left) / rect.width;
    const yPercent = (e.clientY - rect.top) / rect.height;

    eventPayload = {
      type: e.type,
      x: xPercent, // Bhejna hai ratio (0 to 1)
      y: yPercent, // Bhejna hai ratio (0 to 1)
      button: e.button, 
      w: rect.width, // Viewer's current video width
      h: rect.height, // Viewer's current video height
    };

    // 🧪 VS Code Terminal Log Trigger
    if (e.type === "mousedown" || e.type === "dblclick") {
      console.log(`🎯 ${e.type.toUpperCase()} SENT! X-Ratio:${xPercent.toFixed(3)} Y-Ratio:${yPercent.toFixed(3)}`);
    }
  } else if (e.type === "keydown" || e.type === "keyup") {
    /* ============ KEYBOARD EVENTS ============ */
    eventPayload = {
      type: e.type,
      keyCode: e.keyCode || e.which,
      key: e.key,
    };
    console.log(`⌨️ KEY EVENT: ${e.type} - Key: ${e.key}`);
  }

  if (!eventPayload) return;

  // 🔥 Emit to server
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
      socket.on("receive-screen-data", (data) => {
        if (!data?.image || !remoteVideo) return;

        const imgSrc = data.image.startsWith("data:image")
          ? data.image
          : `data:image/jpeg;base64,${data.image}`;

        remoteVideo.src = imgSrc;

        if (status && status.innerText !== "Status: LIVE") {
          status.innerText = "Status: LIVE";
          status.style.color = "green";
        }
      });

      const boundControl = (e) => sendControlEvent(e, sharerId, viewerId);

      /* ===== FOCUS & CLICK FIX ===== */
      remoteVideo.setAttribute("tabindex", "0");

      remoteVideo.addEventListener("mousedown", (e) => {
        remoteVideo.focus(); 
        console.log("🖱️ MOUSE DOWN DETECTED!");
        boundControl(e);
      });

      remoteVideo.addEventListener("dblclick", (e) => {
        console.log("🖱️ DOUBLE CLICK DETECTED!");
        boundControl(e);
      });

      remoteVideo.addEventListener("mouseup", (e) => {
        boundControl(e);
      });

      remoteVideo.addEventListener("mousemove", (e) => {
        if (e.buttons === 1) boundControl(e);
      });

      remoteVideo.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        console.log("🖱️ RIGHT CLICK DETECTED!");
        boundControl(e);
      });

      remoteVideo.addEventListener("keydown", boundControl);
      remoteVideo.addEventListener("keyup", boundControl);

      document
        .getElementById("stop-viewing-btn")
        ?.addEventListener("click", handleDisconnect);
    }
  }, 400);
});