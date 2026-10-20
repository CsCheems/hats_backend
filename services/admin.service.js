const catalog = require('./catalog.store')
const gateway = require('./payments.gateway')
const pedidos = require('./pedidos.store')
const ApiError = require('../utils/ApiError')
const { parseFolio } = require('../utils/folio')
const { guard } = require('../utils/shopErrors')
const { MESSAGES } = require('../validation/rules')

// Lo que el panel enseña. Igual que auth.service: no conoce req ni res, no elige
// status a mano y se podría llamar mañana desde un script.
//
// Todo lo del inventario se lee con el `accessToken` de quien pide: la vista y
// las tablas de producto solo dejan pasar a quien es_admin(), así que aunque
// requireAdmin fallara, la base no enseñaría nada.
//
// LA REGLA DE ESTE ARCHIVO: las cifras se derivan, no se escriben. El número de
// productos es la longitud del inventario y el ingreso es la suma de los
// pedidos, así que un artículo nuevo o un pedido más mueven el resumen solos. Ni
// siquiera el periodo anterior está escrito: son los pedidos de los treinta días
// previos a los últimos treinta, que están en la misma base.

// Cuánto es «poco» stock. Es una regla de negocio, así que vive en el servicio y
// no en el almacén — el almacén solo sabe filtrar por un número que le den.
const LIMITE_STOCK = 5

// Cuántos pedidos caben en el resumen sin dejar de ser un resumen.
const PEDIDOS_RECIENTES = 5

// El periodo del resumen son los últimos treinta días, y se compara con los
// treinta anteriores. Se piden de una vez los sesenta.
const DIA = 24 * 60 * 60 * 1000
const PERIODO_DIAS = 30

// Un pedido cancelado sigue siendo un pedido —se hizo, se registró y hay que
// contarlo—, pero no es una venta ni un ingreso. Confundirlo infla las dos
// cifras que de verdad importan.
const facturables = (filas) => filas.filter((pedido) => pedido.estado !== 'cancelado')

const suma = (filas, campo) => filas.reduce((total, fila) => total + fila[campo], 0)

// Los totales traen centavos: se redondea al sumar para no arrastrar 0.1 + 0.2.
const aPesos = (valor) => Math.round(valor * 100) / 100

/**
 * Variación porcentual con un decimal. Devuelve null cuando no hay con qué
 * comparar: sin referencia, cualquier número que pusiéramos sería inventado, y
 * la tarjeta prefiere no decir nada a decir «+0%».
 */
function variacion(actual, anterior) {
  if (!anterior) return null

  return Math.round(((actual - anterior) / anterior) * 1000) / 10
}

async function summary(accessToken) {
  const ahora = Date.now()
  const inicio = ahora - PERIODO_DIAS * DIA

  const [productos, stockBajo, recientes] = await Promise.all([
    catalog.list(accessToken),
    catalog.lowStock(accessToken, LIMITE_STOCK),
    guard(pedidos.adminList(accessToken, new Date(ahora - 2 * PERIODO_DIAS * DIA))),
  ])

  const actuales = recientes.filter((pedido) => new Date(pedido.pagado).getTime() >= inicio)
  const anteriores = recientes.filter((pedido) => new Date(pedido.pagado).getTime() < inicio)

  const ventas = suma(facturables(actuales), 'articulos')
  const ingresos = aPesos(suma(facturables(actuales), 'total'))

  return {
    periodo: 'Últimos 30 días',
    metricas: {
      // Sin variación a propósito: el inventario es una foto de hoy, no un
      // acumulado del periodo, y no hay un «cuántos productos había el mes
      // pasado» que no nos estuviéramos inventando.
      productos: { valor: productos.length, variacion: null },
      pedidos: { valor: actuales.length, variacion: variacion(actuales.length, anteriores.length) },
      ventas: { valor: ventas, variacion: variacion(ventas, suma(facturables(anteriores), 'articulos')) },
      ingresos: {
        valor: ingresos,
        variacion: variacion(ingresos, aPesos(suma(facturables(anteriores), 'total'))),
      },
    },
    // La base ya los entrega del más reciente al más antiguo.
    pedidosRecientes: actuales.slice(0, PEDIDOS_RECIENTES),
    stockBajo: { limite: LIMITE_STOCK, items: stockBajo },
  }
}

