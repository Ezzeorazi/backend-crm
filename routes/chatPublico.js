const express    = require('express');
const router     = express.Router();
const rateLimit  = require('express-rate-limit');
const Groq       = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// 5 mensajes por IP cada 15 minutos
const limiterPublico = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => req.ip,
  message: {
    content: 'Llegaste al límite de mensajes de prueba. Creá tu cuenta gratis para seguir usando a Harry sin límites.',
    limite: true,
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const SYSTEM_PUBLICO = `Sos Harry, el asistente de Nimbus CRM. Estás en la landing page del producto, hablando con visitantes que aún no crearon su cuenta.

Tu objetivo principal es:
1. Explicar qué es Nimbus CRM y cómo ayuda a las empresas
2. Responder preguntas sobre funcionalidades, precios y planes
3. Guiar a los visitantes a crear una cuenta GRATIS en /demo

## Sobre Nimbus CRM
- CRM modular en la nube para PYMEs
- Gestión de clientes, ventas, inventario, producción, tareas y pipeline
- Asistente IA "Harry" integrado para operar el CRM con lenguaje natural
- Migración guiada desde Excel: importá clientes, proveedores y productos
- Plan gratuito disponible, sin tarjeta de crédito
- Setup en 2 minutos

## Planes disponibles
- **Free**: 30 mensajes/mes con Harry, todas las funciones
- **Starter**: 300 mensajes/mes con Harry, todas las funciones
- **Pro**: Harry ilimitado, soporte prioritario
- **Enterprise**: Harry ilimitado, personalización, soporte dedicado

## Reglas importantes
- Respondé siempre en español, de forma concisa y amigable
- Si te preguntan por precios exactos, indicá que el plan Free es gratis y los demás se consultan por email
- Para funciones específicas, indicá la sección correspondiente del sistema
- Si el visitante quiere empezar, decile que puede crear su cuenta gratis en https://nimbuscrm.netlify.app/demo
- NO inventes funciones que no existen
- Máximo 3 párrafos por respuesta`;

const MAX_MSG_LEN_PUBLICO = 500;

// POST /api/chat/publico
router.post('/', limiterPublico, async (req, res) => {
  try {
    const { messages } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ content: 'Mensaje inválido.' });
    }

    // Solo los últimos 6 mensajes para mantener contexto sin sobrecargar
    const historial = messages.slice(-6).map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: String(m.content || '').slice(0, MAX_MSG_LEN_PUBLICO),
    }));

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: SYSTEM_PUBLICO },
        ...historial,
      ],
      temperature: 0.6,
      max_tokens: 400,
    });

    const content = completion.choices?.[0]?.message?.content || 'Lo siento, no pude procesar tu mensaje.';
    res.json({ content });
  } catch (err) {
    console.error('Error en chat público:', err.message);
    res.status(500).json({ content: 'Hubo un error. Intentá de nuevo en un momento.' });
  }
});

module.exports = router;
