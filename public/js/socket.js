// public/js/socket.js - FINAL FIXED (Production Ready)

(function () {
    // Prevent multiple connections
    if (window.socket) return;

    const currentUserIdElement = document.getElementById('current-user-id');
    const currentUserId = currentUserIdElement ? currentUserIdElement.getAttribute('data-user-id') : null; 
    const userName = currentUserIdElement ? currentUserIdElement.getAttribute('data-user-name') : 'User';
    const userRole = currentUserIdElement ? currentUserIdElement.getAttribute('data-role') : 'unknown';

    // ✅ FIXED: String quotation ("") hata di, ab ye sahi current URL lega
    window.socket = io(window.location.origin, {
        transports: ["websocket"],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 2000,
    });

    window.socket.on("connect", () => {
        console.log("🔌 Connected to Server Socket:", window.socket.id);

        if (currentUserId) {
            // Registering user with the server
            window.socket.emit('user-online', { 
                userId: currentUserId, 
                name: userName, 
                role: userRole
            });
            console.log(`✅ Registered Online: ${userName} (${currentUserId})`);
        } else {
            console.warn("⚠️ No currentUserId found during socket connection.");
        }
    });

    window.socket.on("disconnect", (reason) => {
        console.log("❌ Socket disconnected. Reason:", reason);
    });

    window.socket.on("connect_error", (error) => {
        console.error("🔌 Socket Connection Error:", error);
    });
    
    // Global variables for other scripts to use
    window.CURRENT_USER_ID = currentUserId;
    window.USER_ROLE = userRole;
    window.USER_NAME = userName;
    
})();