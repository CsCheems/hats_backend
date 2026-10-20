const carritoService = require('../services/carrito.service')

// Traduce HTTP ↔ dominio y nada más. Todas las rutas van detrás de requireAuth.
// El cuerpo de añadir y de fijar se lee de `req.validated`, nunca de req.body.

const token = (req) => req.session.accessToken

async function view(req, res) {
  res.status(200).json(await carritoService.view(token(req)))
}

async function add(req, res) {
  res.status(200).json(await carritoService.add(token(req), req.params.slug, req.validated))
}

async function set(req, res) {
  res.status(200).json(await carritoService.set(token(req), req.params.slug, req.validated))
}

// Quitar devuelve la bolsa que queda, igual que añadir y fijar: el cliente
// siempre sustituye la suya por lo que responde el servidor.
async function remove(req, res) {
  res.status(200).json(await carritoService.remove(token(req), req.params.slug))
}

module.exports = { view, add, set, remove }
