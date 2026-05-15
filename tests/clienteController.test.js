const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../models/Contacto');

const app = require('../app');
const Contacto = require('../models/Contacto');

const JWT_SECRET = 'testsecret';
const empresaId = 'emp1';
let token;

function mockChain(value) {
  return {
    populate: jest.fn().mockReturnThis(),
    sort:     jest.fn().mockResolvedValue(value),
    then:     (resolve, reject) => Promise.resolve(value).then(resolve, reject),
    catch:    (onReject) => Promise.resolve(value).catch(onReject),
  };
}

beforeAll(() => {
  process.env.JWT_SECRET = JWT_SECRET;
  token = jwt.sign({ id: 'usr1', empresaId, rol: 'admin' }, JWT_SECRET);
});

afterEach(() => {
  jest.clearAllMocks();
});

// ──────────────────────────────────────────────────────────────
// GET /api/clientes
// ──────────────────────────────────────────────────────────────
describe('GET /api/clientes — obtenerClientes', () => {
  it('200 devuelve lista de clientes', async () => {
    const clientes = [{ _id: '1', nombre: 'Cliente A' }];
    Contacto.find.mockReturnValue(mockChain(clientes));

    const res = await request(app)
      .get('/api/clientes')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Contacto.find).toHaveBeenCalledWith({ empresaId, tipo: 'cliente' });
  });

  it('401 sin token', async () => {
    const res = await request(app).get('/api/clientes');
    expect(res.status).toBe(401);
  });

  it('filtra siempre por empresaId del token (aislamiento multi-tenant)', async () => {
    Contacto.find.mockReturnValue(mockChain([]));
    const tokenOtra = jwt.sign({ id: 'u', empresaId: 'otraEmpresa', rol: 'admin' }, JWT_SECRET);

    await request(app)
      .get('/api/clientes')
      .set('Authorization', `Bearer ${tokenOtra}`);

    expect(Contacto.find).toHaveBeenCalledWith({ empresaId: 'otraEmpresa', tipo: 'cliente' });
    expect(Contacto.find).not.toHaveBeenCalledWith({ empresaId, tipo: 'cliente' });
  });
});

// ──────────────────────────────────────────────────────────────
// POST /api/clientes
// ──────────────────────────────────────────────────────────────
describe('POST /api/clientes — crearCliente', () => {
  it('201 crea cliente correctamente', async () => {
    const guardado = { _id: '1', nombre: 'Nuevo Cliente', empresaId };
    Contacto.mockImplementation(() => ({
      ...guardado,
      save: jest.fn().mockResolvedValue(guardado)
    }));

    const res = await request(app)
      .post('/api/clientes')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Nuevo Cliente' });

    expect(res.status).toBe(201);
  });

  it('400 cuando falta el nombre', async () => {
    const res = await request(app)
      .post('/api/clientes')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'test@test.com' });
    expect(res.status).toBe(400);
    expect(res.body.errores).toBeDefined();
  });

  it('400 cuando el email es inválido', async () => {
    const res = await request(app)
      .post('/api/clientes')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Test', email: 'noesunemail' });
    expect(res.status).toBe(400);
  });

  it('empresaId siempre viene del token, no del body', async () => {
    const guardado = { _id: '1', nombre: 'Test', empresaId };
    Contacto.mockImplementation((data) => ({
      ...guardado,
      _data: data,
      save: jest.fn().mockResolvedValue(guardado)
    }));

    await request(app)
      .post('/api/clientes')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Test', empresaId: 'empresaMaliciosa' });

    const constructorArg = Contacto.mock.calls[0][0];
    expect(constructorArg.empresaId).toBe(empresaId);
    expect(constructorArg.empresaId).not.toBe('empresaMaliciosa');
  });
});

// ──────────────────────────────────────────────────────────────
// GET /api/clientes/:id
// ──────────────────────────────────────────────────────────────
describe('GET /api/clientes/:id — obtenerCliente', () => {
  it('200 devuelve el cliente correcto', async () => {
    const cliente = { _id: '1', nombre: 'Cliente A', empresaId };
    Contacto.findOne.mockResolvedValue(cliente);

    const res = await request(app)
      .get('/api/clientes/1')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Contacto.findOne).toHaveBeenCalledWith({ _id: '1', empresaId, tipo: 'cliente' });
  });

  it('404 cuando no existe el cliente', async () => {
    Contacto.findOne.mockResolvedValue(null);
    const res = await request(app)
      .get('/api/clientes/noexiste')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(res.body.mensaje).toMatch(/no encontrado/i);
  });

  it('aislamiento multi-tenant: incluye empresaId en la query', async () => {
    Contacto.findOne.mockResolvedValue(null);
    await request(app)
      .get('/api/clientes/1')
      .set('Authorization', `Bearer ${token}`);
    expect(Contacto.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ empresaId })
    );
  });
});

