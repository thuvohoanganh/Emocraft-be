const User = require('../models/user');
const HttpError = require('../models/http-error');
const { validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const getUser = async (req, res, next) => {
    let existingUser;
    try {
        existingUser = await User.findOne({ _id: req.params.uid }, '-password');
        if (!existingUser) next(new HttpError(
            'User does not exist',
            400
        ))

    } catch (err) {
        const error = new HttpError(
            'Fetching users failed, please try again later.',
            500
        );
        return next(error);
    }
    res.json({...existingUser._doc});
};

const signup = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return next(
            new HttpError(JSON.stringify(errors), 422)
        );
    }

    let existingUser
    try {
        existingUser = await User.findOne({ name: req.body.name }, '-password')
    } catch (err) {
        const error = new HttpError(
            'Signing up failed, please try again later.',
            500
        );
        return next(error);
    }

    if (existingUser) {
        res.status(201).json({ userId: existingUser.id });
        return
    }

    let createdUser;
    try {
        createdUser = new User({ ...req.body });
        await createdUser.save();
    } catch (err) {
        err && console.error(err);
        const error = new HttpError(
            'Signing up failed, please try again.',
            500
        );
        return next(error);
    }

    res.status(201).json({ userId: createdUser.id });
};

const login = async (req, res, next) => {
    const { name } = req.body;

    let existingUser;
    try {
        existingUser = await User.findOne({ name: name })
    } catch (err) {
        const error = new HttpError(
            'Logging in failed, please try again later - 1',
            500
        );
        return next(error);
    }

    if (!existingUser) {
        const error = new HttpError(
            'Invalid credentials, could not log you in.',
            401
        );
        return next(error);
    }

    let token = "";
    try {
        token = jwt.sign({ userId: existingUser.id, name: existingUser.name }, process.env.JWT_SECRET, { expiresIn: '8h' })
    }
    catch (err) {
        const error = new HttpError(
            'Logging in failed, please try again later. - 3',
            500
        );
        return next(error);
    }

    res.status(200).json({ userId: existingUser.id, name: existingUser.name, token });
};


module.exports = {
    signup,
    login,
    getUser,
}