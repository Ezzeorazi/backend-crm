const Factura  = require('../models/Factura');
const Pago     = require('../models/Pago');
const Venta    = require('../models/Venta');
const Contador = require('../models/Contador');
const Empresa  = require('../models/Empresa');
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

const obtenerFacturas = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let query = { empresaId: req.empresaId };

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const facturas = await Factura.find(query)
      .populate('cliente', 'nombre razonSocial')
      .populate('venta', 'numero total')
      .sort({ createdAt: -1 });
    res.json(facturas);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener facturas', error: error.message });
  }
};

const obtenerFactura = async (req, res) => {
  try {
    const factura = await Factura.findOne({ _id: req.params.id, empresaId: req.empresaId })
      .populate('cliente', 'nombre razonSocial email cuit direccion')
      .populate('venta');
    if (!factura) return res.status(404).json({ mensaje: 'Factura no encontrada' });
    res.json(factura);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener factura', error: error.message });
  }
};

const crearFactura = async (req, res) => {
  try {
    const { venta: ventaId, tipo = 'B', notas, vencimiento } = req.body;

    // Obtener la venta para derivar cliente y montos
    const venta = await Venta.findOne({ _id: ventaId, empresaId: req.empresaId })
      .populate('cliente', 'nombre razonSocial email cuit direccion');
    if (!venta) return res.status(404).json({ mensaje: 'Venta no encontrada' });

    const cliente = venta.cliente;

    const numero   = await Contador.siguiente(req.empresaId, 'factura');
    const subtotal = req.body.subtotal ?? venta.subtotal;
    const iva      = req.body.iva      ?? venta.iva;
    const total    = req.body.total    ?? venta.total;

    const factura = new Factura({
      empresaId: req.empresaId,
      numero,
      tipo,
      venta:     ventaId,
      cliente:   cliente._id,
      clienteSnapshot: {
        nombre:      cliente.nombre,
        razonSocial: cliente.razonSocial,
        cuit:        cliente.cuit,
        direccion:   cliente.direccion,
        email:       cliente.email
      },
      subtotal,
      descuento: req.body.descuento ?? venta.descuento ?? 0,
      iva,
      total,
      vencimiento: vencimiento || undefined,
      notas
    });

    const guardada = await factura.save();
    res.status(201).json(guardada);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al crear factura', error: error.message });
  }
};

const actualizarFactura = async (req, res) => {
  try {
    const factura = await Factura.findOne({ _id: req.params.id, empresaId: req.empresaId });
    if (!factura) return res.status(404).json({ mensaje: 'Factura no encontrada' });

    if (factura.estado === 'pagada' || factura.estado === 'anulada') {
      // Solo permite cambiar estado (para anular desde el frontend)
      const { estado } = req.body;
      if (!estado) return res.status(400).json({ mensaje: 'No se puede editar una factura pagada o anulada' });
      const actualizada = await Factura.findOneAndUpdate(
        { _id: req.params.id, empresaId: req.empresaId },
        { estado },
        { new: true }
      );
      return res.json(actualizada);
    }

    const { tipo, porcentajeIva, descuento, notas, vencimiento, estado } = req.body;
    const updates = {};

    if (estado)                updates.estado     = estado;
    if (tipo)                  updates.tipo       = tipo;
    if (notas !== undefined)   updates.notas      = notas;
    if (vencimiento)           updates.vencimiento = vencimiento;

    const subtotal = factura.subtotal;
    const newDesc  = descuento !== undefined ? parseFloat(descuento) : factura.descuento;

    if (porcentajeIva !== undefined) {
      const pct   = parseFloat(porcentajeIva);
      const iva   = parseFloat((subtotal * (pct / 100)).toFixed(2));
      const total = parseFloat((subtotal - newDesc + iva).toFixed(2));
      updates.porcentajeIva = pct;
      updates.iva           = iva;
      updates.total         = total;
      updates.descuento     = newDesc;
    } else if (descuento !== undefined) {
      const total   = parseFloat((subtotal - newDesc + factura.iva).toFixed(2));
      updates.descuento = newDesc;
      updates.total     = total;
    }

    const actualizada = await Factura.findOneAndUpdate(
      { _id: req.params.id, empresaId: req.empresaId },
      updates,
      { new: true, runValidators: true }
    );
    res.json(actualizada);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al actualizar factura', error: error.message });
  }
};

const eliminarFactura = async (req, res) => {
  try {
    const eliminada = await Factura.findOneAndDelete({ _id: req.params.id, empresaId: req.empresaId });
    if (!eliminada) return res.status(404).json({ mensaje: 'Factura no encontrada' });
    await Pago.deleteMany({ factura: eliminada._id });
    res.json({ mensaje: 'Factura eliminada' });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al eliminar factura', error: error.message });
  }
};

