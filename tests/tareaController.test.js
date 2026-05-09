const request = require('supertest');
const app = require('../app');
const Tarea = require('../models/Tarea');
const jwt = require('jsonwebtoken');

jest.mock('../models/Tarea');

const empresaId = 'empresa1';
let token;

beforeAll(() => {
  process.env.JWT_SECRET = 'testsecret';
  token = jwt.sign({ empresaId, rol: 'admin' }, process.env.JWT_SECRET);
});

describe('Tarea API', () => {
  test('✅ Crear tarea correctamente', async () => {
    Tarea.create.mockResolvedValue({ _id: '1', titulo: 'Test Tarea', empresaId });

    const res = await request(app)
      .post('/api/tareas')
      .set('Authorization', `Bearer ${token}`)
      .send({ titulo: 'Test Tarea', empresaId });

    expect(res.statusCode).toBe(201);
    expect(res.body.titulo).toBe('Test Tarea');
  });

  test('❌ Crear tarea sin título', async () => {
    const res = await request(app)
      .post('/api/tareas')
      .set('Authorization', `Bearer ${token}`)
      .send({ empresaId });

    expect(res.statusCode).toBe(400);
  });

  test('✅ Listar tareas de la empresa', async () => {
    Tarea.find.mockResolvedValue([{ _id: '1', empresaId }]);

    const res = await request(app)
      .get('/api/tareas')
      .set('Authorization', `Bearer ${token}`)
      .query({ empresaId });

    expect(res.statusCode).toBe(200);
    expect(res.body[0].empresaId).toBe(empresaId);
  });

  test('❌ No listar tareas de otra empresa', async () => {
    Tarea.find.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/tareas')
      .set('Authorization', `Bearer ${token}`)
      .query({ empresaId: 'otraEmpresa' });

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(0);
  });
});
