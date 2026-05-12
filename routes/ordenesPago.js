const express = require('express');
const router  = express.Router();
const { verificarToken, permitirRoles } = require('../middleware/authMiddleware');
const { obtenerOrdenesPago, obtenerOrdenPago, actualizarOrdenPago } = require('../controllers/ordenPagoController');

router.get('/',      verificarToken, obtenerOrdenesPago);
router.get('/:id',   verificarToken, obtenerOrdenPago);
router.put('/:id',   verificarToken, permitirRoles('admin', 'compras'), actualizarOrdenPago);

module.exports = router;