async function categories(accessToken) {
  return catalog.categories(accessToken)
}

/**
 * El inventario, entero o de una categoría.
 *
 * Una categoría que no existe es un 404 y no una lista vacía. Son dos cosas
 * distintas —«aquí no hay nada» y «esto no es un sitio»— y la segunda casi
 * siempre es una URL mal escrita; devolver una tabla vacía la haría pasar por
 * buena.
 */
async function products(accessToken, categoria, { archivados = false } = {}) {
  // Los archivados son una lista aparte y entera: no se filtran por categoría,
  // porque solo se miran para restaurar.
  if (archivados) {
    return { categoria: null, items: await catalog.list(accessToken, { archivados: true }) }
  }

  if (!categoria) {
    return { categoria: null, items: await catalog.list(accessToken) }
  }

  const encontrada = await catalog.findCategory(categoria)

  if (!encontrada) throw ApiError.notFound()

  return { categoria: encontrada, items: await catalog.listByCategory(accessToken, categoria) }
}

// ─── CRUD de artículos ─────────────────────────────────────────────────────

// Lo que necesita el formulario para sus selectores: qué marcas trabaja cada
// categoría y si lleva género o fieltro.
async function catalogos() {
  return catalog.catalogos()
}

async function product(accessToken, slug) {
  const encontrado = await catalog.findProduct(accessToken, slug)

  if (!encontrado) throw ApiError.notFound()

  return encontrado
}

// Los mensajes-clave que lanzan las funciones de la base, traducidos. Si llegan
// hasta aquí es que algo cambió entre la comprobación del servicio y la
// escritura —un catálogo tocado a mano, dos pestañas a la vez—, y la base hizo
// su trabajo de última palabra.
const ERRORES_DB = {
  producto_no_encontrado: () => ApiError.notFound(),
  imagen_no_encontrada: () => ApiError.notFound(),
  galeria_llena: () => ApiError.invalidField('imagen', MESSAGES.galeriaLlena),
  categoria_desconocida: () => ApiError.invalidField('categoria', MESSAGES.categoria),
  marca_desconocida: () => ApiError.invalidField('marca', MESSAGES.marca),
  genero_desconocido: () => ApiError.invalidField('genero', MESSAGES.genero),
  fieltro_desconocido: () => ApiError.invalidField('fieltro', MESSAGES.fieltro),
}

const traducir = (error, errores = ERRORES_DB) => errores[error?.message]?.() ?? error

/**
 * Las reglas del artículo que dependen del catálogo, en el orden del
 * formulario, y los datos ya listos para escribir: precio y stock como número,
 * y género y fieltro solo donde aplican.
 *
 * Todo esto lo vuelve a imponer la base con sus llaves. Se comprueba aquí antes
 * para poder decir QUÉ campo está mal y con palabras; una violación de llave
 * foránea solo sabría responder un 500.
 */
