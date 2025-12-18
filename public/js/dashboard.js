const socket = window.socket;

document.addEventListener("DOMContentLoaded", () => {
    const currentUserId = document.body.dataset.userId;
    const currentUserName = document.body.dataset.userName || "User";

    const userList = document.getElementById("active-users-list");
    const requestContainer = document.getElementById("incoming-request-container");

    if (!currentUserId) return;

    // NOTE: user-online is handled by socket.js

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
            socket.emit("request-accepted", {
                sharerId: currentUserId,
                viewerId: data.senderId,
            });

            requestContainer.innerHTML = `
                <b class="text-green-400">✅ Accepted.</b> <br/>
                <span>Now, please run the Agent program.</span>
                <a href="/agent/agent.exe?user_id=${currentUserId}" download="agent.exe" class="bg-blue-600 text-white px-3 py-1.5 rounded-md text-sm mt-2 block w-full text-center">🚀 Run Agent.exe</a>
            `;
        };

        document.getElementById("reject-btn").onclick = () => {
            requestContainer.classList.add("hidden");
        };
    });

    socket.off("redirect-to-view");
    socket.on("redirect-to-view", ({ sharerId }) => {
        window.location.href = "/view/" + sharerId;
    });
});