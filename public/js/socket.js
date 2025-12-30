// public/js/socket.js - FINAL FIXED (Production Ready)

(function () {
    if (window.socket) return;

    const currentUserIdElement = document.getElementById('current-user-id');
    let currentUserId = currentUserIdElement ? currentUserIdElement.getAttribute('data-user-id') : document.body.getAttribute('data-user-id'); 
    const userName = currentUserIdElement ? currentUserIdElement.getAttribute('data-user-name') : (document.body.getAttribute('data-user-name') || 'Unknown');
    const userRole = currentUserIdElement ? currentUserIdElement.getAttribute('data-role') : (document.body.getAttribute('data-role') || 'viewer');




    // 3. Socket Initialize karo
    window.socket = io(window.location.origin, {
        transports: ["websocket"],
        reconnection: true,
        withCredentials: true,
        reconnectionAttempts: 20,
        reconnectionDelay: 3000,
    });

    // 4. Connection Events
    window.socket.on("connect", () => {
         console.log("🔌 Global socket connected:", window.socket.id);

        if (currentUserId) {
            window.socket.emit('user-online', { 
                userId: currentUserId, 
                name: userName, 
                role: userRole
            });
            console.log(`✅ Sent 'user-online' signal for User ID: ${currentUserId}`);
        } else {
            console.error("❌ User ID not found for Socket registration!");
        }
    });

    window.socket.on("disconnect", () => {
        console.log("❌ Global socket disconnected");
    });

    window.socket.on("connect_error", (error) => {
        console.error("🔌 Socket Connection Error:", error);
    });
    
    // 5. Global variables set karo (baaki scripts ke liye)
    window.CURRENT_USER_ID = currentUserId;
    window.USER_ROLE = userRole;
    window.USER_NAME = userName;
    
})();