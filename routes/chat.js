const express = require('express');
const router  = express.Router();
const { verificarToken } = require('../middleware/authMiddleware');
const { enviarMensaje }  = require('../controllers/chatController');

router.post('/message', verificarToken, enviarMensaje);

module.exports = router;
