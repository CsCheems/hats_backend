// Las medidas de una imagen leídas de sus propios bytes, sin decodificarla ni
// añadir una dependencia (sharp, image-size…): para saber cuánto mide basta la
// cabecera, y la lista de dependencias del backend es corta a propósito.
//
// Devuelve { width, height }, o null si la cabecera está truncada o no dice las
// medidas. Quien llama trata el null como imagen inválida: un archivo con la
// firma correcta pero sin medidas legibles no es una imagen que valga la pena
// guardar.

function pngSize(bytes) {
  // Tras la firma de 8 bytes, el primer trozo tiene que ser IHDR (longitud de 4
  // bytes + nombre de 4), y sus dos primeros campos son ancho y alto.
  if (bytes.length < 24 || bytes.subarray(12, 16).toString('ascii') !== 'IHDR') return null
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

function jpegSize(bytes) {
  let i = 2 // salta el SOI (FF D8)

  while (i + 4 < bytes.length) {
    if (bytes[i] !== 0xff) return null

    // Los 0xFF de relleno antes de un marcador son legales.
    while (bytes[i] === 0xff && i < bytes.length) i += 1
    const marker = bytes[i]
    i += 1

    // Marcadores sin longitud: TEM, RSTn y SOI.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue
    if (i + 2 > bytes.length) return null

    // SOF0–SOF15 llevan las medidas, menos DHT (C4), JPG (C8) y DAC (CC), que
    // están en el mismo rango pero son otra cosa.
    const esSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    if (esSof) {
      if (i + 7 > bytes.length) return null
      return { height: bytes.readUInt16BE(i + 3), width: bytes.readUInt16BE(i + 5) }
    }

    i += bytes.readUInt16BE(i) // la longitud incluye sus propios 2 bytes
  }

  return null
}

function webpSize(bytes) {
  if (bytes.length < 30) return null
  const trozo = bytes.subarray(12, 16).toString('ascii')

  if (trozo === 'VP8 ') {
    // Con pérdida: tras la etiqueta de 3 bytes va el código de inicio 9D 01 2A y
    // dos enteros de 14 bits.
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null
    return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff }
  }

  if (trozo === 'VP8L') {
    // Sin pérdida: byte de firma 0x2F y luego 14 bits de ancho y 14 de alto,
    // cada uno menos uno.
    if (bytes[20] !== 0x2f) return null
    const bits = bytes.readUInt32LE(21)
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
  }

  if (trozo === 'VP8X') {
    // Formato extendido: ancho y alto de 24 bits, menos uno.
    return { width: bytes.readUIntLE(24, 3) + 1, height: bytes.readUIntLE(27, 3) + 1 }
  }

  return null
}

const LECTORES = { 'image/png': pngSize, 'image/jpeg': jpegSize, 'image/webp': webpSize }

function imageSize(bytes, tipo) {
  const medidas = LECTORES[tipo]?.(bytes)
  if (!medidas || medidas.width < 1 || medidas.height < 1) return null
  return medidas
}

module.exports = { imageSize }
