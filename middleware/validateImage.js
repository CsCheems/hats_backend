const express = require('express')
const ApiError = require('../utils/ApiError')
const { imageSize } = require('../utils/imageSize')
const { MESSAGES } = require('../validation/rules')

// La subida de una imagen de producto: el cuerpo es la imagen tal cual, no un
// JSON ni un multipart. Así no hace falta ninguna dependencia —express.raw
// viene con Express— y el navegador manda el File sin envoltorio.

// Los tres tipos que admite el bucket (db/scripts/10), con su extensión y los
// primeros bytes que los delatan. La cabecera Content-Type la escribe quien
// sube, y se puede mentir en ella; los bytes, no.
const TIPOS = {
  'image/jpeg': {
    extension: 'jpg',
    firma: (bytes) => bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  },
  'image/png': {
    extension: 'png',
    firma: (bytes) =>
      bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  'image/webp': {
    extension: 'webp',
    firma: (bytes) =>
      bytes.length > 12 &&
      bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
      bytes.subarray(8, 12).toString('ascii') === 'WEBP',
  },
}

// El mismo tope que el bucket: 10 MB. Pasado, express.raw corta la lectura y se
// responde 413 sin haber cargado el archivo entero.
const LIMITE = '10mb'

// Medidas admitidas, por lado y sea cual sea la orientación. El mínimo es lo que
// pide una tarjeta de ~400 px en pantalla de doble densidad; el máximo evita
// guardar archivos que ningún contenedor del sitio necesita. Los contenedores
// recortan con object-cover, así que la proporción no se exige (la recomendada,
// 4:5, solo se avisa en el panel). Si cambian, cambian también en
// frontend/src/components/admin/AdminGallery.jsx y en MESSAGES.
const LADO_MIN = 800
const LADO_MAX = 5000

/**
 * Deja la imagen en `req.validated` —como validate con los cuerpos JSON—, así
 * el controlador tampoco aquí lee req.body.
 *
 * Un tipo que no es de los tres ni siquiera se lee: express.raw no lo parsea,
 * el cuerpo llega vacío y esto responde 415.
 */
function checkImage(req, res, next) {
  const tipo = req.get('content-type')?.split(';')[0].trim().toLowerCase()
  const regla = TIPOS[tipo]

  if (!regla) throw ApiError.unsupportedMediaType(MESSAGES.imagenTipo)

  if (!Buffer.isBuffer(req.body) || !regla.firma(req.body)) {
    throw ApiError.invalidField('imagen', MESSAGES.imagenFirma)
  }

  // La firma dice que es una imagen; la cabecera, cuánto mide. Sin medidas
  // legibles el archivo está truncado o malformado.
  const medidas = imageSize(req.body, tipo)
  if (!medidas) throw ApiError.invalidField('imagen', MESSAGES.imagenFirma)

  const { width, height } = medidas
  if (width < LADO_MIN || height < LADO_MIN) throw ApiError.invalidField('imagen', MESSAGES.imagenMuyChica)
  if (width > LADO_MAX || height > LADO_MAX) throw ApiError.invalidField('imagen', MESSAGES.imagenMuyGrande)

  req.validated = { bytes: req.body, tipo, extension: regla.extension }
  next()
}

// express.raw avisa del exceso con un error genérico; aquí se traduce al mensaje
// de la imagen, con su `field`. Va entre la lectura y la comprobación, y es un
// manejador de errores (cuatro argumentos) que deja pasar todo lo demás.
// eslint-disable-next-line no-unused-vars
function tooLarge(error, req, res, next) {
  next(error?.type === 'entity.too.large' ? ApiError.payloadTooLarge(MESSAGES.imagenPeso) : error)
}

// Los pasos juntos, en el orden en que tienen que ir. La ruta los esparce:
// router.post('/…/imagenes', ...validateImage, controller.uploadImage).
const validateImage = [express.raw({ type: Object.keys(TIPOS), limit: LIMITE }), tooLarge, checkImage]

module.exports = validateImage
