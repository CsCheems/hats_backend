const { randomUUID } = require('node:crypto')
const config = require('../config')
const { publicClient, userClient } = require('./supabase.client')

// La única capa que conoce la forma de las tablas de producto en Supabase
// (backend/db/scripts/06–10). Consulta, ordena y cuenta; no decide qué
// significa nada. Un artículo o una categoría que no existen se devuelven como
// null, y es admin.service quien resuelve que eso es un 404.
//
// Sirve a DOS consumidores con permisos distintos, y esa es la línea que hay que
// tener presente al editarlo:
//   · el panel lee la vista `inventario` CON EL JWT de la administradora:
//     RLS le deja ver todo, y a cualquier otra cuenta, nada.
//   · la tienda entra por la función `catalogo_publico`, que ya devuelve solo lo
//     publicable, y además pasa por toPublicProduct, que es una lista blanca.
//
// Lo derivado —el SKU, el estado, la principal de la galería— lo calcula la
// vista, no este archivo. Aquí solo se traducen nombres de columna a los
// nombres que la API ya usaba.

const rows = async (query) => {
  const { data, error } = await query
  if (error) throw error
  return data
}

// La URL pública de una imagen del bucket. No sale a la red: se compone con la
// URL del proyecto.
function fotoUrl(ruta) {
  if (!ruta) return null
  return publicClient.storage.from(config.supabase.bucket).getPublicUrl(ruta).data.publicUrl
}

// ─── Catálogos ─────────────────────────────────────────────────────────────

/**
 * Categorías, marcas, géneros y fieltros, con los rótulos y el orden en que se
 * enseñan, más qué combinaciones admite cada categoría. Son de lectura pública
 * y se piden en paralelo.
 *
 * Sin caché a propósito: son siete consultas pequeñas, y una marca o una
 * categoría cambiadas desde el panel —o por SQL— se ven en la siguiente
 * petición en vez de al reiniciar el servidor.
 */
async function catalogos() {
  const [categorias, marcas, generos, fieltros, pares, conGenero, conFieltro] = await Promise.all([
    rows(publicClient.from('categorias').select('id, slug, nombre, prefijo').order('orden')),
    rows(publicClient.from('marcas').select('id, slug, nombre').order('orden')),
    rows(publicClient.from('generos').select('slug, nombre').order('orden')),
    rows(publicClient.from('fieltros').select('grado').order('grado')),
    rows(publicClient.from('marca_categorias').select('marca_id, categoria_id')),
    rows(publicClient.from('categorias_con_genero').select('categoria_id')),
    rows(publicClient.from('categorias_con_fieltro').select('categoria_id')),
  ])

  const marcaSlug = new Map(marcas.map((marca) => [marca.id, marca.slug]))
  const usanGenero = new Set(conGenero.map((fila) => fila.categoria_id))
  const usanFieltro = new Set(conFieltro.map((fila) => fila.categoria_id))

  return {
    categorias: categorias.map((categoria) => ({
      id: categoria.slug,
      label: categoria.nombre,
      prefijo: categoria.prefijo,
      llevaGenero: usanGenero.has(categoria.id),
      admiteFieltro: usanFieltro.has(categoria.id),
      // En el orden de las marcas, no en el de la tabla de pares.
      marcas: marcas
        .filter((marca) => pares.some((par) => par.marca_id === marca.id && par.categoria_id === categoria.id))
        .map((marca) => marcaSlug.get(marca.id)),
    })),
    marcas: marcas.map((marca) => ({ id: marca.slug, label: marca.nombre })),
    generos: generos.map((genero) => ({ id: genero.slug, label: genero.nombre })),
    fieltros: fieltros.map((fieltro) => ({ id: `${fieltro.grado}x`, label: `${fieltro.grado}X` })),
  }
}

// ─── El panel ──────────────────────────────────────────────────────────────

// Las columnas de la vista que el panel usa, y en qué se convierten. El orden
// de las claves es el que la API ya tenía.
const INVENTARIO = 'slug, sku, folio, categoria, titulo, descripcion, precio, marca, genero, fieltro, stock, estado, en_portada, actualizado, foto_ruta'

