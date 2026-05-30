require('dotenv').config();
const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const hostRouter = require('./routes/host');
const userRouter = require('./routes/user');

const session = require('express-session');


app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: false
}));





app.set('view engine', 'ejs');
app.set('views', './views');

//for static files
app.use(express.static('public'));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
//middelware to log all requests
app.use((req, res, next) => {
  console.log(`${req.method} request for '${req.url}'`);
  next();
});

//for host
app.use(hostRouter);
//for user
app.use(userRouter);



//for error 404
app.use((req, res,next) => {
     res.status(404).render('404.ejs')

});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server on port ${PORT}`));