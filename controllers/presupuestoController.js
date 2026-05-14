const Presupuesto = require('../models/Presupuesto');
const Venta       = require('../models/Venta');
const Factura     = require('../models/Factura');
const Contador    = require('../models/Contador');
const Empresa     = require('../models/Empresa');
const PDFDocument = require('pdfkit');
const https = require('https');
const http  = require('http');

const fetchImageBuffer = (url) => new Promise((resolve, reject) => {
  const client = url.startsWith('https') ? https : http;
  client.get(url, (res) => {
    const chunks = [];
    res.on('data', chunk => chunks.push(chunk));
    res.on('end', () => resolve(Buffer.concat(chunks)));
    res.on('error', reject);
  }).on('error', reject);
});

const obtenerPresupuestos = async (req, res) => {
  try {
    const presupuestos = await Presupuesto.find({ empresaId: req.empresaId })
      .populate('cliente', 'nombre razonSocial email')
      .sort({ createdAt: -1 });

    // Enriquecer con seguimiento: venta y factura vinculadas
    const ids      = presupuestos.map(p => p._id);
    const ventas   = await Venta.find({ empresaId: req.empresaId, presupuesto: { $in: ids } })
      .select('numero estado presupuesto');
    const ventaMap = {};
    ventas.forEach(v => { ventaMap[v.presupuesto.toString()] = v; });

    const ventaIds    = ventas.map(v => v._id);
    const facturas    = await Factura.find({ empresaId: req.empresaId, venta: { $in: ventaIds } })
      .select('numero tipo estado venta');
    const facturaMap  = {};
    facturas.forEach(f => { facturaMap[f.venta.toString()] = f; });

    const resultado = presupuestos.map(p => {
      const obj   = p.toObject();
      const venta = ventaMap[p._id.toString()];
      obj.seguimiento = {
        venta:   venta
          ? { _id: venta._id, numero: venta.numero, estado: venta.estado }
          : null,
        factura: venta && facturaMap[venta._id.toString()]
          ? (() => {
              const f = facturaMap[venta._id.toString()];
              return { _id: f._id, numero: f.numero, tipo: f.tipo, estado: f.estado };
            })()
          : null,
      };
      return obj;
    });

    res.json(resultado);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener presupuestos', error: error.message });
  }
};

const obtenerPresupuesto = async (req, res) => {
  try {
    const presupuesto = await Presupuesto.findOne({ _id: req.params.id, empresaId: req.empresaId })
      .populate('cliente', 'nombre razonSocial email cuit direccion')
      .populate('creadoPor', 'nombre');
    if (!presupuesto) return res.status(404).json({ mensaje: 'Presupuesto no encontrado' });
    res.json(presupuesto);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener presupuesto', error: error.message });
  }
};

const crearPresupuesto = async (req, res) => {
  try {
    const { cliente, productos, notas, estado = 'borrador', validezDias = 30, descuento = 0, iva: ivaPct = 0 } = req.body;

    // iva en req.body es el porcentaje (ej: 16), calculamos el monto
    const subtotal = parseFloat(productos.reduce((s, p) => s + (p.subtotal ?? p.precio * p.cantidad), 0).toFixed(2));
    const ivaCalc  = parseFloat((subtotal * (ivaPct / 100)).toFixed(2));
    const total    = parseFloat((subtotal - descuento + ivaCalc).toFixed(2));
    const vencimiento = new Date();
    vencimiento.setDate(vencimiento.getDate() + validezDias);

    const numero = await Contador.siguiente(req.empresaId, 'presupuesto');

    const presupuesto = new Presupuesto({
      empresaId: req.empresaId,
      numero,
      cliente,
      creadoPor: req.usuario?.id,
      productos,
      subtotal,
      descuento,
      iva: ivaCalc,
      ivaPct,
      total,
      validezDias,
      vencimiento,
      estado,
      notas
    });

    const guardado = await presupuesto.save();
    res.status(201).json(guardado);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al crear presupuesto', error: error.message });
  }
};

