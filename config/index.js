// Único lector de process.env del backend. Cualquier otro archivo que necesite
// un valor de entorno lo pide aquí: así se ve de un vistazo qué necesita el
// servidor para arrancar, y renombrar una variable es una línea.
//
// Los valores por omisión son los de desarrollo, para que el servidor arranque
// sin .env — de ahí el --env-file-if-exists de los scripts, y no --env-file a
// secas, que aborta si el archivo falta.
//
// La excepción es Supabase: sin su URL y su llave no hay usuarios ni sesiones,
// y no existe un valor por omisión honesto. Falta una y el servidor no arranca,
// con un mensaje que dice cuál — mejor eso que arrancar y responder 500 en el
// primer login.

const required = (name) => {
  const value = process.env[name]

  if (!value) {
    throw new Error(`Falta ${name} en backend/.env (ver .env.example).`)
  }

  return value
}

const config = {
  port: Number(process.env.PORT) || 3001,

  // Solo la interfaz local. Además de no publicar la API de desarrollo en toda
  // la red, escuchar en UNA sola interfaz es lo que hace que un puerto ocupado
  // se detecte antes de anunciar el arranque: con el `::` que Node usa por
  // omisión, Windows acepta el bind IPv6 —y emite 'listening'— y solo falla al
  // añadir el IPv4, con el mensaje de éxito ya impreso.
  //
  // Para probar desde el móvil: HOST=0.0.0.0, y `npm run dev -- --host` en el
  // frontend, que por omisión también escucha solo en local.
  host: process.env.HOST ?? '127.0.0.1',

  // Origen único y explícito. Ver el comentario de cors() en app.js.
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',

  supabase: {
    url: required('SUPABASE_URL'),

    // La llave publicable, no la service_role. Con ella el backend no puede
    // saltarse RLS: todo lo que lee de un usuario lo lee con el JWT de ese
    // usuario, así que las políticas de la base protegen también de un error
    // aquí.
    publishableKey: required('SUPABASE_PKEY'),

    // El bucket de Storage con las imágenes de producto. No sale del entorno:
    // lo crea db/scripts/10_storage_productos.sql con este nombre, y las
    // políticas de ese script lo nombran.
    bucket: 'productos',
  },

  cookie: {
    // Dos cookies, porque Supabase entrega dos tokens: el de acceso (un JWT
    // que caduca en una hora) y el de renovación, que sirve para pedir otro.
    names: {
      access: 'nha_access',
      refresh: 'nha_refresh',
    },

    // Atributos tal como los espera res.cookie(), separados de los nombres para
    // poder pasarlos tal cual sin colar un `name` que ese método no espera.
    options: {
      // Siete días, en milisegundos, para las dos. El JWT de dentro caduca
      // mucho antes y eso no lo decide la cookie sino su firma: la cookie de
      // acceso solo tiene que seguir ahí para que requireAuth sepa que hubo una
      // sesión y la renueve.
      maxAge: 7 * 24 * 60 * 60 * 1000,

      // JS no puede leerla, así que un XSS no puede robar la sesión. Esta no
      // sale del entorno: es la razón de ser de todo el mecanismo.
      httpOnly: true,

      // 'lax' basta en desarrollo: SameSite compara dominio registrable e
      // ignora el puerto, así que 5173 → 3001 es same-site. En producción sigue
      // valiendo si la API cuelga del mismo dominio; si acaba en otro distinto,
      // hace falta COOKIE_SAMESITE=none, y entonces COOKIE_SECURE=true es
      // obligatorio o el navegador descarta la cookie.
      sameSite: process.env.COOKIE_SAMESITE ?? 'lax',

      // En local no hay HTTPS: con esto en alto la cookie no llegaría nunca.
      // En producción, siempre 'true'.
      secure: process.env.COOKIE_SECURE === 'true',

      path: '/',
    },
  },
}

module.exports = config
