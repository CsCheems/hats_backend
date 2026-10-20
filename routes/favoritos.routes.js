const { Router } = require('express')
const controller = require('../controllers/favoritos.controller')
const requireAuth = require('../middleware/requireAuth')

// Declaración pura. requireAuth va al ROUTER ENTERO, como los dos filtros de
// admin.routes: una ruta nueva aquí nace protegida, y para dejarla abierta hay
// que sacarla a propósito. No hace falta requireAdmin: los favoritos son de
// cualquier cuenta, y la base los separa por auth.uid().

const router = Router()

router.use(requireAuth)

router.get('/', controller.list)
router.put('/:slug', controller.add)
router.delete('/:slug', controller.remove)

module.exports = router
