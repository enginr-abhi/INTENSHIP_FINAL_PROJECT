const User = require("../models/user");

/* ================================
   1. DASHBOARD
================================ */
exports.getDashboard = async (req, res, next) => {
  try {
    const loggedUser = req.session.user;
    if (!loggedUser) return res.redirect("/login");

    // ✅ FIXED: Saare online users ko dhoondo (except current user)
    // Tip: Agar list khali dikhe, toh DB mein manually ek user ko true karke test karna
    const allUsers = await User.find({
        _id: { $ne: loggedUser._id },
        isOnline: true
    }).lean(); // .lean() performance ke liye accha hai

    res.render("admin/admin-Dashboard-List", { // 👈 Make sure file name matches
      pageTitle: "Dashboard",
      currentPage: "dashboard",
      user: loggedUser,
      users: allUsers,
      isLoggedIn: req.session.isLoggedIn,
    });
  } catch (err) {
    console.error("❌ Dashboard Controller Error:", err);
    next(err);
  }
};

/* ================================
   2. VIEWER (User1 wants to see User2)
================================ */
exports.openViewer = async (req, res, next) => {
  try {
    const { sharerId } = req.params;
    const loggedUser = req.session.user;

    if (!loggedUser || !sharerId) return res.redirect("/dashboard");

    const sharer = await User.findById(sharerId);
    if (!sharer) return res.redirect("/dashboard");

    res.render("screen/screen", {
      pageTitle: `Viewing ${sharer.firstName}'s Screen`,
      currentPage: "view",
      role: "viewer",
      user: loggedUser,
      currentUserId: loggedUser._id.toString(),
      peerId: sharerId,
      isLoggedIn: req.session.isLoggedIn,
    });
  } catch (err) {
    console.error("❌ Viewer Screen Error:", err);
    next(err);
  }
};

/* ================================
   3. SHARER (User2 sharing with User1)
================================ */
exports.openSharer = async (req, res, next) => {
  try {
    const { viewerId } = req.params;
    const loggedUser = req.session.user;

    if (!loggedUser || !viewerId) return res.redirect("/dashboard");

    const viewerExists = await User.exists({ _id: viewerId });
    if (!viewerExists) return res.redirect("/dashboard");

    res.render("screen/screen", {
      pageTitle: "Sharing Your Screen",
      currentPage: "share",
      role: "sharer",
      user: loggedUser,
      currentUserId: loggedUser._id.toString(),
      peerId: viewerId,
      isLoggedIn: req.session.isLoggedIn,
    });
  } catch (err) {
    console.error("❌ Sharer Screen Error:", err);
    next(err);
  }
};