async function checkProduct(values) {
  const { categorias, marcas, generos, fieltros } = await catalog.catalogos()

  const categoria = categorias.find((entrada) => entrada.id === values.categoria)
  if (!categoria) throw ApiError.invalidField('categoria', MESSAGES.categoria)

  // La tienda es de una sola marca y el formulario no la pide: sin marca en el
  // cuerpo se usa la única que hay. Con varias, sí hay que decirla. Un fallo de
  // marca sin campo de marca en pantalla se coloca bajo la categoría.
  const sinCampo = !values.marca
  const marca = values.marca ?? (marcas.length === 1 ? marcas[0].id : null)
  const campoMarca = sinCampo ? 'categoria' : 'marca'

  if (!marcas.some((entrada) => entrada.id === marca)) {
    throw ApiError.invalidField(campoMarca, sinCampo ? MESSAGES.categoriaSinMarca : MESSAGES.marca)
  }
  if (!categoria.marcas.includes(marca)) {
    throw ApiError.invalidField(campoMarca, sinCampo ? MESSAGES.categoriaSinMarca : MESSAGES.marcaCategoria)
  }

  if (categoria.llevaGenero && !values.genero) {
    throw ApiError.invalidField('genero', MESSAGES.generoFalta)
  }
  if (!categoria.llevaGenero && values.genero) {
    throw ApiError.invalidField('genero', MESSAGES.generoSobra)
  }
  if (values.genero && !generos.some((genero) => genero.id === values.genero)) {
    throw ApiError.invalidField('genero', MESSAGES.genero)
  }

  if (values.fieltro && !categoria.admiteFieltro) {
    throw ApiError.invalidField('fieltro', MESSAGES.fieltroSobra)
  }
  if (values.fieltro && !fieltros.some((fieltro) => fieltro.id === values.fieltro)) {
    throw ApiError.invalidField('fieltro', MESSAGES.fieltro)
  }

  // Nombrando campos, nunca con spread: lo que llega a la base es esto y nada
  // más, aunque el esquema de validación creciera.
  return {
    titulo: values.titulo,
    descripcion: values.descripcion,
    categoria: values.categoria,
    marca,
    genero: values.genero,
    fieltro: values.fieltro,
    precio: Number(values.precio),
    stock: Number(values.stock),
    publicado: values.publicado,
    enPortada: values.enPortada,
  }
}

// Sin acentos, en minúsculas, con guiones, y vacío si el texto no tiene ni una
// letra ni un número. La ñ se queda en n por el camino, como en el buscador.
const aSlug = (texto, largo) =>
  texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, largo)
    .replace(/^-+|-+$/g, '')

/**
 * El slug sale del título: «Botas camperas «Laredo»» → botas-camperas-laredo.
 * Se recorta a 70 para dejar sitio al sufijo de un choque sin pasar de los 80
 * que admite la tabla.
 */
function slugify(titulo) {
  return aSlug(titulo, 70) || 'articulo'
}

const INTENTOS_SLUG = 20

/**
 * Alta. El slug no se elige: se deriva del título, y si ya existe se prueba con
 * -2, -3… La base es quien dice si está ocupado (23505), así que dos altas
 * simultáneas con el mismo título acaban con dos slugs distintos y ninguna
 * pisa a la otra.
 */
async function createProduct(accessToken, values) {
  const datos = await checkProduct(values)
  const base = slugify(values.titulo)

  for (let intento = 1; intento <= INTENTOS_SLUG; intento += 1) {
    const slug = intento === 1 ? base : `${base}-${intento}`

    try {
      await catalog.saveProduct(accessToken, { crear: true, slug, datos })
      return product(accessToken, slug)
    } catch (error) {
      if (error?.code === '23505') continue
      throw traducir(error)
    }
  }

  throw new Error(`Sin slug libre para «${base}» tras ${INTENTOS_SLUG} intentos`)
}

/**
 * Edición. El slug NO cambia aunque cambie el título: la portada y las rutas
 * del bucket lo referencian. Si cambia la categoría, la base recompone el SKU.
 */
async function updateProduct(accessToken, slug, values) {
  const datos = await checkProduct(values)

  try {
    await catalog.saveProduct(accessToken, { crear: false, slug, datos })
  } catch (error) {
    throw traducir(error)
  }

  return product(accessToken, slug)
}

async function archiveProduct(accessToken, slug) {
  try {
    await catalog.archiveProduct(accessToken, slug)
  } catch (error) {
    throw traducir(error)
  }
}

