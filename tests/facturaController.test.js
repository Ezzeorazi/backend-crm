const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../models/Factura');
jest.mock('../models/Venta');
jest.mock('../models/Pago');
jest.mock('../models/Contador');

const app      = require('../app');
const Factura  = require('../models/Factura');
const Venta    = require('../models/Venta');
const Pago     = require('../models/Pago');
const Contador = require('../models/Contador');

const JWT_SECRET = 'testsecret';
const empresaId  = 'emp1';
let tokenAdmin;
let tokenVentas;
let tokenProduccion;

function mockChain(value) {
  return {
    populate: jest.fn().mockReturnThis(),
    sort:     jest.fn().mockReturnThis(),
    lean:     jest.fn().mockReturnThis(),
    then:     (resolve, reject) => Promise.resolve(value).then(resolve, reject),
    catch:    (onReject) => Promise.resolve(value).catch(onReject),
  };
}

// Venta con cliente populado — necesaria para crearFactura
const ventaMock = {
  _id: 'v1',
  subtotal: 1000,
  iva: 210,
  total: 1210,
  descuento: 0,
  cliente: {
    _id: 'cli1',
    nombre: 'Cliente Test',
    razonSocial: 'Test SRL',
    cuit: '20-12345678-1',
    direccion: 'Av. Test 123',
    email: 'test@test.com'
  }
};

beforeAll(() => {
  process.env.JWT_SECRET = JWT_SECRET;
  tokenAdmin      = jwt.sign({ id: 'usr1', empresaId, rol: 'admin' },      JWT_SECRET);
  tokenVentas     = jwt.sign({ id: 'usr2', empresaId, rol: 'ventas' },     JWT_SECRET);
  tokenProduccion = jwt.sign({ id: 'usr3', empresaId, rol: 'produccion' }, JWT_SECRET);
});

afterEach(() => jest.clearAllMocks());

// ──────────────────────────────────────────────────────────────
// GET /api/facturas
// ──────────────────────────────────────────────────────────────
describe('GET /api/facturas — obtenerFacturas', () => {
  it('200 devuelve lista de facturas', async () => {
    const lista = [{ _id: 'f1', numero: 1, empresaId }];
    Factura.find.mockReturnValue(mockChain(lista));

    const res = await request(app)
      .get('/api/facturas')
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(res.status).toBe(200);
    expect(Factura.find).toHaveBeenCalledWith({ empresaId });
  });

  it('filtra por rango de fechas cuando se envían startDate y endDate', async () => {
    Factura.find.mockReturnValue(mockChain([]));

    await request(app)
      .get('/api/facturas?startDate=2026-01-01&endDate=2026-01-31')
      .set('Authorization', `Bearer ${tokenAdmin}`);

    const queryArg = Factura.find.mock.calls[0][0];
    expect(queryArg.createdAt.$gte).toEqual(new Date('2026-01-01'));
    expect(queryArg.createdAt.$lte).toEqual(new Date('2026-01-31'));
  });

  it('aislamiento multi-tenant: usa empresaId del token', async () => {
    Factura.find.mockReturnValue(mockChain([]));
    const tokenOtra = jwt.sign({ id: 'u', empresaId: 'otraEmpresa', rol: 'admin' }, JWT_SECRET);

    await request(app)
      .get('/api/facturas')
      .set('Authorization', `Bearer ${tokenOtra}`);

    expect(Factura.find).toHaveBeenCalledWith({ empresaId: 'otraEmpresa' });
    expect(Factura.find).not.toHaveBeenCalledWith({ empresaId });
  });

  it('401 sin token', async () => {
    const res = await request(app).get('/api/facturas');
    expect(res.status).toBe(401);
  });

  it('500 cuando la DB falla', async () => {
    Factura.find.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      sort:     jest.fn().mockRejectedValue(new Error('DB error'))
    });
    const res = await request(app)
      .get('/api/facturas')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(500);
    expect(res.body.mensaje).toMatch(/error al obtener/i);
  });
});

