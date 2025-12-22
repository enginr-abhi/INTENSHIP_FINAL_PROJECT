const socket = window.socket;

document.addEventListener("DOMContentLoaded", () => {
    const currentUserId = document.body.dataset.userId;
    const currentUserName = document.body.dataset.userName || "User";

    const userList = document.getElementById("active-users-list");
    const requestContainer = document.getElementById("incoming-request-container");

    if (!currentUserId) return;

    // 1. Online Users List update karne ke liye
    socket.off("update-user-list");
    socket.on("update-user-list", (users) => {
        if (!userList) return;
        userList.innerHTML = "";
        users.forEach((u) => {
            if (u.userId === currentUserId) return;
            const div = document.createElement("div");
            div.className = "bg-[#2A2A3A] p-3 rounded-lg flex justify-between items-center";
            const fullName = u.name || (u.firstName ? `${u.firstName} ${u.lastName || ''}` : "User");
            div.innerHTML = `
                <span>${fullName}</span>
                <button class="bg-blue-600 text-white px-3 py-1.5 rounded-md text-xs">Request ScreenShare</button>
            `;
            div.querySelector("button").onclick = () => {
                socket.emit("send-share-request", {
                    targetId: u.userId,
                    senderId: currentUserId,
                    senderName: currentUserName,
                });
            };
            userList.appendChild(div);
        });
    });

    // 2. Incoming Request Handle karne ke liye (FIXED)
    socket.off("incoming-request");
    socket.on("incoming-request", (data) => {
        requestContainer.classList.remove("hidden");
        requestContainer.innerHTML = `
            <b>${data.senderName}</b> wants to Remote control your screen
            <div class="mt-2 flex gap-2">
                <button id="accept-btn" class="bg-blue-600 text-white px-3 py-1 rounded">Accept</button>
                <button id="reject-btn" class="bg-red-600 text-white px-3 py-1 rounded">Reject</button>
            </div>
        `;

        document.getElementById("accept-btn").onclick = () => {
            // Server ko inform karo accept ho gaya hai
            socket.emit("request-accepted", {
                sharerId: currentUserId,
                viewerId: data.senderId,
            });

            // 🔥 FIX: Ankit (Sharer) ko uske sharing page par redirect karo
            // Isse use screen.ejs dikhega jahan se wo Agent download karega
            window.location.href = "/share/" + data.senderId;
        };

        document.getElementById("reject-btn").onclick = () => {
            requestContainer.classList.add("hidden");
        };
    });

    // 3. Viewer (Abhishek) ko redirect karne ke liye
    socket.off("redirect-to-view");
    socket.on("redirect-to-view", ({ sharerId }) => {
        window.location.href = "/view/" + sharerId;
    });
});