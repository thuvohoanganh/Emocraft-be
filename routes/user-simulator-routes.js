const express = require('express');
const router = express.Router();
const userSimulatorController = require('../controllers/simulator-controllers');
const { userSimulatorResponse, writeDiary } = userSimulatorController;
const { check } = require('express-validator');

router.post('/response', [
    check('diary')
        .not()
        .isEmpty(),
    check('dialog')
        .not()
        .isEmpty(),
], userSimulatorResponse);

router.get('/write-diary', writeDiary);

module.exports = router;