function toItem(fila) {
  return {
    id: fila.slug,
    folio: fila.folio,
    categoria: fila.categoria,
    titulo: fila.titulo,
    descripcion: fila.descripcion,
    precio: Number(fila.precio),
    marca: fila.marca,
    genero: fila.genero,
    fieltro: fila.fieltro,
    stock: fila.stock,
    estado: fila.estado,
    enPortada: fila.en_portada,
    actualizado: fila.actualizado,
    sku: fila.sku,
    foto: fotoUrl(fila.foto_ruta),
  }
}

// El orden de la tienda: por categoría según su orden, y dentro de ella por
// folio, que es el orden de alta.
const ordenado = (query) => query.order('categoria_orden').order('folio')

/**
 * El inventario, sin archivados o solo los archivados. Las dos cosas a la vez
 * no se piden nunca: son dos listas con dos usos distintos.
 */
async function list(accessToken, { archivados = false } = {}) {
  const filas = await rows(
    ordenado(userClient(accessToken).from('inventario').select(INVENTARIO).eq('archivado', archivados)),
  )
  return filas.map(toItem)
}

async function listByCategory(accessToken, categoria) {
  const filas = await rows(
    ordenado(
      userClient(accessToken)
        .from('inventario')
        .select(INVENTARIO)
        .eq('archivado', false)
        .eq('categoria', categoria),
    ),
  )
  return filas.map(toItem)
}

/**
 * Un artículo por su slug, archivado o no, con la galería completa en orden.
 * Null si no existe.
 */
async function findProduct(accessToken, slug) {
  const cliente = userClient(accessToken)

  const fila = await rows(
    cliente.from('inventario').select(`${INVENTARIO}, archivado`).eq('slug', slug).maybeSingle(),
  )

  if (!fila) return null

  const imagenes = await rows(
    cliente
      .from('producto_imagenes')
      .select('id, ruta, orden, productos!inner(slug)')
      .eq('productos.slug', slug)
      .order('orden'),
  )

  return {
    ...toItem(fila),
    publicado: fila.estado !== 'borrador',
    archivado: fila.archivado,
    imagenes: imagenes.map((imagen) => ({
      id: imagen.id,
      url: fotoUrl(imagen.ruta),
      orden: imagen.orden,
    })),
  }
}

// La entrada del catálogo de categorías o null: saber si existe y tener su
// rótulo en una sola consulta.
async function findCategory(slug) {
  const { categorias } = await catalogos()
  const categoria = categorias.find((entrada) => entrada.id === slug)

  return categoria ? { id: categoria.id, label: categoria.label, prefijo: categoria.prefijo } : null
}

// ─── Lo que usa cada marca y cada categoría ────────────────────────────────
//
// Una sola lectura del inventario ENTERO, archivados incluidos: si algo se puede
// borrar, o si un campo queda fijo, depende de cualquier artículo que lo
// referencie, y un archivado sigue referenciándolo. Lo que se enseña como
// cuenta, en cambio, deja fuera los archivados, igual que el inventario.

const inventarioEntero = (accessToken) =>
  rows(userClient(accessToken).from('inventario').select('marca, categoria, fieltro, publicado, archivado'))

function usoDeMarca(slug, filas) {
  const suyas = filas.filter((fila) => fila.marca === slug)

  return {
    count: suyas.filter((fila) => !fila.archivado).length,
    enTienda: suyas.some((fila) => fila.publicado && !fila.archivado),
    borrable: suyas.length === 0,
    conArticulos: new Set(suyas.map((fila) => fila.categoria)),
  }
}

function usoDeCategoria(slug, filas) {
  const suyas = filas.filter((fila) => fila.categoria === slug)

  return {
    count: suyas.filter((fila) => !fila.archivado).length,
    conArticulos: suyas.length > 0,
    conFieltro: suyas.some((fila) => fila.fieltro !== null),
  }
}

