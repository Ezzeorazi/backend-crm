# Nimbus CRM – Backend

API REST para el CRM multi-tenant construida con **Node.js + Express + MongoDB**.

---

## Stack

| Tecnología | Versión | Uso |
|---|---|---|
| Node.js | >= 18 | Runtime |
| Express | 5.1 | Framework HTTP |
| MongoDB + Mongoose | 8.16 | Base de datos |
| JWT (jsonwebtoken) | 9.0 | Autenticación |
| BcryptJS | 3.0 | Hash de contraseñas |
| Multer | 2.0 | Upload de archivos |
| Nodemailer | 6.9 | Envío de emails |
| PDFKit | 0.17 | Generación de PDFs |
| node-cron | 3.0 | Tareas programadas |
| express-validator | 7.2 | Validación de entrada |

---

## Estructura del proyecto

```
Backend-crm/
├── controllers/          # Lógica de negocio (14 controladores)
├── models/               # Esquemas Mongoose (15 modelos)
├── routes/               # Rutas Express (15 archivos)
├── middleware/
│   └── authMiddleware.js # verificarToken + permitirRoles
├── services/             # Servicios de negocio
├── jobs/
│   └── stockAlertJob.js  # Cron diario de alertas de stock
├── tests/                # Tests Jest (4 archivos)
├── app.js                # Configuración Express y rutas
├── server.js             # Punto de entrada
└── jest.config.js
```

---

## Variables de entorno

Crear un archivo `.env` en la raíz de `Backend-crm/`:

```env
# Servidor
PORT=5000

# Base de datos
MONGO_URI=mongodb://localhost:27017/nimbus_crm

# Autenticación
JWT_SECRET=cambiar_en_produccion_por_secreto_largo_y_aleatorio

# CORS
CORS_ORIGIN=http://localhost:5173

# Email (requerido para alertas de stock bajo)
SMTP_HOST=smtp.ejemplo.com
SMTP_PORT=587
SMTP_USER=tu@email.com
SMTP_PASS=tu_contrasena_smtp
SMTP_FROM=noreply@nimbus-crm.com
```

> Las variables SMTP son obligatorias para que el job de alertas de stock funcione. Sin ellas, el cron job arranca pero los emails fallan silenciosamente.

---

## Puesta en marcha

```bash
cd Backend-crm
npm install
cp .env.example .env   # editar con tus valores
npm run dev            # nodemon – recarga en caliente
npm start              # producción
npm test               # Jest
```

---

## Modelos de base de datos

### Empresa
- `nombre`, `razonSocial`, `cuit`, `email`, `telefono`, `direccion`
- `plan`: `free | starter | pro | enterprise`
- `estado`: `activo | inactivo | suspendido`
- `config`: `{ moneda, idioma, ivaDefault, tipoFacturacion }`
- `colorPrimario`, `logoUrl`

### User
- `nombre`, `email`, `contraseña` (bcrypt), `rol`, `empresaId`, `activo`
- Roles disponibles: `admin | ventas | compras | inventario | rrhh | produccion | soporte`
- Index único: `empresaId + email`

### Producto
- `nombre`, `sku` (único por empresa), `descripcion`, `stock`, `stockMinimo`
- `unidad`: `unidad | kg | litro | m2 | hora | ...`
- `precio`, `costo`, `impuesto` (% IVA), `categoria`, `imagenUrl`, `activo`

### Contacto (unifica clientes y proveedores)
- `tipo`: `['cliente'] | ['proveedor'] | ['cliente', 'proveedor']`
- `nombre`, `razonSocial`, `cuit`, `email`, `telefono`, `direccion`
- Búsqueda textual indexada

### Venta
- `numero` (único por empresa), `cliente`, `presupuesto` (ref)
- `productos`: `[{ producto, nombre, sku, cantidad, precio, descuento, subtotal }]`
- `subtotal`, `descuento`, `iva`, `total`
- `estado`: `pendiente | procesando | completado | cancelado`

### Presupuesto
- `numero`, `cliente`, `productos`, `subtotal`, `descuento`, `iva`, `total`
- `validezDias`, `vencimiento`
- `estado`: `borrador | enviado | aceptado | rechazado | vencido`

### Factura
- `numero`, `tipo` (A/B/C/X), `venta` (ref), `cliente`, `clienteSnapshot`
- `estado`: `pendiente | pagada | parcial | anulada`

### Pago
- `factura` (ref), `monto`, `fecha`, `metodo`: `efectivo | tarjeta | transferencia | cheque`

### MovimientoStock
- `productoId`, `tipo`: `entrada | salida | ajuste`
- `cantidad`, `stockAnterior`, `stockResultante`
- `motivo`: `venta | compra | ajuste_manual | produccion | devolucion | merma`
- `origen`: `{ tipo, referenciaId }` — trazabilidad completa