const actualizarPresupuesto = async (req, res) => {
  try {
    const presupuesto = await Presupuesto.findOne({ _id: req.params.id, empresaId: req.empresaId });
    if (!presupuesto) return res.status(404).json({ mensaje: 'Presupuesto no encontrado' });

    let updates;
    if (presupuesto.estado === 'borrador') {
      // Borrador: recalcular montos igual que en creación
      const { cliente, productos, notas, estado, validezDias = 30, descuento = 0, iva: ivaPct = 0 } = req.body;
      const subtotal = parseFloat(productos.reduce((s, p) => s + (p.subtotal ?? p.precio * p.cantidad), 0).toFixed(2));
      const ivaCalc  = parseFloat((subtotal * (ivaPct / 100)).toFixed(2));
      const total    = parseFloat((subtotal - descuento + ivaCalc).toFixed(2));
      updates = { cliente, productos, subtotal, descuento, iva: ivaCalc, ivaPct, total, validezDias, notas, estado };
    } else {
      // Emitido: solo estado y notas son modificables
      const { estado, notas } = req.body;
      updates = {};
      if (estado)              updates.estado = estado;
      if (notas !== undefined) updates.notas  = notas;
    }

    const actualizado = await Presupuesto.findOneAndUpdate(
      { _id: req.params.id, empresaId: req.empresaId },
      updates,
      { new: true, runValidators: true }
    );
    res.json(actualizado);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al actualizar presupuesto', error: error.message });
  }
};

const eliminarPresupuesto = async (req, res) => {
  try {
    const presupuesto = await Presupuesto.findOne({ _id: req.params.id, empresaId: req.empresaId });
    if (!presupuesto) return res.status(404).json({ mensaje: 'Presupuesto no encontrado' });

    if (presupuesto.estado !== 'borrador') {
      return res.status(400).json({ mensaje: 'Solo se pueden eliminar presupuestos en borrador. Los presupuestos emitidos quedan registrados permanentemente.' });
    }

    await presupuesto.deleteOne();
    res.json({ mensaje: 'Presupuesto eliminado' });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al eliminar presupuesto', error: error.message });
  }
};