/**
 * Las categorías con su cuenta, para el menú lateral y para la sección
 * Categorías. Las cuatro primeras claves son las que el lateral ya leía; el
 * resto lo añade la sección, y el lateral lo ignora.
 */
function toCategoryItem(categoria, marcas, filas) {
  const uso = usoDeCategoria(categoria.id, filas)

  return {
    id: categoria.id,
    label: categoria.label,
    prefijo: categoria.prefijo,
    count: uso.count,
    llevaGenero: categoria.llevaGenero,
    admiteFieltro: categoria.admiteFieltro,
    marcas: marcas.filter((marca) => categoria.marcas.includes(marca.id)),
    borrable: !uso.conArticulos,
  }
}

async function categories(accessToken) {
  const [{ categorias, marcas }, filas] = await Promise.all([catalogos(), inventarioEntero(accessToken)])

  return categorias.map((categoria) => toCategoryItem(categoria, marcas, filas))
}

/**
 * Una categoría para editarla, o null. Además de lo de la lista, dice qué
 * campos quedaron fijos: el prefijo y el género en cuanto hay artículos, y el
 * fieltro en cuanto alguno lo lleva.
 */
async function findCategoryAdmin(accessToken, slug) {
  const [{ categorias, marcas }, filas] = await Promise.all([catalogos(), inventarioEntero(accessToken)])
  const categoria = categorias.find((entrada) => entrada.id === slug)

  if (!categoria) return null

  const uso = usoDeCategoria(slug, filas)

  return {
    ...toCategoryItem(categoria, marcas, filas),
    prefijoFijo: uso.conArticulos,
    generoFijo: uso.conArticulos,
    fieltroFijo: uso.conFieltro,
  }
}

/**
 * Las marcas con las categorías que trabajan. `enTienda` es lo que decide si
 * salen en el menú y en la portada: tener algo publicado y sin archivar.
 */
async function brands(accessToken) {
  const [{ categorias, marcas }, filas] = await Promise.all([catalogos(), inventarioEntero(accessToken)])

  return marcas.map((marca) => {
    const uso = usoDeMarca(marca.id, filas)

    return {
      id: marca.id,
      label: marca.label,
      categorias: categorias
        .filter((categoria) => categoria.marcas.includes(marca.id))
        .map((categoria) => ({ id: categoria.id, label: categoria.label })),
      count: uso.count,
      enTienda: uso.enTienda,
      borrable: uso.borrable,
    }
  })
}

/**
 * Una marca para editarla, o null. Las categorías van como slugs —son los
 * valores de las casillas— y `categoriasFijas` son las que no se pueden quitar
 * porque la marca ya tiene artículos en ellas.
 */
async function findBrand(accessToken, slug) {
  const [{ categorias, marcas }, filas] = await Promise.all([catalogos(), inventarioEntero(accessToken)])
  const marca = marcas.find((entrada) => entrada.id === slug)

  if (!marca) return null

  const uso = usoDeMarca(slug, filas)

  return {
    id: marca.id,
    label: marca.label,
    categorias: categorias.filter((categoria) => categoria.marcas.includes(slug)).map((categoria) => categoria.id),
    categoriasFijas: categorias.filter((categoria) => uso.conArticulos.has(categoria.id)).map((categoria) => categoria.id),
    count: uso.count,
    enTienda: uso.enTienda,
    borrable: uso.borrable,
  }
}

/**
 * Lo que se está acabando, de menos a más. El umbral lo pasa quien llama: es
 * una regla de negocio y vive en admin.service.
 *
 * Los borradores quedan fuera —lo que no se publica no se agota— y los
 * archivados también.
 */
async function lowStock(accessToken, limite) {
  const filas = await rows(
    userClient(accessToken)
      .from('inventario')
      .select(INVENTARIO)
      .eq('archivado', false)
      .neq('estado', 'borrador')
      .lte('stock', limite)
      .order('stock')
      .order('categoria_orden')
      .order('folio'),
  )
  return filas.map(toItem)
}

