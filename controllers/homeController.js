const Favourite = require("../models/favourite");
const Users = require("../models/users");

const signupUsers = [];

exports.getHome = (req, res, next) => {
  console.log("Session Value:", req.session);
  res.render("home", {
    pageTitle: "home",
    currentPage: "home",
    isLoggedIn: req.session.isLoggedIn,
  });
};

exports.postSignup = (req, res, next) => {
  console.log("come after signup", req.body);
  const { firstName, lastName, email, password, confirmPassword, gender } =
    req.body;
  Users.fetchAll((users) => {
    // 1) Check existing user
    const exists = users.find((u) => u.email === email);
    if (exists) {
      return res.send("User already exists", {
        isLoggedIn: req.session.isLoggedIn,
      });
    }
    // 2) Create user
    // Create new user only if not exists
    const newUser = new Users(
      firstName,
      lastName,
      email,
      password,
      confirmPassword,
      gender
    );
    //Render success page after saving
    newUser.save();
    res.render("signupAdded", {
      pageTitle: "signupAdded",
      currentPage: "signupAdded",
      isLoggedIn: req.session.isLoggedIn,
    });
  });
};

exports.getBookings = (req, res, next) => {
  res.render("store/bookings", {
    pageTitle: "Bookings",
    currentPage: "bookings",
    isLoggedIn: req.session.isLoggedIn,
  });
};

exports.getFavouriteList = (req, res, next) => {
  Favourite.getFavourites((favourites) => {
    Users.fetchAll((users) => {
      const favouriteUsers = users.filter((user) =>
        favourites.includes(user.id)
      );
      res.render("store/favourite-list", {
        favouriteUsers: favouriteUsers,
        pageTitle: "My Favourites",
        currentPage: "favourite",
        isLoggedIn: req.session.isLoggedIn,
      });
    });
  });
};

exports.postAddToFavouriteList = (req, res, next) => {
  console.log("come to ADD TO FAVOURITE", req.body);
  Favourite.addToFavourite(req.body.id, (error) => {
    if (error) {
      console.log("Error while making favourite", error);
    }
    res.redirect("/favourites", {
      isLoggedIn: req.session.isLoggedIn,
    });
  });
};
exports.signupUsers = signupUsers;
