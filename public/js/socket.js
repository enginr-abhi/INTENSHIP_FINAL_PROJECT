// public/js/socket.js - FINAL FIXED (Production Ready)

(function () {
    // 1. Pehle se connection hai toh dobara mat banao
    if (window.socket) return;

    // 2. User Info nikalne ka full-proof tareeka
    const currentUserIdElement = document.getElementById('current-user-id');
    
    // Pehle attribute se dekho, agar wahan null hai toh URL se nikalo
    let currentUserId = currentUserIdElement ? currentUserIdElement.getAttribute('data-user-id') : null; 
    
    if (!currentUserId || currentUserId === "null" || currentUserId === "") {
        const pathParts = window.location.pathname.split('/');
        const lastPart = pathParts[pathParts.length - 1];
        // Agar last part 24 chars ka hex hai (MongoDB ID), toh use use karo
        if (lastPart && lastPart.length === 24) {
            currentUserId = lastPart;
        }
    }

    const userName = currentUserIdElement ? currentUserIdElement.getAttribute('data-user-name') : 'User';
    const userRole = currentUserIdElement ? currentUserIdElement.getAttribute('data-role') : 'viewer';

    // 3. Socket Initialize karo
    window.socket = io(window.location.origin, {
        transports: ["polling", "websocket"],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 3000,
    });

    // 4. Connection Events
    window.socket.on("connect", () => {
        console.log("🔌 Connected to Server Socket:", window.socket.id);

        if (currentUserId && currentUserId.length === 24) {
            // Server ko signal bhejo
            window.socket.emit('user-online', { 
                userId: currentUserId, 
                name: userName, 
                role: userRole
            });
            console.log(`✅ Registered Successfully: ${userName} (${currentUserId})`);
        } else {
            console.error("❌ Registration Failed: Invalid or Missing UserID (" + currentUserId + ")");
        }
    });

    window.socket.on("disconnect", (reason) => {
        console.warn("❌ Socket disconnected. Reason:", reason);
    });

    window.socket.on("connect_error", (error) => {
        console.error("🔌 Socket Connection Error:", error);
    });
    
    // 5. Global variables set karo (baaki scripts ke liye)
    window.CURRENT_USER_ID = currentUserId;
    window.USER_ROLE = userRole;
    window.USER_NAME = userName;
    
})();