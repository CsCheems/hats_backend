const catalog = require('./catalog.store')
const { userClient } = require('./supabase.client')

// La única capa que conoce las funciones de db/scripts/15 y 16: el resumen de la
// bolsa, apartar un pedido, confirmarlo o cancelarlo, leerlo —el propio, la lista
// de los propios y, para el panel, los de todos— y cambiar su estado. Igual que
// shop.store: llama, traduce nombres de columna a los de la API y no decide qué
// significa nada. Los errores de la base se lanzan tal cual —con su
// mensaje-clave— y los traduce utils/shopErrors.
//
// Todo va por `userClient(accessToken)`: las funciones leen auth.uid() del JWT,
// así que lo que se lee y se escribe es siempre del dueño del token. Las del
// panel, además, comprueban es_admin() ellas mismas.

async function call(accessToken, funcion, argumentos) {
  const { data, error } = await userClient(accessToken).rpc(funcion, argumentos)
  if (error) throw error
  return data
}

// numeric llega como número o como texto según el cliente; la API siempre manda
// números, que es lo que se suma.
const dinero = (valor) => Number(valor)

// El día de un instante EN MÉXICO, como «2026-10-19». `en-CA` da ese orden sin
// más; la zona es la de la tienda y no la del servidor, porque un pedido hecho a
// las 21:00 del día 19 en Monterrey ya es día 20 en UTC.
const DIA_MX = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' })

const fecha = (iso) => DIA_MX.format(new Date(iso))

/**
 * Lo que se pagaría hoy por la bolsa: artículos, envío, base sin IVA, IVA y
 * total. Todo calculado por la base, con las mismas funciones que usa al crear el
 * pedido, así que lo que se enseña y lo que se cobra no pueden diferir.
 */
async function summary(accessToken) {
  const [fila] = await call(accessToken, 'resumen_bolsa')

  return {
    unidades: fila.unidades,
    articulos: dinero(fila.articulos),
    envio: dinero(fila.envio),
    base: dinero(fila.base),
    iva: dinero(fila.iva),
    total: dinero(fila.total),
    tasa: dinero(fila.tasa),
    envioGratisDesde: dinero(fila.envio_gratis_desde),
  }
}

/**
 * Aparta el stock y crea el pedido por pagar con la bolsa de ahora. Devuelve su
 * id. `totalEsperado` es el que la persona vio: si ya no coincide, la base se
 * niega (`total_cambio`).
 */
async function create(accessToken, { destinatario, telefono, estadoId, codigoPostal, colonia, calle, numero, referencias, totalEsperado }) {
  return call(accessToken, 'crear_pedido', {
    p_destinatario: destinatario,
    p_telefono: telefono,
    p_estado_id: estadoId,
    p_codigo_postal: codigoPostal,
    p_colonia: colonia,
    p_calle: calle,
    p_numero: numero,
    p_referencias: referencias,
    p_total_esperado: totalEsperado,
  })
}

async function confirmPayment(accessToken, id, { referencia, ultimos4 }) {
  await call(accessToken, 'confirmar_pago', {
    p_pedido: id,
    p_referencia: referencia,
    p_ultimos4: ultimos4,
  })
}

async function cancel(accessToken, id) {
  await call(accessToken, 'cancelar_pedido', { p_pedido: id })
}

/**
 * Cancela un pedido PAGADO que todavía no se envió (db/scripts/17), devolviendo
 * sus piezas al stock. Devuelve la referencia del cobro, que es lo que el backend
 * necesita para pedir el reembolso a la pasarela.
 */
async function cancelPaid(accessToken, id) {
  return call(accessToken, 'cancelar_mi_pedido', { p_id: id })
}

// Un pedido con su dirección, sus líneas y su desglose. Lo mismo lee quien compra
// (mi_pedido) que el panel (admin_pedido): el panel solo añade quién es el cliente
// y la referencia del cobro, abajo.
function toOrder(fila) {
  return {
    folio: fila.folio,
    estado: fila.estado,
    creado: fila.creado_en,
    pagado: fila.pagado_en,
    envio: {
      destinatario: fila.destinatario,
      telefono: fila.telefono,
      pais: fila.pais,
      estado: fila.estado_nombre,
      codigoPostal: fila.codigo_postal,
      colonia: fila.colonia,
      calle: fila.calle,
      numero: fila.numero,
      referencias: fila.referencias,
    },
    pago: fila.pago_ultimos4 ? { ultimos4: fila.pago_ultimos4 } : null,
    unidades: fila.unidades,
    desglose: {
      articulos: dinero(fila.articulos),
      envio: dinero(fila.envio),
      base: dinero(fila.base),
      iva: dinero(fila.iva),
      total: dinero(fila.total),
      tasa: dinero(fila.iva_tasa),
    },
    items: fila.items.map((item) => ({
      id: item.slug,
      categoria: item.categoria,
      titulo: item.titulo,
      precio: dinero(item.precio),
      cantidad: item.cantidad,
      foto: catalog.fotoUrl(item.foto_ruta),
    })),
  }
}

/** Un pedido mío con su dirección, sus líneas y su desglose, o null. */
async function find(accessToken, id) {
  const [fila] = await call(accessToken, 'mi_pedido', { p_id: id })

  return fila ? toOrder(fila) : null
}

/**
 * Mis pedidos pagados, el más reciente primero. Lo justo para la lista: folio,
 * estado, cuántas piezas, el total y las piezas con su foto. El desglose y la
 * dirección se piden al abrir uno.
 */
async function list(accessToken) {
  const filas = await call(accessToken, 'mis_pedidos')

  return filas.map((fila) => ({
    folio: fila.folio,
    estado: fila.estado,
    pagado: fila.pagado_en,
    unidades: fila.unidades,
    total: dinero(fila.total),
    items: fila.items.map((item) => ({
      id: item.slug,
      titulo: item.titulo,
      cantidad: item.cantidad,
      foto: catalog.fotoUrl(item.foto_ruta),
    })),
  }))
}

// ─── Panel ─────────────────────────────────────────────────────────────────

/**
 * Los pedidos pagados de todos, del más reciente al más antiguo, desde `desde`
 * (una Date) o todos. Con la forma de las filas de las tablas del panel: la
 * columna «Artículos» son las piezas, y `fecha` es el día en México.
 */
async function adminList(accessToken, desde) {
  const filas = await call(accessToken, 'admin_pedidos', { p_desde: desde ? desde.toISOString() : null })

  return filas.map((fila) => ({
    folio: fila.folio,
    cliente: fila.cliente,
    fecha: fecha(fila.pagado_en),
    pagado: fila.pagado_en,
    articulos: fila.unidades,
    total: dinero(fila.total),
    estado: fila.estado,
  }))
}

/** Un pedido pagado de quien sea, con quién lo compró y la referencia del cobro. */
async function adminFind(accessToken, id) {
  const [fila] = await call(accessToken, 'admin_pedido', { p_id: id })
  if (!fila) return null

  const pedido = toOrder(fila)

  return {
    ...pedido,
    cliente: { nombre: fila.cliente, email: fila.email },
    pago: pedido.pago && { ...pedido.pago, referencia: fila.pago_referencia },
  }
}

async function adminSetState(accessToken, id, estado) {
  await call(accessToken, 'admin_cambiar_estado', { p_id: id, p_estado: estado })
}

module.exports = {
  summary,
  create,
  confirmPayment,
  cancel,
  cancelPaid,
  find,
  list,
  adminList,
  adminFind,
  adminSetState,
}
