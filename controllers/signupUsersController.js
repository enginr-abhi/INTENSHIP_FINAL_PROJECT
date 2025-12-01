const fs = require('fs');
const path = require('path');
const rootDir = require('../utils/pathUtil');
const filePath = path.join(rootDir, 'data', 'signupList.json');
// In-memory store (resets on server restart)
const signupUsers = [];

exports.getSignup = (req, res, next)=>{
    res.render('signup',{
      pageTitle:'signup', 
      currentPage: 'signup'
    });
}

exports.postSignup = (req, res, next)=>{
  const { FirstName, LastName, Email, Password , ConfirmPassword, gender} = req.body;
  console.log('User succesfull Registered:', req.body);
  // Push user to array
  signupUsers.push(req.body);
  res.render('signupAdded',{
    signupUsers: signupUsers, pageTitle:'signupAdded', 
    currentPage: 'signupAdded'
  });
}

exports.getIndex = (req, res, next) => {
  Home.fetchAll((registeredHomes) =>
    res.render("store/index", {
      registeredHomes: registeredHomes,
      pageTitle: "airbnb Home",
      currentPage: "index",
    })
  );
};

exports.getHomes = (req, res, next) => {
  Home.fetchAll((registeredHomes) =>
    res.render("store/home-list", {
      registeredHomes: registeredHomes,
      pageTitle: "Homes List",
      currentPage: "Home",
    })
  );
};

exports.getBookings = (req, res, next) => {
  res.render("store/bookings", {
    pageTitle: "My Bookings",
    currentPage: "bookings",
  })
};

exports.getFavouriteList = (req, res, next) => {
  Home.fetchAll((registeredHomes) =>
    res.render("store/favourite-list", {
      registeredHomes: registeredHomes,
      pageTitle: "My Favourites",
      currentPage: "favourites",
    })
  );
};

exports.signupUsers = signupUsers;
