const Groq        = require('groq-sdk');
const Contacto    = require('../models/Contacto');
const Producto    = require('../models/Product');
const Presupuesto = require('../models/Presupuesto');
const Tarea       = require('../models/Tarea');
const Contador    = require('../models/Contador');
const Empresa     = require('../models/Empresa');
const User        = require('../models/User');
const { sendMail } = require('../utils/mailer');

const ADMIN_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || 'ezequiel.orazi90@gmail.com';

const PLAN_LIMITES = {
  free:       30,
  starter:    300,
  pro:        Infinity,
  enterprise: Infinity
};

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const BASE_SYSTEM_PROMPT = `Sos Harry, el asistente inteligente de Nimbus CRM. Tu personalidad es amigable, claro y paciente. Ayudás a los usuarios a:
1. Entender y usar el sistema CRM
2. Crear y buscar registros usando las herramientas disponibles

## Entidades del sistema

**Clientes y Proveedores** (Contactos)
- Campos: nombre (requerido), email, telefono, razonSocial, cuit, direccion, ciudad, provincia

**Productos**
- Catálogo con nombre (requerido), SKU (requerido, se convierte a mayúsculas), precio (requerido), stock, costo, impuesto (% IVA, default 21), unidad, categoria, descripcion

**Presupuestos**
- Cotizaciones para clientes con productos/servicios
- Estados: borrador → enviado → aceptado / rechazado / vencido
- Para crear uno: necesitás el cliente y los productos con precios y cantidades

**Tareas**
- Actividades y seguimientos
- Tipos: llamada, reunion, email, seguimiento, otro
- Prioridades: alta, media, baja

## Flujo de ventas típico
Crear cliente → Crear presupuesto → Cliente acepta → Registrar venta → Emitir factura

## Instrucciones
- Siempre respondé en español rioplatense (vos, no usted)
- Antes de crear cualquier registro, mostrá los datos que vas a usar y pedí confirmación
- Si el usuario responde "sí", "dale", "confirmado", "ok", "sí dale", "confirmar" o similar, procedé a crear
- Para crear un presupuesto: primero buscá al cliente y los productos, luego mostrá el resumen y pedí confirmación
- Si no encontrás exactamente lo que el usuario pide, mostrá las opciones disponibles y preguntá
- Sé conciso y amigable, usá markdown para formatear (negritas, listas)
- Cuando crees algo exitosamente, incluí un link de navegación al final: [Ver en Clientes](/dashboard/clientes), [Ver en Productos](/dashboard/productos), etc.
- Si te preguntan cómo hacer algo en el CRM, explicalo en 2-3 pasos simples

## Soporte y escalación de bugs
Si el usuario reporta un bug, un error persistente, algo roto en el sistema, o un problema que Harry no pudo resolver después de intentarlo:
1. Intentá entender bien el problema (hacé una pregunta si falta contexto)
2. Si no podés resolverlo, usá la herramienta \`escalar_soporte\` para notificar al equipo técnico
3. Informale al usuario que ya se envió el reporte y que lo contactarán a la brevedad
IMPORTANTE: usá \`escalar_soporte\` para bugs reales del sistema, NO para preguntas de uso o dudas normales.

## Cambio o upgrade de plan
Si el usuario pregunta cómo subir de plan, menciona que se quedó sin mensajes de Harry, o quiere las funciones Pro/Enterprise:
1. Preguntale brevemente a qué plan quiere pasar y por qué lo necesita (si no lo dijo)
2. Confirmá que vas a enviar la solicitud al equipo
3. Usá la herramienta \`solicitar_upgrade_plan\` para notificar al equipo con el pedido
4. Informale que recibirá contacto con los detalles para concretar el upgrade

## Migración desde Excel
Si el usuario pregunta cómo migrar desde Excel o viene de otro sistema, guialo así:
1. Decile que vaya a **Migrar Excel** en el menú lateral (o al link [Migrar Excel](/dashboard/migrar))
2. Explicale que hay 3 pestañas: Clientes, Proveedores y Productos
3. Que descargue la plantilla, la complete con sus datos, y la suba
4. Que vos (Harry) lo guiás en cada paso desde esa pantalla

Columnas disponibles para importar:
- **Clientes**: nombre*, telefono, email, ciudad, provincia, direccion, cuit, notas
- **Proveedores**: nombre*, telefono, email, razonSocial, cuit, ciudad, notas
- **Productos**: nombre*, sku*, precio*, stock, costo, categoria, unidad, descripcion, impuesto
(* = obligatorio)

Si el usuario tiene datos en Excel con otros nombres de columnas, ayudalo a mapear sus columnas a las del sistema.`;

