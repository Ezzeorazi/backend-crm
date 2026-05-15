const Contacto = require('../models/Contacto');

const obtenerProveedores = async (req, res) => {
  try {
    const proveedores = await Contacto.find({ empresaId: req.empresaId, tipo: 'proveedor' }).sort({ createdAt: -1 });
    res.json(proveedores);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener proveedores', error: error.message });
  }
};

const crearProveedor = async (req, res) => {
  try {
    const tipo = req.body.tipo || ['proveedor'];
    const proveedor = new Contacto({ ...req.body, tipo, empresaId: req.empresaId });
    const guardado = await proveedor.save();
    res.status(201).json(guardado);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al crear proveedor', error: error.message });
  }
};

const obtenerProveedor = async (req, res) => {
  try {
    const proveedor = await Contacto.findOne({ _id: req.params.id, empresaId: req.empresaId, tipo: 'proveedor' });
    if (!proveedor) return res.status(404).json({ mensaje: 'Proveedor no encontrado' });
    res.json(proveedor);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener proveedor', error: error.message });
  }
};

const actualizarProveedor = async (req, res) => {
  try {
    const actualizado = await Contacto.findOneAndUpdate(
      { _id: req.params.id, empresaId: req.empresaId, tipo: 'proveedor' },
      req.body,
      { new: true, runValidators: true }
    );
    if (!actualizado) return res.status(404).json({ mensaje: 'Proveedor no encontrado' });
    res.json(actualizado);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al actualizar proveedor', error: error.message });
  }
};

const eliminarProveedor = async (req, res) => {
  try {
    const eliminado = await Contacto.findOneAndDelete({ _id: req.params.id, empresaId: req.empresaId, tipo: 'proveedor' });
    if (!eliminado) return res.status(404).json({ mensaje: 'Proveedor no encontrado' });
    res.json({ mensaje: 'Proveedor eliminado' });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al eliminar proveedor', error: error.message });
  }
};

const importarProveedores = async (req, res) => {
  try {
    const filas = req.body;
    if (!Array.isArray(filas) || filas.length === 0) {
      return res.status(400).json({ mensaje: 'No se recibieron datos válidos' });
    }

    const docs = filas.map(f => ({
      nombre:      String(f.nombre || '').trim(),
      email:       f.email ? String(f.email).trim() : undefined,
      telefono:    f.telefono ? String(f.telefono).trim() : undefined,
      razonSocial: f.razonSocial ? String(f.razonSocial).trim() : undefined,
      cuit:        f.cuit ? String(f.cuit).trim() : undefined,
      direccion:   f.direccion ? String(f.direccion).trim() : undefined,
      ciudad:      f.ciudad ? String(f.ciudad).trim() : undefined,
      notas:       f.notas ? String(f.notas).trim() : undefined,
      tipo:        ['proveedor'],
      empresaId:   req.empresaId
    })).filter(d => d.nombre);

    const resultado = await Contacto.insertMany(docs, { ordered: false });
    res.status(201).json({ insertados: resultado.length });
  } catch (error) {
    const insertados = error.result?.nInserted ?? 0;
    res.status(207).json({ insertados, mensaje: 'Algunos registros no se importaron', error: error.message });
  }
};

module.exports = { obtenerProveedores, crearProveedor, obtenerProveedor, actualizarProveedor, eliminarProveedor, importarProveedores };
