const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const userRoutes = require('./routes/user-routes');
const chatgptRoutes = require('./routes/chatgpt-routes');
const diaryRoutes = require('./routes/diary-routes.js');
const userSimulatorRoutes = require('./routes/user-simulator-routes.js');
const HttpError = require('./models/http-error');
const bodyParse = require('body-parser');
const app = express();

require('dotenv').config()

const corsOptions = {
  origin: 'http://localhost:3000/',
  optionsSuccessStatus: 200 // some legacy browsers (IE11, various SmartTVs) choke on 204
}

app.use(cors());

app.use(bodyParse.json());

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization'
  );
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE');
  res.header('Access-Control-Expose-Headers', 'Authorization');
  next();
});

app.use('/api/users', userRoutes);

app.use('/api/chatgpt', chatgptRoutes);

app.use('/api/diary', diaryRoutes);

app.use('/api/user-simulator', userSimulatorRoutes);

app.use((req, res, next) => {
  const error = new HttpError('Could not find this route.', 404);
  throw error;
});

app.use((error, req, res, next) => {
  if (res.headerSent) {
    return next(error);
  }
  res.status(error.code || 500);
  res.json({
    message: error.message || 'An unknown error occurred!',
    code: error.code,
    data: error.data
  });
});

mongoose
  .connect(process.env.MONGODB_ICLAB_CONNECTION)
  .then(() => {
    app.listen(process.env.PORT || 8000);
  })
  .catch(err => {
    console.log(err);
  });