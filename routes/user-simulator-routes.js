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

router.post('/write-diary', [
    check('userid')
        .not()
        .isEmpty()
], writeDiary);

module.exports = router;