async function restoreProduct(accessToken, slug) {
  try {
    await catalog.restoreProduct(accessToken, slug)
  } catch (error) {
    throw traducir(error)
  }

  return product(accessToken, slug)
}

// ─── Galería ───────────────────────────────────────────────────────────────

const MAX_IMAGENES = 8

// Un id de imagen que no es un entero no es una imagen: 404 sin preguntarle a
// la base.
const imagenValida = (imagenId) => /^\d{1,18}$/.test(imagenId)

/**
 * Sube una imagen al final de la galería. Devuelve el artículo con la galería
 * ya actualizada, que es lo que el panel pinta.
 *
 * Se comprueba antes de subir que el artículo existe y que cabe otra imagen:
 * subir 5 MB para descubrir después que no había sitio es tiempo y ancho de
 * banda tirados. La base lo vuelve a comprobar al añadirla.
 */
async function uploadImage(accessToken, slug, imagen) {
  const actual = await product(accessToken, slug)

  if (actual.imagenes.length >= MAX_IMAGENES) {
    throw ApiError.invalidField('imagen', MESSAGES.galeriaLlena)
  }

  try {
    await catalog.uploadImage(accessToken, slug, imagen)
  } catch (error) {
    throw traducir(error)
  }

  return product(accessToken, slug)
}

async function removeImage(accessToken, slug, imagenId) {
  if (!imagenValida(imagenId)) throw ApiError.notFound()

  try {
    await catalog.removeImage(accessToken, slug, Number(imagenId))
  } catch (error) {
    throw traducir(error)
  }

  return product(accessToken, slug)
}

async function makePrincipal(accessToken, slug, imagenId) {
  if (!imagenValida(imagenId)) throw ApiError.notFound()

  try {
    await catalog.makePrincipal(accessToken, slug, Number(imagenId))
  } catch (error) {
    throw traducir(error)
  }

  return product(accessToken, slug)
}

// ─── Marcas y categorías ───────────────────────────────────────────────────
//
// El mismo reparto que los artículos: aquí se comprueba lo que se puede nombrar
// con un campo —con el catálogo en la mano—, y la base lo vuelve a imponer al
// escribir (db/scripts/11).
//
// El slug sale del nombre al crear y NO cambia al renombrar: está en las URL de
// la tienda (?marca=, ?categoria=) y en las del panel. Y al revés que con los
// artículos, un choque no se resuelve con -2: dos marcas que se escriben igual
// son la misma marca dos veces, y eso es un error bajo `nombre`.

const LARGO_SLUG_CATALOGO = 60

// /admin/productos/nuevo es el alta de artículos y el router lo prefiere sobre
// /admin/productos/:categoria. La base tiene el mismo check.
const SLUG_RESERVADO = 'nuevo'

// Dos nombres son el mismo si se escriben igual para quien lee el menú:
// «Cañón Hats» y «canon hats» lo son.
const mismoNombre = (a, b) => aSlug(a, LARGO_SLUG_CATALOGO) === aSlug(b, LARGO_SLUG_CATALOGO)

const ERRORES_CATALOGO = {
  marca_no_encontrada: () => ApiError.notFound(),
  categoria_no_encontrada: () => ApiError.notFound(),
  marca_duplicada: () => ApiError.invalidField('nombre', MESSAGES.marcaDuplicada),
  categoria_duplicada: () => ApiError.invalidField('nombre', MESSAGES.categoriaDuplicada),
  marca_sin_categorias: () => ApiError.invalidField('categorias', MESSAGES.categorias),
  categorias_desconocidas: () => ApiError.invalidField('categorias', MESSAGES.categoriasDesconocidas),
  marca_categoria_en_uso: () => ApiError.invalidField('categorias', MESSAGES.categoriaConArticulos),
  prefijo_ocupado: () => ApiError.invalidField('prefijo', MESSAGES.prefijoOcupado),
  prefijo_fijo: () => ApiError.invalidField('prefijo', MESSAGES.prefijoFijo),
  genero_fijo: () => ApiError.invalidField('llevaGenero', MESSAGES.generoFijo),
  fieltro_fijo: () => ApiError.invalidField('admiteFieltro', MESSAGES.fieltroFijo),
  marca_en_uso: () => ApiError.inUse(MESSAGES.marcaEnUso),
  categoria_en_uso: () => ApiError.inUse(MESSAGES.categoriaEnUso),
}

