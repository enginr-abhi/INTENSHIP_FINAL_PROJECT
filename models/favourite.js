const fs = require('fs');
const path = require('path');

const rootDir = require('../utils/pathUtil');
const favouriteDataPath = path.join(rootDir, 'data', 'favourite.json');

module.exports = class Favourite {

static addToFavourite(userId, callback){
  Favourite.getFavourites((favourites) => {
      if(favourites.includes(userId)){
        console.log('user is already marked favourite');
        callback('user is already marked favourite')
      }
      else{
       favourites.push(this);
      fs.writeFile(favouriteDataPath, JSON.stringify(favourites), callback);
      }
      })
    };

static getFavourites(callback){
  fs.readFile(favouriteDataPath, (err, data) => {
        console.log("File read:", err, data);
        if (err) {
          return callback([]);
        }
        const json = data.toString().trim();
  
        if (!json) {
          // empty file fix
          return callback([]);
        }
        try {
          const users = JSON.parse(json);
          callback(users);
        } catch (e) {
          console.log("JSON corrupted → resetting file");
          fs.writeFileSync(favouriteDataPath, "[]");
          callback([]);
        }
      });
}
}
  

