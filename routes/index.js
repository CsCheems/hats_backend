const { Router } = require('express')
const adminRoutes = require('./admin.routes')
const authRoutes = require('./auth.routes')
const marcasRoutes = require('./marcas.routes')
const productsRoutes = require('./products.routes')
const ubicacionesRoutes = require('./ubicaciones.routes')

// Índice de la API.
//
// El prefijo /api no se pone aquí sino en app.js: es contrato con VITE_API_URL
// del frontend, y teniéndolo en un solo sitio, mudarlo es una línea.
//
// Nota de nombres: aquí los archivos son <dominio>.<capa>.js y en el frontend
// son <capa>/<dominio>.js. La divergencia es deliberada — en el backend un mismo
// dominio se abre en cuatro archivos a la vez, y las trazas de Node imprimen
// solo el basename: «at register (auth.service.js:41)» se lee, con tres auth.js
// no se lee.

const router = Router()

// Sonda de vida. Es lo único para lo que servía el GET /products/:id de la
// plantilla de Express que había aquí: distinguir «el servidor no está» de «esa
// ruta no existe».
router.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})

router.use('/auth', authRoutes)

// Todo lo de /admin va detrás de requireAuth + requireAdmin, aplicados en el
// propio admin.routes.js. Aquí no hay filtro: si lo hubiera, habría dos sitios
// donde mirar para saber quién puede entrar.
router.use('/admin', adminRoutes)

// El escaparate, y el único dominio de esta API que se ve SIN SESIÓN. Aquí no
// hay filtro por el mismo motivo que en /admin no lo hay: quién puede entrar se
// decide en un solo sitio, y el de estas rutas es que no lo lleven.
//
// Los productos de la PORTADA siguen siendo data estática del frontend —doce
// piezas escogidas a mano en data/products.js—; la página de catálogo sí pide
// por aquí, y el panel sigue leyendo el inventario entero por /admin/products.
router.use('/products', productsRoutes)

// Países y estados para los desplegables del alta y del perfil. También sin
// sesión, y por lo mismo que /products: no llevar filtro es la decisión, y se
// toma en un solo sitio.
router.use('/ubicaciones', ubicacionesRoutes)

// Las marcas del menú de la tienda y de la portada. Sin sesión, por lo mismo.
router.use('/marcas', marcasRoutes)

module.exports = router
