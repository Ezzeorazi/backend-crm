const Groq        = require('groq-sdk');
const Contacto    = require('../models/Contacto');
const Producto    = require('../models/Product');
const Presupuesto = require('../models/Presupuesto');
const Tarea       = require('../models/Tarea');
const Contador    = require('../models/Contador');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = `Eres el asistente inteligente de Nimbus CRM. Ayudás a los usuarios a:
1. Entender y usar el sistema CRM
2. Crear registros como clientes, proveedores, presupuestos y tareas usando las herramientas disponibles

## Entidades del sistema

**Clientes y Proveedores** (Contactos)
- Clientes: empresas o personas que compran productos/servicios
- Proveedores: empresas que suministran productos
- Campos: nombre (requerido), email, telefono, razonSocial, cuit, direccion, ciudad, provincia

**Productos**
- Catálogo con nombre, SKU, precio, stock e impuesto (% IVA, default 21%)

**Presupuestos**
- Cotizaciones para clientes con productos/servicios
- Estados: borrador → enviado → aceptado / rechazado / vencido
- Para crear uno: necesitás el cliente y los productos con precios y cantidades

**Ventas**
- Registro de ventas cerradas, generalmente desde un presupuesto aceptado

**Facturas**
- Documentos fiscales ligados a ventas (tipos A, B, C, X)
- Estados: pendiente → pagada / parcial / anulada

**Tareas**
- Actividades y seguimientos
- Tipos: llamada, reunion, email, seguimiento, otro
- Prioridades: alta, media, baja

## Flujo de ventas típico
Crear cliente → Crear presupuesto → Cliente acepta → Registrar venta → Emitir factura

## Instrucciones
- Siempre respondé en español rioplatense (vos, no usted)
- Antes de crear cualquier registro, mostrá los datos que vas a usar y pedí confirmación
- Si el usuario responde "sí", "dale", "confirmado", "ok" u similar, procedé a crear
- Para crear un presupuesto: primero buscá al cliente y los productos, luego mostrá el resumen y pedí confirmación
- Si no encontrás exactamente lo que el usuario pide, mostrá las opciones disponibles
- Sé conciso y amigable
- Si te preguntan cómo hacer algo en el CRM, explicalo en 2-3 pasos simples`;

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
        titulo:          { type: 'string', description: 'Título de la tarea (requerido)' },
        descripcion:     { type: 'string', description: 'Descripción detallada' },
        tipo:            { type: 'string', description: 'Tipo: llamada, reunion, email, seguimiento, otro (default: otro)' },
        prioridad:       { type: 'string', description: 'Prioridad: alta, media, baja (default: media)' },
        fechaVencimiento:{ type: 'string', description: 'Fecha de vencimiento en formato ISO 8601 (ej: 2026-05-20)' }
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

    case 'crear_cliente': {
      const cliente = new Contacto({ ...args, tipo: ['cliente'], empresaId });
      const guardado = await cliente.save();
      return { exito: true, id: guardado._id.toString(), nombre: guardado.nombre };
    }

    case 'crear_proveedor': {
      const proveedor = new Contacto({ ...args, tipo: ['proveedor'], empresaId });
      const guardado = await proveedor.save();
      return { exito: true, id: guardado._id.toString(), nombre: guardado.nombre };
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

      const subtotal   = parseFloat(productosConSubtotal.reduce((s, i) => s + i.subtotal, 0).toFixed(2));
      const ivaCalc    = parseFloat((subtotal * (ivaPct / 100)).toFixed(2));
      const total      = parseFloat((subtotal - descuento + ivaCalc).toFixed(2));
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
      return { exito: true, id: guardado._id.toString(), numero: guardado.numero, total: guardado.total };
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
      return { exito: true, id: guardada._id.toString(), titulo: guardada.titulo };
    }

    default:
      return { error: `Herramienta desconocida: ${nombre}` };
  }
}

const enviarMensaje = async (req, res) => {
  try {
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ mensaje: 'Se requiere el array de mensajes' });
    }

    // Construir historial en formato OpenAI/Groq
    const groqMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages.map(m => ({
        role:    m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content
      }))
    ];

    // Convertir TOOL_DECLARATIONS al formato de Groq (OpenAI-compatible)
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
      temperature: 0.7,
      max_tokens:  1024
    });

    // Loop para manejar tool calls (máx 5 iteraciones)
    for (let i = 0; i < 5; i++) {
      const msg       = completion.choices[0].message;
      const toolCalls = msg.tool_calls;
      if (!toolCalls || toolCalls.length === 0) break;

      // Agregar respuesta del asistente con los tool_calls al historial
      groqMessages.push(msg);

      // Ejecutar cada herramienta y agregar resultados
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
        temperature: 0.7,
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
