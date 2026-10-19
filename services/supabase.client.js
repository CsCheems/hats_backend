const { createClient } = require('@supabase/supabase-js')
const config = require('../config')

// El único archivo que llama a createClient. Hay tres formas de pedir un
// cliente, y la diferencia entre ellas es de seguridad, no de comodidad.
//
// EL PELIGRO: un cliente de supabase-js guarda en memoria la sesión con la que
// se entró. Un cliente compartido por todo el servidor en el que Rosa hiciera
// login atendería la siguiente consulta de Tomás con el JWT de Rosa. Por eso el
// único cliente compartido es `publicClient`, en el que nunca entra nadie, y
// todo lo que toca una sesión usa un cliente nuevo que muere con la petición.
//
// `persistSession: false` y `autoRefreshToken: false` en los tres: en un
// servidor no hay almacenamiento que persistir, y un temporizador renovando
// tokens por su cuenta sería un proceso más que parar al apagar. La renovación
// la decide requireAuth, cuando hace falta.

const AUTH_OPTIONS = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
}

const build = (extra = {}) =>
  createClient(config.supabase.url, config.supabase.publishableKey, {
    auth: AUTH_OPTIONS,
    ...extra,
  })

// Compartido y sin sesión: verificar JWT (guarda en caché las llaves públicas
// del proyecto, de ahí que no se cree uno por petición) y leer lo que es de
// lectura pública, como el catálogo de estados. NUNCA login ni alta aquí.
const publicClient = build()

// Nuevo en cada llamada: login, alta, renovación y cierre de sesión. Cualquier
// sesión que guarde por dentro se va con él.
const authClient = () => build()

// Nuevo en cada llamada y con el JWT del usuario en la cabecera: todo lo que
// consulta va a PostgREST como esa persona, y RLS filtra en consecuencia.
const userClient = (accessToken) =>
  build({ global: { headers: { Authorization: `Bearer ${accessToken}` } } })

module.exports = { publicClient, authClient, userClient }
