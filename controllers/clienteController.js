const Contacto = require('../models/Contacto');

const obtenerClientes = async (req, res) => {
  try {
    const clientes = await Contacto.find({ empresaId: req.empresaId, tipo: 'cliente' }).sort({ createdAt: -1 });
    res.json(clientes);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener clientes', error: error.message });
  }
};

const crearCliente = async (req, res) => {
  try {
    // si el frontend no envía tipo, lo asignamos aquí
    const tipo = req.body.tipo || ['cliente'];
    const cliente = new Contacto({ ...req.body, tipo, empresaId: req.empresaId });
    const guardado = await cliente.save();
    res.status(201).json(guardado);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al crear cliente', error: error.message });
  }
};

const obtenerCliente = async (req, res) => {
  try {
    const cliente = await Contacto.findOne({ _id: req.params.id, empresaId: req.empresaId, tipo: 'cliente' });
    if (!cliente) return res.status(404).json({ mensaje: 'Cliente no encontrado' });
    res.json(cliente);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener cliente', error: error.message });
  }
};

const actualizarCliente = async (req, res) => {
  try {
    const actualizado = await Contacto.findOneAndUpdate(
      { _id: req.params.id, empresaId: req.empresaId, tipo: 'cliente' },
      req.body,
      { new: true, runValidators: true }
    );
    if (!actualizado) return res.status(404).json({ mensaje: 'Cliente no encontrado' });
    res.json(actualizado);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al actualizar cliente', error: error.message });
  }
};

const eliminarCliente = async (req, res) => {
  try {
    const eliminado = await Contacto.findOneAndDelete({ _id: req.params.id, empresaId: req.empresaId, tipo: 'cliente' });
    if (!eliminado) return res.status(404).json({ mensaje: 'Cliente no encontrado' });
    res.json({ mensaje: 'Cliente eliminado' });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al eliminar cliente', error: error.message });
  }
};

const importarClientes = async (req, res) => {
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
      provincia:   f.provincia ? String(f.provincia).trim() : undefined,
      notas:       f.notas ? String(f.notas).trim() : undefined,
      tipo:        ['cliente'],
      empresaId:   req.empresaId
    })).filter(d => d.nombre);

    const resultado = await Contacto.insertMany(docs, { ordered: false });
    res.status(201).json({ insertados: resultado.length });
  } catch (error) {
    const insertados = error.result?.nInserted ?? 0;
    res.status(207).json({ insertados, mensaje: 'Algunos registros no se importaron (duplicados u errores)', error: error.message });
  }
};

module.exports = { obtenerClientes, crearCliente, obtenerCliente, actualizarCliente, eliminarCliente, importarClientes };
