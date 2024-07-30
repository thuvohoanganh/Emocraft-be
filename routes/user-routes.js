const express = require('express');
const router = express.Router();
const { check } = require('express-validator');
const userController = require('../controllers/user-controllers');
const { signup, login, getUser } = userController;
const { checkAuthUser } = require('../middleware/check-auth');

router.post('/signup',
    [
        check('name')
            .not()
            .isEmpty()
            .withMessage('Name is required.'),
        check('gender')
            .isIn(['male', 'female', 'other'])
            .withMessage('Gender must be one of male, female, or other.')
    ],
    signup);

router.post('/login', login);

router.get('/:uid', checkAuthUser, getUser);

module.exports = router;