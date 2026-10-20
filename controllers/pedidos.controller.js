const pedidosService = require('../services/pedidos.service')

// Traduce HTTP ↔ dominio y nada más. Todas las rutas van detrás de requireAuth.
// El cuerpo de pagar se lee de `req.validated`, nunca de req.body.

const token = (req) => req.session.accessToken

async function summary(req, res) {
  res.status(200).json(await pedidosService.summary(token(req)))
}

// 201: se creó un pedido. La respuesta es el pedido entero, que es lo que la
// página de confirmación pinta sin pedir nada más.
async function checkout(req, res) {
  res.status(201).json(await pedidosService.checkout(token(req), req.userId, req.validated))
}

async function view(req, res) {
  res.status(200).json(await pedidosService.find(token(req), req.params.folio))
}

async function cancel(req, res) {
  res.status(200).json(await pedidosService.cancelOrder(token(req), req.params.folio))
}

async function list(req, res) {
  res.status(200).json(await pedidosService.list(token(req)))
}

async function addresses(req, res) {
  res.status(200).json(await pedidosService.addresses(token(req), req.userId))
}

module.exports = { summary, checkout, view, list, cancel, addresses }