const TOOL_DECLARATIONS = [
  {
    name: 'buscar_clientes',
    description: 'Busca clientes por nombre o razón social. Usarlo antes de crear un presupuesto para obtener el ID del cliente.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Nombre o razón social del cliente a buscar' }
      },
      required: ['query']
    }
  },
  {
    name: 'buscar_productos',
    description: 'Busca productos por nombre o SKU. Usarlo para obtener IDs y precios al armar un presupuesto.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Nombre o SKU del producto a buscar' }
      },
      required: ['query']
    }
  },
  {
    name: 'buscar_presupuestos',
    description: 'Busca presupuestos por nombre de cliente o estado.',
    parameters: {
      type: 'object',
      properties: {
        clienteNombre: { type: 'string', description: 'Nombre del cliente para filtrar presupuestos' },
        estado: { type: 'string', description: 'Estado: borrador, enviado, aceptado, rechazado, vencido' }
      }
    }
  },
  {
    name: 'listar_tareas_pendientes',
    description: 'Lista las tareas pendientes o próximas a vencer.',
    parameters: {
      type: 'object',
      properties: {
        limite: { type: 'number', description: 'Cantidad máxima de tareas a mostrar (default 5)' }
      }
    }
  },
  {
    name: 'crear_cliente',
    description: 'Crea un nuevo cliente en el CRM. Solo llamar después de que el usuario confirme los datos.',
    parameters: {
      type: 'object',
      properties: {
        nombre:      { type: 'string', description: 'Nombre o nombre comercial del cliente (requerido)' },
        email:       { type: 'string', description: 'Email de contacto' },
        telefono:    { type: 'string', description: 'Teléfono de contacto' },
        razonSocial: { type: 'string', description: 'Razón social o nombre legal de la empresa' },
        cuit:        { type: 'string', description: 'CUIT sin guiones' },
        direccion:   { type: 'string', description: 'Dirección postal' },
        ciudad:      { type: 'string', description: 'Ciudad' },
        provincia:   { type: 'string', description: 'Provincia' },
        notas:       { type: 'string', description: 'Notas adicionales' }
      },
      required: ['nombre']
    }
  },
  {
    name: 'crear_proveedor',
    description: 'Crea un nuevo proveedor en el CRM. Solo llamar después de que el usuario confirme los datos.',
    parameters: {
      type: 'object',
      properties: {
        nombre:      { type: 'string', description: 'Nombre del proveedor (requerido)' },
        email:       { type: 'string', description: 'Email de contacto' },
        telefono:    { type: 'string', description: 'Teléfono de contacto' },
        razonSocial: { type: 'string', description: 'Razón social' },
        cuit:        { type: 'string', description: 'CUIT sin guiones' },
        direccion:   { type: 'string', description: 'Dirección' },
        notas:       { type: 'string', description: 'Notas adicionales' }
      },
      required: ['nombre']
    }
  },
  {
    name: 'crear_producto',
    description: 'Crea un nuevo producto en el catálogo. Solo llamar después de que el usuario confirme los datos.',
    parameters: {
      type: 'object',
      properties: {
        nombre:      { type: 'string', description: 'Nombre del producto (requerido)' },
        sku:         { type: 'string', description: 'Código SKU único (requerido, se convierte a mayúsculas)' },
        precio:      { type: 'number', description: 'Precio de venta (requerido)' },
        stock:       { type: 'number', description: 'Stock inicial (default 0)' },
        costo:       { type: 'number', description: 'Costo del producto' },
        impuesto:    { type: 'number', description: 'Porcentaje de IVA (default 21)' },
        unidad:      { type: 'string', description: 'Unidad de medida: unidad, kg, litro, m2, hora, etc. (default: unidad)' },
        categoria:   { type: 'string', description: 'Categoría del producto' },
        descripcion: { type: 'string', description: 'Descripción del producto' }
      },
      required: ['nombre', 'sku', 'precio']
    }
  },
  {
    name: 'crear_presupuesto',
    description: 'Crea un nuevo presupuesto en estado borrador. Solo llamar después de que el usuario confirme. Los items deben incluir datos obtenidos de buscar_productos.',
    parameters: {
      type: 'object',
      properties: {
        clienteId:  { type: 'string', description: 'ID del cliente (obtenido de buscar_clientes)' },
        items: {
          type: 'array',
          description: 'Lista de productos del presupuesto',
          items: {
            type: 'object',
            properties: {
              productoId: { type: 'string', description: 'ID del producto (obtenido de buscar_productos)' },
              nombre:     { type: 'string', description: 'Nombre del producto (snapshot)' },
              sku:        { type: 'string', description: 'SKU del producto (snapshot)' },
              cantidad:   { type: 'number', description: 'Cantidad' },
              precio:     { type: 'number', description: 'Precio unitario' },
              descuento:  { type: 'number', description: 'Descuento en porcentaje (0-100), default 0' }
            },
            required: ['nombre', 'cantidad', 'precio']
          }
        },
        validezDias: { type: 'number', description: 'Días de validez del presupuesto (default 30)' },
        descuento:   { type: 'number', description: 'Descuento global en monto (default 0)' },
        ivaPct:      { type: 'number', description: 'Porcentaje de IVA a aplicar (ej: 21, default 0)' },
        notas:       { type: 'string', description: 'Notas o condiciones del presupuesto' }
      },
      required: ['clienteId', 'items']
    }
  },
  {
    name: 'crear_tarea',
    description: 'Crea una nueva tarea o recordatorio. Solo llamar después de que el usuario confirme.',
    parameters: {
      type: 'object',
      properties: {
        titulo:           { type: 'string', description: 'Título de la tarea (requerido)' },
        descripcion:      { type: 'string', description: 'Descripción detallada' },
        tipo:             { type: 'string', description: 'Tipo: llamada, reunion, email, seguimiento, otro (default: otro)' },
        prioridad:        { type: 'string', description: 'Prioridad: alta, media, baja (default: media)' },
        fechaVencimiento: { type: 'string', description: 'Fecha de vencimiento en formato ISO 8601 (ej: 2026-05-20)' }
      },
      required: ['titulo']
    }
  },
  {
    name: 'escalar_soporte',
    description: 'Escala un bug o problema técnico al equipo de soporte (Ezequiel). Usar cuando el usuario reporta un error real del sistema, algo que no funciona, o cuando Harry no puede resolver el problema después de intentarlo. NO usar para preguntas de uso normales.',
    parameters: {
      type: 'object',
      properties: {
        descripcion: { type: 'string', description: 'Descripción clara del problema que reporta el usuario (requerido)' },
        pasos:       { type: 'string', description: 'Pasos para reproducir el error o contexto adicional que el usuario mencionó' },
        urgencia:    { type: 'string', description: 'Nivel de urgencia: alta (sistema caído), media (bug que afecta trabajo), baja (inconveniente menor)' }
      },
      required: ['descripcion']
    }
  },
  {
    name: 'solicitar_upgrade_plan',
    description: 'Envía una solicitud de cambio de plan al equipo. Usar cuando el usuario pide subir de plan, menciona que necesita más mensajes con Harry, o quiere acceder a funciones Pro/Enterprise.',
    parameters: {
      type: 'object',
      properties: {
        plan_deseado: { type: 'string', description: 'Plan al que quiere cambiar: starter, pro, enterprise (requerido)' },
        motivo:       { type: 'string', description: 'Por qué necesita el upgrade o qué funcionalidad le falta' }
      },
      required: ['plan_deseado']
    }
  }
];