// Escribe en la base y traduce sus mensajes-clave. Las cuatro escrituras de
// catálogo son iguales salvo por la función que llaman.
async function escribirCatalogo(escritura) {
  try {
    await escritura()
  } catch (error) {
    throw traducir(error, ERRORES_CATALOGO)
  }
}

/**
 * Las reglas de una marca que dependen de lo que ya hay, en el orden del
 * formulario. `actual` es la marca que se edita, o null en el alta.
 */
async function checkBrand(values, actual) {
  const base = aSlug(values.nombre, LARGO_SLUG_CATALOGO)
  if (!base) throw ApiError.invalidField('nombre', MESSAGES.nombreSinLetras)

  const slug = actual?.id ?? base
  const { categorias, marcas } = await catalog.catalogos()

  const duplicada = marcas.some(
    (marca) =>
      marca.id !== actual?.id && (mismoNombre(marca.label, values.nombre) || (!actual && marca.id === slug)),
  )
  if (duplicada) throw ApiError.invalidField('nombre', MESSAGES.marcaDuplicada)

  if (!values.categorias.every((id) => categorias.some((categoria) => categoria.id === id))) {
    throw ApiError.invalidField('categorias', MESSAGES.categoriasDesconocidas)
  }

  if (actual?.categoriasFijas.some((id) => !values.categorias.includes(id))) {
    throw ApiError.invalidField('categorias', MESSAGES.categoriaConArticulos)
  }

  return { slug, datos: { nombre: values.nombre, categorias: values.categorias } }
}

/**
 * Lo mismo para una categoría. Con artículos, el prefijo y el género quedan
 * fijos, y el fieltro no se puede quitar si alguno lo lleva: son los `*Fijo`
 * que ya calcula el almacén.
 */
async function checkCategory(values, actual) {
  const base = aSlug(values.nombre, LARGO_SLUG_CATALOGO)
  if (!base) throw ApiError.invalidField('nombre', MESSAGES.nombreSinLetras)

  const slug = actual?.id ?? base
  if (!actual && slug === SLUG_RESERVADO) throw ApiError.invalidField('nombre', MESSAGES.nombreReservado)

  const { categorias } = await catalog.catalogos()
  const otras = categorias.filter((categoria) => categoria.id !== actual?.id)

  const duplicada = otras.some(
    (categoria) => mismoNombre(categoria.label, values.nombre) || (!actual && categoria.id === slug),
  )
  if (duplicada) throw ApiError.invalidField('nombre', MESSAGES.categoriaDuplicada)

  const prefijo = values.prefijo.toUpperCase()

  if (otras.some((categoria) => categoria.prefijo === prefijo)) {
    throw ApiError.invalidField('prefijo', MESSAGES.prefijoOcupado)
  }
  if (actual?.prefijoFijo && prefijo !== actual.prefijo) {
    throw ApiError.invalidField('prefijo', MESSAGES.prefijoFijo)
  }
  if (actual?.generoFijo && values.llevaGenero !== actual.llevaGenero) {
    throw ApiError.invalidField('llevaGenero', MESSAGES.generoFijo)
  }
  if (actual?.fieltroFijo && !values.admiteFieltro) {
    throw ApiError.invalidField('admiteFieltro', MESSAGES.fieltroFijo)
  }

  return {
    slug,
    datos: {
      nombre: values.nombre,
      prefijo,
      llevaGenero: values.llevaGenero,
      admiteFieltro: values.admiteFieltro,
    },
  }
}