### Tarea
- `titulo`, `descripcion`, `tipo`: `llamada | reunion | email | seguimiento | otro`
- `asignadoA`, `creadoPor`, `estado`: `pendiente | en_progreso | completada | cancelada`
- `prioridad`: `alta | media | baja`
- `referencias`: `{ contactoId, productoId, ventaId }` (opcionales)
- `comentarios`: `[{ texto, autor, fecha }]`

### OrdenProduccion
- `numero`, `producto`, `cantidad`, `ventaId` (opcional)
- `estadoGeneral`: `borrador | en_proceso | pausada | completada | cancelada`
- `etapas`: `[{ nombre, estado, responsable, fechaInicio, fechaFin, notas }]`

### OrdenCompra
- `numero`, `proveedor`, `productos`, `subtotal`, `iva`, `total`
- `estado`: `borrador | enviada | confirmada | recibida_parcial | recibida | cancelada`

### Contador
- Modelo auxiliar para números secuenciales por empresa y tipo de documento.

---

## Autenticación y roles

### Flujo

1. `POST /api/auth/login` recibe `{ email, contraseña }`.
2. El backend valida con bcrypt y emite un JWT con `{ id, rol, empresaId }` que expira en 8h.
3. El cliente envía el token en cada request: `Authorization: Bearer <token>`.
4. `verificarToken` decodifica el JWT y asigna `req.usuario` y `req.empresaId`.
5. `permitirRoles(...roles)` compara `req.usuario.rol` con los roles permitidos.

### Matriz de permisos (endpoints críticos)

| Endpoint | admin | ventas | compras | inventario | produccion | rrhh | soporte |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Usuarios (CRUD) | X | | | | | | |
| Productos (crear/editar) | X | | | X | | | |
| Productos (eliminar) | X | | | | | | |
| Ventas (crear/editar) | X | X | | | | | |
| Presupuestos | X | X | | | | | |
| Inventario (movimientos) | X | | X | X | X | | |
| Órdenes producción | X | | | | X | | |
| Órdenes compra | X | | X | | | | |
| Tareas | X | X | X | X | X | X | X |

---

## Endpoints

### Auth
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/login` | Login, devuelve JWT |

### Empresas
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/empresas` | Registrar empresa + admin (flujo demo) |
| GET | `/api/empresas` | Listar empresas |
| GET | `/api/empresa/:id` | Ver empresa |
| POST | `/api/empresa/logo` | Subir logo (PNG) |

### Usuarios
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/usuarios` | Listar usuarios de la empresa |
| POST | `/api/usuarios` | Crear usuario |
| PUT | `/api/usuarios/:id` | Editar usuario |
| DELETE | `/api/usuarios/:id` | Eliminar usuario |

### Productos
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/productos` | Listar productos |
| POST | `/api/productos` | Crear producto |
| GET | `/api/productos/:id` | Ver producto |
| PUT | `/api/productos/:id` | Editar producto |
| DELETE | `/api/productos/:id` | Eliminar producto |
| POST | `/api/productos/importar` | Importar desde Excel (.xlsx) |

### Clientes
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/clientes` | Listar clientes |
| POST | `/api/clientes` | Crear cliente |
| GET | `/api/clientes/:id` | Ver cliente |
| PUT | `/api/clientes/:id` | Editar cliente |
| DELETE | `/api/clientes/:id` | Eliminar cliente |

### Proveedores
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/proveedores` | Listar proveedores |
| POST | `/api/proveedores` | Crear proveedor |
| GET | `/api/proveedores/:id` | Ver proveedor |
| PUT | `/api/proveedores/:id` | Editar proveedor |
| DELETE | `/api/proveedores/:id` | Eliminar proveedor |

### Presupuestos
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/presupuestos` | Listar presupuestos |
| POST | `/api/presupuestos` | Crear presupuesto |
| GET | `/api/presupuestos/:id` | Ver presupuesto |
| PUT | `/api/presupuestos/:id` | Editar presupuesto |
| DELETE | `/api/presupuestos/:id` | Eliminar presupuesto |
| GET | `/api/presupuestos/:id/pdf` | Descargar PDF con logo corporativo |

### Ventas
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/ventas` | Listar ventas |
| POST | `/api/ventas` | Crear venta (descuenta stock automáticamente) |
| GET | `/api/ventas/:id` | Ver venta |
| PUT | `/api/ventas/:id` | Editar venta |
| DELETE | `/api/ventas/:id` | Eliminar venta |

### Facturas
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/facturas` | Listar facturas |
| POST | `/api/facturas` | Crear factura |
| GET | `/api/facturas/:id` | Ver factura |
| PUT | `/api/facturas/:id` | Editar factura |
| DELETE | `/api/facturas/:id` | Eliminar factura |

### Pagos
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/pagos/factura/:facturaId` | Pagos de una factura |
| POST | `/api/pagos` | Registrar pago |

