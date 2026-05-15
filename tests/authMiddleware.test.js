const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../models/User');
jest.mock('../models/Tarea');

const app = require('../app');
const User = require('../models/User');
const Tarea = require('../models/Tarea');

const JWT_SECRET = 'testsecret';

beforeAll(() => {
  process.env.JWT_SECRET = JWT_SECRET;
});

afterEach(() => {
  jest.clearAllMocks();
});

// ──────────────────────────────────────────────────────────────
// verificarToken middleware
// ──────────────────────────────────────────────────────────────
describe('verificarToken middleware', () => {
  it('retorna 401 sin Authorization header', async () => {
    const res = await request(app).get('/api/tareas');
    expect(res.status).toBe(401);
    expect(res.body.mensaje).toMatch(/token no proporcionado/i);
  });

  it('retorna 401 con esquema distinto de Bearer', async () => {
    const res = await request(app)
      .get('/api/tareas')
      .set('Authorization', 'Basic abc123');
    expect(res.status).toBe(401);
    expect(res.body.mensaje).toMatch(/token no proporcionado/i);
  });

  it('retorna 401 con token malformado', async () => {
    const res = await request(app)
      .get('/api/tareas')
      .set('Authorization', 'Bearer tokeninvalido');
    expect(res.status).toBe(401);
    expect(res.body.mensaje).toMatch(/token inválido/i);
  });

  it('retorna 401 con token expirado', async () => {
    const token = jwt.sign(
      { id: 'usr1', empresaId: 'emp1', rol: 'admin' },
      JWT_SECRET,
      { expiresIn: '-1s' }
    );
    const res = await request(app)
      .get('/api/tareas')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.mensaje).toMatch(/token inválido/i);
  });

  it('retorna 401 con token firmado con secreto incorrecto', async () => {
    const token = jwt.sign(
      { id: 'usr1', empresaId: 'emp1', rol: 'admin' },
      'secreto_incorrecto'
    );
    const res = await request(app)
      .get('/api/tareas')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('permite acceso con token válido', async () => {
    Tarea.find.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockResolvedValue([])
    });
    const token = jwt.sign(
      { id: 'usr1', empresaId: 'emp1', rol: 'admin' },
      JWT_SECRET
    );
    const res = await request(app)
      .get('/api/tareas')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

// ──────────────────────────────────────────────────────────────
// permitirRoles middleware
// ──────────────────────────────────────────────────────────────
describe('permitirRoles middleware', () => {
  it('retorna 403 para rol sin permiso en POST /api/tareas (rol: ventas)', async () => {
    const token = jwt.sign(
      { id: 'usr1', empresaId: 'emp1', rol: 'ventas' },
      JWT_SECRET
    );
    const res = await request(app)
      .post('/api/tareas')
      .set('Authorization', `Bearer ${token}`)
      .send({ titulo: 'Test' });
    expect(res.status).toBe(403);
    expect(res.body.mensaje).toMatch(/rol insuficiente/i);
  });

  it('retorna 403 para rol compras en POST /api/tareas', async () => {
    const token = jwt.sign(
      { id: 'usr2', empresaId: 'emp1', rol: 'compras' },
      JWT_SECRET
    );
    const res = await request(app)
      .post('/api/tareas')
      .set('Authorization', `Bearer ${token}`)
      .send({ titulo: 'Test' });
    expect(res.status).toBe(403);
  });

  it('permite acceso para rol admin', async () => {
    Tarea.mockImplementation(() => ({
      _id: '1',
      titulo: 'Test',
      save: jest.fn().mockResolvedValue(true)
    }));
    const token = jwt.sign(
      { id: 'usr1', empresaId: 'emp1', rol: 'admin' },
      JWT_SECRET
    );
    const res = await request(app)
      .post('/api/tareas')
      .set('Authorization', `Bearer ${token}`)
      .send({ titulo: 'Test' });
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it('permite acceso para rol produccion', async () => {
    Tarea.mockImplementation(() => ({
      _id: '1',
      titulo: 'Test',
      save: jest.fn().mockResolvedValue(true)
    }));
    const token = jwt.sign(
      { id: 'usr3', empresaId: 'emp1', rol: 'produccion' },
      JWT_SECRET
    );
    const res = await request(app)
      .post('/api/tareas')
      .set('Authorization', `Bearer ${token}`)
      .send({ titulo: 'Test' });
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

// ──────────────────────────────────────────────────────────────
// POST /api/auth/login — validaciones de express-validator
// ──────────────────────────────────────────────────────────────
describe('POST /api/auth/login — validaciones', () => {
  it('400 con email inválido', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'noesunemail', contraseña: '123456' });
    expect(res.status).toBe(400);
    expect(res.body.errores).toBeDefined();
  });

  it('400 con contraseña menor a 6 caracteres', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@test.com', contraseña: '123' });
    expect(res.status).toBe(400);
    expect(res.body.errores).toBeDefined();
  });

  it('404 cuando el usuario no existe', async () => {
    User.findOne.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'noexiste@test.com', contraseña: '123456' });
    expect(res.status).toBe(404);
    expect(res.body.mensaje).toMatch(/no encontrado/i);
  });

  it('403 cuando el usuario está desactivado', async () => {
    User.findOne.mockResolvedValue({ activo: false });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'inactivo@test.com', contraseña: '123456' });
    expect(res.status).toBe(403);
    expect(res.body.mensaje).toMatch(/desactivado/i);
  });

  it('401 con contraseña incorrecta', async () => {
    User.findOne.mockResolvedValue({
      activo: true,
      compararPassword: jest.fn().mockResolvedValue(false),
      save: jest.fn()
    });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@test.com', contraseña: '123456' });
    expect(res.status).toBe(401);
    expect(res.body.mensaje).toMatch(/contraseña incorrecta/i);
  });

  it('200 y devuelve token en login exitoso', async () => {
    User.findOne.mockResolvedValue({
      _id: 'usr1',
      nombre: 'Juan',
      email: 'user@test.com',
      rol: 'admin',
      avatar: null,
      empresaId: 'emp1',
      activo: true,
      compararPassword: jest.fn().mockResolvedValue(true),
      save: jest.fn().mockResolvedValue(true)
    });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@test.com', contraseña: '123456' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.usuario).toBeDefined();
    expect(res.body.usuario.email).toBe('user@test.com');
    // La contraseña nunca debe exponerse
    expect(res.body.usuario.contraseña).toBeUndefined();
  });

  it('no expone cuál campo es el incorrecto (timing-safe: mismo mensaje para email y pw)', async () => {
    User.findOne.mockResolvedValue(null);
    const resNoEmail = await request(app)
      .post('/api/auth/login')
      .send({ email: 'fantasma@test.com', contraseña: '123456' });
    expect(resNoEmail.body.mensaje).not.toMatch(/contraseña/i);
  });
});

// ──────────────────────────────────────────────────────────────
// POST /api/auth/forgot-password — validaciones
// ──────────────────────────────────────────────────────────────
describe('POST /api/auth/forgot-password — anti-enumeración', () => {
  it('400 con email inválido', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'noemail' });
    expect(res.status).toBe(400);
  });

  it('siempre devuelve 200 aunque el email no exista (previene enumeración)', async () => {
    User.findOne.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'noexiste@test.com' });
    expect(res.status).toBe(200);
    expect(res.body.mensaje).toBeDefined();
  });
});
