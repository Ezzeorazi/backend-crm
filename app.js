require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();

// Configuración global de CORS para el frontend alojado en Netlify
const FRONTEND_URL = 'https://taupe-crisp-4638a8.netlify.app';
const corsOptions = {
  origin: FRONTEND_URL,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Responde preflight correctamente

// Middlewares
app.use(express.json());

// 🔌 Conexión a MongoDB
console.log('Conectando a MongoDB...');
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ Conectado a MongoDB desde app.js'))
  .catch(err => console.error('❌ Error de conexión a MongoDB:', err));

// 📦 Rutas
app.use('/api/usuarios', require('./routes/userRoutes'));
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/protegida', require('./routes/protegidaRoutes'));
app.use('/api/productos', require('./routes/productRoutes'));
app.use('/api/empresas', require('./routes/empresas'));
app.use('/api/empresa', require('./routes/empresa'));
app.use('/api/clientes', require('./routes/clientes'));
app.use('/api/proveedores', require('./routes/proveedores'));
app.use('/api/ventas', require('./routes/ventas'));
app.use('/api/presupuestos', require('./routes/presupuestos'));
app.use('/api/facturas', require('./routes/facturas'));
app.use('/api/pagos', require('./routes/pagos'));
app.use('/api/movimientos', require('./routes/movimientos'));
app.use('/api/tareas', require('./routes/tareas'));
app.use('/api/ordenes', require('./routes/ordenes'));

// 🛑 Middleware global de errores
app.use((err, req, res, next) => {
  console.error('🚨 Error global:', err.stack);
  res.status(500).json({ mensaje: 'Error interno del servidor' });
});

module.exports = app;
