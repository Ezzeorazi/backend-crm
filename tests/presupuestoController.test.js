const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../models/Presupuesto');
jest.mock('../models/Venta');
jest.mock('../models/Factura');
jest.mock('../models/Empresa');
jest.mock('../models/Contador');
jest.mock('pdfkit', () => {
  return jest.fn().mockImplementation(() => ({
    pipe:       jest.fn(),
    fontSize:   jest.fn().mockReturnThis(),
    font:       jest.fn().mockReturnThis(),
    text:       jest.fn().mockReturnThis(),
    moveDown:   jest.fn().mockReturnThis(),
    image:      jest.fn().mockReturnThis(),
    rect:       jest.fn().mockReturnThis(),
    fillColor:  jest.fn().mockReturnThis(),
    strokeColor: jest.fn().mockReturnThis(),
    fill:       jest.fn().mockReturnThis(),
    stroke:     jest.fn().mockReturnThis(),
    lineWidth:  jest.fn().mockReturnThis(),
    moveTo:     jest.fn().mockReturnThis(),
    lineTo:     jest.fn().mockReturnThis(),
    end:        jest.fn(),
    on:         jest.fn()
  }));
});

const app = require('../app');
const Presupuesto = require('../models/Presupuesto');
const Venta       = require('../models/Venta');
const Factura     = require('../models/Factura');
const Empresa     = require('../models/Empresa');
const Contador    = require('../models/Contador');

const JWT_SECRET = 'testsecret';
const empresaId  = 'emp1';
let tokenAdmin;
let tokenVentas;

function mockChain(value) {
  return {
    populate: jest.fn().mockReturnThis(),
    sort:     jest.fn().mockReturnThis(),
    select:   jest.fn().mockReturnThis(),
    lean:     jest.fn().mockReturnThis(),
    then:     (resolve, reject) => Promise.resolve(value).then(resolve, reject),
    catch:    (onReject) => Promise.resolve(value).catch(onReject),
  };
}

beforeAll(() => {
  process.env.JWT_SECRET = JWT_SECRET;
  tokenAdmin  = jwt.sign({ id: 'usr1', empresaId, rol: 'admin' },  JWT_SECRET);
  tokenVentas = jwt.sign({ id: 'usr2', empresaId, rol: 'ventas' }, JWT_SECRET);
});

afterEach(() => jest.clearAllMocks());

// ──────────────────────────────────────────────────────────────
// GET /api/presupuestos
// ──────────────────────────────────────────────────────────────
describe('GET /api/presupuestos — obtenerPresupuestos', () => {
  it('200 devuelve lista de presupuestos', async () => {
    const presupuestoMock = {
      _id: '1', numero: 1, total: 1000, empresaId,
      toObject: () => ({ _id: '1', numero: 1, total: 1000 })
    };
    Presupuesto.find.mockReturnValue(mockChain([presupuestoMock]));
    Venta.find.mockReturnValue(mockChain([]));
    Factura.find.mockReturnValue(mockChain([]));

    const res = await request(app)
      .get('/api/presupuestos')
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(res.status).toBe(200);
    expect(Presupuesto.find).toHaveBeenCalledWith({ empresaId });
  });

  it('401 sin token', async () => {
    const res = await request(app).get('/api/presupuestos');
    expect(res.status).toBe(401);
  });
});

// ──────────────────────────────────────────────────────────────
// GET /api/presupuestos/:id/pdf — descargarPDF
// ──────────────────────────────────────────────────────────────
describe('GET /api/presupuestos/:id/pdf — descargarPDF', () => {
  it('404 cuando el presupuesto no existe', async () => {
    Presupuesto.findOne.mockReturnValue(mockChain(null));

    const res = await request(app)
      .get('/api/presupuestos/noexiste/pdf')
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(res.status).toBe(404);
    expect(res.body.mensaje).toMatch(/no encontrado/i);
    expect(Presupuesto.findOne).toHaveBeenCalledWith(
      { _id: 'noexiste', empresaId }
    );
  });

  it('busca presupuesto filtrando por empresaId del token', async () => {
    Presupuesto.findOne.mockReturnValue(mockChain(null));

    await request(app)
      .get('/api/presupuestos/abc123/pdf')
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(Presupuesto.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ empresaId })
    );
  });
});

// ──────────────────────────────────────────────────────────────
// POST /api/presupuestos — crearPresupuesto
// ──────────────────────────────────────────────────────────────
describe('POST /api/presupuestos — crearPresupuesto', () => {
  it('400 sin cliente', async () => {
    const res = await request(app)
      .post('/api/presupuestos')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ productos: [{ producto: 'p1', cantidad: 1 }], total: 100 });
    expect(res.status).toBe(400);
  });

  it('400 sin productos', async () => {
    const res = await request(app)
      .post('/api/presupuestos')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ cliente: 'cli1', total: 100 });
    expect(res.status).toBe(400);
  });

  it('403 cuando el rol no tiene permiso (inventario)', async () => {
    const tokenInv = jwt.sign({ id: 'u', empresaId, rol: 'inventario' }, JWT_SECRET);
    const res = await request(app)
      .post('/api/presupuestos')
      .set('Authorization', `Bearer ${tokenInv}`)
      .send({ cliente: 'c', productos: [{ producto: 'p1', cantidad: 1 }], total: 100 });
    expect(res.status).toBe(403);
  });

  it('401 sin token', async () => {
    const res = await request(app)
      .post('/api/presupuestos')
      .send({ cliente: 'c', productos: [{ producto: 'p1', cantidad: 1 }], total: 100 });
    expect(res.status).toBe(401);
  });
});

// ──────────────────────────────────────────────────────────────
// DELETE /api/presupuestos/:id — eliminarPresupuesto
// ──────────────────────────────────────────────────────────────
describe('DELETE /api/presupuestos/:id — eliminarPresupuesto', () => {
  it('403 cuando rol ventas intenta eliminar', async () => {
    const res = await request(app)
      .delete('/api/presupuestos/1')
      .set('Authorization', `Bearer ${tokenVentas}`);
    expect(res.status).toBe(403);
  });

  it('401 sin token', async () => {
    const res = await request(app)
      .delete('/api/presupuestos/1');
    expect(res.status).toBe(401);
  });
});
