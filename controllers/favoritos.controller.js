const favoritosService = require('../services/favoritos.service')

// Traduce HTTP ↔ dominio y nada más. Todas las rutas van detrás de requireAuth,
// así que `req.session` existe y su accessToken es con lo que la base sabe de
// quién son los favoritos.

const token = (req) => req.session.accessToken

async function list(req, res) {
  res.status(200).json(await favoritosService.list(token(req)))
}

// 204: no hay nada que devolver. Las dos son idempotentes, así que repetirlas es
// inofensivo y no necesitan un 409 para «ya estaba».
async function add(req, res) {
  await favoritosService.add(token(req), req.params.slug)
  res.status(204).end()
}

async function remove(req, res) {
  await favoritosService.remove(token(req), req.params.slug)
  res.status(204).end()
}

module.exports = { list, add, remove }
