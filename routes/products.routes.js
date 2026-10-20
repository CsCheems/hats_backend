const { Router } = require('express')
const productsController = require('../controllers/products.controller')
const resenasController = require('../controllers/resenas.controller')

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
//
// Leer las reseñas de un artículo es público y por eso cuelga de aquí; escribirlas
// necesita sesión y vive en resenas.routes.js, donde sí hay filtro.

const router = Router()

router.get('/', productsController.list)
router.get('/:slug', productsController.detail)
router.get('/:slug/resenas', resenasController.list)

module.exports = router