### Inventario (Movimientos de stock)
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/movimientos/entrada` | Registrar entrada de stock |
| POST | `/api/movimientos/salida` | Registrar salida de stock |
| GET | `/api/movimientos` | Historial de movimientos |
| GET | `/api/movimientos/reportes/stock-bajo` | Productos bajo stock mínimo |
| GET | `/api/movimientos/reportes/sin-movimientos/:dias` | Productos sin movimientos en N días |
| GET | `/api/movimientos/reportes/evolucion/:productoId` | Evolución de stock de un producto |

### Tareas
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/tareas` | Listar tareas |
| POST | `/api/tareas` | Crear tarea |
| GET | `/api/tareas/:id` | Ver tarea con comentarios |
| PUT | `/api/tareas/:id` | Editar tarea / agregar comentario |
| DELETE | `/api/tareas/:id` | Eliminar tarea |

### Órdenes de producción
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/ordenes` | Listar órdenes |
| POST | `/api/ordenes` | Crear orden |
| GET | `/api/ordenes/:id` | Ver orden con etapas |
| PUT | `/api/ordenes/:id` | Editar orden / actualizar etapa |
| DELETE | `/api/ordenes/:id` | Eliminar orden |

### Órdenes de compra
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/ordenes-compra` | Listar órdenes de compra |
| POST | `/api/ordenes-compra` | Crear orden de compra |
| GET | `/api/ordenes-compra/:id` | Ver orden de compra |
| PUT | `/api/ordenes-compra/:id` | Editar orden de compra |

---

## Automatizaciones

### Job: Alerta de stock bajo
- Se ejecuta **diariamente a las 8:00** via `node-cron`.
- Busca productos con `stock <= stockMinimo` por empresa.
- Envía un email consolidado a cada empresa usando Nodemailer.
- Requiere las variables `SMTP_*` en `.env`.

---

## Tests

Los tests están en `Backend-crm/tests/` y usan **Jest + Supertest**.

```bash
npm test
```

| Archivo | Qué cubre |
|---|---|
| `authMiddleware.test.js` | Token inválido, expirado, sin token |
| `presupuestoController.test.js` | CRUD de presupuestos |
| `ordenProduccionController.test.js` | CRUD de órdenes |
| `tareaController.test.js` | CRUD de tareas |

Cobertura estimada: ~15%. No existen tests para los controladores de ventas, productos, usuarios, inventario ni para el job de stock.

---

## Estado para produccion

### Implementado y funcional
- Autenticacion JWT con multi-tenant por `empresaId`
- CRUD completo de todos los modulos
- Ciclo presupuesto → venta → factura → pago con descuento automatico de stock
- Generacion de PDF con logo corporativo
- Importacion masiva desde Excel
- Alertas diarias de stock bajo por email
- Control de acceso por roles en endpoints criticos
- Indices MongoDB para filtros por empresa

### Pendiente antes de aceptar usuarios reales

#### Seguridad (critico)
- [ ] Agregar `helmet` para headers HTTP seguros
- [ ] Rate limiting en `/api/auth/login` y endpoints de escritura (ej: `express-rate-limit`)
- [ ] Rotar `JWT_SECRET` y usar un secreto de al menos 64 caracteres aleatorios
- [ ] Sanitizacion contra inyeccion NoSQL (`express-mongo-sanitize`)
- [ ] Validacion de input completa y consistente en todos los controllers (express-validator esta incluido pero su uso es inconsistente)
- [ ] Recuperacion de contrasena (flujo "olvidé mi contraseña" con token temporal)

#### Observabilidad
- [ ] Logging estructurado (reemplazar `console.log` con Winston o Pino)
- [ ] Manejo de errores centralizado con codigos de error especificos
- [ ] Monitoreo de errores en produccion (Sentry o similar)

#### Infraestructura
- [ ] Dockerizar la aplicacion (`Dockerfile` + `docker-compose.yml`)
- [ ] Pipeline CI/CD (GitHub Actions o similar) con tests automatizados
- [ ] Configurar MongoDB en produccion con replica set y backups automaticos
- [ ] Variables de entorno SMTP configuradas y probadas

#### Calidad
- [ ] Ampliar cobertura de tests a controladores principales (ventas, productos, usuarios)
- [ ] Tests de integracion contra base de datos de test
- [ ] Documentacion de API con Swagger/OpenAPI

#### Funcionalidades faltantes
- [ ] Paginacion en todos los endpoints de listado (algunos no la tienen)
- [ ] Endpoint para cambiar contrasena desde el dashboard
- [ ] Filtros de busqueda y fecha en listados (ventas, facturas, movimientos)
- [ ] Exportacion de reportes a Excel/PDF