async function brands(accessToken) {
  return catalog.brands(accessToken)
}

async function brand(accessToken, slug) {
  const encontrada = await catalog.findBrand(accessToken, slug)

  if (!encontrada) throw ApiError.notFound()

  return encontrada
}

async function createBrand(accessToken, values) {
  const { slug, datos } = await checkBrand(values, null)

  await escribirCatalogo(() => catalog.saveBrand(accessToken, { crear: true, slug, datos }))

  return brand(accessToken, slug)
}

async function updateBrand(accessToken, slug, values) {
  const actual = await brand(accessToken, slug)
  const { datos } = await checkBrand(values, actual)

  await escribirCatalogo(() => catalog.saveBrand(accessToken, { crear: false, slug, datos }))

  return brand(accessToken, slug)
}

// Se comprueba antes de llamar a la base para responder con el motivo; si algo
// cambió entre medias, la base dice lo mismo con marca_en_uso.
async function deleteBrand(accessToken, slug) {
  const actual = await brand(accessToken, slug)

  if (!actual.borrable) throw ApiError.inUse(MESSAGES.marcaEnUso)

  await escribirCatalogo(() => catalog.deleteBrand(accessToken, slug))
}

async function category(accessToken, slug) {
  const encontrada = await catalog.findCategoryAdmin(accessToken, slug)

  if (!encontrada) throw ApiError.notFound()

  return encontrada
}

async function createCategory(accessToken, values) {
  const { slug, datos } = await checkCategory(values, null)

  await escribirCatalogo(() => catalog.saveCategory(accessToken, { crear: true, slug, datos }))

  return category(accessToken, slug)
}

async function updateCategory(accessToken, slug, values) {
  const actual = await category(accessToken, slug)
  const { datos } = await checkCategory(values, actual)

  await escribirCatalogo(() => catalog.saveCategory(accessToken, { crear: false, slug, datos }))

  return category(accessToken, slug)
}

async function deleteCategory(accessToken, slug) {
  const actual = await category(accessToken, slug)

  if (!actual.borrable) throw ApiError.inUse(MESSAGES.categoriaEnUso)

  await escribirCatalogo(() => catalog.deleteCategory(accessToken, slug))
}

// ─── Pedidos ───────────────────────────────────────────────────────────────

/** Todos los pedidos pagados, el más reciente primero. */
async function orders(accessToken) {
  return guard(pedidos.adminList(accessToken, null))
}

/** Un pedido por folio, con quién lo compró. Inexistente o sin pagar: 404. */
async function order(accessToken, folio) {
  const id = parseFolio(folio)

  if (!id) throw ApiError.notFound()

  const pedido = await guard(pedidos.adminFind(accessToken, id))

  if (!pedido) throw ApiError.notFound()

  return pedido
}

/**
 * Cambia el estado de un pedido y devuelve el pedido como quedó. La base decide
 * qué transiciones valen (db/scripts/16). Si se cancela, además se pide el
 * reembolso a la pasarela: el stock ya volvió en la misma transacción, y si la
 * devolución falla se avisa en consola, porque el pedido ya está cancelado y
 * habrá que devolver el dinero a mano.
 */
async function setOrderState(accessToken, folio, { estado }) {
  const antes = await order(accessToken, folio)

  await guard(pedidos.adminSetState(accessToken, parseFolio(folio), estado))

  if (estado === 'cancelado' && antes.pago?.referencia) {
    await gateway
      .refund({ referencia: antes.pago.referencia })
      .catch((fallo) => console.error('No se pudo devolver el cobro', antes.pago.referencia, fallo))
  }

  return order(accessToken, folio)
}

module.exports = {
  summary,
  orders,
  order,
  setOrderState,
  categories,
  products,
  catalogos,
  product,
  createProduct,
  updateProduct,
  archiveProduct,
  restoreProduct,
  uploadImage,
  removeImage,
  makePrincipal,
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
