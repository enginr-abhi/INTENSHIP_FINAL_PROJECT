// External Module
const express = require('express');
const homeRouter = express.Router();

// Local Module
const homeController  = require('../controllers/homeController');


homeRouter.get("/", homeController.getHome);
homeRouter.post("/signupAdded", homeController.postSignup);
homeRouter.get("/bookings", homeController.getBookings);
homeRouter.get("/favourites", homeController.getFavouriteList);
homeRouter.post("/favourites", homeController.postAddToFavouriteList);


module.exports = homeRouter;





