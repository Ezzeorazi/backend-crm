const express = require('express');
const router = express.Router();
const Empresa = require('../models/Empresa');

const PLANES_VALIDOS = ['free', 'starter', 'pro', 'enterprise'];

const adminAuth = (req, res, next) => {
  const secret = req.headers['x-admin-secret'];
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ mensaje: 'No autorizado' });
  }
  next();
};

// GET /api/admin/empresas — lista todas las empresas con su plan y uso de Harry
router.get('/empresas', adminAuth, async (req, res) => {
  try {
    const empresas = await Empresa.find(
      {},
      'nombre email plan chatStats estado createdAt'
    ).lean();
    res.json(empresas);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener empresas', error: error.message });
  }
});

// PATCH /api/admin/empresa/:id/plan — cambia el plan de una empresa
router.patch('/empresa/:id/plan', adminAuth, async (req, res) => {
  try {
    const { plan } = req.body;
    if (!PLANES_VALIDOS.includes(plan)) {
      return res.status(400).json({
        mensaje: `Plan inválido. Opciones válidas: ${PLANES_VALIDOS.join(', ')}`
      });
    }
    const empresa = await Empresa.findByIdAndUpdate(
      req.params.id,
      { $set: { plan } },
      { new: true, select: 'nombre plan chatStats' }
    );
    if (!empresa) return res.status(404).json({ mensaje: 'Empresa no encontrada' });
    res.json({ mensaje: `Plan actualizado a "${plan}"`, empresa });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al actualizar plan', error: error.message });
  }
});

module.exports = router;