async function ejecutarHerramienta(nombre, args, empresaId, usuarioId) {
  switch (nombre) {
    case 'buscar_clientes': {
      const clientes = await Contacto.find({
        empresaId,
        tipo: 'cliente',
        $or: [
          { nombre:      { $regex: args.query, $options: 'i' } },
          { razonSocial: { $regex: args.query, $options: 'i' } }
        ]
      }).select('_id nombre razonSocial email cuit').limit(5).lean();
      return clientes.length > 0
        ? { clientes }
        : { clientes: [], mensaje: `No se encontraron clientes con "${args.query}"` };
    }

    case 'buscar_productos': {
      const productos = await Producto.find({
        empresaId,
        activo: true,
        $or: [
          { nombre: { $regex: args.query, $options: 'i' } },
          { sku:    { $regex: args.query, $options: 'i' } }
        ]
      }).select('_id nombre sku precio impuesto unidad stock').limit(5).lean();
      return productos.length > 0
        ? { productos }
        : { productos: [], mensaje: `No se encontraron productos con "${args.query}"` };
    }

    case 'buscar_presupuestos': {
      const filtro = { empresaId };
      if (args.estado) filtro.estado = args.estado;
      if (args.clienteNombre) {
        const clientes = await Contacto.find({
          empresaId,
          nombre: { $regex: args.clienteNombre, $options: 'i' }
        }).select('_id').lean();
        if (clientes.length > 0) {
          filtro.cliente = { $in: clientes.map(c => c._id) };
        }
      }
      const presupuestos = await Presupuesto.find(filtro)
        .populate('cliente', 'nombre')
        .select('numero estado total vencimiento cliente')
        .sort({ createdAt: -1 })
        .limit(args.limite || 5)
        .lean();
      return presupuestos.length > 0
        ? { presupuestos: presupuestos.map(p => ({
            id: p._id,
            numero: p.numero,
            cliente: p.cliente?.nombre || 'Sin cliente',
            estado: p.estado,
            total: p.total,
            vencimiento: p.vencimiento
          })) }
        : { presupuestos: [], mensaje: 'No se encontraron presupuestos con esos filtros' };
    }

    case 'listar_tareas_pendientes': {
      const tareas = await Tarea.find({
        empresaId,
        estado: 'pendiente'
      })
        .select('titulo tipo prioridad fechaVencimiento estado')
        .sort({ fechaVencimiento: 1, prioridad: -1 })
        .limit(args.limite || 5)
        .lean();
      return tareas.length > 0
        ? { tareas }
        : { tareas: [], mensaje: 'No tenés tareas pendientes' };
    }

    case 'crear_cliente': {
      const cliente = new Contacto({ ...args, tipo: ['cliente'], empresaId });
      const guardado = await cliente.save();
      return { exito: true, id: guardado._id.toString(), nombre: guardado.nombre, path: '/dashboard/clientes' };
    }

    case 'crear_proveedor': {
      const proveedor = new Contacto({ ...args, tipo: ['proveedor'], empresaId });
      const guardado = await proveedor.save();
      return { exito: true, id: guardado._id.toString(), nombre: guardado.nombre, path: '/dashboard/proveedores' };
    }

    case 'crear_producto': {
      const { nombre, sku, precio, stock = 0, costo, impuesto = 21, unidad = 'unidad', categoria, descripcion } = args;
      const producto = new Producto({
        empresaId,
        nombre,
        sku: sku.toUpperCase(),
        precio,
        stock,
        costo,
        impuesto,
        unidad,
        categoria,
        descripcion,
        activo: true
      });
      const guardado = await producto.save();
      return { exito: true, id: guardado._id.toString(), nombre: guardado.nombre, sku: guardado.sku, path: '/dashboard/productos' };
    }

    case 'crear_presupuesto': {
      const { clienteId, items, validezDias = 30, descuento = 0, ivaPct = 0, notas } = args;

      const productosConSubtotal = items.map(item => {
        const sub = parseFloat((item.cantidad * item.precio * (1 - (item.descuento || 0) / 100)).toFixed(2));
        return {
          producto:  item.productoId || undefined,
          nombre:    item.nombre,
          sku:       item.sku || '',
          cantidad:  item.cantidad,
          precio:    item.precio,
          descuento: item.descuento || 0,
          subtotal:  sub
        };
      });

      const subtotal    = parseFloat(productosConSubtotal.reduce((s, i) => s + i.subtotal, 0).toFixed(2));
      const ivaCalc     = parseFloat((subtotal * (ivaPct / 100)).toFixed(2));
      const total       = parseFloat((subtotal - descuento + ivaCalc).toFixed(2));
      const vencimiento = new Date();
      vencimiento.setDate(vencimiento.getDate() + validezDias);

      const numero = await Contador.siguiente(empresaId, 'presupuesto');

      const presupuesto = new Presupuesto({
        empresaId,
        numero,
        cliente:    clienteId,
        creadoPor:  usuarioId,
        productos:  productosConSubtotal,
        subtotal,
        descuento,
        iva:        ivaCalc,
        ivaPct,
        total,
        validezDias,
        vencimiento,
        estado:     'borrador',
        notas
      });

      const guardado = await presupuesto.save();
      return { exito: true, id: guardado._id.toString(), numero: guardado.numero, total: guardado.total, path: '/dashboard/presupuestos' };
    }

    case 'crear_tarea': {
      const { titulo, descripcion, tipo = 'otro', prioridad = 'media', fechaVencimiento } = args;
      const tarea = new Tarea({
        empresaId,
        titulo,
        descripcion,
        tipo,
        prioridad,
        fechaVencimiento: fechaVencimiento ? new Date(fechaVencimiento) : undefined,
        creadoPor:        usuarioId,
        estado:           'pendiente'
      });
      const guardada = await tarea.save();
      return { exito: true, id: guardada._id.toString(), titulo: guardada.titulo, path: '/dashboard/tareas' };
    }

    case 'escalar_soporte': {
      const [empresa, usuario] = await Promise.all([
        Empresa.findById(empresaId).select('nombre plan').lean(),
        User.findById(usuarioId).select('nombre email').lean()
      ]);
      const fecha    = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
      const urgencia = args.urgencia || 'media';
      const urgEmoji = { alta: '🔴', media: '🟡', baja: '🟢' }[urgencia] || '🟡';

      await sendMail({
        to:      ADMIN_EMAIL,
        subject: `${urgEmoji} Soporte requerido — ${empresa?.nombre || 'Empresa'} — Nimbus CRM`,
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
            <h2 style="color:#dc2626">🐛 Reporte de soporte — Nimbus CRM</h2>
            <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px">
              <tr><td style="padding:6px 0;color:#64748b;width:130px">Empresa</td><td><strong>${empresa?.nombre || 'N/A'}</strong></td></tr>
              <tr><td style="padding:6px 0;color:#64748b">Usuario</td><td>${usuario?.nombre || 'N/A'} — ${usuario?.email || 'sin email'}</td></tr>
              <tr><td style="padding:6px 0;color:#64748b">Plan actual</td><td>${empresa?.plan || 'free'}</td></tr>
              <tr><td style="padding:6px 0;color:#64748b">Urgencia</td><td><strong>${urgencia.toUpperCase()}</strong></td></tr>
              <tr><td style="padding:6px 0;color:#64748b">Fecha</td><td>${fecha}</td></tr>
            </table>
            <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:16px;margin-bottom:12px">
              <p style="margin:0 0 8px;font-weight:600;color:#dc2626">Problema reportado:</p>
              <p style="margin:0;color:#1e293b;line-height:1.6">${args.descripcion}</p>
            </div>
            ${args.pasos ? `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px">
              <p style="margin:0 0 8px;font-weight:600;color:#475569">Contexto / pasos:</p>
              <p style="margin:0;color:#1e293b;line-height:1.6">${args.pasos}</p>
            </div>` : ''}
          </div>`,
      }).catch(err => console.error('Error enviando email de soporte:', err.message));

      return { exito: true, mensaje: 'Reporte enviado al equipo de soporte.' };
    }

    case 'solicitar_upgrade_plan': {
      const [empresa, usuario] = await Promise.all([
        Empresa.findById(empresaId).select('nombre plan').lean(),
        User.findById(usuarioId).select('nombre email').lean()
      ]);
      const fecha = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });

      await sendMail({
        to:      ADMIN_EMAIL,
        subject: `⬆️ Solicitud de upgrade — ${empresa?.nombre || 'Empresa'} → Plan ${(args.plan_deseado || '').toUpperCase()} — Nimbus CRM`,
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
            <h2 style="color:#4f46e5">⬆️ Solicitud de upgrade de plan — Nimbus CRM</h2>
            <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px">
              <tr><td style="padding:6px 0;color:#64748b;width:130px">Empresa</td><td><strong>${empresa?.nombre || 'N/A'}</strong></td></tr>
              <tr><td style="padding:6px 0;color:#64748b">Usuario</td><td>${usuario?.nombre || 'N/A'} — ${usuario?.email || 'sin email'}</td></tr>
              <tr><td style="padding:6px 0;color:#64748b">Plan actual</td><td>${empresa?.plan || 'free'}</td></tr>
              <tr><td style="padding:6px 0;color:#64748b">Plan solicitado</td><td><strong style="color:#4f46e5">${(args.plan_deseado || '').toUpperCase()}</strong></td></tr>
              <tr><td style="padding:6px 0;color:#64748b">Fecha</td><td>${fecha}</td></tr>
            </table>
            ${args.motivo ? `<div style="background:#f0f9ff;border:1px solid #7dd3fc;border-radius:8px;padding:16px;margin-bottom:12px">
              <p style="margin:0 0 8px;font-weight:600;color:#0369a1">Motivo / qué necesita:</p>
              <p style="margin:0;color:#1e293b;line-height:1.6">${args.motivo}</p>
            </div>` : ''}
            <p style="color:#64748b;font-size:12px;margin-top:16px;border-top:1px solid #e2e8f0;padding-top:12px">
              Para activar: <code>PATCH /api/admin/empresa/${empresaId}/plan</code> con body <code>{"plan":"${args.plan_deseado}"}</code>
            </p>
          </div>`,
      }).catch(err => console.error('Error enviando email de upgrade:', err.message));

      return { exito: true, mensaje: 'Solicitud de upgrade enviada al equipo.' };
    }

    default:
      return { error: `Herramienta desconocida: ${nombre}` };
  }
}

