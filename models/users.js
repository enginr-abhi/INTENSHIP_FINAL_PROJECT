const fs = require('fs');
const path = require('path');
const rootDir = require('../utils/pathUtil');
const userDataPath = path.join(rootDir, 'data', 'users.json');

module.exports = class Users {
  constructor(firstName, lastName, email, password, confirmPassword, gender) {
  this.firstName = firstName;
  this.lastName = lastName;
  this.email = email;
  this.password = password;
  this.confirmPassword = confirmPassword;
  this.gender = gender;
  }

  save() {  // FIXED ID
    Users.fetchAll((users) => {
    if(this.id){
    const updatedUsers = users.map(user => user.id === this.id ? this : user)
    
    fs.writeFile(userDataPath, JSON.stringify(updatedUsers), (error) => {
        console.log("User updated:", error);
      });
    }
    else {
    this.id = Math.random().toString();
    users.push(this);
    fs.writeFile(userDataPath, JSON.stringify(users), (error) => {
    console.log("User saved:", error);
        });
    }
    });
  }

  static fetchAll(callback) {
    fs.readFile(userDataPath, (err, data) => {
      console.log("File read:", err, data);
      if (err) return callback([]);
      const json = data.toString().trim();
      if (!json) return callback([]);
      try {
        const users = JSON.parse(json);
        callback(users);
      } catch (e) {
        console.log("JSON corrupted → resetting file");
        fs.writeFileSync(userDataPath, "[]");
        callback([]);
      }
    });
  }

  static findById(userId, callback) {
    this.fetchAll((users) => {
      const userFound = users.find((user) => user.id === userId);
      callback(userFound);
    });
  }
};
