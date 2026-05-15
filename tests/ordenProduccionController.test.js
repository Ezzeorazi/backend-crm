const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../models/OrdenProduccion');
jest.mock('../models/Contador');

const app = require('../app');
const OrdenProduccion = require('../models/OrdenProduccion');
const Contador        = require('../models/Contador');

const JWT_SECRET = 'testsecret';
const empresaId  = 'emp1';
let tokenAdmin;
let tokenProduccion;
let tokenVentas;

function mockChain(value) {
  return {
    populate: jest.fn().mockReturnThis(),
    sort:     jest.fn().mockReturnThis(),
    lean:     jest.fn().mockReturnThis(),
    then:     (resolve, reject) => Promise.resolve(value).then(resolve, reject),
    catch:    (onReject) => Promise.resolve(value).catch(onReject),
  };
}

beforeAll(() => {
  process.env.JWT_SECRET = JWT_SECRET;
  tokenAdmin     = jwt.sign({ id: 'usr1', empresaId, rol: 'admin' },      JWT_SECRET);
  tokenProduccion = jwt.sign({ id: 'usr2', empresaId, rol: 'produccion' }, JWT_SECRET);
  tokenVentas    = jwt.sign({ id: 'usr3', empresaId, rol: 'ventas' },      JWT_SECRET);
});

afterEach(() => jest.clearAllMocks());

// ──────────────────────────────────────────────────────────────
// GET /api/ordenes
// ──────────────────────────────────────────────────────────────
describe('GET /api/ordenes — obtenerOrdenes', () => {
  it('200 devuelve lista de órdenes', async () => {
    const ordenes = [{ _id: '1', descripcion: 'Orden A', empresaId }];
    OrdenProduccion.find.mockReturnValue(mockChain(ordenes));

    const res = await request(app)
      .get('/api/ordenes')
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(res.status).toBe(200);
    expect(OrdenProduccion.find).toHaveBeenCalledWith({ empresaId });
  });

  it('filtra siempre por empresaId del token (aislamiento multi-tenant)', async () => {
    OrdenProduccion.find.mockReturnValue(mockChain([]));
    const tokenOtra = jwt.sign({ id: 'u', empresaId: 'otraEmpresa', rol: 'admin' }, JWT_SECRET);

    await request(app)
      .get('/api/ordenes')
      .set('Authorization', `Bearer ${tokenOtra}`);

    expect(OrdenProduccion.find).toHaveBeenCalledWith({ empresaId: 'otraEmpresa' });
    expect(OrdenProduccion.find).not.toHaveBeenCalledWith({ empresaId });
  });

  it('401 sin token', async () => {
    const res = await request(app).get('/api/ordenes');
    expect(res.status).toBe(401);
  });

  it('500 cuando la DB falla', async () => {
    OrdenProduccion.find.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      sort:     jest.fn().mockRejectedValue(new Error('DB error'))
    });
    const res = await request(app)
      .get('/api/ordenes')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(500);
    expect(res.body.mensaje).toMatch(/error al obtener/i);
  });
});

// ──────────────────────────────────────────────────────────────
// GET /api/ordenes/:id
// ──────────────────────────────────────────────────────────────
describe('GET /api/ordenes/:id — obtenerOrden', () => {
  it('200 devuelve la orden cuando existe', async () => {
    const orden = { _id: '1', descripcion: 'Test', empresaId };
    OrdenProduccion.findOne.mockReturnValue(mockChain(orden));

    const res = await request(app)
      .get('/api/ordenes/1')
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(res.status).toBe(200);
    expect(OrdenProduccion.findOne).toHaveBeenCalledWith({ _id: '1', empresaId });
  });

  it('404 cuando no existe', async () => {
    OrdenProduccion.findOne.mockReturnValue(mockChain(null));
    const res = await request(app)
      .get('/api/ordenes/noexiste')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(404);
    expect(res.body.mensaje).toMatch(/no encontrada/i);
  });
});

