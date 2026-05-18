const express = require('express');
const router = express.Router();
const { subirLogo, uploadLogo, obtenerEmpresa, actualizarEmpresa } = require('../controllers/empresaController');
const { verificarToken, permitirRoles } = require('../middleware/authMiddleware');
const { reclamarRecompensaOnboarding } = require('../controllers/empresaController');

router.get('/', verificarToken, obtenerEmpresa);
router.put('/', verificarToken, permitirRoles('admin'), actualizarEmpresa);
router.post('/logo', verificarToken, permitirRoles('admin'), uploadLogo.single('logo'), subirLogo);
router.post('/onboarding-recompensa', verificarToken, permitirRoles('admin'), reclamarRecompensaOnboarding);

module.exports = router;
