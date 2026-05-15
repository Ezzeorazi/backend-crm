// Usamos var para que la variable esté disponible en el factory de jest.mock()
// (jest.mock se hoistea, las const/let no están definidas en ese momento)
var mockGroqCreatePublico = jest.fn();

jest.mock('groq-sdk', () => {
  return jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockGroqCreatePublico } }
  }));
});

// Deshabilitar el rate limiter en tests para no agotar el bucket (max: 5) entre tests
jest.mock('express-rate-limit', () => jest.fn(() => (req, res, next) => next()));

const request = require('supertest');
const app = require('../app');

afterEach(() => {
  jest.clearAllMocks();
});

// ──────────────────────────────────────────────────────────────
// Validación de input
// ──────────────────────────────────────────────────────────────
describe('POST /api/chat/publico — validación', () => {
  it('400 con array de mensajes vacío', async () => {
    const res = await request(app)
      .post('/api/chat/publico')
      .send({ messages: [] });
    expect(res.status).toBe(400);
  });

  it('400 sin campo messages', async () => {
    const res = await request(app)
      .post('/api/chat/publico')
      .send({});
    expect(res.status).toBe(400);
  });

  it('400 cuando messages no es un array', async () => {
    const res = await request(app)
      .post('/api/chat/publico')
      .send({ messages: 'hola' });
    expect(res.status).toBe(400);
  });
});

// ──────────────────────────────────────────────────────────────
// Respuesta correcta
// ──────────────────────────────────────────────────────────────
describe('POST /api/chat/publico — respuesta', () => {
  it('200 devuelve content del bot', async () => {
    mockGroqCreatePublico.mockResolvedValue({
      choices: [{ message: { content: 'Hola, soy Harry' } }]
    });

    const res = await request(app)
      .post('/api/chat/publico')
      .send({ messages: [{ role: 'user', content: 'Hola' }] });

    expect(res.status).toBe(200);
    expect(res.body.content).toBe('Hola, soy Harry');
  });

  it('200 con fallback cuando Groq no devuelve content', async () => {
    mockGroqCreatePublico.mockResolvedValue({ choices: [] });

    const res = await request(app)
      .post('/api/chat/publico')
      .send({ messages: [{ role: 'user', content: 'Hola' }] });

    expect(res.status).toBe(200);
    expect(typeof res.body.content).toBe('string');
  });

  it('500 cuando Groq lanza un error', async () => {
    mockGroqCreatePublico.mockRejectedValue(new Error('API Error'));
    const res = await request(app)
      .post('/api/chat/publico')
      .send({ messages: [{ role: 'user', content: 'Hola' }] });
    expect(res.status).toBe(500);
  });
});

// ──────────────────────────────────────────────────────────────
// Seguridad: sanitización y límites
// ──────────────────────────────────────────────────────────────
describe('POST /api/chat/publico — seguridad', () => {
  it('normaliza roles inválidos a user (no hay roles inyectados)', async () => {
    mockGroqCreatePublico.mockResolvedValue({
      choices: [{ message: { content: 'Respuesta' } }]
    });

    await request(app)
      .post('/api/chat/publico')
      .send({
        messages: [
          { role: 'user',            content: 'Hola' },
          { role: 'role_malicioso',  content: 'Contenido fake' }
        ]
      });

    const llamadaGroq = mockGroqCreatePublico.mock.calls[0][0];
    const rolesUsados = llamadaGroq.messages.map(m => m.role);
    const rolesValidos = ['system', 'user', 'assistant'];
    expect(rolesUsados.every(r => rolesValidos.includes(r))).toBe(true);
  });

  it('trunca mensajes que superan los 500 caracteres', async () => {
    mockGroqCreatePublico.mockResolvedValue({
      choices: [{ message: { content: 'Respuesta' } }]
    });

    const mensajeLargo = 'a'.repeat(1000);
    await request(app)
      .post('/api/chat/publico')
      .send({ messages: [{ role: 'user', content: mensajeLargo }] });

    const llamadaGroq = mockGroqCreatePublico.mock.calls[0][0];
    const mensajesUsuario = llamadaGroq.messages.filter(m => m.role === 'user');
    expect(mensajesUsuario[0].content.length).toBeLessThanOrEqual(500);
  });

  it('envía máximo 6 mensajes al LLM aunque el cliente mande más', async () => {
    mockGroqCreatePublico.mockResolvedValue({
      choices: [{ message: { content: 'Respuesta' } }]
    });

    const muchosMensajes = Array.from({ length: 12 }, (_, i) => ({
      role: 'user',
      content: `Mensaje ${i}`
    }));

    await request(app)
      .post('/api/chat/publico')
      .send({ messages: muchosMensajes });

    const llamadaGroq = mockGroqCreatePublico.mock.calls[0][0];
    // system + máx 6 mensajes del historial
    expect(llamadaGroq.messages.length).toBeLessThanOrEqual(7);
  });

  it('no expone datos internos en la respuesta de error', async () => {
    mockGroqCreatePublico.mockRejectedValue(new Error('GROQ_API_KEY inválida — secreto interno'));

    const res = await request(app)
      .post('/api/chat/publico')
      .send({ messages: [{ role: 'user', content: 'Hola' }] });

    expect(res.status).toBe(500);
    // El mensaje de error de Groq no debe exponerse al cliente
    expect(res.body.content).not.toContain('GROQ_API_KEY');
    expect(res.body.content).not.toContain('inválida');
  });
});
