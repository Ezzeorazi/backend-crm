const Groq        = require('groq-sdk');
const Contacto    = require('../models/Contacto');
const Producto    = require('../models/Product');
const Presupuesto = require('../models/Presupuesto');
const Tarea       = require('../models/Tarea');
const Contador    = require('../models/Contador');

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
