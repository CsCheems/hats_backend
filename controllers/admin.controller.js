const adminService = require('../services/admin.service')

// Traduce HTTP ↔ dominio y nada más, como auth.controller. Sin try/catch:
// Express 5 propaga a next() el rechazo de un manejador async, así que el 404
// que lanza el servicio llega solo al manejador central.
//
// Todas las rutas van detrás de requireAuth + requireAdmin, así que
// `req.session` existe: su accessToken es con lo que el servicio lee y escribe
// la base, para que RLS aplique también aquí.
//
// Los cuerpos se leen de `req.validated` —el JSON de un artículo lo deja
// validate, la imagen la deja validateImage— y nunca de req.body. Lo que llega
// por la URL (`:id`, `:imagenId`, `?categoria=`) lo comprueba el servicio
// contra la base, que es una lista cerrada: más estricto que cualquier regex.

const token = (req) => req.session.accessToken

async function summary(req, res) {
  res.status(200).json(await adminService.summary(token(req)))
}

async function categories(req, res) {
  res.status(200).json(await adminService.categories(token(req)))
}

async function catalogos(req, res) {
  res.status(200).json(await adminService.catalogos())
}

async function products(req, res) {
  const archivados = req.query.archivados === '1'
  res.status(200).json(await adminService.products(token(req), req.query.categoria, { archivados }))
}

async function product(req, res) {
  res.status(200).json(await adminService.product(token(req), req.params.id))
}

async function createProduct(req, res) {
  res.status(201).json(await adminService.createProduct(token(req), req.validated))
}

async function updateProduct(req, res) {
  res.status(200).json(await adminService.updateProduct(token(req), req.params.id, req.validated))
}

// Archivar es el DELETE de esta API: el artículo deja de existir para la tienda
// y el inventario, aunque la fila se conserve. 204 porque no hay nada que
// devolver; restaurarlo sí devuelve el artículo.
async function archiveProduct(req, res) {
  await adminService.archiveProduct(token(req), req.params.id)
  res.status(204).end()
}

async function restoreProduct(req, res) {
  res.status(200).json(await adminService.restoreProduct(token(req), req.params.id))
}

async function uploadImage(req, res) {
  res.status(201).json(await adminService.uploadImage(token(req), req.params.id, req.validated))
}

async function makePrincipal(req, res) {
  res.status(200).json(await adminService.makePrincipal(token(req), req.params.id, req.params.imagenId))
}

async function removeImage(req, res) {
  res.status(200).json(await adminService.removeImage(token(req), req.params.id, req.params.imagenId))
}

async function brands(req, res) {
  res.status(200).json(await adminService.brands(token(req)))
}

async function brand(req, res) {
  res.status(200).json(await adminService.brand(token(req), req.params.id))
}

async function createBrand(req, res) {
  res.status(201).json(await adminService.createBrand(token(req), req.validated))
}

async function updateBrand(req, res) {
  res.status(200).json(await adminService.updateBrand(token(req), req.params.id, req.validated))
}

// Aquí DELETE sí borra, al revés que con los artículos: solo se puede borrar una
// marca que ningún artículo usa, así que no queda nada que conservar.
async function deleteBrand(req, res) {
  await adminService.deleteBrand(token(req), req.params.id)
  res.status(204).end()
}

async function category(req, res) {
  res.status(200).json(await adminService.category(token(req), req.params.id))
}

async function createCategory(req, res) {
  res.status(201).json(await adminService.createCategory(token(req), req.validated))
}

async function updateCategory(req, res) {
  res.status(200).json(await adminService.updateCategory(token(req), req.params.id, req.validated))
}

async function deleteCategory(req, res) {
  await adminService.deleteCategory(token(req), req.params.id)
  res.status(204).end()
}

module.exports = {
  summary,
  categories,
  catalogos,
  products,
  product,
  createProduct,
  updateProduct,
  archiveProduct,
  restoreProduct,
  uploadImage,
  makePrincipal,
  removeImage,
  brands,
  brand,
  createBrand,
  updateBrand,
  deleteBrand,
  category,
  createCategory,
  updateCategory,
  deleteCategory,
}
