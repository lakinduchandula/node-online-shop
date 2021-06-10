const path = require("path");
const fs = require("fs");
const https = require("https");

// 3rd party libraries
const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const MongoDBStore = require("connect-mongodb-session")(session); // pass the argument to fucntion
const csrf = require("csurf");
const flash = require("connect-flash");
const multer = require("multer");
const { nanoid } = require("nanoid");
const { v4: uuidv4 } = require("uuid");
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");

// custom (my own) libraries
const adminRoutes = require("./routes/admin");
const shopRoutes = require("./routes/shop");
const authRoutes = require("./routes/auth");

const User = require("./models/user");

// constants username: , password:
const MONGODB_URI = `mongodb+srv://${process.env.MONGO_USER}:${process.env.MONGO_PASSWORD}@cluster0.fjhfb.mongodb.net/${process.env.MONGO_DEFAULT_DATABASE} `;

// import controllers
const errorController = require("./controllers/error");

const app = express(); // this express will handle almost very thing in behind the scenes
const store = new MongoDBStore({
  uri: MONGODB_URI, // uri mongodb
  collection: "sessions", // which collection to store sessions
});

// let uuid = uuidv4();
// console.log('uuid ==> ',uuid);
// console.log('nanoid ==> ',nanoid(10));

const fileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "images");
  },
  filename: (req, file, cb) => {
    cb(null, nanoid(10) + "-" + uuidv4() + "-" + file.originalname);
  },
});

const fileFilter = (req, file, cb) => {
  if (
    file.mimetype === "image/png" ||
    file.mimetype === "image/jpg" ||
    file.mimetype === "image/jpeg"
  ) {
    cb(null, true);
  } else {
    cb(null, false);
  }
};
console.log(process.env.NODE_ENV);
// initialize cross-site-register-forgery Protectoin String
const csrfProtection = csrf();

const privateKey = fs.readFileSync("server.key");
const certificate = fs.readFileSync("server.cert");

const accessLogSteam = fs.createWriteStream(
  path.join(__dirname, "access.log"),
  { flags: "a" }
);

app.use(helmet());
app.use(compression());
app.use(morgan("combined", { stream: accessLogSteam }));

// dest: './images'
app.use(
  multer({ storage: fileStorage, fileFilter: fileFilter }).single("image")
);

// flash register so we can use it on evey request accross the all files
app.use(flash()); // call it as a function

// this middleware function will give the access to the user to read our file system in public folder
app.use(express.static(path.join(__dirname, "public")));
app.use("/images", express.static(path.join(__dirname, "images")));

app.set("view engine", "ejs"); // this will setup ejs as the template engine

// this will setup where temp file in,
//if temp file are is some where besides views folder second argument should replace by that folder name
app.set("views", "views");

app.use(
  express.urlencoded({
    // this will help to catch the body in express package
    extended: true,
  })
);

// session middleware
app.use(
  session({
    secret: "long-string-in-prodction-level!", // this will normaly a long string
    resave: false, // not save for every incoming req or res that we send, unless content is not changed
    saveUninitialized: false, // this will also basically give the same meaning as resave
    store: store, // MongoDBStore variable (store)
  })
);

app.use(csrfProtection); // add csrf(); to middleware chain

// this is the ideal place to place the csrfprotection and isLoggedIn middelware
// before the routes and after the user authentication
app.use((req, res, next) => {
  res.locals.csrfToken = req.csrfToken();
  res.locals.isAuthenticated = req.session.isLoggedIn;
  next();
});

app.use((req, res, next) => {
  // throw new Error("This will detect by express because this throw is out side of promise in then or catch block");
  if (!req.session.user) {
    // check the session for perticular user
    return next();
  }
  User.findById(req.session.user._id)
    .then(user => {
      // if user was deleted in between session and store user to req this if will save from such senario
      if (!user) {
        return next();
      }
      req.user = user; // add the user to request so we can access it any where
      next();
    })
    .catch(err => {
      // throw new Error(err); This will *** NOT DETECT *** by express because this throw is IN side of catch block
      next(new Error(err)); // this will detect as a error and it will thow and handdle by middelware in line 106
    });
});

app.use("/admin", adminRoutes); // handling all admin routes
app.use(shopRoutes); // handling all shop routes
app.use(authRoutes); // handling all auth routes

app.get("/500", errorController.get500);

app.use(errorController.get404);

// this is a special kind of middelware this has 4 arguments
// this will only run when we next(error) <= if this call in
// somewhere it means that route will skip all the middlewhere
// and reach this special middlewhere
app.use((error, req, res, next) => {
  // res.status(error.httpStatusCode).render(...);
  console.log(error);
  res.status(500).render("500", {
    pageTitle: "Error!",
    path: "/500",
    isAuthenticated: true,
  });
});

mongoose
  .connect(
    MONGODB_URI, // srv string to connect mongodb atlas
    { useNewUrlParser: true, useUnifiedTopology: true }
  )
  .then(response => {
    // mongodb connected msg
    console.log("Connected to Mongodb Atlas!");
    // setup the server to listen on port 3000
    // https
    //   .createServer({ key: privateKey, cert: certificate }, app)
    //   .listen(process.env.PORT || 3000);
    app.listen(process.env.PORT || 3000);
  })
  .catch(err => {
    console.log(err);
  });
