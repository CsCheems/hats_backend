// Lectura de cookies de la petición.
//
// Sin cookie-parser a propósito: leer una cookie propia es exactamente esto. Los
// valores son los tokens de Supabase —caracteres seguros para URL, sin sorpresas
// de codificación— y no usamos cookies firmadas, que es para lo que esa
// dependencia valdría la pena: el JWT ya viene firmado por Supabase y
// requireAuth verifica esa firma en cada petición.
//
// Poner una cookie no necesita ayuda de nadie: res.cookie() viene con Express.

function readCookie(req, name) {
  const header = req.headers.cookie

  if (!header) return null

  for (const part of header.split(';')) {
    // Se corta por el PRIMER '=' y no con split: un valor puede contener el
    // signo, y partirlo lo devolvería a medias.
    const separator = part.indexOf('=')

    if (separator === -1) continue
    if (part.slice(0, separator).trim() !== name) continue

    return decodeURIComponent(part.slice(separator + 1).trim())
  }

  return null
}

module.exports = { readCookie }
