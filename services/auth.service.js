const { isAuthSessionMissingError } = require('@supabase/supabase-js')
const ApiError = require('../utils/ApiError')
const { MESSAGES } = require('../validation/rules')
const { authClient, publicClient } = require('./supabase.client')
const { resolveEstado } = require('./ubicaciones.service')
const store = require('./users.store')

// Las reglas de acceso, sobre Supabase Auth.
//
// No conoce req ni res, y no elige status a mano — el status viaja dentro del
// ApiError, que el manejador central traduce a respuesta. Tampoco sabe qué es
// una cookie: `login` y `register` devuelven la sesión y es el controlador quien
// decide que eso viaja en dos.
//
// Es también el único archivo que habla el idioma de Supabase Auth: sus
// nombres (access_token), sus códigos de error y sus respuestas se traducen
// aquí y no salen de aquí.

// La sesión con los nombres del backend. Lo que no se nombra —el objeto `user`
// entero, la fecha de caducidad— no viaja.
const toSession = (session) => ({
  accessToken: session.access_token,
  refreshToken: session.refresh_token,
})

const toIdentity = (user) => ({ id: user.id, email: user.email })

// Errores de Supabase Auth que tienen traducción al catálogo propio. Lo que no
// está aquí se relanza tal cual y acaba en un 500 con la traza en consola: es un
// fallo que no esperábamos, y disfrazarlo de otra cosa lo escondería.
function translate(error, codes) {
  if (error.status === 429) return ApiError.tooManyRequests()

  const build = codes[error.code]

  return build ? build(error) : error
}

async function login({ email, password }) {
  const { data, error } = await authClient().auth.signInWithPassword({
    email: store.normalizeEmail(email),
    password,
  })

  // Supabase ya responde lo mismo para «ese correo no existe» y «la contraseña
  // está mal», así que la respuesta no le confirma a nadie qué correos están
  // dados de alta.
  if (error) {
    throw translate(error, { invalid_credentials: () => ApiError.invalidCredentials() })
  }

  const session = toSession(data.session)
  const identity = toIdentity(data.user)

  return { user: await me(session.accessToken, identity), session }
}

async function register(values) {
  // El estado se resuelve ANTES de crear la cuenta. Al revés, un estado mal
  // escrito dejaría una cuenta creada sin perfil —o un alta a medias— y la
  // persona no podría repetirla porque su correo ya estaría tomado.
  const estadoId = await resolveEstado(values)

  // Los datos del perfil viajan como metadata y los guarda el trigger
  // crear_perfil_nuevo_usuario, en la misma transacción que la cuenta: si el
  // perfil no se puede crear, no queda cuenta. Se arma nombrando campos y nunca
  // con spread, y NO lleva `rol` — el trigger lo ignoraría de todos modos, pero
  // no hay por qué ofrecérselo.
  const { data, error } = await authClient().auth.signUp({
    email: store.normalizeEmail(values.email),
    password: values.password,
    options: {
      data: {
        nombre: values.nombre,
        apellido: values.apellido,
        telefono: values.telefono,
        estado_id: estadoId,
        codigo_postal: values.codigoPostal,
        colonia: values.colonia,
        calle: values.calle,
        numero: values.numero,
      },
    },
  })

  if (error) {
    throw translate(error, {
      user_already_exists: () => ApiError.emailTaken(),
      email_exists: () => ApiError.emailTaken(),
      // Supabase va más allá del regex: rechaza también dominios que no pueden
      // recibir correo. Para la persona es lo mismo, un correo que no sirve.
      email_address_invalid: () => ApiError.invalidField('email', MESSAGES.email),
      weak_password: () => ApiError.invalidField('password', MESSAGES.passwordWeak),
    })
  }

  // Sin sesión quiere decir que el proyecto exige confirmar el correo antes de
  // entrar. La cuenta YA existe, pero el frontend espera salir de aquí con la
  // sesión abierta y no tiene pantalla para «revisa tu correo». Se avisa en
  // consola de qué hay que tocar, en lugar de fingir un alta completa.
  if (!data.session) {
    throw new Error(
      'signUp no devolvió sesión: desactiva «Confirm email» en Supabase ' +
        '(Authentication → Sign In / Providers) o añade al frontend el paso de confirmación.',
    )
  }

  const session = toSession(data.session)
  const identity = toIdentity(data.user)

  // Quien acaba de darse de alta entra con la sesión ya abierta: pedirle que
  // escriba otra vez lo que acaba de escribir no tendría ninguna gracia.
  return { user: await me(session.accessToken, identity), session }
}

/**
 * ¿Es válido este JWT? Devuelve la identidad que lleva dentro, o null.
 *
 * getClaims comprueba la firma y la caducidad. Con las llaves asimétricas del
 * proyecto lo hace en local, contra las llaves públicas que publicClient guarda
 * en caché; con un secreto compartido pregunta al servidor de Auth. En los dos
 * casos, un token caducado, manipulado o que ni siquiera es un JWT da null, y
 * quien llama decide si intenta renovar.
 */
async function verify(accessToken) {
  try {
    const { data, error } = await publicClient.auth.getClaims(accessToken)

    if (error || !data?.claims?.sub) return null

    return { id: data.claims.sub, email: data.claims.email }
  } catch {
    return null
  }
}

/**
 * Cambia un refresh token por una sesión nueva. Supabase rota el token en cada
 * uso, así que la sesión que devuelve trae los DOS tokens nuevos y hay que
 * guardar ambos. Null si el token ya no vale (usado fuera de su margen,
 * revocado por un logout, o inventado).
 */
