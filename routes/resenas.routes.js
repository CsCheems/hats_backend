const { Router } = require('express')
const controller = require('../controllers/resenas.controller')
const requireAuth = require('../middleware/requireAuth')
const validate = require('../middleware/validate')
const { reviewSchema } = require('../validation/shop.schema')

// Escribir reseñas: todo detrás de requireAuth, al router entero. Leerlas es
// público y vive en products.routes.js (/products/:slug/resenas).
//
// `mia` va antes que `:slug` solo por claridad: no choca, porque la ruta tiene un
// segmento más.

const router = Router()

router.use(requireAuth)

router.get('/:slug/mia', controller.mine)
router.put('/:slug', validate(reviewSchema), controller.save)
router.delete('/:slug', controller.remove)

module.exports = router
