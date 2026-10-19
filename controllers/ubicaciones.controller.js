const ubicacionesService = require('../services/ubicaciones.service')

// Traduce HTTP ↔ dominio y nada más, como products.controller.
// Sin try/catch: Express 5 propaga a next() el rechazo de un manejador async.

async function list(req, res) {
  res.status(200).json(await ubicacionesService.list())
}

module.exports = { list }
