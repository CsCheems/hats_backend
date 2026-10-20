const ApiError = require('../utils/ApiError')
const { parseFolio } = require('../utils/folio')
const { guard } = require('../utils/shopErrors')
const gateway = require('./payments.gateway')
const store = require('./pedidos.store')
const { resolveEstado } = require('./ubicaciones.service')
const users = require('./users.store')

// De la bolsa al pedido pagado. No conoce req ni res y no elige status a mano.
//
// Qué se calcula y dónde: el desglose lo calcula la base de datos (db/scripts/15,
// función `desglose`) y esta capa solo lo pasa. Aquí no hay una sola suma de
// dinero: si hubiera dos sitios que calculan el IVA, tarde o temprano
// discreparían, y el pedido cobraría una cifra distinta de la que se enseñó.

// Solo dígitos: «81 1234 5678» y «81-1234-5678» son el mismo teléfono, y el check
// de la base pide diez dígitos.
const digits = (value) => value.replace(/\D/g, '')

async function summary(accessToken) {
  return guard(store.summary(accessToken))
}

/**
 * Paga la bolsa. Los pasos y su orden son la razón de ser de este archivo:
 *
 *   1. Resolver el estado ANTES de tocar nada (un estado mal escrito no debe
 *      dejar un apartado hecho).
 *   2. Apartar: crea el pedido por pagar y descuenta el stock en una transacción.
 *      Aquí fallan «bolsa vacía», «se acabó un artículo» y «cambió el total».
 *   3. Cobrar, por el total que calculó la base y no por el que mandó el
 *      navegador. Si la pasarela rechaza, se libera lo apartado.
 *   4. Confirmar el pago. Si eso falla con el cobro ya hecho, se devuelve.
 *   5. Guardar la dirección en la cuenta si se pidió; que eso falle no estropea
 *      una compra ya pagada.
 */
async function checkout(accessToken, userId, values) {
  const estadoId = await resolveEstado(values)

  const direccion = {
    estadoId,
    codigoPostal: digits(values.codigoPostal),
    colonia: values.colonia,
    calle: values.calle,
    numero: values.numero,
  }

  const id = await guard(
    store.create(accessToken, {
      ...direccion,
      destinatario: values.destinatario,
      telefono: digits(values.telefono),
      referencias: values.referencias,
      totalEsperado: Number(values.total),
    }),
  )

  const pedido = await guard(store.find(accessToken, id))

  let cobro

  try {
    cobro = await gateway.charge({ token: values.token, monto: pedido.desglose.total })
  } catch (error) {
    await store.cancel(accessToken, id).catch((fallo) => console.error('No se pudo liberar el pedido', id, fallo))
    throw error
  }

  try {
    await guard(store.confirmPayment(accessToken, id, cobro))
  } catch (error) {
    await gateway.refund(cobro).catch((fallo) => console.error('No se pudo devolver el cobro', cobro.referencia, fallo))
    await store.cancel(accessToken, id).catch((fallo) => console.error('No se pudo liberar el pedido', id, fallo))
    throw error
  }

  if (values.guardar) {
    await users
      .saveAddress(accessToken, userId, direccion)
      .catch((fallo) => console.error('No se pudo guardar la dirección del pedido', id, fallo))
  }

  return guard(store.find(accessToken, id))
}

/** Un pedido de la persona, por folio («NHT-00012»). Ajeno o inexistente: 404. */
async function find(accessToken, folio) {
  const id = parseFolio(folio)

  if (!id) throw ApiError.notFound()

  const pedido = await guard(store.find(accessToken, id))

  if (!pedido) throw ApiError.notFound()

  return pedido
}

/**
 * Cancela un pedido de la persona mientras NO se haya enviado. Devuelve las
 * piezas al stock (la base, en una transacción) y pide a la pasarela devolver el
 * cobro. Si ya se envió, se entregó o ya estaba cancelado: 409 `cannot_cancel`.
 *
 * El reembolso va DESPUÉS y es de mejor esfuerzo: el pedido ya está cancelado y
 * las piezas ya volvieron; si la devolución falla se avisa en consola, porque el
 * dinero habrá que devolverlo a mano.
 */
async function cancelOrder(accessToken, folio) {
  const id = parseFolio(folio)

  if (!id) throw ApiError.notFound()

  let referencia

  try {
    referencia = await guard(store.cancelPaid(accessToken, id))
  } catch (error) {
    // La base lo dice como una transición inválida; a quien compró se le dice con
    // sus palabras.
    if (error.code === 'invalid_transition') throw ApiError.cannotCancel()
    throw error
  }

  if (referencia) {
    await gateway
      .refund({ referencia })
      .catch((fallo) => console.error('No se pudo devolver el cobro', referencia, fallo))
  }

  return find(accessToken, folio)
}

/** «Mis pedidos»: los pagados de la persona, el más reciente primero. */
async function list(accessToken) {
  return { pedidos: await guard(store.list(accessToken)) }
}

/** Las direcciones guardadas de la persona, para elegir adónde se envía. */
async function addresses(accessToken, userId) {
  return { direcciones: await users.listAddresses(accessToken, userId) }
}

module.exports = { summary, checkout, find, list, cancelOrder, addresses }
