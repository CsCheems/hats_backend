const ApiError = require('../utils/ApiError')
const { MESSAGES } = require('../validation/rules')
const ubicaciones = require('./ubicaciones.store')

// Países y estados para los desplegables del alta y de la edición del perfil.
// Igual que products.service: no conoce req ni res y no elige status a mano.
//
// Es fino a propósito. La capa existe para que el controlador no hable con un
// almacén —la misma disciplina que en el resto de dominios—, y el día que haya
// que decidir algo aquí (solo países con envío activo, por ejemplo) ya tiene
// sitio.

async function list() {
  return { paises: await ubicaciones.listPaises() }
}

/**
 * El país y el estado escritos —o elegidos— traducidos a un id del catálogo, o a
 * un error bajo el campo que está mal. Lo comparten el alta, la edición del
 * perfil y la compra: que las tres acepten exactamente lo mismo es el motivo de
 * que viva aquí.
 */
async function resolveEstado({ pais, estado }) {
  const { paisValido, estadoId } = await ubicaciones.findEstadoId(pais, estado)

  if (!paisValido) throw ApiError.invalidField('pais', MESSAGES.pais)
  if (!estadoId) throw ApiError.invalidField('estado', MESSAGES.estado)

  return estadoId
}

module.exports = { list, resolveEstado }
