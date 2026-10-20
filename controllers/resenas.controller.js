const resenasService = require('../services/resenas.service')

// Traduce HTTP ↔ dominio y nada más. `list` es público (cuelga de /products);
// las otras tres van detrás de requireAuth y usan el accessToken de la sesión.

const token = (req) => req.session.accessToken

async function list(req, res) {
  res.status(200).json(await resenasService.list(req.params.slug))
}

async function mine(req, res) {
  res.status(200).json(await resenasService.mine(token(req), req.params.slug))
}

// PUT y no POST: es "esta es mi reseña de este artículo", y repetirla la
// sustituye. La base garantiza que no haya dos.
async function save(req, res) {
  res.status(200).json(await resenasService.save(token(req), req.params.slug, req.validated))
}

async function remove(req, res) {
  await resenasService.remove(token(req), req.params.slug)
  res.status(204).end()
}

module.exports = { list, mine, save, remove }
