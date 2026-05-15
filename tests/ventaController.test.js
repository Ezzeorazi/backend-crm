const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../models/Venta');
jest.mock('../models/Product');
jest.mock('../models/MovimientoStock');
jest.mock('../models/Contador');

const app           = require('../app');
const Venta           = require('../models/Venta');
const Producto        = require('../models/Product');
const MovimientoStock = require('../models/MovimientoStock');
const Contador        = require('../models/Contador');

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

function makeMockSession() {
  return {
    startTransaction:  jest.fn(),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    abortTransaction:  jest.fn().mockResolvedValue(undefined),
    endSession:        jest.fn()
  };
}

// Configura todos los mocks para el flujo exitoso de crearVenta
function setupCrearVentaOK() {
  const mockSession = makeMockSession();
  Venta.startSession = jest.fn().mockResolvedValue(mockSession);

  const prodMock = {
    _id: 'prod1', nombre: 'Prod A', sku: 'SKU1',
    precio: 100, stock: 10, activo: true,
    save: jest.fn().mockResolvedValue(true)
  };
  Producto.findOne.mockReturnValue({ session: jest.fn().mockResolvedValue(prodMock) });
  Producto.findById.mockReturnValue({ session: jest.fn().mockResolvedValue(prodMock) });

  Contador.siguiente.mockResolvedValue(1);
  MovimientoStock.create.mockResolvedValue([{}]);

  const ventaMock = { _id: 'v1', numero: 1, total: 200, empresaId };
  Venta.mockImplementation(() => ({ ...ventaMock, save: jest.fn().mockResolvedValue(true) }));

  return mockSession;
}

beforeAll(() => {
  process.env.JWT_SECRET = JWT_SECRET;
  tokenAdmin      = jwt.sign({ id: 'usr1', empresaId, rol: 'admin' },      JWT_SECRET);
  tokenVentas     = jwt.sign({ id: 'usr2', empresaId, rol: 'ventas' },     JWT_SECRET);
  tokenProduccion = jwt.sign({ id: 'usr3', empresaId, rol: 'produccion' }, JWT_SECRET);
});

afterEach(() => jest.clearAllMocks());

// ──────────────────────────────────────────────────────────────
// GET /api/ventas
// ──────────────────────────────────────────────────────────────
describe('GET /api/ventas — obtenerVentas', () => {
  it('200 devuelve lista de ventas', async () => {
    Venta.find.mockReturnValue(mockChain([{ _id: '1', empresaId }]));

    const res = await request(app)
      .get('/api/ventas')
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(res.status).toBe(200);
    expect(Venta.find).toHaveBeenCalledWith({ empresaId });
  });

  it('filtra por rango de fechas cuando se envían startDate y endDate', async () => {
    Venta.find.mockReturnValue(mockChain([]));

    await request(app)
      .get('/api/ventas?startDate=2026-01-01&endDate=2026-01-31')
      .set('Authorization', `Bearer ${tokenAdmin}`);

    const queryArg = Venta.find.mock.calls[0][0];
    expect(queryArg.createdAt).toBeDefined();
    expect(queryArg.createdAt.$gte).toEqual(new Date('2026-01-01'));
    expect(queryArg.createdAt.$lte).toEqual(new Date('2026-01-31'));
  });

  it('aislamiento multi-tenant: usa siempre empresaId del token', async () => {
    Venta.find.mockReturnValue(mockChain([]));
    const tokenOtra = jwt.sign({ id: 'u', empresaId: 'otraEmpresa', rol: 'admin' }, JWT_SECRET);

    await request(app)
      .get('/api/ventas')
      .set('Authorization', `Bearer ${tokenOtra}`);

    expect(Venta.find).toHaveBeenCalledWith({ empresaId: 'otraEmpresa' });
    expect(Venta.find).not.toHaveBeenCalledWith({ empresaId });
  });

  it('401 sin token', async () => {
    const res = await request(app).get('/api/ventas');
    expect(res.status).toBe(401);
  });

  it('500 cuando la DB falla', async () => {
    Venta.find.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      sort:     jest.fn().mockRejectedValue(new Error('DB error'))
    });
    const res = await request(app)
      .get('/api/ventas')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(500);
    expect(res.body.mensaje).toMatch(/error al obtener/i);
  });
});

