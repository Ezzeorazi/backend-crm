# Backend — Nimbus CRM · Documentación Técnica

> Repositorio privado. Autor: **Ezequiel Orazi** · ezequiel.orazi90@gmail.com  
> Node.js 18+ · Express 5 · MongoDB + Mongoose · JWT · Groq SDK

---

## Índice

1. [Stack y dependencias clave](#stack-y-dependencias)
2. [Levantar localmente](#levantar-localmente)
3. [Variables de entorno](#variables-de-entorno)
4. [Estructura de carpetas](#estructura-de-carpetas)
5. [Middleware de auth](#middleware-de-auth)
6. [Endpoint completo (todas las rutas)](#endpoints)
7. [Asistente IA — Harry](#asistente-ia-harry)
8. [Endpoint admin — gestión de planes](#endpoint-admin)
9. [Chat público (landing sin login)](#chat-publico)
10. [Modelo Empresa y planes](#modelo-empresa-y-planes)
11. [Importación masiva desde Excel](#importacion-masiva)
12. [Generación de PDF](#generacion-de-pdf)
13. [Jobs automáticos](#jobs-automaticos)
14. [Seguridad implementada](#seguridad)
15. [Logging](#logging)
16. [Tests](#tests)
17. [Deploy en Render](#deploy-en-render)

---

## Stack y dependencias

| Paquete | Uso |
|---|---|
| `express` v5 | Framework HTTP |
| `mongoose` | ODM para MongoDB |
| `jsonwebtoken` + `bcryptjs` | Auth JWT + hashing |
| `groq-sdk` | Cliente oficial para Groq/Llama (IA) |
| `pdfkit` | Generación de PDFs (presupuestos) |
| `nodemailer` | Envío de emails (alertas de stock) |
| `multer` | Upload de archivos (logo de empresa) |
| `cloudinary` | Almacenamiento de imágenes |
| `node-cron` | Jobs programados (alertas stock) |
| `helmet` | Headers HTTP seguros |
| `express-rate-limit` | Rate limiting por IP |
| `express-mongo-sanitize` | Prevención inyección NoSQL |
| `morgan` + `winston` | Logging HTTP + aplicación |
| `jest` + `supertest` | Tests unitarios e integración |

---

## Levantar localmente

```bash
# 1. Clonar
git clone https://github.com/Ezzeorazi/backend-crm.git
cd Backend-crm

# 2. Instalar
npm install

# 3. Crear .env (ver sección Variables de entorno)

# 4. Levantar en desarrollo
npm run dev      # nodemon server.js — puerto 5000
```

---

## Variables de entorno

Crear `.env` en la raíz de `Backend-crm/`:

```env
# Servidor
PORT=5000
NODE_ENV=development

# MongoDB
MONGO_URI=mongodb+srv://usuario:password@cluster.mongodb.net/nimbus-crm

# Auth
JWT_SECRET=una_cadena_larga_y_aleatoria_aqui

# CORS
CORS_ORIGIN=http://localhost:5173

# Cloudinary (para logos de empresa)
CLOUDINARY_URL=cloudinary://api_key:api_secret@cloud_name

# Groq IA (Harry)
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxx

# Admin SaaS (para endpoint de gestión de planes)
ADMIN_SECRET=nimbus-admin-secreto-fuerte-2026

# Email (para alertas de stock bajo)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu@gmail.com
SMTP_PASS=app_password_de_gmail
SMTP_FROM=Nimbus CRM <noreply@nimbus-crm.com>

# Notificación de nuevas cuentas (opcional)
ADMIN_NOTIFY_EMAIL=ezequiel.orazi90@gmail.com
```

> En Render, configurar todas estas variables en **Environment → Add environment variable**. Nunca commitear `.env`.

---

## Estructura de carpetas

```
Backend-crm/
├── controllers/        # Lógica de negocio por módulo
│   ├── chatController.js       ← Asistente Harry (Groq/Llama)
│   ├── clienteController.js    ← CRUD + importarClientes
│   ├── proveedorController.js  ← CRUD + importarProveedores
│   ├── empresaController.js    ← CRUD empresa + crearEmpresaDemo
│   └── ...
├── models/             # Schemas Mongoose
│   ├── Empresa.js      ← Incluye plan y chatStats
│   ├── Contacto.js     ← Clientes y proveedores (campo tipo: [])
│   ├── Producto.js
│   ├── Venta.js
│   └── ...
├── routes/             # Rutas Express
│   ├── admin.js        ← Gestión de planes (requiere ADMIN_SECRET)
│   ├── chat.js         ← Harry (requiere JWT)
│   ├── chatPublico.js  ← Harry landing (sin auth, rate limit por IP)
│   └── ...
├── middleware/
│   ├── authMiddleware.js   ← verificarToken + permitirRoles
│   └── errorMiddleware.js
├── jobs/
│   └── stockAlertJob.js   ← Alerta diaria de stock bajo (node-cron)
├── utils/
│   ├── logger.js      ← Winston
│   └── mailer.js      ← Nodemailer helper
├── tests/             ← Jest + Supertest
├── app.js             ← Express app (sin listen)
└── server.js          ← Punto de entrada (listen)
```

---

## Middleware de auth

```
POST /api/auth/login   →  emite JWT { id, rol, empresaId }
                              ↓
Cada request al dashboard:
Headers: Authorization: Bearer <token>
                              ↓
verificarToken middleware:
  - Decodifica JWT
  - Asigna req.usuario = { id, rol, empresaId }
  - Asigna req.empresaId = empresaId (usado en TODAS las queries)
                              ↓
permitirRoles('admin', 'ventas', ...)
  - Verifica req.usuario.rol
```

**Roles**: `admin` · `ventas` · `inventario` · `rrhh` · `produccion` · `soporte`

---

## Endpoints

### Auth
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/login` | Login — devuelve JWT |
| POST | `/api/auth/register` | Registro de nuevo usuario en empresa existente |

### Empresa
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/api/empresas/demo` | Pública | Crear empresa + usuario admin (onboarding) |
| GET | `/api/empresa` | JWT | Obtener datos de la empresa del usuario |
| PUT | `/api/empresa` | JWT + admin | Actualizar datos de empresa |
| POST | `/api/empresa/logo` | JWT + admin | Subir logo (Cloudinary) |

### Admin SaaS ← para el dueño de Nimbus
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/api/admin/empresas` | `x-admin-secret` | Listar todas las empresas con plan y uso |
| PATCH | `/api/admin/empresa/:id/plan` | `x-admin-secret` | Cambiar plan de una empresa |

### Clientes / Proveedores
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/api/clientes` | JWT | Listar (con filtros: tipo, busqueda, pagina) |
| POST | `/api/clientes` | JWT | Crear cliente |
| PUT | `/api/clientes/:id` | JWT | Editar |
| DELETE | `/api/clientes/:id` | JWT | Eliminar |
| POST | `/api/clientes/importar` | JWT | Importar desde Excel (bulk) |
| *(mismo patrón)* | `/api/proveedores/...` | JWT | Ídem para proveedores |

### Productos
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/api/productos` | JWT | Listar (con filtros + paginación) |
| POST | `/api/productos` | JWT | Crear producto |
| PUT | `/api/productos/:id` | JWT | Editar |
| DELETE | `/api/productos/:id` | JWT | Eliminar |
| POST | `/api/productos/importar` | JWT | Importar desde Excel (bulk) |

### Ventas, Presupuestos, Facturas
| Módulo | Base | Acciones extra |
|---|---|---|
| Presupuestos | `/api/presupuestos` | `GET /:id/pdf` — genera PDF descargable |
| Ventas | `/api/ventas` | |
| Facturas | `/api/facturas` | |
| Pagos | `/api/pagos` | |

### Inventario
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/movimientos` | Historial de movimientos de stock |
| POST | `/api/movimientos` | Registrar entrada o salida |

### Tareas
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/tareas` | Listar tareas (con filtros de estado/usuario) |
| POST | `/api/tareas` | Crear tarea |
| PUT | `/api/tareas/:id` | Actualizar estado o datos |
| DELETE | `/api/tareas/:id` | Eliminar |
| POST | `/api/tareas/:id/comentarios` | Agregar comentario |

### Producción / Compras / Oportunidades
Siguen el mismo patrón CRUD en:
`/api/ordenes`, `/api/ordenes-compra`, `/api/ordenes-pago`, `/api/oportunidades`

### Chat — Harry
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/api/chat/message` | JWT | Envía mensaje a Harry (con límite por plan) |
| POST | `/api/chat/publico` | Ninguna | Harry para landing (5 msgs/15min por IP) |

### Búsqueda global
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/api/search?q=...` | JWT | Busca en clientes, productos, ventas, facturas |

---

## Asistente IA — Harry

**Archivo**: `controllers/chatController.js`

### Flujo completo de un mensaje

```
Frontend: POST /api/chat/message
  { messages: [...], currentPage: "Clientes", currentPath: "/dashboard/clientes" }
            ↓
1. verificarToken → req.empresaId
2. Obtener empresa + plan + chatStats
3. Verificar límite mensual:
   - mesActual = "YYYY-MM"
   - stats.mes === mesActual ? usos = stats.usos : usos = 0
   - si usos >= limite → 429 con { limite: true, plan, usos, maximo }
4. Llamar Groq API con TOOL_DECLARATIONS (JSON Schema lowercase)
5. Si Groq devuelve tool_calls → ejecutar tool → agregar result → segunda llamada Groq
6. Si Groq devuelve mensaje directo → devolver content
7. Si límite !== Infinity → incrementar chatStats:
   - mes cambia: $set { mes: mesActual, usos: 1 }
   - mismo mes: $inc { 'chatStats.usos': 1 }
8. Response: { content: "..." }
```

### Límites de plan

```javascript
const PLAN_LIMITES = {
  free: 30,
  starter: 300,
  pro: Infinity,
  enterprise: Infinity,
};
```

### Herramientas disponibles (tool calling)

```javascript
// Todas usan tipos JSON Schema lowercase (requerido por Groq)
// CORRECTO: "type": "object"  ← Groq
// INCORRECTO: "type": "OBJECT"  ← era formato Gemini, causaba fallo silencioso
```

| Tool name | Acción backend |
|---|---|
| `buscar_clientes` | `Contacto.find` con regex + tipo cliente |
| `crear_cliente` | `Contacto.create` con tipo cliente |
| `buscar_productos` | `Producto.find` con regex |
| `crear_producto` | `Producto.create` |
| `buscar_proveedores` | `Contacto.find` con tipo proveedor |
| `crear_tarea` | `Tarea.create` |
| `listar_tareas_pendientes` | `Tarea.find` con estado pendiente/en_progreso |
| `buscar_presupuestos` | `Presupuesto.find` con populate cliente |
| `obtener_resumen_ventas` | Aggregate de ventas del último mes |

---

## Endpoint admin

**Archivo**: `routes/admin.js`

Protegido por el header `x-admin-secret` contra el valor de `process.env.ADMIN_SECRET`.

### Listar todas las empresas

```bash
curl -X GET https://backend.onrender.com/api/admin/empresas \
  -H "x-admin-secret: TU_ADMIN_SECRET"
```

Responde array con:
```json
[{
  "_id": "665...",
  "nombre": "Emprendimiento Dulce",
  "plan": "free",
  "chatStats": { "mes": "2026-05", "usos": 18 },
  "estado": "activo",
  "createdAt": "2026-04-10T..."
}]
```

### Cambiar plan

```bash
curl -X PATCH https://backend.onrender.com/api/admin/empresa/665.../plan \
  -H "x-admin-secret: TU_ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"plan": "pro"}'
```

Responde:
```json
{
  "mensaje": "Plan actualizado a \"pro\"",
  "empresa": { "nombre": "Emprendimiento Dulce", "plan": "pro" }
}
```

**Planes válidos**: `free` · `starter` · `pro` · `enterprise`

---

## Chat publico

**Archivo**: `routes/chatPublico.js`

- No requiere JWT.
- Rate limit: **5 mensajes por IP cada 15 minutos**.
- Modelo Groq con sistema prompt orientado solo a explicar Nimbus CRM y guiar a crear cuenta.
- Sin acceso a datos del CRM (no hay empresa en contexto).
- Usado por el widget de Harry en el **landing page** (usuarios no logueados).

---

## Modelo Empresa y planes

**Archivo**: `models/Empresa.js`

Campos relevantes para el sistema de planes:

```javascript
{
  plan: {
    type: String,
    enum: ['free', 'starter', 'pro', 'enterprise'],
    default: 'free'
  },
  chatStats: {
    mes:  { type: String, default: '' },  // "YYYY-MM"
    usos: { type: Number, default: 0 }
  }
}
```

El campo `chatStats.mes` se compara con el mes actual para detectar si hay que reiniciar el contador o incrementarlo. La lógica está en `chatController.js` antes de cada mensaje de Harry.

---

## Importacion masiva

### Clientes: `POST /api/clientes/importar`
```json
[
  { "nombre": "Juan Pérez", "email": "juan@...","telefono": "..." },
  ...
]
```
Usa `Contacto.insertMany(docs, { ordered: false })` — continúa aunque algún registro falle.
Respuesta exitosa: `{ "insertados": 47 }`
Respuesta parcial (207): `{ "insertados": 45, "mensaje": "Algunos registros no se importaron" }`

### Proveedores: `POST /api/proveedores/importar`
Igual que clientes pero agrega `tipo: ['proveedor']`.

### Productos: `POST /api/productos/importar`
```json
[
  { "nombre": "Torta cumpleaños", "precio": 5000, "stock": 10 },
  ...
]
```

---

## Generacion de PDF

`GET /api/presupuestos/:id/pdf`

1. Busca el presupuesto + populate de cliente y productos.
2. Si la empresa tiene logo, lo descarga desde Cloudinary vía `https.get()`.
3. Genera PDF con PDFKit: logo, datos de empresa, tabla de productos, totales.
4. Devuelve como stream con `Content-Type: application/pdf`.

---

## Jobs automaticos

**Archivo**: `jobs/stockAlertJob.js`

- Se registra al iniciar el servidor con `node-cron`.
- Ejecuta a las **8:00 AM** todos los días.
- Busca todos los productos donde `stock <= stockMinimo` agrupados por `empresaId`.
- Envía un email por empresa con la lista de productos críticos vía Nodemailer.
- Si no hay variables SMTP configuradas, el job no lanza error — simplemente no envía.

---

## Seguridad

```javascript
app.use(helmet());                  // Headers seguros
app.use(mongoSanitize());           // Previene { $gt: "" } en queries
app.set('trust proxy', 1);          // IP real en Render (X-Forwarded-For)

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,        // 15 minutos
  max: 300,                         // máximo 300 requests por IP
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,                          // máximo 10 intentos de login
});
```

Passwords: `bcrypt.hash(password, 10)` — factor 10.  
JWT: `{ expiresIn: '8h' }` con secret largo.  
CORS: acepta cualquier origin para compatibilidad con previews de Netlify.

---

## Logging

**Archivo**: `utils/logger.js`

- Winston con niveles `info`, `warn`, `error`.
- En producción: formato `combined` (IP, método, path, status, tiempo).
- En desarrollo: formato `dev` (colorizado).
- Morgan integrado como stream de Winston para logs HTTP automáticos.

---

## Tests

```bash
npm test        # Jest + Supertest
npm run test:coverage  # con cobertura
```

Tests en `tests/`:
- `auth.test.js` — login, token, roles
- `presupuestos.test.js` — CRUD con empresa mock
- `tareas.test.js` — estados, comentarios
- `ordenes.test.js` — producción

Cobertura actual: ~15%. Suficiente para CI pero mejorable.

---

## Deploy en Render

1. **Conectar repo**: `https://github.com/Ezzeorazi/backend-crm` rama `main`.
2. **Build command**: `npm install`
3. **Start command**: `node server.js`
4. **Variables de entorno**: Agregar todas las listadas en la sección [Variables de entorno](#variables-de-entorno).

### Variables obligatorias en Render:
```
MONGO_URI
JWT_SECRET
GROQ_API_KEY
ADMIN_SECRET         ← Para gestión de planes
CLOUDINARY_URL
NODE_ENV=production
```

### Variables opcionales (emails):
```
SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM
ADMIN_NOTIFY_EMAIL
```

### Render free tier — spin-down
El servidor se duerme tras ~15 min de inactividad. El primer request tarda ~50 segundos.  
**Mitigación implementada**: El landing page hace `fetch('/api/status')` al montar para despertar el servidor antes de que el usuario necesite hacer login.

---

## Matriz de permisos por rol

| Acción | admin | ventas | inventario | rrhh | produccion | soporte |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Configurar empresa | ✓ | | | | | |
| Gestionar usuarios | ✓ | | | | | |
| Clientes/Proveedores | ✓ | ✓ | | | | ✓ |
| Productos | ✓ | ✓ | ✓ | | | |
| Ventas/Presupuestos | ✓ | ✓ | | | | |
| Facturas/Pagos | ✓ | ✓ | | | | |
| Inventario | ✓ | | ✓ | | | |
| Producción | ✓ | | | | ✓ | |
| Tareas | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Harry | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

---

*Última actualización: Mayo 2026*