// ──────────────────────────────────────────────────────────────
// PUT /api/clientes/:id
// ──────────────────────────────────────────────────────────────
describe('PUT /api/clientes/:id — actualizarCliente', () => {
  it('200 actualiza el cliente', async () => {
    const updated = { _id: '1', nombre: 'Actualizado', empresaId };
    Contacto.findOneAndUpdate.mockResolvedValue(updated);

    const res = await request(app)
      .put('/api/clientes/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Actualizado' });

    expect(res.status).toBe(200);
    expect(Contacto.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: '1', empresaId, tipo: 'cliente' },
      expect.any(Object),
      expect.any(Object)
    );
  });

  it('404 cuando no existe', async () => {
    Contacto.findOneAndUpdate.mockResolvedValue(null);
    const res = await request(app)
      .put('/api/clientes/noexiste')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'X' });
    expect(res.status).toBe(404);
  });

  it('400 cuando el email de actualización es inválido', async () => {
    const res = await request(app)
      .put('/api/clientes/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'noesunemail' });
    expect(res.status).toBe(400);
  });
});

// ──────────────────────────────────────────────────────────────
// DELETE /api/clientes/:id
// ──────────────────────────────────────────────────────────────
describe('DELETE /api/clientes/:id — eliminarCliente', () => {
  it('200 elimina el cliente', async () => {
    Contacto.findOneAndDelete.mockResolvedValue({ _id: '1' });
    const res = await request(app)
      .delete('/api/clientes/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.mensaje).toMatch(/eliminado/i);
    expect(Contacto.findOneAndDelete).toHaveBeenCalledWith(
      { _id: '1', empresaId, tipo: 'cliente' }
    );
  });

  it('404 cuando no existe', async () => {
    Contacto.findOneAndDelete.mockResolvedValue(null);
    const res = await request(app)
      .delete('/api/clientes/noexiste')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

// ──────────────────────────────────────────────────────────────
// POST /api/clientes/importar
// ──────────────────────────────────────────────────────────────
describe('POST /api/clientes/importar — importarClientes', () => {
  it('201 importa clientes válidos', async () => {
    Contacto.insertMany.mockResolvedValue([{ _id: '1' }, { _id: '2' }]);
    const filas = [
      { nombre: 'Cliente 1', email: 'c1@test.com' },
      { nombre: 'Cliente 2', email: 'c2@test.com' },
    ];
    const res = await request(app)
      .post('/api/clientes/importar')
      .set('Authorization', `Bearer ${token}`)
      .send(filas);
    expect(res.status).toBe(201);
    expect(res.body.insertados).toBe(2);
  });

  it('400 cuando el array está vacío', async () => {
    const res = await request(app)
      .post('/api/clientes/importar')
      .set('Authorization', `Bearer ${token}`)
      .send([]);
    expect(res.status).toBe(400);
    expect(res.body.mensaje).toMatch(/datos válidos/i);
  });

  it('400 cuando se superan los 500 registros', async () => {
    const filas = Array.from({ length: 501 }, (_, i) => ({ nombre: `Cliente ${i}` }));
    const res = await request(app)
      .post('/api/clientes/importar')
      .set('Authorization', `Bearer ${token}`)
      .send(filas);
    expect(res.status).toBe(400);
    expect(res.body.mensaje).toMatch(/máximo/i);
  });

  it('exactamente 500 registros se acepta', async () => {
    Contacto.insertMany.mockResolvedValue(Array(500).fill({ _id: '1' }));
    const filas = Array.from({ length: 500 }, (_, i) => ({ nombre: `Cliente ${i}` }));
    const res = await request(app)
      .post('/api/clientes/importar')
      .set('Authorization', `Bearer ${token}`)
      .send(filas);
    expect(res.status).toBe(201);
  });

  it('filtra registros sin nombre antes de insertar', async () => {
    Contacto.insertMany.mockResolvedValue([{ _id: '1' }]);
    const filas = [
      { nombre: 'Cliente válido' },
      { email: 'sinnombre@test.com' },
    ];
    await request(app)
      .post('/api/clientes/importar')
      .set('Authorization', `Bearer ${token}`)
      .send(filas);

    const docsInsertados = Contacto.insertMany.mock.calls[0][0];
    expect(docsInsertados).toHaveLength(1);
    expect(docsInsertados[0].nombre).toBe('Cliente válido');
  });

  it('400 si no se envía un array', async () => {
    const res = await request(app)
      .post('/api/clientes/importar')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'no es un array' });
    expect(res.status).toBe(400);
  });

  it('siempre asigna empresaId del token a los documentos importados', async () => {
    Contacto.insertMany.mockResolvedValue([{ _id: '1' }]);
    await request(app)
      .post('/api/clientes/importar')
      .set('Authorization', `Bearer ${token}`)
      .send([{ nombre: 'Test', empresaId: 'empresaMaliciosa' }]);

    const docsInsertados = Contacto.insertMany.mock.calls[0][0];
    expect(docsInsertados[0].empresaId).toBe(empresaId);
    expect(docsInsertados[0].empresaId).not.toBe('empresaMaliciosa');
  });
});
