const authService = require('../services/auth.service')
const ApiError = require('../utils/ApiError')
const { readSession, setSession } = require('../utils/sessionCookies')

/**
 * El filtro de sesión.
 *
 * Ocupa en la ruta exactamente la posición que estrenó `validate` —entre el
 * camino y el controlador— y hace lo mismo: interponerse, dejar algo en `req`, y
 * llamar a next() o lanzar y cortar.
 *
 * Deja tres cosas en `req`:
 *   - `req.userId` y `req.email`, sacados del JWT verificado;
 *   - `req.session`, `{ accessToken, refreshToken }`, que es con lo que el
 *     servicio consulta la base como esta persona (RLS) y cierra la sesión.
 * No deja el objeto de la persona: quien lo necesite se lo pide al servicio.
 *
 * LA RENOVACIÓN VIVE AQUÍ. El JWT de acceso caduca en una hora; si ya no vale y
 * hay refresh token, se cambia por una sesión nueva, se reescriben las cookies
 * y la petición sigue como si nada. El frontend no se entera, que es justo lo
 * que tiene que pasar: para él la sesión dura lo que dura la cookie.
 *
 * Varias peticiones simultáneas con el mismo JWT caducado —las tres lecturas
 * del panel— renuevan las tres con el mismo refresh token. Supabase lo tolera
 * dentro de su margen de reúso (10 s por omisión) y devuelve la misma sesión
 * rotada.
 *
 * Sin try/catch, como los controladores: Express 5 propaga a next() el rechazo
 * de un manejador async.
 *
 * Aquí es donde entraría la comprobación de un token CSRF el día que haga falta
 * —si la API llegara a aceptar form-urlencoded, o hubiera que relajar el
 * sameSite de la cookie—: es el único punto por el que pasa todo lo autenticado.
 * Hoy no hace falta: con sameSite 'lax', una API que solo acepta
 * application/json y el preflight obligatorio que eso impone, un formulario de
 * otro sitio no llega ni a la puerta.
 */
async function requireAuth(req, res, next) {
  let session = readSession(req)

  if (!session.accessToken && !session.refreshToken) throw ApiError.notAuthenticated()

  let identity = session.accessToken ? await authService.verify(session.accessToken) : null

  if (!identity && session.refreshToken) {
    const renewed = await authService.refresh(session.refreshToken)

    if (renewed) {
      session = renewed.session
      identity = renewed.identity
      setSession(res, session)
    }
  }

  // Cookie inventada, revocada por un logout, o con un refresh token que ya no
  // vale: las tres son lo mismo desde aquí, y las tres dan el mismo error.
  if (!identity) throw ApiError.notAuthenticated()

  req.userId = identity.id
  req.email = identity.email
  req.session = session

  next()
}

module.exports = requireAuth
