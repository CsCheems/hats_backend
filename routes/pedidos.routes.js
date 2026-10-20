const { Router } = require('express')
const controller = require('../controllers/pedidos.controller')
const requireAuth = require('../middleware/requireAuth')
const validate = require('../middleware/validate')
const { checkoutSchema } = require('../validation/shop.schema')

// Declaración pura. requireAuth al router entero, por lo mismo que en carrito: una
// ruta nueva aquí nace protegida.
//
// GET /resumen es lo que se pagaría hoy por la bolsa; GET / son mis pedidos; POST /
// paga (aparta, cobra y confirma); GET /:folio lee un pedido propio. `/resumen`
// va antes que `/:folio` para que el segmento fijo no se lea como un folio.

const router = Router()

router.use(requireAuth)

router.get('/resumen', controller.summary)
router.get('/', controller.list)
router.post('/', validate(checkoutSchema), controller.checkout)
router.get('/:folio', controller.view)
router.post('/:folio/cancelar', controller.cancel)

module.exports = router
