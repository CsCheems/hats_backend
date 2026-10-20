const { Router } = require('express')
const controller = require('../controllers/pedidos.controller')
const requireAuth = require('../middleware/requireAuth')

// Las direcciones guardadas de la persona, para el paso de envío de la compra.
// Solo lectura: se añaden al pagar (casilla «Guardar en mi cuenta») y se editan
// en el perfil. requireAuth al router entero, como los demás de la cuenta.

const router = Router()

router.use(requireAuth)

router.get('/', controller.addresses)

module.exports = router