// ──────────────────────────────────────────────────────────────
// GET /api/facturas/:id
// ──────────────────────────────────────────────────────────────
describe('GET /api/facturas/:id — obtenerFactura', () => {
  it('200 devuelve la factura cuando existe', async () => {
    const factura = { _id: 'f1', numero: 1, empresaId };
    Factura.findOne.mockReturnValue(mockChain(factura));

    const res = await request(app)
      .get('/api/facturas/f1')
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(res.status).toBe(200);
    expect(Factura.findOne).toHaveBeenCalledWith({ _id: 'f1', empresaId });
  });

  it('404 cuando no existe', async () => {
    Factura.findOne.mockReturnValue(mockChain(null));
    const res = await request(app)
      .get('/api/facturas/noexiste')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(404);
    expect(res.body.mensaje).toMatch(/no encontrada/i);
  });
});

// ──────────────────────────────────────────────────────────────
// POST /api/facturas — crearFactura
// ──────────────────────────────────────────────────────────────
describe('POST /api/facturas — crearFactura', () => {
  function setupCrearFacturaOK() {
    Venta.findOne.mockReturnValue(mockChain(ventaMock));
    Contador.siguiente.mockResolvedValue(1);

    const facturaGuardada = { _id: 'f1', numero: 1, total: 1210, empresaId };
    Factura.mockImplementation(() => ({
      ...facturaGuardada,
      save: jest.fn().mockResolvedValue(true)
    }));
  }

  it('201 crea factura derivando datos de la venta', async () => {
    setupCrearFacturaOK();

    const res = await request(app)
      .post('/api/facturas')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ venta: 'v1' });

    expect(res.status).toBe(201);
    expect(Contador.siguiente).toHaveBeenCalledWith(empresaId, 'factura');
  });

  it('usa los montos de la venta cuando no se envían en el body', async () => {
    setupCrearFacturaOK();

    await request(app)
      .post('/api/facturas')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ venta: 'v1' });

    const facturaArgs = Factura.mock.calls[0][0];
    expect(facturaArgs.subtotal).toBe(ventaMock.subtotal);
    expect(facturaArgs.iva).toBe(ventaMock.iva);
    expect(facturaArgs.total).toBe(ventaMock.total);
  });

  it('guarda snapshot del cliente en la factura', async () => {
    setupCrearFacturaOK();

    await request(app)
      .post('/api/facturas')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ venta: 'v1' });

    const facturaArgs = Factura.mock.calls[0][0];
    expect(facturaArgs.clienteSnapshot).toMatchObject({
      nombre:      ventaMock.cliente.nombre,
      razonSocial: ventaMock.cliente.razonSocial,
      cuit:        ventaMock.cliente.cuit,
      email:       ventaMock.cliente.email
    });
  });

  it('404 cuando la venta referenciada no existe', async () => {
    Venta.findOne.mockReturnValue(mockChain(null));

    const res = await request(app)
      .post('/api/facturas')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ venta: 'ventaInexistente' });

    expect(res.status).toBe(404);
    expect(res.body.mensaje).toMatch(/venta no encontrada/i);
  });

  it('403 cuando rol produccion intenta crear', async () => {
    const res = await request(app)
      .post('/api/facturas')
      .set('Authorization', `Bearer ${tokenProduccion}`)
      .send({ venta: 'v1' });
    expect(res.status).toBe(403);
  });

  it('401 sin token', async () => {
    const res = await request(app).post('/api/facturas').send({ venta: 'v1' });
    expect(res.status).toBe(401);
  });
});

