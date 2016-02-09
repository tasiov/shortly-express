var express = require('express');
var util = require('./lib/utility');
var partials = require('express-partials');
var bodyParser = require('body-parser');
var bcrypt = require('bcrypt-nodejs');
var session = require('client-sessions');



var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');

var app = express();

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(partials());
// Parse JSON (uniform resource locators)
app.use(bodyParser.json());
// Parse forms (signup/login)
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/public'));
app.use(session({
  cookieName: 'session',
  secret: bcrypt.genSaltSync(10),
  duration: 30 * 60 * 1000,
  activeDuration: 5 * 60 * 1000,
}));

app.post('/login', function(req, res) {
  var formData = req.body;

  console.log('formdata: ' + JSON.stringify(formData));
  new User({username: formData.username}).fetch().then(function(found) {
    if (found) {
      console.log('found user:', JSON.stringify(found.attributes));
      var existingPassword = found.attributes.password;
      var salt = found.attributes.salt;
      var hash = bcrypt.hashSync(formData.password, salt);

      if (existingPassword === hash) {
        req.session.username = formData.username;
        console.log('session username = ' + req.session.username);
        res.redirect('/');
      } else {
        res.redirect('/login');
      }
    } else { 
      console.log('user not found');
      res.redirect('/login');
    }
  });
});

app.get('/login', function(req, res) {
  isLoggedIn(req, res, function (isLogged) {
    if (isLogged) {
      res.redirect('/');
    } else {
      res.render('login');
    }
  });
});

app.post('/signup', function(req, res) {
  var userData = req.body;
  Users.create(userData)
  .then(function(result) {
    req.session.username = userData.username;
    res.redirect('/');
  });
});

app.get('/signup', function(req, res) {
  isLoggedIn(req, res, function (isLogged) {
    if (isLogged) {
      res.redirect('/');
    } else {
      res.render('signup');
    }
  });
});

app.get('/logout', function(req, res) {
  req.session.username = '';
  res.redirect('login');
});


var isLoggedIn = function (req, res, callback) {
  if (req.session && req.session.username) {
    new User({username: req.session.username}).fetch().then(function(found) {
      callback(found);
    });
  } else {
    callback(null);
  }
};

function checkUser (req, res, next) {
  isLoggedIn (req, res, function(isLogged) {
    if (isLogged) {
      next();
    } else {
      res.redirect('/login');
    }
  });
}

app.get('/', checkUser, 
function(req, res) {
  res.render('index');
});

app.get('/create',  checkUser,
function(req, res) {
  res.render('index');
});

app.get('/links',  checkUser,
function(req, res) {
  Links.reset().fetch().then(function(links) {
    res.send(200, links.models);
  });
});

app.post('/links',  checkUser,
function(req, res) {
  var uri = req.body.url;

  if (!util.isValidUrl(uri)) {
    console.log('Not a valid url: ', uri);
    return res.send(404);
  }

  new Link({ url: uri }).fetch().then(function(found) {
    if (found) {
      res.send(200, found.attributes);
    } else {
      util.getUrlTitle(uri, function(err, title) {
        if (err) {
          console.log('Error reading URL heading: ', err);
          return res.send(404);
        }

        Links.create({
          url: uri,
          title: title,
          baseUrl: req.headers.origin
        })
        .then(function(newLink) {
          res.send(200, newLink);
        });
      });
    }
  });
});

/************************************************************/
// Write your authentication routes here
/************************************************************/


/************************************************************/
// Handle the wildcard route last - if all other routes fail
// assume the route is a short code and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

app.get('/*', function(req, res) {
  new Link({ code: req.params[0] }).fetch().then(function(link) {
    if (!link) {
      res.redirect('/');
    } else {
      var click = new Click({
        linkId: link.get('id')
      });

      click.save().then(function() {
        link.set('visits', link.get('visits') + 1);
        link.save().then(function() {
          return res.redirect(link.get('url'));
        });
      });
    }
  });
});

console.log('Shortly is listening on 4568');
app.listen(4568);
