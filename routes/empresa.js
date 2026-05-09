const express = require('express');
const router = express.Router();
const { subirLogo, uploadLogo, obtenerEmpresa, actualizarEmpresa } = require('../controllers/empresaController');
const { verificarToken, permitirRoles } = require('../middleware/authMiddleware');

router.get('/', verificarToken, obtenerEmpresa);
router.put('/', verificarToken, permitirRoles('admin'), actualizarEmpresa);
router.post('/logo', verificarToken, permitirRoles('admin'), uploadLogo.single('logo'), subirLogo);

module.exports = router;