// ──────────────────────────────────────────────────────────────
// PUT /api/facturas/:id — actualizarFactura
// ──────────────────────────────────────────────────────────────
describe('PUT /api/facturas/:id — actualizarFactura', () => {
  const facturaBase = {
    _id: 'f1', empresaId, subtotal: 1000, iva: 0, descuento: 0,
    total: 1000, estado: 'pendiente'
  };

  it('200 actualiza tipo y notas en factura pendiente', async () => {
    Factura.findOne.mockResolvedValue(facturaBase);
    Factura.findOneAndUpdate.mockResolvedValue({ ...facturaBase, tipo: 'A' });

    const res = await request(app)
      .put('/api/facturas/f1')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ tipo: 'A' });

    expect(res.status).toBe(200);
  });

  it('recalcula IVA y total cuando se envía porcentajeIva', async () => {
    Factura.findOne.mockResolvedValue(facturaBase);
    Factura.findOneAndUpdate.mockResolvedValue({ ...facturaBase, iva: 210, total: 1210 });

    const res = await request(app)
      .put('/api/facturas/f1')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ porcentajeIva: 21 });

    expect(res.status).toBe(200);
    const updateArg = Factura.findOneAndUpdate.mock.calls[0][1];
    expect(updateArg.iva).toBeCloseTo(210);
    expect(updateArg.total).toBeCloseTo(1210);
  });

  it('recalcula total cuando se envía un descuento', async () => {
    Factura.findOne.mockResolvedValue(facturaBase);
    Factura.findOneAndUpdate.mockResolvedValue({ ...facturaBase, descuento: 100, total: 900 });

    await request(app)
      .put('/api/facturas/f1')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ descuento: 100 });

    const updateArg = Factura.findOneAndUpdate.mock.calls[0][1];
    expect(updateArg.descuento).toBe(100);
    expect(updateArg.total).toBeCloseTo(900);
  });

  it('factura pagada: solo permite cambiar estado', async () => {
    const facturaPagada = { ...facturaBase, estado: 'pagada' };
    Factura.findOne.mockResolvedValue(facturaPagada);
    Factura.findOneAndUpdate.mockResolvedValue({ ...facturaPagada, estado: 'anulada' });

    const res = await request(app)
      .put('/api/facturas/f1')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ estado: 'anulada' });

    expect(res.status).toBe(200);
    const updateArg = Factura.findOneAndUpdate.mock.calls[0][1];
    expect(updateArg).toEqual({ estado: 'anulada' });
  });

  it('400 cuando factura pagada y no se envía estado', async () => {
    Factura.findOne.mockResolvedValue({ ...facturaBase, estado: 'pagada' });

    const res = await request(app)
      .put('/api/facturas/f1')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ tipo: 'A' });

    expect(res.status).toBe(400);
    expect(res.body.mensaje).toMatch(/no se puede editar/i);
  });

  it('404 cuando no existe', async () => {
    Factura.findOne.mockResolvedValue(null);
    const res = await request(app)
      .put('/api/facturas/noexiste')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ tipo: 'A' });
    expect(res.status).toBe(404);
    expect(res.body.mensaje).toMatch(/no encontrada/i);
  });

  it('403 cuando rol produccion intenta actualizar', async () => {
    const res = await request(app)
      .put('/api/facturas/f1')
      .set('Authorization', `Bearer ${tokenProduccion}`)
      .send({ tipo: 'A' });
    expect(res.status).toBe(403);
  });
});

// ──────────────────────────────────────────────────────────────
// DELETE /api/facturas/:id — eliminarFactura
// ──────────────────────────────────────────────────────────────
describe('DELETE /api/facturas/:id — eliminarFactura', () => {
  it('200 elimina factura y sus pagos asociados', async () => {
    Factura.findOneAndDelete.mockResolvedValue({ _id: 'f1' });
    Pago.deleteMany.mockResolvedValue({ deletedCount: 2 });

    const res = await request(app)
      .delete('/api/facturas/f1')
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(res.status).toBe(200);
    expect(Factura.findOneAndDelete).toHaveBeenCalledWith({ _id: 'f1', empresaId });
    expect(Pago.deleteMany).toHaveBeenCalledWith({ factura: 'f1' });
  });

  it('404 cuando no existe', async () => {
    Factura.findOneAndDelete.mockResolvedValue(null);
    const res = await request(app)
      .delete('/api/facturas/noexiste')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(404);
    expect(res.body.mensaje).toMatch(/no encontrada/i);
  });

  it('no llama a Pago.deleteMany cuando la factura no existe', async () => {
    Factura.findOneAndDelete.mockResolvedValue(null);

    await request(app)
      .delete('/api/facturas/noexiste')
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(Pago.deleteMany).not.toHaveBeenCalled();
  });

  it('403 cuando rol ventas intenta eliminar (solo admin)', async () => {
    const res = await request(app)
      .delete('/api/facturas/f1')
      .set('Authorization', `Bearer ${tokenVentas}`);
    expect(res.status).toBe(403);
  });

  it('403 cuando rol produccion intenta eliminar', async () => {
    const res = await request(app)
      .delete('/api/facturas/f1')
      .set('Authorization', `Bearer ${tokenProduccion}`);
    expect(res.status).toBe(403);
  });
});
