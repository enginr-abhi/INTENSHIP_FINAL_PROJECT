const express = require('express');
const loginRouter = express.Router();

const { getAddUser , postAddUser, getDashboard, getUserDetails } = require('../controllers/loginUsersController');

loginRouter.get("/login", getAddUser )
loginRouter.post("/loginAdded", postAddUser);
loginRouter.get("/dashboard", getDashboard);
loginRouter.get("/dashboard/:userId", getUserDetails);


exports.loginRouter = loginRouter;
