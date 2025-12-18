const express = require("express");
const dashboardRouter = express.Router();

const dashboardController = require("../controllers/dashboardController");

function isAuthenticated(req, res, next) {
  if (req.session.isLoggedIn) return next();
  res.redirect("/login");
}

dashboardRouter.get("/dashboard", isAuthenticated, dashboardController.getDashboard);
dashboardRouter.get("/dashboard/:userId", isAuthenticated, dashboardController.getDashboard);

/* 🔥 SCREEN ROUTES (SINGLE VIEW) */
dashboardRouter.get("/view/:sharerId", isAuthenticated, dashboardController.openViewer);
dashboardRouter.get("/share/:viewerId", isAuthenticated, dashboardController.openSharer);

module.exports = dashboardRouter;
