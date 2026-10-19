const productsService = require('../services/products.service')

// Traduce HTTP ↔ dominio y nada más, como auth.controller y admin.controller.
// Sin try/catch: Express 5 propaga a next() el rechazo de un manejador async.
//
// No lee ningún parámetro, y no es un olvido: el servicio devuelve el catálogo
// entero a propósito (la razón está escrita allí). Aceptar un `?categoria=` que
// después se ignora en silencio es peor que no aceptarlo — quien lo escribe se
// queda creyendo que filtró.

async function list(req, res) {
  res.status(200).json(await productsService.catalogo())
}

module.exports = { list }
