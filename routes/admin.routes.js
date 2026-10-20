const { Router } = require('express')
const controller = require('../controllers/admin.controller')
const requireAdmin = require('../middleware/requireAdmin')
const requireAuth = require('../middleware/requireAuth')
const validate = require('../middleware/validate')
const validateImage = require('../middleware/validateImage')
const { brandSchema, categorySchema, productSchema } = require('../validation/admin.schema')

// Declaración pura, como auth.routes.
//
// Los dos filtros se aplican AL ROUTER ENTERO y no ruta por ruta. Es la
// diferencia entre que proteger sea lo que pasa por omisión y que sea algo que
// hay que acordarse de escribir: una ruta nueva en este archivo nace protegida,
// y para dejarla abierta hay que sacarla de aquí a propósito. Al revés, el
// olvido de una sola línea publica el inventario.
//
// El orden importa y no es intercambiable: requireAuth deja `req.userId`, que es
// lo único con lo que requireAdmin puede mirar el rol. Puestos al revés, el
// segundo leería undefined y todo el mundo sería «no admin» — que falla del lado
// seguro, pero por accidente, y un día dejaría de hacerlo.
//
// Y detrás de los dos filtros sigue estando la base: todo se lee y se escribe
// con el JWT de quien pide, así que RLS dice lo mismo que requireAdmin.

const router = Router()

router.use(requireAuth, requireAdmin)

router.get('/summary', controller.summary)
router.get('/catalogos', controller.catalogos)

// Las categorías: la lista es la del menú lateral, que la sección Categorías
// también usa.
router.get('/categories', controller.categories)
router.post('/categories', validate(categorySchema), controller.createCategory)
router.get('/categories/:id', controller.category)
router.put('/categories/:id', validate(categorySchema), controller.updateCategory)
router.delete('/categories/:id', controller.deleteCategory)

router.get('/brands', controller.brands)
router.post('/brands', validate(brandSchema), controller.createBrand)
router.get('/brands/:id', controller.brand)
router.put('/brands/:id', validate(brandSchema), controller.updateBrand)
router.delete('/brands/:id', controller.deleteBrand)

router.get('/products', controller.products)
router.post('/products', validate(productSchema), controller.createProduct)
router.get('/products/:id', controller.product)
router.put('/products/:id', validate(productSchema), controller.updateProduct)
router.delete('/products/:id', controller.archiveProduct)
router.post('/products/:id/restaurar', controller.restoreProduct)

// El cuerpo de la subida es la imagen cruda: validateImage lee hasta 10 MB y
// comprueba tipo y firma antes de que el controlador la vea.
router.post('/products/:id/imagenes', ...validateImage, controller.uploadImage)
router.put('/products/:id/imagenes/:imagenId/principal', controller.makePrincipal)
router.delete('/products/:id/imagenes/:imagenId', controller.removeImage)

module.exports = router
