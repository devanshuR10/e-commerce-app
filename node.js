require('dotenv').config();
const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const hostRouter = require('./routes/host');
const userRouter = require('./routes/user');
const session = require('express-session');

app.use(session({
  // ✅ FIX: use env variable for secret
  secret: process.env.SESSION_SECRET || 'fallback-secret',
  resave: false,
  saveUninitialized: false
}));

app.set('view engine', 'ejs');
app.set('views', './views');

app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use((req, res, next) => {
  console.log(`${req.method} request for '${req.url}'`);
  next();
});

app.use(hostRouter);
app.use(userRouter);

app.use((req, res, next) => {
  res.status(404).render('404.ejs');
});

const PORT = process.env.PORT || 3000;

// ✅ FIX: listen on 0.0.0.0 so Railway can reach the app
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});