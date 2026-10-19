const { Router } = require('express')
const controller = require('../controllers/ubicaciones.controller')

// Declaración pura, como el resto de rutas.
//
// SIN FILTROS, igual que products.routes: el formulario de alta necesita la
// lista antes de que exista una sesión. Lo que sale son nombres de países y
// estados, un catálogo que RLS ya deja leer sin sesión en la propia base.

const router = Router()

router.get('/', controller.list)

module.exports = router
