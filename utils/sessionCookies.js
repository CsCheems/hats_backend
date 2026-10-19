const config = require('../config')
const { readCookie } = require('./cookies')

// Poner, leer y borrar las dos cookies de sesión. Salió del controlador de auth
// porque ahora hay dos sitios que las escriben: el login/alta y requireAuth
// cuando renueva un token caducado.
//
// Lo que se guarda es `{ accessToken, refreshToken }`, la misma forma que deja
// requireAuth en req.session. Los nombres de Supabase (access_token,
// refresh_token) se traducen en auth.service y no llegan hasta aquí.

const { names, options } = config.cookie

function setSession(res, session) {
  res.cookie(names.access, session.accessToken, options)
  res.cookie(names.refresh, session.refreshToken, options)
}

function readSession(req) {
  return {
    accessToken: readCookie(req, names.access),
    refreshToken: readCookie(req, names.refresh),
  }
}

// Para borrarlas, el navegador exige los mismos atributos con los que se
// pusieron —path y sameSite incluidos— o se queda con las viejas. `maxAge` se
// aparta: es lo único que sobra, porque clearCookie pone su propia fecha en el
// pasado.
function clearSession(res) {
  const { maxAge, ...attributes } = options
  res.clearCookie(names.access, attributes)
  res.clearCookie(names.refresh, attributes)
}

module.exports = { setSession, readSession, clearSession }
