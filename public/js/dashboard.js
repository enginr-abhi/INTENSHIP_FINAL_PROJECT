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

    // 1. Online Users List Update (Bina page refresh ke list update hogi)
    socket.off("update-user-list");
    socket.on("update-user-list", (users) => {
        if (!userList) return;
        userList.innerHTML = "";

        // Agar koi aur online nahi hai
        const otherUsers = users.filter(u => u.userId !== currentUserId);
        if (otherUsers.length === 0) {
            userList.innerHTML = `<div class="text-gray-400 p-4 text-center italic border border-dashed border-gray-700 rounded-lg">No other users online yet...</div>`;
            return;
        }

        otherUsers.forEach((u) => {
            const div = document.createElement("div");
            div.className = "bg-[#2A2A3A] p-4 rounded-xl flex flex-col gap-3 border border-gray-700 mb-3 transition-all hover:border-blue-500";
            
            const fullName = u.name || "User";
            
            div.innerHTML = `
                <div class="flex items-center gap-3">
                    <div class="h-8 w-8 bg-blue-600 rounded-full flex items-center justify-center text-xs font-bold text-white uppercase">
                        ${fullName.substring(0, 2)}
                    </div>
                    <span class="text-sm font-medium text-white">${fullName}</span>
                </div>
                <button class="request-btn w-full bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-xs font-semibold transition-all">
                    Request ScreenShare
                </button>
            `;

            const btn = div.querySelector("button");
            btn.onclick = () => {
                // Button feedback
                btn.innerText = "Request Sent...";
                btn.disabled = true;
                btn.classList.replace("bg-blue-600", "bg-gray-700");

                socket.emit("send-share-request", {
                    targetId: u.userId,
                    senderId: currentUserId,
                    senderName: currentUserName,
                });
                
                console.log(`📤 Request sent to: ${u.userId}`);
            };
            userList.appendChild(div);
        });
    });

    // 2. Incoming Request Handle (User 2 ki screen par dikhega)
    socket.off("incoming-request");
    socket.on("incoming-request", (data) => {
        if (!requestContainer) return;

        requestContainer.classList.remove("hidden");
        requestContainer.innerHTML = `
            <div class="flex flex-col gap-3 p-2">
                <p class="text-sm">🔔 <b>${data.senderName}</b> wants to control your screen.</p>
                <div class="flex gap-2">
                    <button id="accept-btn" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-xs font-bold transition-all shadow-md">
                        Accept & Share
                    </button>
                    <button id="reject-btn" class="bg-gray-200 text-gray-800 hover:bg-red-100 hover:text-red-600 px-4 py-2 rounded-md text-xs font-bold transition-all">
                        Reject
                    </button>
                </div>
            </div>
        `;

        // Accept Logic
        document.getElementById("accept-btn").onclick = () => {
            // User ko yaad dilana ki Agent run karna hai
            alert("Bhai, request accept ho gayi hai! Agle page par jaate hi Agent download karna aur use rename karke (agent_" + currentUserId + ".exe) chala dena.");
            
            socket.emit("request-accepted", {
                sharerId: currentUserId,
                viewerId: data.senderId,
            });

            // Redirect to share page
            window.location.href = "/share/" + data.senderId;
        };

        // Reject Logic
        document.getElementById("reject-btn").onclick = () => {
            requestContainer.classList.add("hidden");
        };
    });

    // 3. Viewer Redirection (User 1 ko redirect karna)
    socket.off("redirect-to-view");
    socket.on("redirect-to-view", ({ sharerId }) => {
        console.log("🔗 Redirecting to view screen...");
        window.location.href = "/view/" + sharerId;
    });
});