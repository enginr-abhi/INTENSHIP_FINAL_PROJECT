/* ========================================================
   public/js/dashboard.js - PRODUCTION READY (FIXED)
   ======================================================== */
const socket = window.socket;

document.addEventListener("DOMContentLoaded", () => {
    const currentUserId = document.body.dataset.userId;
    const currentUserName = document.body.dataset.userName || "User";

    const userList = document.getElementById("active-users-list");
    const requestContainer = document.getElementById("incoming-request-container");

    if (!currentUserId) {
        console.error("❌ Error: User ID missing from Dashboard");
        return;
    }

    // 1. Online Users List Update
    socket.off("update-user-list");
    socket.on("update-user-list", (users) => {
        if (!userList) return;
        userList.innerHTML = "";

        const otherUsers = users.filter(u => u.userId !== currentUserId);
        
        if (otherUsers.length === 0) {
            userList.innerHTML = `<div class="text-gray-400 p-4 text-center italic border border-dashed border-gray-700 rounded-lg">No other users online yet...</div>`;
            return;
        }

        otherUsers.forEach((u) => {
            const div = document.createElement("div");
            div.className = "bg-[#2A2A3A] p-4 rounded-xl flex flex-col gap-3 border border-gray-700 mb-3 transition-all hover:border-blue-500 shadow-lg";
            
            const fullName = u.name || "User";
            const initials = fullName.substring(0, 2).toUpperCase();
            
            div.innerHTML = `
                <div class="flex items-center gap-3">
                    <div class="h-10 w-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-sm font-bold text-white">
                        ${initials}
                    </div>
                    <span class="text-sm font-medium text-white">${fullName}</span>
                </div>
                <button class="request-btn w-full bg-blue-600 hover:bg-blue-700 text-white px-3 py-2.5 rounded-lg text-xs font-semibold transition-all">
                    Request ScreenShare
                </button>
            `;

            const btn = div.querySelector("button");
            btn.onclick = () => {
                btn.innerText = "Request Sent...";
                btn.disabled = true;
                btn.classList.replace("bg-blue-600", "bg-gray-700");

                socket.emit("send-share-request", {
                    targetId: u.userId,
                    senderId: currentUserId,
                    senderName: currentUserName,
                });
            };
            userList.appendChild(div);
        });
    });

    // 2. Incoming Request Handle
    socket.off("incoming-request");
    socket.on("incoming-request", (data) => {
        if (!requestContainer) return;

        requestContainer.classList.remove("hidden");
        requestContainer.innerHTML = `
            <div class="flex flex-col gap-3 p-2 bg-[#1F1F2E] border border-blue-500 rounded-lg shadow-2xl">
                <p class="text-sm text-white">🔔 <b>${data.senderName}</b> wants to control your screen.</p>
                <div class="flex gap-2">
                    <button id="accept-btn" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-xs font-bold transition-all">
                        Accept & Share
                    </button>
                    <button id="reject-btn" class="bg-gray-700 text-gray-300 hover:bg-red-600 hover:text-white px-4 py-2 rounded-md text-xs font-bold transition-all">
                        Reject
                    </button>
                </div>
            </div>
        `;

        document.getElementById("accept-btn").onclick = () => {
            // Emit first, redirect later (No alert to block the flow)
            socket.emit("request-accepted", {
                sharerId: currentUserId,
                viewerId: data.senderId,
            });

            // Local fix: use /share/ + viewerId
            setTimeout(() => {
                window.location.href = "/share/" + data.senderId;
            }, 100);
        };

        document.getElementById("reject-btn").onclick = () => {
            requestContainer.classList.add("hidden");
        };
    });

    // 3. Viewer Redirection
    socket.off("redirect-to-view");
    socket.on("redirect-to-view", ({ sharerId }) => {
        console.log("🔗 Redirecting to viewer page...");
        window.location.href = "/view/" + sharerId;
    });
});