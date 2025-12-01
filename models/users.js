const fs = require('fs');
const path = require('path');
const rootDir = require('../utils/pathUtil');

const filePath = path.join(rootDir, 'data','usersList.json');
// //fake database in memory
// const loginUsers = [];

module.exports = class Users {
 constructor(username, email , password) {
  this.username = username;
  this.email = email;
  this.password = password;
 }

 save(){
  this.id = Math.random().toString()
  Users.fetchAll((users)=>{
    users.push(this);
    fs.writeFile(filePath,JSON.stringify(users),(err) => {
    if(err) console.log(err);
  });
  });
 }

 static fetchAll(callback){
  fs.readFile(filePath, (err, data) => {
    // File not exists → empty array return
    if(err){
  return callback([]);
    }
    try {
      const users =  JSON.parse(data);
      callback(users)
    } catch (e) {
    // JSON corrupt ho to empty return
        callback([]);
    }
  })
 }

 static findById(userId,callback){
  this.fetchAll(users =>{
    const userFound = users.find(user => user.id === userId);
    callback(userFound)
  })
 }
}