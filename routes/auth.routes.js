const { Router } = require('express')
const controller = require('../controllers/auth.controller')
const requireAuth = require('../middleware/requireAuth')
const validate = require('../middleware/validate')
const { loginSchema, registerSchema, updateMeSchema } = require('../validation/auth.schema')

// Declaración pura: método, camino, filtros y controlador. Cero lógica — un `if`
// en este archivo es de un servicio.
//
// Las rutas se leen en columna: los filtros de cada una van entre el camino y el
// controlador. En PUT /me van los dos, y en ese orden: primero saber quién es,
// después mirar qué manda — validar el cuerpo de alguien sin sesión sería
// contestarle un 400 a quien merece un 401.

const router = Router()

router.post('/login', validate(loginSchema), controller.login)
router.post('/register', validate(registerSchema), controller.register)

router.get('/me', requireAuth, controller.me)
router.put('/me', requireAuth, validate(updateMeSchema), controller.updateMe)
router.post('/logout', requireAuth, controller.logout)

module.exports = router
