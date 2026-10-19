const { Router } = require('express')
const controller = require('../controllers/marcas.controller')

// Declaración pura, como el resto de rutas.
//
// SIN FILTROS, igual que products.routes y ubicaciones.routes: el menú «Marcas»
// del navbar y la banda de la portada se pintan sin sesión.
//
// Qué marcas salen no lo decide esta ruta sino marcas_publicas() en la base
// (db/scripts/11): solo las que tienen algo publicado.

const router = Router()

router.get('/', controller.list)

module.exports = router
