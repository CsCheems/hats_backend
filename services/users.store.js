const { userClient } = require('./supabase.client')

// La única capa que conoce la forma de las tablas `perfiles` y `direcciones` de
// Supabase (backend/db/scripts). Las credenciales no pasan por aquí —las guarda
// Supabase Auth y las maneja auth.service—, y el catálogo de países y estados
// tiene su propio almacén, ubicaciones.store.
//
// No decide errores de negocio: devuelve lo que encuentra o null, y quien
// decide qué significa eso es el servicio. Un fallo de la base de datos sí se
// lanza tal cual: no es «no encontré», es «no pude mirar», y acaba en un 500.

// Un solo sitio decide qué es «el mismo correo». Supabase ya lo pasa a
// minúsculas, pero el espacio del final que deja un autocompletado no.
const normalizeEmail = (email) => email.trim().toLowerCase()

// Lo que se pide de un perfil, con su dirección y los nombres de su estado y su
// país en la misma consulta. Las llaves foráneas son las que le dicen a
// PostgREST cómo anidar.
const PROFILE_SELECT = `
  nombre, apellido, telefono, rol,
  direcciones (
    codigo_postal, colonia, calle, numero, predeterminada,
    estados ( nombre, paises ( nombre ) )
  )
`

/**
 * Lista blanca explícita: la respuesta se arma nombrando campos. La forma es la
 * misma que tenía la maqueta, y es un contrato con el frontend
 * (data/profile.js lee `direccion.pais`, `direccion.estado`, …), así que la
 * dirección se vuelve a aplanar con los nombres de siempre.
 *
 * El correo y el id no están en `perfiles` —viven en auth.users y repetirlos
 * sería redundancia—, así que llegan aparte, de la identidad que verificó
 * requireAuth o que devolvió el login.
 */
function toPublicUser(perfil, { id, email }) {
  // La predeterminada, y si ninguna lo es, la primera. Hoy cada cuenta tiene
  // una sola, creada en el alta.
  const direccion = perfil.direcciones.find((d) => d.predeterminada) ?? perfil.direcciones[0]

  return {
    id,
    nombre: perfil.nombre,
    apellido: perfil.apellido,
    telefono: perfil.telefono,
    email,
    // El rol sí sale hacia el navegador: el menú de cuenta necesita saberlo para
    // decidir si pinta la entrada del panel. Que se pueda leer —o falsear— desde
    // el cliente no importa, porque no es lo que protege nada: quien decide es
    // requireAdmin en cada petición, y detrás de él, RLS.
    rol: perfil.rol,
    direccion: direccion
      ? {
          pais: direccion.estados.paises.nombre,
          estado: direccion.estados.nombre,
          codigoPostal: direccion.codigo_postal,
          colonia: direccion.colonia,
          calle: direccion.calle,
          numero: direccion.numero,
        }
      : null,
  }
}

/**
 * El perfil de `userId`, leído CON EL JWT de quien pregunta. RLS decide qué se
 * puede ver: el propio siempre, cualquiera si es admin. Si la política dice que
 * no, la fila simplemente no llega y esto devuelve null.
 */
async function findProfile(accessToken, userId) {
  const { data, error } = await userClient(accessToken)
    .from('perfiles')
    .select(PROFILE_SELECT)
    .eq('id', userId)
    .maybeSingle()

  if (error) throw error

  return data
}

/**
 * Guarda los datos personales y la dirección predeterminada de quien llama, en
 * una sola transacción (función actualizar_perfil, db/scripts/05). Va con el JWT
 * de la persona: la función corre con sus permisos, así que solo puede tocar su
 * propia fila y nunca su rol.
 *
 * Recibe el estado ya resuelto a id; traducir el texto del formulario es cosa
 * de findEstadoId, antes de llegar aquí.
 */
async function updateProfile(accessToken, values) {
  const { error } = await userClient(accessToken).rpc('actualizar_perfil', {
    p_nombre: values.nombre,
    p_apellido: values.apellido,
    p_telefono: values.telefono,
    p_estado_id: values.estadoId,
    p_codigo_postal: values.codigoPostal,
    p_colonia: values.colonia,
    p_calle: values.calle,
    p_numero: values.numero,
  })

  if (error) throw error
}

/**
 * Todas las direcciones de `userId`, la predeterminada primero y luego la más
 * nueva. Con el JWT de la persona: RLS ya limita a las suyas, el `eq` es para
 * que un admin no reciba las de todo el mundo. Forma de API, con los nombres del
 * estado y del país.
 */
async function listAddresses(accessToken, userId) {
  const { data, error } = await userClient(accessToken)
    .from('direcciones')
    .select('id, codigo_postal, colonia, calle, numero, predeterminada, estados ( nombre, paises ( nombre ) )')
    .eq('usuario_id', userId)
    .order('predeterminada', { ascending: false })
    .order('creado_en', { ascending: false })

  if (error) throw error

  return data.map((fila) => ({
    id: fila.id,
    pais: fila.estados.paises.nombre,
    estado: fila.estados.nombre,
    codigoPostal: fila.codigo_postal,
    colonia: fila.colonia,
    calle: fila.calle,
    numero: fila.numero,
    predeterminada: fila.predeterminada,
  }))
}

// Dos direcciones son la misma si coinciden estado, código postal y —sin importar
// mayúsculas ni espacios de sobra— colonia, calle y número.
const mismaDireccion = (a, b) =>
  ['colonia', 'calle', 'numero'].every((campo) => a[campo].trim().toLowerCase() === b[campo].trim().toLowerCase())

/**
 * Añade una dirección a la cuenta, salvo que ya tenga esa misma. Nunca es la
 * predeterminada: esa se cambia en el perfil. Devuelve true si la creó.
 */
async function saveAddress(accessToken, userId, direccion) {
  const client = userClient(accessToken)

  const { data: candidatas, error: lecturaError } = await client
    .from('direcciones')
    .select('colonia, calle, numero')
    .eq('usuario_id', userId)
    .eq('estado_id', direccion.estadoId)
    .eq('codigo_postal', direccion.codigoPostal)

  if (lecturaError) throw lecturaError
  if (candidatas.some((candidata) => mismaDireccion(candidata, direccion))) return false

  const { error } = await client.from('direcciones').insert({
    usuario_id: userId,
    estado_id: direccion.estadoId,
    codigo_postal: direccion.codigoPostal,
    colonia: direccion.colonia,
    calle: direccion.calle,
    numero: direccion.numero,
    predeterminada: false,
  })

  if (error) throw error

  return true
}

module.exports = { findProfile, updateProfile, listAddresses, saveAddress, toPublicUser, normalizeEmail }