---

## Futuros modulos sugeridos

### Modulos de negocio
| Modulo | Descripcion | Prioridad |
|---|---|---|
| RRHH | Empleados, contratos, licencias, liquidacion de sueldos | Alta |
| Contabilidad | Libro diario, balance, cuentas contables, cierre mensual | Alta |
| Reportes avanzados | Dashboard con graficos, exportacion a Excel/PDF, filtros por periodo | Alta |
| Remitos / Albaranes | Documento de entrega vinculado a venta u orden de compra | Media |
| Devoluciones | Flujo de devolucion de venta con reingreso al stock | Media |
| Comisiones | Calculo de comisiones por vendedor sobre ventas cerradas | Media |
| Portal de clientes | Vista publica donde el cliente puede ver sus presupuestos y facturas | Media |
| Firma digital | Aceptacion de presupuesto con firma digital del cliente | Media |
| Catalogo publico | Pagina de productos con precios (tipo tienda simple) | Baja |
| Proyectos | Agrupador de tareas y ordenes con seguimiento de avance por proyecto | Baja |
| Soporte / Tickets | Mesa de ayuda interna o para clientes externos | Baja |

### Infraestructura y plataforma
| Modulo | Descripcion |
|---|---|
| API publica con clave | Permitir integraciones externas (Zapier, Make, sistemas contables) |
| Webhooks | Notificaciones en tiempo real a sistemas externos |
| Multimoneda por transaccion | Soporte para operar en moneda extranjera con tipo de cambio configurable |
| Notificaciones push / in-app | Alertas dentro del sistema (tareas vencidas, stock critico, pagos pendientes) |
| Auditoria de cambios | Historial completo de quién modificó qué y cuándo |

---

## Roadmap para Latinoamerica

### Lo que ya funciona
- Modelo `Empresa` con campo `pais` y moneda configurable por empresa
- Campo generico `identificadorFiscal` + `tipoIdentificadorFiscal` para almacenar CUIT, RFC, RUT, NIT, RUC, CNPJ, etc.
- Soporte para `tipoOrganizacion`: `empresa` o `autonomo`
- IVA configurable por empresa (`ivaDefault` en `configuracion`)
- Moneda configurable por empresa (`moneda` en `configuracion`)

### Pendiente para soporte LatAm completo

#### Facturacion electronica (por pais)
Cada pais tiene su propio sistema de facturacion electronica obligatoria. Implementarlos requiere integracion con el organismo fiscal de cada pais o con un proveedor intermediario (facturador electronico):

| Pais | Organismo | Tipo de integracion |
|---|---|---|
| Argentina | AFIP / ARCA | API AFIP (CAE), o via facturador como Tiendanube, Factura.com |
| México | SAT | CFDI 4.0, via PAC autorizado (e.FacturaXML, Trazo Fiscal, etc.) |
| Chile | SII | DTE via proveedor (DTE Chile, Bsale, etc.) |
| Colombia | DIAN | Factura electronica UBL 2.1 via software autorizado |
| Perú | SUNAT | UBL 2.1 via OSE/PSE autorizado |
| Uruguay | DGI | e-Factura via proveedor |
| Brasil | SEFAZ | NF-e / NFS-e, sistema altamente complejo por estado |

**Recomendacion:** integrar con un proveedor regional multi-pais (Allegra, Nubox, Alegra.com) via API en lugar de implementar cada integracion directamente.

#### Impuestos y alicuotas
- El campo `ivaDefault` en `configuracion` cubre el IVA general, pero muchos paises tienen alicuotas diferenciales por tipo de producto (alimentos, medicamentos, lujo, etc.)
- Argentina tiene regimenes especiales: monotributo, responsable inscripto, exento
- Brasil tiene ICMS, ISS, PIS, COFINS — cada uno con reglas por estado y por tipo de servicio
- Pendiente: modelo de `Impuesto` por empresa con tipo, alicuota y aplicacion (todos los productos, categorias, etc.)

#### Moneda y tipo de cambio
- La moneda esta guardada pero no hay conversion entre monedas dentro del sistema
- Pendiente: servicio de tipo de cambio (via API publica como ExchangeRate-API o Open Exchange Rates) para mostrar equivalencias

#### Adaptaciones por pais en documentos
- Tipos de comprobante varian: Argentina usa A/B/C, Mexico usa CFDI, Chile usa boleta/factura electronica
- Los campos requeridos en cada documento difieren (razon social, regimen fiscal, domicilio, etc.)
- Pendiente: plantillas de PDF configurables por pais

#### Idioma
- El backend devuelve mensajes en castellano rioplatense
- Pendiente: i18n con soporte de variantes regionales (vos/usted, terminologia diferente por pais)

---

## Autor

Ezequiel Orazi – Desarrollo Fullstack MERN
