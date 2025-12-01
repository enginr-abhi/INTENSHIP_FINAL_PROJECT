const express = require('express');
const app = express();
const path = require('path');
const rootDir = require('./utils/pathUtil');
const PORT = 9000;

const { signupRouter } = require('./routes/signupRouter');
const { loginRouter } = require('./routes/loginRouter');
const { get404 } = require('./controllers/error');

// Set EJS
app.set('view engine', 'ejs');
app.set('views', 'views');

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routers
app.use(signupRouter);// /signup
app.use("/host", loginRouter);// /host/login etc.


// Static files
app.use(express.static(path.join(rootDir, 'public')));

// 404 Page
app.use(get404)

app.listen(PORT, () => {
  console.log(`server is running at http://localhost:${PORT}`);
})