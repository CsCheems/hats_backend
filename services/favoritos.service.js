const { guard } = require('../utils/shopErrors')
const store = require('./shop.store')

// Los favoritos de la persona que pidió. No conoce req ni res: el controlador le
// pasa el accessToken, y con ese JWT la base devuelve y escribe solo lo suyo.

async function list(accessToken) {
  const items = await guard(store.favorites(accessToken))

  return { items, total: items.length }
}

// Añadir y quitar son idempotentes: marcar dos veces es marcar una, y quitar lo
// que no estaba no es un error. Por eso ninguna devuelve nada.
async function add(accessToken, slug) {
  await guard(store.addFavorite(accessToken, slug))
}

async function remove(accessToken, slug) {
  await guard(store.removeFavorite(accessToken, slug))
}

module.exports = { list, add, remove }
