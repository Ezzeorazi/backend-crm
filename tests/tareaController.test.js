const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../models/Tarea');

const app = require('../app');
const Tarea = require('../models/Tarea');

const JWT_SECRET = 'testsecret';
const empresaId = 'emp1';
const usuarioId = 'usr1';
let tokenAdmin;
let tokenVentas;

// Helper: crea una cadena de Mongoose chaineable que resuelve en `value`
function mockChain(value) {
  const chain = {
    populate: jest.fn().mockReturnThis(),
    sort:     jest.fn().mockReturnThis(),
    limit:    jest.fn().mockReturnThis(),
    select:   jest.fn().mockReturnThis(),
    lean:     jest.fn().mockReturnThis(),
    then:     (resolve, reject) => Promise.resolve(value).then(resolve, reject),
    catch:    (onReject) => Promise.resolve(value).catch(onReject),
  };
  return chain;
}

beforeAll(() => {
  process.env.JWT_SECRET = JWT_SECRET;
  tokenAdmin  = jwt.sign({ id: usuarioId, empresaId, rol: 'admin' },      JWT_SECRET);
  tokenVentas = jwt.sign({ id: 'usr2',    empresaId, rol: 'ventas' },     JWT_SECRET);
});

afterEach(() => {
  jest.clearAllMocks();
});

// ──────────────────────────────────────────────────────────────
// GET /api/tareas
// ──────────────────────────────────────────────────────────────
describe('GET /api/tareas — obtenerTareas', () => {
  it('200 devuelve lista de tareas de la empresa', async () => {
    const tareas = [{ _id: '1', titulo: 'Tarea 1', empresaId }];
    Tarea.find.mockReturnValue(mockChain(tareas));

    const res = await request(app)
      .get('/api/tareas')
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(Tarea.find).toHaveBeenCalledWith({ empresaId });
  });

  it('filtra siempre por empresaId del token (aislamiento multi-tenant)', async () => {
    Tarea.find.mockReturnValue(mockChain([]));
    const tokenOtra = jwt.sign({ id: 'u', empresaId: 'otraEmpresa', rol: 'admin' }, JWT_SECRET);

    await request(app)
      .get('/api/tareas')
      .set('Authorization', `Bearer ${tokenOtra}`);

    expect(Tarea.find).toHaveBeenCalledWith({ empresaId: 'otraEmpresa' });
    expect(Tarea.find).not.toHaveBeenCalledWith({ empresaId });
  });

  it('401 sin token', async () => {
    const res = await request(app).get('/api/tareas');
    expect(res.status).toBe(401);
  });

  it('500 cuando la DB falla', async () => {
    Tarea.find.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockRejectedValue(new Error('DB error'))
    });
    const res = await request(app)
      .get('/api/tareas')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(500);
    expect(res.body.mensaje).toMatch(/error al obtener/i);
  });
});

// ──────────────────────────────────────────────────────────────
// GET /api/tareas/:id
// ──────────────────────────────────────────────────────────────
describe('GET /api/tareas/:id — obtenerTarea', () => {
  it('200 devuelve la tarea cuando existe', async () => {
    const tarea = { _id: '64f1', titulo: 'Test', empresaId };
    Tarea.findOne.mockReturnValue(mockChain(tarea));

    const res = await request(app)
      .get('/api/tareas/64f1')
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(res.status).toBe(200);
    expect(Tarea.findOne).toHaveBeenCalledWith({ _id: '64f1', empresaId });
  });

  it('404 cuando la tarea no existe', async () => {
    Tarea.findOne.mockReturnValue(mockChain(null));

    const res = await request(app)
      .get('/api/tareas/noexiste')
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(res.status).toBe(404);
    expect(res.body.mensaje).toMatch(/no encontrada/i);
  });
});