// ──────────────────────────────────────────────────────────────
// GET /api/ventas/:id
// ──────────────────────────────────────────────────────────────
describe('GET /api/ventas/:id — obtenerVenta', () => {
  it('200 devuelve la venta cuando existe', async () => {
    Venta.findOne.mockReturnValue(mockChain({ _id: '1', empresaId }));

    const res = await request(app)
      .get('/api/ventas/1')
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(res.status).toBe(200);
    expect(Venta.findOne).toHaveBeenCalledWith({ _id: '1', empresaId });
  });

  it('404 cuando no existe', async () => {
    Venta.findOne.mockReturnValue(mockChain(null));
    const res = await request(app)
      .get('/api/ventas/noexiste')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(404);
    expect(res.body.mensaje).toMatch(/no encontrada/i);
  });
});

// ──────────────────────────────────────────────────────────────
// POST /api/ventas — crearVenta
// ──────────────────────────────────────────────────────────────
describe('POST /api/ventas — crearVenta', () => {
  const bodyValido = {
    cliente: 'cli1',
    productos: [{ producto: 'prod1', cantidad: 2 }],
    total: 200
  };

  it('201 crea la venta y genera número correlativo', async () => {
    setupCrearVentaOK();

    const res = await request(app)
      .post('/api/ventas')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send(bodyValido);

    expect(res.status).toBe(201);
    expect(Contador.siguiente).toHaveBeenCalledWith(empresaId, 'venta');
  });

  it('hace commit de la transacción tras crear exitosamente', async () => {
    const mockSession = setupCrearVentaOK();

    await request(app)
      .post('/api/ventas')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send(bodyValido);

    expect(mockSession.commitTransaction).toHaveBeenCalled();
    expect(mockSession.endSession).toHaveBeenCalled();
    expect(mockSession.abortTransaction).not.toHaveBeenCalled();
  });

  it('registra movimiento de stock tipo salida por cada producto', async () => {
    setupCrearVentaOK();

    await request(app)
      .post('/api/ventas')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send(bodyValido);

    expect(MovimientoStock.create).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ tipo: 'salida', motivo: 'venta', cantidad: 2 })
      ]),
      expect.any(Object)
    );
  });

  it('400 y abort cuando el producto no existe en DB', async () => {
    const mockSession = makeMockSession();
    Venta.startSession = jest.fn().mockResolvedValue(mockSession);
    Producto.findOne.mockReturnValue({ session: jest.fn().mockResolvedValue(null) });

    const res = await request(app)
      .post('/api/ventas')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send(bodyValido);

    expect(res.status).toBe(400);
    expect(res.body.mensaje).toMatch(/no encontrado/i);
    expect(mockSession.abortTransaction).toHaveBeenCalled();
    expect(mockSession.endSession).toHaveBeenCalled();
  });

  it('400 y abort cuando hay stock insuficiente', async () => {
    const mockSession = makeMockSession();
    Venta.startSession = jest.fn().mockResolvedValue(mockSession);
    Producto.findOne.mockReturnValue({
      session: jest.fn().mockResolvedValue({
        _id: 'prod1', nombre: 'Prod A', sku: 'SKU1', precio: 100, stock: 0, activo: true
      })
    });

    const res = await request(app)
      .post('/api/ventas')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send(bodyValido);

    expect(res.status).toBe(400);
    expect(res.body.mensaje).toMatch(/stock insuficiente/i);
    expect(mockSession.abortTransaction).toHaveBeenCalled();
  });

  it('400 y abort cuando el producto está inactivo', async () => {
    const mockSession = makeMockSession();
    Venta.startSession = jest.fn().mockResolvedValue(mockSession);
    Producto.findOne.mockReturnValue({
      session: jest.fn().mockResolvedValue({
        _id: 'prod1', nombre: 'Prod A', sku: 'SKU1', precio: 100, stock: 10, activo: false
      })
    });

    const res = await request(app)
      .post('/api/ventas')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send(bodyValido);

    expect(res.status).toBe(400);
    expect(res.body.mensaje).toMatch(/inactivo/i);
    expect(mockSession.abortTransaction).toHaveBeenCalled();
  });

  it('400 sin productos (express-validator)', async () => {
    const res = await request(app)
      .post('/api/ventas')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ cliente: 'cli1', total: 100 });
    expect(res.status).toBe(400);
  });

  it('400 sin cliente (express-validator)', async () => {
    const res = await request(app)
      .post('/api/ventas')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ productos: [{ producto: 'p1', cantidad: 1 }], total: 100 });
    expect(res.status).toBe(400);
  });

  it('403 cuando rol produccion intenta crear', async () => {
    const res = await request(app)
      .post('/api/ventas')
      .set('Authorization', `Bearer ${tokenProduccion}`)
      .send(bodyValido);
    expect(res.status).toBe(403);
  });

  it('401 sin token', async () => {
    const res = await request(app).post('/api/ventas').send(bodyValido);
    expect(res.status).toBe(401);
  });
});

