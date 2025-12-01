// External Module
const express = require('express');
const signupRouter = express.Router();
// Local Module
const { getSignup , postSignup } = require('../controllers/signupUsersController');


signupRouter.get("/", getSignup);
signupRouter.post("/signupAdded", postSignup);
// signupRouter.get(getIndex);
// signupRouter.get(getHomes);
// signupRouter.get(getBookings);
// signupRouter.get(getFavouriteList);

exports.signupRouter = signupRouter;