// ──────────────────────────────────────────────────────────────
// POST /api/tareas
// ──────────────────────────────────────────────────────────────
describe('POST /api/tareas — crearTarea', () => {
  it('201 crea tarea correctamente (usa new Tarea().save())', async () => {
    const instancia = { _id: '1', titulo: 'Nueva Tarea', empresaId };
    Tarea.mockImplementation(() => ({
      ...instancia,
      save: jest.fn().mockResolvedValue(true)
    }));

    const res = await request(app)
      .post('/api/tareas')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ titulo: 'Nueva Tarea' });

    expect(res.status).toBe(201);
  });

  it('403 cuando el rol es ventas (sin permiso)', async () => {
    const res = await request(app)
      .post('/api/tareas')
      .set('Authorization', `Bearer ${tokenVentas}`)
      .send({ titulo: 'Tarea' });
    expect(res.status).toBe(403);
    expect(res.body.mensaje).toMatch(/rol insuficiente/i);
  });

  it('500 cuando la DB falla al guardar', async () => {
    Tarea.mockImplementation(() => ({
      save: jest.fn().mockRejectedValue(new Error('DB error'))
    }));

    const res = await request(app)
      .post('/api/tareas')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ titulo: 'Test' });

    expect(res.status).toBe(500);
    expect(res.body.mensaje).toMatch(/error al crear/i);
  });

  it('empresaId siempre viene del token, no del body', async () => {
    const instancia = { _id: '1', titulo: 'Test', empresaId };
    Tarea.mockImplementation((data) => ({
      ...instancia,
      _constructorArg: data,
      save: jest.fn().mockResolvedValue(true)
    }));

    await request(app)
      .post('/api/tareas')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ titulo: 'Test', empresaId: 'empresaMaliciosa' });

    const constructorCall = Tarea.mock.calls[0][0];
    expect(constructorCall.empresaId).toBe(empresaId);
    expect(constructorCall.empresaId).not.toBe('empresaMaliciosa');
  });
});

// ──────────────────────────────────────────────────────────────
// PUT /api/tareas/:id
// ──────────────────────────────────────────────────────────────
describe('PUT /api/tareas/:id — actualizarTarea', () => {
  it('200 actualiza la tarea correctamente', async () => {
    const actualizada = { _id: '1', titulo: 'Actualizada', empresaId };
    Tarea.findOneAndUpdate.mockResolvedValue(actualizada);

    const res = await request(app)
      .put('/api/tareas/1')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ titulo: 'Actualizada' });

    expect(res.status).toBe(200);
    expect(Tarea.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: '1', empresaId },
      expect.any(Object),
      expect.any(Object)
    );
  });

  it('404 cuando no existe', async () => {
    Tarea.findOneAndUpdate.mockResolvedValue(null);
    const res = await request(app)
      .put('/api/tareas/noexiste')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ titulo: 'X' });
    expect(res.status).toBe(404);
  });

  it('403 cuando el rol no tiene permiso (compras)', async () => {
    const tokenCompras = jwt.sign({ id: 'u3', empresaId, rol: 'compras' }, JWT_SECRET);
    const res = await request(app)
      .put('/api/tareas/1')
      .set('Authorization', `Bearer ${tokenCompras}`)
      .send({ titulo: 'X' });
    expect(res.status).toBe(403);
  });
});

// ──────────────────────────────────────────────────────────────
// DELETE /api/tareas/:id
// ──────────────────────────────────────────────────────────────
describe('DELETE /api/tareas/:id — eliminarTarea', () => {
  it('200 elimina la tarea correctamente', async () => {
    Tarea.findOneAndDelete.mockResolvedValue({ _id: '1' });
    const res = await request(app)
      .delete('/api/tareas/1')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.mensaje).toMatch(/eliminada/i);
    expect(Tarea.findOneAndDelete).toHaveBeenCalledWith({ _id: '1', empresaId });
  });

  it('404 cuando no existe', async () => {
    Tarea.findOneAndDelete.mockResolvedValue(null);
    const res = await request(app)
      .delete('/api/tareas/noexiste')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(404);
  });

  it('403 cuando el rol soporte intenta eliminar', async () => {
    const tokenSoporte = jwt.sign({ id: 'u4', empresaId, rol: 'soporte' }, JWT_SECRET);
    const res = await request(app)
      .delete('/api/tareas/1')
      .set('Authorization', `Bearer ${tokenSoporte}`);
    expect(res.status).toBe(403);
  });
});

// ──────────────────────────────────────────────────────────────
// POST /api/tareas/:id/comentarios — agregarComentario
// ──────────────────────────────────────────────────────────────
describe('POST /api/tareas/:id/comentarios — agregarComentario', () => {
  it('400 cuando el texto está vacío', async () => {
    const res = await request(app)
      .post('/api/tareas/1/comentarios')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ texto: '' });
    expect(res.status).toBe(400);
    expect(res.body.mensaje).toMatch(/vacío/i);
  });

  it('400 cuando falta el texto', async () => {
    const res = await request(app)
      .post('/api/tareas/1/comentarios')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('404 cuando la tarea no existe', async () => {
    Tarea.findOneAndUpdate.mockReturnValue(mockChain(null));
    const res = await request(app)
      .post('/api/tareas/noexiste/comentarios')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ texto: 'Mi comentario' });
    expect(res.status).toBe(404);
  });
});