// ──────────────────────────────────────────────────────────────
// PUT /api/ventas/:id — actualizarVenta
// ──────────────────────────────────────────────────────────────
describe('PUT /api/ventas/:id — actualizarVenta', () => {
  const ventaBase = {
    _id: '1', empresaId, subtotal: 1000, descuento: 0, iva: 0, estado: 'pendiente'
  };

  it('200 actualiza el estado', async () => {
    Venta.findOne.mockResolvedValue(ventaBase);
    Venta.findOneAndUpdate.mockResolvedValue({ ...ventaBase, estado: 'completado' });

    const res = await request(app)
      .put('/api/ventas/1')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ estado: 'completado' });

    expect(res.status).toBe(200);
  });

  it('recalcula IVA cuando porcentajeIva se envía y la venta no está cerrada', async () => {
    Venta.findOne.mockResolvedValue(ventaBase);
    Venta.findOneAndUpdate.mockResolvedValue({ ...ventaBase, iva: 210, total: 1210 });

    const res = await request(app)
      .put('/api/ventas/1')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ porcentajeIva: 21 });

    expect(res.status).toBe(200);
    const updateArg = Venta.findOneAndUpdate.mock.calls[0][1];
    expect(updateArg.iva).toBeCloseTo(210);
    expect(updateArg.total).toBeCloseTo(1210);
  });

  it('no recalcula IVA si la venta ya está completada', async () => {
    Venta.findOne.mockResolvedValue({ ...ventaBase, estado: 'completado' });
    Venta.findOneAndUpdate.mockResolvedValue({ ...ventaBase, estado: 'completado' });

    await request(app)
      .put('/api/ventas/1')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ porcentajeIva: 21 });

    const updateArg = Venta.findOneAndUpdate.mock.calls[0][1];
    expect(updateArg.iva).toBeUndefined();
  });

  it('404 cuando no existe', async () => {
    Venta.findOne.mockResolvedValue(null);
    const res = await request(app)
      .put('/api/ventas/noexiste')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ estado: 'completado' });
    expect(res.status).toBe(404);
    expect(res.body.mensaje).toMatch(/no encontrada/i);
  });

  it('403 cuando rol produccion intenta actualizar', async () => {
    const res = await request(app)
      .put('/api/ventas/1')
      .set('Authorization', `Bearer ${tokenProduccion}`)
      .send({ estado: 'completado' });
    expect(res.status).toBe(403);
  });
});

// ──────────────────────────────────────────────────────────────
// DELETE /api/ventas/:id — eliminarVenta
// ──────────────────────────────────────────────────────────────
describe('DELETE /api/ventas/:id — eliminarVenta', () => {
  it('200 elimina correctamente', async () => {
    Venta.findOneAndDelete.mockResolvedValue({ _id: '1' });

    const res = await request(app)
      .delete('/api/ventas/1')
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(res.status).toBe(200);
    expect(Venta.findOneAndDelete).toHaveBeenCalledWith({ _id: '1', empresaId });
  });

  it('404 cuando no existe', async () => {
    Venta.findOneAndDelete.mockResolvedValue(null);
    const res = await request(app)
      .delete('/api/ventas/noexiste')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(404);
    expect(res.body.mensaje).toMatch(/no encontrada/i);
  });

  it('403 cuando rol ventas intenta eliminar (solo admin puede)', async () => {
    const res = await request(app)
      .delete('/api/ventas/1')
      .set('Authorization', `Bearer ${tokenVentas}`);
    expect(res.status).toBe(403);
  });
});
