const { Router } = require('express')
const controller = require('../controllers/carrito.controller')
const requireAuth = require('../middleware/requireAuth')
const validate = require('../middleware/validate')
const { addToCartSchema, setCartSchema } = require('../validation/shop.schema')

// Declaración pura. requireAuth al router entero, por lo mismo que en
// favoritos.routes.
//
// POST suma a lo que ya hay (el botón «Añadir» del detalle); PUT fija la
// cantidad (la bolsa; 0 quita el artículo); DELETE lo quita.

const router = Router()

router.use(requireAuth)

router.get('/', controller.view)
router.post('/:slug', validate(addToCartSchema), controller.add)
router.put('/:slug', validate(setCartSchema), controller.set)
router.delete('/:slug', controller.remove)

module.exports = router
