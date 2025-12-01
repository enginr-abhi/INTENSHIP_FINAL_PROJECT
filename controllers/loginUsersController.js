const Users = require("../models/users");

exports.getAddUser = (req, res, next) => {
  res.render('admin/login', { pageTitle: 'login', currentPage: 'login' });
}


exports.getDashboard = (req, res, next) => {
  Users.fetchAll((users) => {
    res.render('admin/admin-Dashboard-List', {
      users: users,
      pageTitle: 'Admin-Dashboard',
      currentPage: 'dashboard'
    });
  });
}

exports.getUserDetails = (req, res, next) => {
  const userId = req.params.userId;
  console.log("At user details page", userId);
  Users.findById(userId, (user) => {
    if (!user) {
      console.log('user not found');
    } else {
      console.log("User details Found", user);
      res.render('store/user-detail', {
        user: user,
        pageTitle: 'user-details',
        currentPage: 'dashboard'
      });
    }
  })
}

exports.postAddUser = (req, res, next) => {
  const { username, email, password } = req.body;
  const user = new Users(username, email, password);
  user.save();
  res.render('admin/login-Added', {
    pageTitle: 'LoginAdded Successfull', currentPage: 'loginAdded'
  });
}


