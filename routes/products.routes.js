const { Router } = require('express')
const controller = require('../controllers/products.controller')

// Declaración pura, como auth.routes y admin.routes.
//
// AQUÍ NO HAY FILTROS, y es lo único que hay que mirar en este archivo: esto es
// el escaparate y se ve sin sesión. Es la excepción DELIBERADA a
// admin.routes.js, donde el router entero va detrás de requireAuth +
// requireAdmin — allí proteger es lo que pasa por omisión, y aquí publicar.
//
// Lo que se publica no lo decide esta ruta sino toPublicProduct, en
// services/catalog.store.js: una lista blanca de campos, así que `sku`, `stock`
// y `actualizado` no salen aunque alguien añada aquí una ruta nueva sin pensarlo.

const router = Router()

router.get('/', controller.list)

module.exports = router