const descargarPDF = async (req, res) => {
  try {
    const presupuesto = await Presupuesto.findOne({ _id: req.params.id, empresaId: req.empresaId })
      .populate('cliente', 'nombre razonSocial cuit direccion email')
      .populate('creadoPor', 'nombre');
    if (!presupuesto) return res.status(404).json({ mensaje: 'Presupuesto no encontrado' });

    const empresa   = await Empresa.findById(req.empresaId);
    const formatter = new Intl.NumberFormat('es-AR', { style: 'currency', currency: empresa?.configuracion?.moneda || 'ARS' });

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=presupuesto-${presupuesto.numero}.pdf`);
    doc.pipe(res);

    // Cabecera
    if (empresa?.logoUrl) {
      try {
        const logoBuffer = await fetchImageBuffer(empresa.logoUrl);
        doc.image(logoBuffer, 50, 45, { width: 100 });
      } catch { /* logo no disponible, continuar sin él */ }
    }
    doc.fontSize(20).font('Helvetica-Bold').text('PRESUPUESTO', 0, 50, { align: 'right' });
    doc.fontSize(10).font('Helvetica').text(`Nº ${String(presupuesto.numero).padStart(5, '0')}`, { align: 'right' });
    doc.text(`Fecha: ${presupuesto.createdAt.toLocaleDateString('es-AR')}`, { align: 'right' });
    if (presupuesto.vencimiento) {
      doc.text(`Válido hasta: ${presupuesto.vencimiento.toLocaleDateString('es-AR')}`, { align: 'right' });
    }
    doc.moveDown(2);

    // Datos empresa
    if (empresa) {
      doc.fontSize(12).font('Helvetica-Bold').text(empresa.nombre);
      doc.fontSize(9).font('Helvetica');
      if (empresa.razonSocial) doc.text(empresa.razonSocial);
      if (empresa.cuit)        doc.text(`CUIT: ${empresa.cuit}`);
      if (empresa.direccion)   doc.text(empresa.direccion);
      if (empresa.email)       doc.text(empresa.email);
    }
    doc.moveDown();

    // Datos cliente
    if (presupuesto.cliente) {
      const c = presupuesto.cliente;
      doc.fontSize(10).font('Helvetica-Bold').text('CLIENTE:');
      doc.font('Helvetica').text(c.nombre || c.razonSocial || '');
      if (c.razonSocial && c.nombre !== c.razonSocial) doc.text(c.razonSocial);
      if (c.cuit)      doc.text(`CUIT: ${c.cuit}`);
      if (c.direccion) doc.text(c.direccion);
      if (c.email)     doc.text(c.email);
    }
    doc.moveDown();

    // Tabla de productos
    const tableTop = doc.y;
    const cols = { nombre: 50, cant: 320, precio: 370, desc: 420, subtotal: 470 };
    doc.font('Helvetica-Bold').fontSize(9);
    doc.text('Descripción',     cols.nombre,   tableTop);
    doc.text('Cant.',           cols.cant,     tableTop, { width: 40, align: 'right' });
    doc.text('P. Unit.',        cols.precio,   tableTop, { width: 45, align: 'right' });
    doc.text('Dto %',           cols.desc,     tableTop, { width: 40, align: 'right' });
    doc.text('Subtotal',        cols.subtotal, tableTop, { width: 70, align: 'right' });
    doc.moveTo(50, doc.y + 3).lineTo(545, doc.y + 3).stroke();
    doc.moveDown(0.5);

    doc.font('Helvetica').fontSize(9);
    for (const item of presupuesto.productos) {
      const y = doc.y;
      doc.text(item.nombre,                      cols.nombre,   y, { width: 255 });
      doc.text(String(item.cantidad),            cols.cant,     y, { width: 40,  align: 'right' });
      doc.text(formatter.format(item.precio),    cols.precio,   y, { width: 45,  align: 'right' });
      doc.text(`${item.descuento || 0}%`,        cols.desc,     y, { width: 40,  align: 'right' });
      doc.text(formatter.format(item.subtotal),  cols.subtotal, y, { width: 70,  align: 'right' });
      doc.moveDown(0.8);
    }

    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);

    // Totales
    const totX = 380;
    doc.font('Helvetica').fontSize(10);
    doc.text('Subtotal:',  totX, doc.y, { width: 100 });
    doc.text(formatter.format(presupuesto.subtotal), totX + 105, doc.y - doc.currentLineHeight(), { width: 65, align: 'right' });
    if (presupuesto.descuento > 0) {
      doc.moveDown(0.5);
      doc.text('Descuento:', totX);
      doc.text(`-${formatter.format(presupuesto.descuento)}`, totX + 105, doc.y - doc.currentLineHeight(), { width: 65, align: 'right' });
    }
    if (presupuesto.iva > 0) {
      doc.moveDown(0.5);
      const ivaPctLabel = presupuesto.ivaPct || (presupuesto.subtotal > 0
        ? parseFloat(((presupuesto.iva / presupuesto.subtotal) * 100).toFixed(1))
        : 0);
      doc.text(`IVA (${ivaPctLabel}%):`, totX);
      doc.text(formatter.format(presupuesto.iva), totX + 105, doc.y - doc.currentLineHeight(), { width: 65, align: 'right' });
    }
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(12);
    doc.text('TOTAL:', totX);
    doc.text(formatter.format(presupuesto.total), totX + 105, doc.y - doc.currentLineHeight(), { width: 65, align: 'right' });

    doc.moveDown(2);
    doc.font('Helvetica').fontSize(8).fillColor('#888888').text(
      `Este presupuesto tiene validez de ${presupuesto.validezDias} días desde la fecha de emisión.`,
      { align: 'center' }
    );
    if (presupuesto.notas) {
      doc.moveDown().text(`Notas: ${presupuesto.notas}`, { align: 'left' });
    }

    doc.end();
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al generar PDF', error: error.message });
  }
};

module.exports = {
  obtenerPresupuestos,
  obtenerPresupuesto,
  crearPresupuesto,
  actualizarPresupuesto,
  eliminarPresupuesto,
  descargarPDF
};
