const authService = require('../services/auth.service')
const { setSession, clearSession } = require('../utils/sessionCookies')

// Traduce HTTP ↔ dominio: lee `req.validated` —nunca req.body— y elige el
// status. No valida y no consulta el almacén.
//
// SIN try/catch A PROPÓSITO. Express 5 propaga a next() el rechazo de la promesa
// que devuelve un manejador async, así que un ApiError lanzado en el servicio
// llega solo al manejador central. Un try/catch aquí no podría hacer nada mejor
// que lo que ya hace errorHandler, y sí podría hacerlo peor.
//
// Las cookies se ponen aquí y no en el servicio: el servicio devuelve una sesión
// y no sabe que existe tal cosa como una respuesta HTTP.

async function login(req, res) {
  const { user, session } = await authService.login(req.validated)

  setSession(res, session)
  res.status(200).json(user)
}

async function register(req, res) {
  const { user, session } = await authService.register(req.validated)

  setSession(res, session)

  // 201 y no 200: la petición creó algo. El frontend no lo mira —http.js
  // devuelve el cuerpo de cualquier respuesta ok— pero un cliente que no sea
  // este sí puede.
  res.status(201).json(user)
}

// Las dos de abajo van detrás de requireAuth, así que req.session, req.userId y
// req.email existen sin necesidad de comprobarlo: sin sesión, la petición no
// habría llegado hasta aquí.

async function me(req, res) {
  const user = await authService.me(req.session.accessToken, { id: req.userId, email: req.email })

  res.status(200).json(user)
}

// 200 con el usuario ya actualizado, en la misma forma que /me: el frontend lo
// pone en el contexto tal cual y la cabecera del perfil cambia sin otra
// petición.
async function updateMe(req, res) {
  const { user, session } = await authService.updateMe(
    req.session,
    { id: req.userId, email: req.email },
    req.validated,
  )

  // Solo hay sesión nueva si cambió la contraseña, y entonces es obligatorio
  // guardarla: Supabase acaba de cerrar la de las cookies actuales.
  if (session) setSession(res, session)

  res.status(200).json(user)
}

async function logout(req, res) {
  await authService.logout(req.session)

  // Las cookies se borran pase lo que pase con Supabase: dejar al navegador con
  // unas cookies que ya no valen solo produce un 401 en la siguiente petición.
  clearSession(res)

  // 204: no hay nada que contar. http.js lo convierte en null.
  res.status(204).end()
}

module.exports = { login, register, me, updateMe, logout }
