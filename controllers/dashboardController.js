const User = require("../models/user");

/* ================================
   1. DASHBOARD
================================ */
exports.getDashboard = async (req, res, next) => {
  try {
    const loggedUser = req.session.user;
    if (!loggedUser) return res.redirect("/login");

    const allUsers = await User.find({
       _id: { $ne: loggedUser._id },
       isOnline: true
      });

    res.render("admin/admin-Dashboard-List", {
      pageTitle: "Dashboard",
      currentPage: "dashboard",
      user: loggedUser,
      users: allUsers,
      isLoggedIn: req.session.isLoggedIn,
    });
  } catch (err) {
    console.error("Dashboard Error:", err);
    next(err);
  }
};

/* ================================
   2. VIEWER (Abhishek wants to see Ankit)
================================ */
exports.openViewer = async (req, res, next) => {
  try {
    const { sharerId } = req.params; // Ankit ki ID
    const loggedUser = req.session.user; // Abhishek

    if (!loggedUser || !sharerId) return res.redirect("/dashboard");

    // Check if Sharer actually exists
    const sharer = await User.findById(sharerId);
    if (!sharer) return res.redirect("/dashboard");

    res.render("screen/screen", {
      pageTitle: `Viewing ${sharer.firstName}'s Screen`,
      currentPage: "view",
      role: "viewer",
      user: loggedUser,             // Abhishek (Viewer)
      currentUserId: loggedUser._id.toString(), // Signal isi ID se jayega
      peerId: sharerId,             // Target (Ankit) ki ID
      isLoggedIn: req.session.isLoggedIn,
    });
  } catch (err) {
    console.error("Viewer Screen Error:", err);
    next(err);
  }
};

/* ================================
   3. SHARER (Ankit sharing with Abhishek)
================================ */
exports.openSharer = async (req, res, next) => {
  try {
    const { viewerId } = req.params; // Abhishek ki ID
    const loggedUser = req.session.user; // Ankit

    if (!loggedUser || !viewerId) return res.redirect("/dashboard");

    // Defensive check: Sharer mode mein bhi viewer ka existence check karna safe hai
    const viewerExists = await User.exists({ _id: viewerId });
    if (!viewerExists) return res.redirect("/dashboard");

    res.render("screen/screen", {
      pageTitle: "Sharing Your Screen",
      currentPage: "share",
      role: "sharer",
      user: loggedUser,             // Ankit (Sharer)
      currentUserId: loggedUser._id.toString(), // Signal isi ID se jayega
      peerId: viewerId,             // Target (Abhishek) ki ID
      isLoggedIn: req.session.isLoggedIn,
    });
  } catch (err) {
    console.error("Sharer Screen Error:", err);
    next(err);
  }
};