const descargarPDF = async (req, res) => {
  try {
    const factura = await Factura.findOne({ _id: req.params.id, empresaId: req.empresaId })
      .populate('cliente', 'nombre razonSocial cuit direccion email')
      .populate({
        path: 'venta',
        populate: {
          path: 'productos.producto',
          select: 'nombre sku'
        }
      });

    if (!factura) return res.status(404).json({ mensaje: 'Factura no encontrada' });

    const empresa   = await Empresa.findById(req.empresaId);
    const formatter = new Intl.NumberFormat('es-AR', { style: 'currency', currency: empresa?.configuracion?.moneda || 'ARS' });

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=factura-${factura.numero}.pdf`);
    doc.pipe(res);

    // Cabecera
    if (empresa?.logoUrl) {
      try {
        const logoBuffer = await fetchImageBuffer(empresa.logoUrl);
        doc.image(logoBuffer, 50, 45, { width: 100 });
      } catch { /* logo no disponible, continuar sin él */ }
    }
    
    const titulo = `FACTURA ${factura.tipo || 'C'}`;
    doc.fontSize(20).font('Helvetica-Bold').text(titulo, 0, 50, { align: 'right' });
    doc.fontSize(10).font('Helvetica').text(`Nº ${String(factura.numero).padStart(8, '0')}`, { align: 'right' });
    doc.text(`Fecha: ${factura.createdAt.toLocaleDateString('es-AR')}`, { align: 'right' });
    if (factura.vencimiento) {
      doc.text(`Vencimiento: ${factura.vencimiento.toLocaleDateString('es-AR')}`, { align: 'right' });
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
    if (factura.clienteSnapshot) {
      const c = factura.clienteSnapshot;
      doc.fontSize(10).font('Helvetica-Bold').text('CLIENTE:');
      doc.font('Helvetica').text(c.nombre || c.razonSocial || '');
      if (c.razonSocial && c.nombre !== c.razonSocial) doc.text(c.razonSocial);
      if (c.cuit)      doc.text(`CUIT: ${c.cuit}`);
      if (c.direccion) doc.text(c.direccion);
      if (c.email)     doc.text(c.email);
    }
    doc.moveDown();

    // Tabla de productos (tomada de la venta vinculada)
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
    if (factura.venta && factura.venta.productos) {
      for (const item of factura.venta.productos) {
        const y = doc.y;
        doc.text(item.nombre,                      cols.nombre,   y, { width: 255 });
        doc.text(String(item.cantidad),            cols.cant,     y, { width: 40,  align: 'right' });
        doc.text(formatter.format(item.precio),    cols.precio,   y, { width: 45,  align: 'right' });
        doc.text(`${item.descuento || 0}%`,        cols.desc,     y, { width: 40,  align: 'right' });
        doc.text(formatter.format(item.subtotal),  cols.subtotal, y, { width: 70,  align: 'right' });
        doc.moveDown(0.8);
      }
    } else {
       doc.text("Detalle de productos no disponible", cols.nombre, doc.y);
       doc.moveDown(0.8);
    }

    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);

    // Totales
    const totX = 380;
    doc.font('Helvetica').fontSize(10);
    doc.text('Subtotal:',  totX, doc.y, { width: 100 });
    doc.text(formatter.format(factura.subtotal), totX + 105, doc.y - doc.currentLineHeight(), { width: 65, align: 'right' });
    if (factura.descuento > 0) {
      doc.moveDown(0.5);
      doc.text('Descuento:', totX);
      doc.text(`-${formatter.format(factura.descuento)}`, totX + 105, doc.y - doc.currentLineHeight(), { width: 65, align: 'right' });
    }
    if (factura.iva > 0) {
      doc.moveDown(0.5);
      const ivaPctLabel = factura.porcentajeIva || (factura.subtotal > 0
        ? parseFloat(((factura.iva / factura.subtotal) * 100).toFixed(1))
        : 21);
      doc.text(`IVA (${ivaPctLabel}%):`, totX);
      doc.text(formatter.format(factura.iva), totX + 105, doc.y - doc.currentLineHeight(), { width: 65, align: 'right' });
    }
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(12);
    doc.text('TOTAL:', totX);
    doc.text(formatter.format(factura.total), totX + 105, doc.y - doc.currentLineHeight(), { width: 65, align: 'right' });

    doc.moveDown(2);
    
    // Estado de la factura
    const estadoPagada = factura.estado === 'pagada';
    doc.font('Helvetica-Bold').fontSize(14).fillColor(estadoPagada ? '#16a34a' : (factura.estado === 'anulada' ? '#dc2626' : '#ea580c')).text(
      estadoPagada ? 'FACTURA PAGADA' : (factura.estado === 'anulada' ? 'FACTURA ANULADA' : 'FACTURA PENDIENTE DE PAGO'),
      { align: 'center' }
    );

    if (factura.notas) {
      doc.moveDown().font('Helvetica').fontSize(8).fillColor('#000000').text(`Notas: ${factura.notas}`, { align: 'left' });
    }

    doc.end();
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al generar PDF', error: error.message });
  }
};

module.exports = { obtenerFacturas, obtenerFactura, crearFactura, actualizarFactura, eliminarFactura, descargarPDF };
