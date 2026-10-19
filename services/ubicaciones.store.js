const { publicClient } = require('./supabase.client')

// El catálogo de ubicación: las tablas `paises` y `estados` de Supabase
// (backend/db/scripts/01 y 04). Es de lectura pública —RLS deja leerlo sin
// sesión—, así que se consulta con publicClient y no hace falta el JWT de nadie.
//
// Lo usan dos sitios: la lista de los desplegables del formulario (GET
// /ubicaciones) y la traducción del país y el estado que llegan en el alta o en
// la edición a un id (findEstadoId). Que los dos lean de aquí es lo que asegura
// que lo que el formulario ofrece es exactamente lo que el servidor acepta.

// Sin mayúsculas, sin acentos y sin espacios de sobra: «nuevo leon», «Nuevo
// León» y «NUEVO  LEÓN» son el mismo estado escrito con prisa. Con la lista el
// formulario ya manda el nombre exacto; esto sigue sirviendo para quien llega
// por curl y para el formulario de reserva en texto, cuando la lista no cargó.
const plain = (text) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[.\s]+/g, ' ')
    .trim()

// Cómo escribe la gente algunos estados, además de su nombre. Las claves ya van
// en forma `plain`; el valor es el nombre tal como está en la tabla.
const ALIAS = {
  cdmx: 'Ciudad de México',
  df: 'Ciudad de México',
  'distrito federal': 'Ciudad de México',
  edomex: 'Estado de México',
  'edo mex': 'Estado de México',
  'edo de mexico': 'Estado de México',
  'coahuila de zaragoza': 'Coahuila',
  'michoacan de ocampo': 'Michoacán',
  'veracruz de ignacio de la llave': 'Veracruz',
  nl: 'Nuevo León',
  qroo: 'Quintana Roo',
  slp: 'San Luis Potosí',
  bcs: 'Baja California Sur',
}

// «México» a secas es ambiguo: es el país y también el nombre oficial del
// Estado de México. En el campo `estado` gana el estado; en `pais`, el país.
const ALIAS_ESTADO_AMBIGUO = { mexico: 'Estado de México' }

// El catálogo se lee una vez y se guarda la PROMESA, no el resultado: dos
// peticiones simultáneas en frío comparten la misma consulta. Si falla, se
// olvida, para que la siguiente lo vuelva a intentar en lugar de heredar el
// error para siempre. Un estado nuevo en la tabla aparece al reiniciar el
// servidor — son 32 y no cambian.
let catalogo = null

function loadCatalogo() {
  catalogo ??= publicClient
    .from('estados')
    .select('id, nombre, paises ( nombre )')
    .then(({ data, error }) => {
      if (error) throw error
      return data
    })
    .catch((error) => {
      catalogo = null
      throw error
    })

  return catalogo
}

const porNombre = (a, b) => a.localeCompare(b, 'es')

/**
 * Los países con sus estados, en orden alfabético, para los desplegables:
 * `[{ nombre: 'México', estados: ['Aguascalientes', …] }]`.
 *
 * Solo nombres, sin ids: el formulario manda el nombre y el servidor lo traduce
 * con findEstadoId, igual que si lo hubiera escrito a mano. Así el contrato del
 * alta y de la edición no cambió al llegar la lista.
 */
async function listPaises() {
  const estados = await loadCatalogo()
  const paises = new Map()

  for (const estado of estados) {
    const pais = estado.paises.nombre
    if (!paises.has(pais)) paises.set(pais, [])
    paises.get(pais).push(estado.nombre)
  }

  return [...paises.keys()].sort(porNombre).map((nombre) => ({
    nombre,
    estados: paises.get(nombre).sort(porNombre),
  }))
}

/**
 * Traduce el país y el estado recibidos a un id del catálogo. Devuelve
 * `{ paisValido, estadoId }` para que el servicio pueda decir cuál de los dos
 * campos está mal.
 */
async function findEstadoId(pais, estado) {
  const estados = await loadCatalogo()
  const paisPlano = plain(pais)
  const paisValido = estados.some((e) => plain(e.paises.nombre) === paisPlano)

  if (!paisValido) return { paisValido: false, estadoId: null }

  const escrito = plain(estado)
  const nombre = ALIAS[escrito] ?? ALIAS_ESTADO_AMBIGUO[escrito]
  const buscado = nombre ? plain(nombre) : escrito

  const encontrado = estados.find(
    (e) => plain(e.paises.nombre) === paisPlano && plain(e.nombre) === buscado,
  )

  return { paisValido: true, estadoId: encontrado?.id ?? null }
}

module.exports = { listPaises, findEstadoId }
