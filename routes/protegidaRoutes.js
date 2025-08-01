// Ruta protegida para múltiples roles
const express = require('express');
const router = express.Router();
const { verificarToken, permitirRoles } = require('../middleware/authMiddleware');

router.get(
  '/',
  verificarToken,
  permitirRoles('admin', 'rrhh', 'ventas', 'soporte', 'marketing'),
  (req, res) => {
    res.json({
      mensaje: 'Acceso permitido a ruta protegida por rol ✅',
      usuario: req.usuario
    });
  }
);

module.exports = router;
