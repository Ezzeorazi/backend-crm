const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middleware/authMiddleware');
const Cliente = require('../models/Cliente');
const Product = require('../models/Product');
const Venta = require('../models/Venta');

router.get('/', verificarToken, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) {
      return res.json({ clientes: [], productos: [], ventas: [] });
    }

    const regex = new RegExp(q, 'i');
    const empresaId = req.empresaId;

    // Ejecutamos las busquedas en paralelo
    const [clientes, productos, ventas] = await Promise.all([
      Cliente.find({
        empresaId,
        $or: [{ nombre: regex }, { razonSocial: regex }, { email: regex }]
      }).limit(5).select('nombre razonSocial email'),

      Product.find({
        empresaId,
        $or: [{ nombre: regex }, { codigo: regex }]
      }).limit(5).select('nombre codigo precio'),

      // Para las ventas podemos buscar por número si se guarda, o hacemos un match con el cliente
      Venta.find({
        empresaId
      }).populate({
        path: 'cliente',
        match: { $or: [{ nombre: regex }, { razonSocial: regex }] },
        select: 'nombre razonSocial'
      }).limit(20) // Buscamos más y filtramos en JS porque populate match no filtra el root document si no hace match
    ]);

    // Filtrar ventas donde el cliente hizo match
    const ventasFiltradas = ventas.filter(v => v.cliente).slice(0, 5).map(v => ({
      _id: v._id,
      total: v.total,
      estado: v.estado,
      createdAt: v.createdAt,
      cliente: v.cliente
    }));

    res.json({
      clientes,
      productos,
      ventas: ventasFiltradas
    });

  } catch (error) {
    console.error('Error en búsqueda global:', error);
    res.status(500).json({ mensaje: 'Error al realizar la búsqueda', error: error.message });
  }
});

module.exports = router;