async function refresh(refreshToken) {
  const { data, error } = await authClient().auth.refreshSession({ refresh_token: refreshToken })

  if (error || !data.session) return null

  return { session: toSession(data.session), identity: toIdentity(data.user) }
}

/**
 * Quién es la persona de esta sesión. Vuelve a leer el perfil en cada llamada en
 * vez de guardar una copia: así lo que devuelve está al día aunque los datos
 * hayan cambiado desde que entró, y un cambio de rol surte efecto en la
 * siguiente petición.
 */
async function me(accessToken, identity) {
  const perfil = await store.findProfile(accessToken, identity.id)

  // Un JWT válido de alguien sin perfil: la cuenta se borró con el token
  // todavía vivo (un JWT no se puede revocar antes de caducar). «No
  // autenticado» es la respuesta honesta, y el cliente reaccionará cerrando
  // sesión.
  if (!perfil) throw ApiError.notAuthenticated()

  return store.toPublicUser(perfil, identity)
}

/**
 * Cambia la contraseña de `email`, comprobando antes la actual, y devuelve la
 * sesión con la que la persona tiene que seguir.
 *
 * La comprobación es un login de verdad con un cliente propio: Supabase no
 * tiene un «¿es esta su contraseña?» que no sea entrar. Y ese mismo cliente,
 * recién autenticado, es el que pide el cambio — así se cumple también el
 * requisito de «sesión reciente» que Supabase puede exigir para cambiar la
 * contraseña.
 *
 * AL CAMBIAR LA CONTRASEÑA, SUPABASE CIERRA TODAS LAS DEMÁS SESIONES DE LA
 * CUENTA, incluida la de las cookies de quien está editando. Es lo correcto
 * —quien cambia la contraseña porque se la robaron quiere echar al ladrón—, pero
 * obliga a una cosa: la sesión que sobrevive es la de verificación, y es la que
 * tiene que acabar en las cookies. Si se revocara, la persona perdería la sesión
 * en cuanto caducara su JWT —como mucho una hora después—, sin ningún aviso.
 * Por eso solo se revoca si el cambio falla.
 */
async function changePassword(email, currentPassword, password) {
  const verifier = authClient()

  const { data, error: signInError } = await verifier.auth.signInWithPassword({
    email,
    password: currentPassword,
  })

  if (signInError) {
    throw translate(signInError, {
      invalid_credentials: () => ApiError.invalidField('currentPassword', MESSAGES.currentPasswordWrong),
    })
  }

  const { error } = await verifier.auth.updateUser({ password })

  if (error) {
    // Sin cambio no hay sesión nueva que conservar: la de verificación sobra.
    await verifier.auth.signOut({ scope: 'local' }).catch(() => {})

    throw translate(error, {
      same_password: () => ApiError.invalidField('password', MESSAGES.samePassword),
      weak_password: () => ApiError.invalidField('password', MESSAGES.passwordWeak),
    })
  }

  return toSession(data.session)
}

/**
 * Edición del perfil. El orden está pensado para que un error de validación no
 * deje nada guardado a medias:
 *
 *   1. el estado, que puede no existir;
 *   2. la contraseña, si se pidió cambiarla: la actual puede estar mal y la
 *      nueva puede ser igual o débil;
 *   3. los datos y la dirección, en una sola transacción.
 *
 * Lo único que puede fallar después de cambiar la contraseña es la base de
 * datos misma, y eso ya no es un error de lo que la persona escribió sino un
 * 500.
 *
 * Devuelve `{ user, session }`. `session` es null salvo que haya cambiado la
 * contraseña: entonces es la sesión nueva, y el controlador tiene que ponerla
 * en las cookies porque la anterior ya no existe (ver changePassword).
 *
 * El correo no se edita aquí: Supabase solo lo cambia tras confirmarlo por
 * correo, y ese flujo no existe todavía.
 */
async function updateMe(currentSession, identity, values) {
  const estadoId = await resolveEstado(values)

  // `password` solo existe en values si validate no omitió el grupo.
  const renewed = values.password
    ? await changePassword(identity.email, values.currentPassword, values.password)
    : null

  const session = renewed ?? currentSession

  await store.updateProfile(session.accessToken, {
    nombre: values.nombre,
    apellido: values.apellido,
    telefono: values.telefono,
    estadoId,
    codigoPostal: values.codigoPostal,
    colonia: values.colonia,
    calle: values.calle,
    numero: values.numero,
  })

  return { user: await me(session.accessToken, identity), session: renewed }
}

/**
 * Revoca el refresh token de ESTA sesión en Supabase, que es lo que la invalida
 * de verdad. El JWT de acceso sigue siendo válido hasta que caduque —como mucho
 * una hora—: así funcionan los JWT, y es la razón de que duren poco.
 *
 * `local` y no `global`: cerrar sesión en esta computadora no debe echar a la
 * persona de su teléfono.
 */
async function logout(session) {
  const { error } = await authClient().auth.admin.signOut(session.accessToken, 'local')

  // Una sesión que ya no existe no es un fallo del logout: el objetivo era que
  // no existiera. Pasa, por ejemplo, con el JWT todavía vigente de una sesión
  // que Supabase cerró al cambiar la contraseña desde otro dispositivo.
  if (!error || isAuthSessionMissingError(error) || [401, 403, 404].includes(error.status)) return

  throw error
}

module.exports = { login, register, verify, refresh, me, updateMe, logout }
