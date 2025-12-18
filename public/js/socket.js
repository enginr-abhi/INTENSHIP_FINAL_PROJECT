// public/js/socket.js - FINAL FIXED (Minor Improvement)

(function () {
    if (window.socket) return;

    const currentUserIdElement = document.getElementById('current-user-id');
    const currentUserId = currentUserIdElement ? currentUserIdElement.getAttribute('data-user-id') : null; 
    const userName = currentUserIdElement ? currentUserIdElement.getAttribute('data-user-name') : 'Unknown'; // ✅ Added data-user-name check
    const userRole = currentUserIdElement ? currentUserIdElement.getAttribute('data-role') : 'unknown';

    window.socket = io("http://localhost:8000", {
        transports: ["websocket"],
        reconnection: true,
    });


    window.socket.on("connect", () => {
        console.log("🔌 Global socket connected:", window.socket.id);

        if (currentUserId) {

            window.socket.emit('user-online', { 
                userId: currentUserId, 
                // ✅ Name is sent as required by server.js
                name: userName, // Using a dedicated name attribute if available, otherwise defaulting.
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
    
    // Global variables for easy access in other JS files
    window.CURRENT_USER_ID = currentUserId;
    window.USER_ROLE = userRole;
    window.USER_NAME = userName; // Added
    
})();