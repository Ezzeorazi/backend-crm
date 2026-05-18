const express = require('express');
const router  = express.Router();
const { verificarToken } = require('../middleware/authMiddleware');
const { enviarMensaje, organizarExcel }  = require('../controllers/chatController');

router.post('/message', verificarToken, enviarMensaje);
router.post('/organizar-excel', verificarToken, organizarExcel);

module.exports = router;
