const catalog = require('./catalog.store')
const { publicClient, userClient } = require('./supabase.client')

// La única capa que conoce las funciones de db/scripts/14: el detalle público, los
// favoritos, la bolsa y las reseñas. Igual que catalog.store: llama, traduce
// nombres de columna a los de la API y no decide qué significa nada. Los errores
// de la base se lanzan tal cual —con su mensaje-clave— y los traducen los
// servicios.
//
// Dos clientes, y la diferencia es la que importa:
//   · lo público (detalle, reseñas de un artículo) va por `publicClient`, sin
//     sesión;
//   · todo lo de una persona (favoritos, bolsa, escribir una reseña) va por
//     `userClient(accessToken)`: las funciones leen auth.uid() del JWT, así que lo
//     que se lee y se escribe es siempre lo suyo, aunque el servidor se equivoque.

async function call(client, funcion, argumentos) {
  const { data, error } = await client.rpc(funcion, argumentos)
  if (error) throw error
  return data
}

const rotulos = (categorias) => new Map(categorias.map((categoria) => [categoria.id, categoria.label]))

// ─── Detalle ───────────────────────────────────────────────────────────────

/**
 * Un artículo publicado con toda su galería, o null. La lista blanca es la del
 * catálogo (`toPublicProduct`) más lo que el detalle necesita: el rótulo de la
 * categoría, las URLs de todas las imágenes en orden y `maximo`, lo más que se
 * puede pedir. El stock no sale; `maximo` es lo único que de él se publica.
 */
async function productDetail(slug) {
  const [filas, { categorias }] = await Promise.all([
    call(publicClient, 'producto_publico', { p_slug: slug }),
    catalog.catalogos(),
  ])

  const fila = filas[0]
  if (!fila) return null

  return {
    ...catalog.toPublicProduct({ ...fila, foto_ruta: fila.rutas[0] ?? null }),
    categoriaLabel: rotulos(categorias).get(fila.categoria) ?? fila.categoria,
    imagenes: fila.rutas.map(catalog.fotoUrl),
    maximo: fila.maximo,
  }
}

// ─── Favoritos ─────────────────────────────────────────────────────────────

async function favorites(accessToken) {
  const [filas, { categorias }] = await Promise.all([
    call(userClient(accessToken), 'mis_favoritos'),
    catalog.catalogos(),
  ])
  const nombres = rotulos(categorias)

  return filas.map((fila) => ({
    ...catalog.toPublicProduct(fila),
    categoriaLabel: nombres.get(fila.categoria) ?? fila.categoria,
    guardado: fila.guardado,
  }))
}

async function addFavorite(accessToken, slug) {
  await call(userClient(accessToken), 'agregar_favorito', { p_slug: slug })
}

async function removeFavorite(accessToken, slug) {
  await call(userClient(accessToken), 'quitar_favorito', { p_slug: slug })
}

// ─── Bolsa ─────────────────────────────────────────────────────────────────

async function cart(accessToken) {
  const [filas, { categorias }] = await Promise.all([
    call(userClient(accessToken), 'mi_carrito'),
    catalog.catalogos(),
  ])
  const nombres = rotulos(categorias)

  return filas.map((fila) => ({
    id: fila.slug,
    categoria: fila.categoria,
    categoriaLabel: nombres.get(fila.categoria) ?? fila.categoria,
    titulo: fila.titulo,
    precio: Number(fila.precio),
    disponible: fila.disponible,
    foto: catalog.fotoUrl(fila.foto_ruta),
    cantidad: fila.cantidad,
    maximo: fila.maximo,
  }))
}

// `sumar` = true añade a lo que ya hay (el botón «Añadir» del detalle); false lo
// fija (cambiar la cantidad desde la bolsa; 0 quita el artículo). Devuelve la
// cantidad que quedó, que puede ser menor que la pedida.
async function saveInCart(accessToken, slug, cantidad, sumar) {
  return call(userClient(accessToken), 'guardar_en_carrito', {
    p_slug: slug,
    p_cantidad: cantidad,
    p_sumar: sumar,
  })
}

async function removeFromCart(accessToken, slug) {
  await call(userClient(accessToken), 'quitar_del_carrito', { p_slug: slug })
}

// ─── Reseñas ───────────────────────────────────────────────────────────────

async function reviews(slug) {
  const filas = await call(publicClient, 'resenas_publicas', { p_slug: slug })

  return filas.map((fila) => ({
    id: fila.id,
    calificacion: fila.calificacion,
    texto: fila.texto,
    autor: fila.autor,
    fecha: fila.creado,
  }))
}

async function myReview(accessToken, slug) {
  const filas = await call(userClient(accessToken), 'mi_resena', { p_slug: slug })
  const fila = filas[0]

  return fila ? { calificacion: fila.calificacion, texto: fila.texto } : null
}

async function saveReview(accessToken, slug, { calificacion, texto }) {
  await call(userClient(accessToken), 'guardar_resena', {
    p_slug: slug,
    p_calificacion: calificacion,
    p_texto: texto,
  })
}

async function deleteReview(accessToken, slug) {
  await call(userClient(accessToken), 'borrar_resena', { p_slug: slug })
}

module.exports = {
  productDetail,
  favorites,
  addFavorite,
  removeFavorite,
  cart,
  saveInCart,
  removeFromCart,
  reviews,
  myReview,
  saveReview,
  deleteReview,
}
