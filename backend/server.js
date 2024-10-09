const express = require("express");
const cors = require("cors");
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

global.__basedir = __dirname;

const boxConfigPath = path.join(__dirname, 'app/config/app.config.yaml');
let boxConfig;
try {
  const fileContents = fs.readFileSync(boxConfigPath, 'utf8');
  boxConfig = yaml.load(fileContents);
} catch (e) {
  console.error(`Failed to load box configuration: ${e.message}`);
}

const static_path = __dirname + '/app/views/';

const app = express();

app.use(express.static(static_path));

var corsOptions = {
  origin: boxConfig.boxvault.origin
};

app.use(cors(corsOptions));

// parse requests of content-type - application/json
app.use(express.json());

// parse requests of content-type - application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: true }));

// database
const db = require("./app/models");
const Role = db.role;

db.sequelize.sync();
// force: true will drop the table if it already exists
// db.sequelize.sync({force: true}).then(() => {
//   console.log('Drop and Resync Database with { force: true }');
//   initial();
// });

// simple route
app.get("/", (req, res) => {
  res.json({ message: "Welcome to BoxVault API" });
});
//app.get('/', function (req,res) {
//  res.sendFile(path + "index.html");
//});

// routes
require('./app/routes/auth.routes')(app);
require('./app/routes/config.routes')(app);
require('./app/routes/user.routes')(app);
require('./app/routes/box.routes')(app);
require('./app/routes/file.routes')(app);
require('./app/routes/version.routes')(app);
require('./app/routes/organization.routes')(app);
require('./app/routes/provider.routes')(app);
require('./app/routes/architecture.routes')(app);

// set port, listen for requests
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}.`);
});

function initial() {
  Role.create({
    id: 1,
    name: "user"
  });
 
  Role.create({
    id: 2,
    name: "moderator"
  });
 
  Role.create({
    id: 3,
    name: "admin"
  });
}
