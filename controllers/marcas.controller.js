const marcasService = require('../services/marcas.service')

// Traduce HTTP ↔ dominio y nada más, como ubicaciones.controller.
// Sin try/catch: Express 5 propaga a next() el rechazo de un manejador async.

async function list(req, res) {
  res.status(200).json(await marcasService.list())
}

module.exports = { list }
