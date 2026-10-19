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

module.exports = { list }