// ─── Escritura ─────────────────────────────────────────────────────────────
//
// Todo pasa por las funciones de db/scripts/08, con el JWT de la
// administradora: cada una es una transacción y respeta RLS. Los errores de la
// base se lanzan tal cual —con su `code` y su mensaje-clave— y es
// admin.service quien los traduce.

const rpc = async (accessToken, funcion, argumentos) => {
  const { data, error } = await userClient(accessToken).rpc(funcion, argumentos)
  if (error) throw error
  return data
}

// `crear` separa el alta de la edición: un alta sobre un slug ocupado falla
// con 23505 en vez de sobrescribir al otro artículo.
async function saveProduct(accessToken, { crear, slug, datos }) {
  await rpc(accessToken, 'guardar_producto', {
    p_crear: crear,
    p_slug: slug,
    p_titulo: datos.titulo,
    p_descripcion: datos.descripcion,
    p_precio: datos.precio,
    p_stock: datos.stock,
    p_categoria: datos.categoria,
    p_marca: datos.marca,
    p_genero: datos.genero,
    p_fieltro: datos.fieltro,
    p_publicado: datos.publicado,
    p_en_portada: datos.enPortada,
  })
}

async function archiveProduct(accessToken, slug) {
  await rpc(accessToken, 'archivar_producto', { p_slug: slug })
}

async function restoreProduct(accessToken, slug) {
  await rpc(accessToken, 'restaurar_producto', { p_slug: slug })
}

const bucket = (accessToken) => userClient(accessToken).storage.from(config.supabase.bucket)

/**
 * Sube la imagen al bucket y la añade al final de la galería.
 *
 * Son dos sistemas —Storage y la base— y no hay transacción que los abarque a
 * los dos. El orden elegido deja el fallo del lado barato: primero el objeto,
 * después la fila. Si la fila falla (galería llena, artículo que no existe), el
 * objeto recién subido se borra; si hasta eso fallara, queda un archivo
 * huérfano que nadie enlaza, que es mucho mejor que una fila que apunta a un
 * archivo que no existe.
 *
 * La ruta lleva un uuid y nunca se reutiliza, así que la imagen se puede
 * cachear un año: si cambia, cambia de ruta.
 */
async function uploadImage(accessToken, slug, { bytes, tipo, extension }) {
  const ruta = `${slug}/${randomUUID()}.${extension}`

  const { error: subida } = await bucket(accessToken).upload(ruta, bytes, {
    contentType: tipo,
    upsert: false,
    cacheControl: '31536000',
  })

  if (subida) throw subida

  try {
    await rpc(accessToken, 'agregar_imagen', { p_slug: slug, p_ruta: ruta })
  } catch (error) {
    const { error: limpieza } = await bucket(accessToken).remove([ruta])
    if (limpieza) console.error(`Imagen huérfana en el bucket (no se pudo borrar): ${ruta}`, limpieza)
    throw error
  }
}

/**
 * La saca de la galería y después borra el objeto. Al revés que al subir, y
 * por la misma razón: si Storage falla, queda un archivo huérfano y la
 * galería ya es correcta. Se registra en consola para poder limpiarlo.
 */
async function removeImage(accessToken, slug, imagenId) {
  const ruta = await rpc(accessToken, 'quitar_imagen', { p_slug: slug, p_imagen: imagenId })

  const { error } = await bucket(accessToken).remove([ruta])
  if (error) console.error(`Imagen quitada de la galería pero no del bucket: ${ruta}`, error)
}

async function makePrincipal(accessToken, slug, imagenId) {
  await rpc(accessToken, 'hacer_principal', { p_slug: slug, p_imagen: imagenId })
}

// Marcas y categorías: las funciones de db/scripts/11, con el mismo `crear`
// que separa el alta de la edición.

async function saveBrand(accessToken, { crear, slug, datos }) {
  await rpc(accessToken, 'guardar_marca', {
    p_crear: crear,
    p_slug: slug,
    p_nombre: datos.nombre,
    p_categorias: datos.categorias,
  })
}

async function deleteBrand(accessToken, slug) {
  await rpc(accessToken, 'borrar_marca', { p_slug: slug })
}