// ──────────────────────────────────────────────────────────────
// POST /api/ordenes — crearOrden
// ──────────────────────────────────────────────────────────────
describe('POST /api/ordenes — crearOrden', () => {
  it('201 crea orden correctamente (usa new OrdenProduccion().save())', async () => {
    Contador.siguiente.mockResolvedValue(1);
    const instancia = { _id: '1', numero: 1, empresaId, estadoGeneral: 'borrador', etapas: [] };
    OrdenProduccion.mockImplementation(() => ({
      ...instancia,
      save: jest.fn().mockResolvedValue(true)
    }));

    const res = await request(app)
      .post('/api/ordenes')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ descripcion: 'Orden Test' });

    expect(res.status).toBe(201);
    expect(Contador.siguiente).toHaveBeenCalledWith(empresaId, 'orden_produccion');
  });

  it('403 cuando rol ventas intenta crear', async () => {
    const res = await request(app)
      .post('/api/ordenes')
      .set('Authorization', `Bearer ${tokenVentas}`)
      .send({ descripcion: 'Test' });
    expect(res.status).toBe(403);
    expect(res.body.mensaje).toMatch(/rol insuficiente/i);
  });

  it('permite crear con rol produccion', async () => {
    Contador.siguiente.mockResolvedValue(2);
    const instancia = { _id: '2', numero: 2, empresaId, etapas: [] };
    OrdenProduccion.mockImplementation(() => ({
      ...instancia,
      save: jest.fn().mockResolvedValue(true)
    }));

    const res = await request(app)
      .post('/api/ordenes')
      .set('Authorization', `Bearer ${tokenProduccion}`)
      .send({ descripcion: 'Orden Prod' });

    expect(res.status).toBe(201);
  });

  it('500 cuando la DB falla al guardar', async () => {
    Contador.siguiente.mockResolvedValue(3);
    OrdenProduccion.mockImplementation(() => ({
      etapas: [],
      save: jest.fn().mockRejectedValue(new Error('DB error'))
    }));

    const res = await request(app)
      .post('/api/ordenes')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ descripcion: 'Test' });

    expect(res.status).toBe(500);
    expect(res.body.mensaje).toMatch(/error al crear/i);
  });

  it('empresaId siempre viene del token, no del body', async () => {
    Contador.siguiente.mockResolvedValue(4);
    OrdenProduccion.mockImplementation((data) => ({
      ...data,
      etapas: data.etapas || [],
      save: jest.fn().mockResolvedValue(true)
    }));

    await request(app)
      .post('/api/ordenes')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ descripcion: 'Test', empresaId: 'empresaMaliciosa' });

    const constructorArg = OrdenProduccion.mock.calls[0][0];
    expect(constructorArg.empresaId).toBe(empresaId);
    expect(constructorArg.empresaId).not.toBe('empresaMaliciosa');
  });
});

// ──────────────────────────────────────────────────────────────
// PUT /api/ordenes/:id — actualizarOrden
// ──────────────────────────────────────────────────────────────
describe('PUT /api/ordenes/:id — actualizarOrden', () => {
  it('200 actualiza correctamente', async () => {
    const updated = { _id: '1', descripcion: 'Actualizada', empresaId, etapas: [] };
    OrdenProduccion.findOneAndUpdate.mockResolvedValue(updated);

    const res = await request(app)
      .put('/api/ordenes/1')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ descripcion: 'Actualizada' });

    expect(res.status).toBe(200);
    expect(OrdenProduccion.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: '1', empresaId },
      expect.any(Object),
      expect.any(Object)
    );
  });

  it('404 cuando no existe', async () => {
    OrdenProduccion.findOneAndUpdate.mockResolvedValue(null);
    const res = await request(app)
      .put('/api/ordenes/noexiste')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ descripcion: 'X' });
    expect(res.status).toBe(404);
  });

  it('403 cuando rol ventas intenta actualizar', async () => {
    const res = await request(app)
      .put('/api/ordenes/1')
      .set('Authorization', `Bearer ${tokenVentas}`)
      .send({ descripcion: 'X' });
    expect(res.status).toBe(403);
  });
});

// ──────────────────────────────────────────────────────────────
// DELETE /api/ordenes/:id — eliminarOrden
// ──────────────────────────────────────────────────────────────
describe('DELETE /api/ordenes/:id — eliminarOrden', () => {
  it('200 elimina correctamente', async () => {
    OrdenProduccion.findOneAndDelete.mockResolvedValue({ _id: '1' });
    const res = await request(app)
      .delete('/api/ordenes/1')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(OrdenProduccion.findOneAndDelete).toHaveBeenCalledWith({ _id: '1', empresaId });
  });

  it('404 cuando no existe', async () => {
    OrdenProduccion.findOneAndDelete.mockResolvedValue(null);
    const res = await request(app)
      .delete('/api/ordenes/noexiste')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(404);
  });

  it('403 cuando rol ventas intenta eliminar', async () => {
    const res = await request(app)
      .delete('/api/ordenes/1')
      .set('Authorization', `Bearer ${tokenVentas}`);
    expect(res.status).toBe(403);
  });
});
