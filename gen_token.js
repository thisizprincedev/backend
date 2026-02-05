const jwt = require('jsonwebtoken');
require('dotenv').config();

const secret = process.env.JWT_SECRET;
const payload = {
    id: '12',
    email: 'testuser@example.com',
    role: 'admin'
};

const token = jwt.sign(payload, secret);
console.log(token);