async function saveCategory(accessToken, { crear, slug, datos }) {
  await rpc(accessToken, 'guardar_categoria', {
    p_crear: crear,
    p_slug: slug,
    p_nombre: datos.nombre,
    p_prefijo: datos.prefijo,
    p_lleva_genero: datos.llevaGenero,
    p_admite_fieltro: datos.admiteFieltro,
  })
}

async function deleteCategory(accessToken, slug) {
  await rpc(accessToken, 'borrar_categoria', { p_slug: slug })
}

// ─── El escaparate ─────────────────────────────────────────────────────────

/**
 * Lista blanca explícita, como toPublicUser: la respuesta se arma NOMBRANDO
 * campos. catalogo_publico ya no devuelve stock ni borradores; esto es la
 * segunda cerradura, y la forma que la tienda espera.
 */
function toPublicProduct(fila) {
  return {
    id: fila.slug,
    categoria: fila.categoria,
    titulo: fila.titulo,
    descripcion: fila.descripcion,
    precio: Number(fila.precio),
    marca: fila.marca,
    // Se emiten SIEMPRE, con null cuando no aplican, para que el cliente no
    // tenga que preguntar si la clave existe antes de leerla.
    genero: fila.genero ?? null,
    fieltro: fila.fieltro ?? null,
    foto: fotoUrl(fila.foto_ruta),
    disponible: fila.disponible,
  }
}

const cuenta = (filas, clave, id) => filas.filter((fila) => fila[clave] === id).length

/**
 * El catálogo visible y sus facetas, de una sola lectura: las cuentas de cada
 * casilla y los topes del deslizador salen de las mismas filas que se envían.
 *
 * Las cuentas son del catálogo visible ENTERO, no de lo ya filtrado: son la
 * foto de lo que hay en la tienda, y encogerlas al filtrar dejaría al usuario
 * sin saber qué se está perdiendo.
 */
async function publicCatalog() {
  const [filas, { categorias, marcas, generos, fieltros }] = await Promise.all([
    rows(publicClient.rpc('catalogo_publico')),
    catalogos(),
  ])

  const items = filas.map(toPublicProduct)
  const precios = items.map((item) => item.precio)

  return {
    items,
    facetas: {
      categorias: categorias.map((c) => ({ id: c.id, label: c.label, count: cuenta(items, 'categoria', c.id) })),
      generos: generos.map((g) => ({ ...g, count: cuenta(items, 'genero', g.id) })),
      marcas: marcas.map((m) => ({ ...m, count: cuenta(items, 'marca', m.id) })),
      fieltros: fieltros.map((f) => ({ ...f, count: cuenta(items, 'fieltro', f.id) })),

      // Math.min(...[]) es Infinity, y eso sale a JSON como null y rompe el
      // deslizador sin decir por qué. Con el catálogo vacío no hay rango.
      precio: precios.length
        ? { min: Math.min(...precios), max: Math.max(...precios) }
        : { min: 0, max: 0 },

      disponibles: items.filter((item) => item.disponible).length,
    },
  }
}

/**
 * Las marcas del menú de la tienda y de la banda de la portada: las que tienen
 * algo publicado. Lo decide marcas_publicas() en la base, que es la única forma
 * de saberlo sin sesión.
 */
async function publicBrands() {
  const filas = await rows(publicClient.rpc('marcas_publicas'))

  return filas.map((fila) => ({ id: fila.slug, label: fila.nombre }))
}

module.exports = {
  catalogos,
  list,
  listByCategory,
  findProduct,
  findCategory,
  categories,
  findCategoryAdmin,
  brands,
  findBrand,
  lowStock,
  saveProduct,
  archiveProduct,
  restoreProduct,
  uploadImage,
  removeImage,
  makePrincipal,
  saveBrand,
  deleteBrand,
  saveCategory,
  deleteCategory,
  publicCatalog,
  publicBrands,
  // Para shop.store: el detalle, los favoritos y la bolsa se arman con la misma
  // lista blanca y la misma URL pública que el catálogo.
  toPublicProduct,
  fotoUrl,
}