const enviarMensaje = async (req, res) => {
  try {
    const { messages, currentPage, currentPath } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ mensaje: 'Se requiere el array de mensajes' });
    }

    // ── Verificar límite de plan ──────────────────────────────────────────────
    const empresa = await Empresa.findById(req.empresaId).select('plan chatStats').lean();
    const plan    = empresa?.plan || 'free';
    const limite  = PLAN_LIMITES[plan] ?? PLAN_LIMITES.free;

    if (limite !== Infinity) {
      const mesActual = new Date().toISOString().slice(0, 7); // "YYYY-MM"
      const stats     = empresa?.chatStats || { mes: '', usos: 0 };
      const usosActuales = stats.mes === mesActual ? stats.usos : 0;

      if (usosActuales >= limite) {
        const planesSuperiores = { free: 'Starter', starter: 'Pro' };
        const planSiguiente    = planesSuperiores[plan] || 'Pro';
        return res.status(429).json({
          mensaje: `Alcanzaste el límite de ${limite} mensajes/mes del plan ${plan.charAt(0).toUpperCase() + plan.slice(1)}. Actualizá al plan ${planSiguiente} para continuar usando a Harry sin límites.`,
          limite:  true,
          plan,
          usos:    usosActuales,
          maximo:  limite
        });
      }

      // Incrementar contador (upsert atómico)
      await Empresa.updateOne(
        { _id: req.empresaId },
        stats.mes === mesActual
          ? { $inc: { 'chatStats.usos': 1 } }
          : { $set: { 'chatStats.mes': mesActual, 'chatStats.usos': 1 } }
      );
    }

    // Agregar contexto de página actual al system prompt
    let systemPrompt = BASE_SYSTEM_PROMPT;
    if (currentPage) {
      systemPrompt += `\n\n## Contexto actual\nEl usuario está en la sección **${currentPage}** del CRM (ruta: ${currentPath || currentPage}). Tené esto en cuenta para dar respuestas más relevantes y proactivas.`;
    }

    const groqMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({
        role:    m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content
      }))
    ];

    const groqTools = TOOL_DECLARATIONS.map(t => ({
      type: 'function',
      function: {
        name:        t.name,
        description: t.description,
        parameters:  t.parameters
      }
    }));

    let completion = await groq.chat.completions.create({
      model:       'llama-3.3-70b-versatile',
      messages:    groqMessages,
      tools:       groqTools,
      tool_choice: 'auto',
      temperature: 0.6,
      max_tokens:  1024
    });

    // Loop para manejar tool calls (máx 5 iteraciones)
    for (let i = 0; i < 5; i++) {
      const msg       = completion.choices[0].message;
      const toolCalls = msg.tool_calls;
      if (!toolCalls || toolCalls.length === 0) break;

      groqMessages.push(msg);

      for (const call of toolCalls) {
        const args   = JSON.parse(call.function.arguments);
        const output = await ejecutarHerramienta(
          call.function.name,
          args,
          req.empresaId,
          req.usuario?.id
        );
        groqMessages.push({
          role:         'tool',
          tool_call_id: call.id,
          content:      JSON.stringify(output)
        });
      }

      completion = await groq.chat.completions.create({
        model:       'llama-3.3-70b-versatile',
        messages:    groqMessages,
        tools:       groqTools,
        tool_choice: 'auto',
        temperature: 0.6,
        max_tokens:  1024
      });
    }

    const text = completion.choices[0].message.content;
    res.json({ content: text });

  } catch (error) {
    console.error('Error en chatController:', error);
    res.status(500).json({ mensaje: 'Error al procesar el mensaje', error: error.message });
  }
};

module.exports = { enviarMensaje };
