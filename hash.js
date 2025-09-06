// In restaurant-backend folder, create hash.js
const bcrypt = require('bcrypt');
bcrypt.hash('Lahore@#$090', 10).then(hash => console.log(hash));