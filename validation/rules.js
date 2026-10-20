// Espejo de frontend/src/utils/validation.js. Reglas puras: no saben qué es
// Express ni qué es una petición. El enchufe está en middleware/validate.js.
//
// LAS REGLAS ESTÁN DUPLICADAS A PROPÓSITO. La del cliente evita un viaje de red
// para enterarse de que falta un campo —y con once campos en el alta, marca los
// once de golpe, mientras que desde aquí solo puede viajar uno por respuesta—.
// Esta existe porque aquella se salta con curl. Si una cambia, cambian las dos.
//
// INVARIANTE: el cliente puede ser igual o MÁS LAXO que este archivo, nunca más
// estricto. Si el cliente rechaza algo que aquí pasaría, la petición no llega a
// salir y nadie ve el 400 que lo explicaría: el formulario simplemente no
// avanza. Al revés se corrige solo — pasa el filtro del cliente, se rechaza aquí
// y el mensaje se pinta bajo el campo.

// Mismo regex que el frontend, carácter por carácter.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

const MIN_PASSWORD = 8

// Copia literal de `validationMessages` en frontend/src/data/auth.js: el mismo
// error tiene que decir lo mismo venga de donde venga.
const MESSAGES = {
  required: 'Este campo es obligatorio',
  email: 'Escribe un correo válido',
  telefono: 'El teléfono debe tener 10 dígitos',
  codigoPostal: 'El código postal debe tener 5 dígitos',
  passwordShort: 'La contraseña necesita al menos 8 caracteres',
  passwordMismatch: 'Las contraseñas no coinciden',
  // Estas dos NO tienen copia en el cliente, y no es un descuido: solo se pueden
  // comprobar contra el catálogo de la base de datos. Que el cliente sea más
  // laxo es justo lo que el invariante de arriba permite.
  pais: 'Por ahora solo enviamos dentro de México',
  estado: 'Elige un estado de México',
  passwordWeak: 'Elige una contraseña más difícil de adivinar',
  // Edición del perfil. Tampoco tienen copia en el cliente: solo Supabase sabe
  // cuál es la contraseña actual.
  currentPasswordWrong: 'La contraseña actual no es correcta',
  samePassword: 'La nueva contraseña tiene que ser distinta de la actual',

  // Artículos del panel. Los de formato tienen copia literal en
  // `productMessages` de frontend/src/data/admin.js; los que dependen del
  // catálogo de la base (marca, género, fieltro) solo pueden salir de aquí.
  tituloLargo: 'El título admite hasta 120 caracteres',
  descripcionLarga: 'La descripción admite hasta 600 caracteres',
  precio: 'Escribe un precio mayor que cero, con hasta dos decimales',
  stock: 'Escribe un número entero de piezas, de cero en adelante',
  categoria: 'Elige una categoría de la lista',
  marca: 'Elige una marca de la lista',
  marcaCategoria: 'Esta marca no trabaja esa categoría',
  // Sin campo de marca en el formulario, el fallo de «la marca de la tienda no
  // trabaja esta categoría» se dice bajo la categoría, que es lo que se puede
  // cambiar; la salida está en Marcas.
  categoriaSinMarca: 'Esta categoría no está asignada a la marca de la tienda. Asígnala en Marcas',
  generoFalta: 'Esta categoría necesita género',
  genero: 'Elige un género de la lista',
  generoSobra: 'Esta categoría no lleva género',
  fieltro: 'Elige un fieltro de la lista',
  fieltroSobra: 'Esta categoría no lleva fieltro',

  // Imágenes. El tipo se comprueba por la cabecera y por los primeros bytes: un
  // texto renombrado a .png trae la cabecera correcta y los bytes no.
  imagenTipo: 'La imagen tiene que ser JPG, PNG o WebP',
  imagenFirma: 'El archivo no es una imagen JPG, PNG o WebP válida',
  imagenPeso: 'La imagen pesa más de 10 MB',
  // Los topes de medidas viven en middleware/validateImage.js; el mensaje los
  // repite porque es lo que la persona tiene que corregir.
  imagenMuyChica: 'La imagen es muy pequeña: tiene que medir al menos 800 × 800 píxeles',
  imagenMuyGrande: 'La imagen es demasiado grande: no puede pasar de 5000 × 5000 píxeles',
  galeriaLlena: 'Este artículo ya tiene 8 imágenes. Quita una para subir otra',

  // Bolsa y reseñas de la tienda. Tienen copia literal en `shopMessages` de
  // frontend/src/data/shop.js. El tope de 10 es el de max_cantidad() en la base
  // (db/scripts/14); el servidor lo recorta además al stock.
  cantidad: 'Elige entre 1 y 10 piezas',
  cantidadFijar: 'Elige entre 0 y 10 piezas',
  calificacion: 'Elige de 1 a 5 estrellas',
  resenaLarga: 'La reseña admite hasta 1000 caracteres',

  // Compra (db/scripts/15). Los de formato tienen copia literal en
  // `checkoutMessages` de frontend/src/data/checkout.js. `tarjeta` y `total` los
  // dice también la pasarela: el token y la cifra son de la máquina, no de un
  // campo que la persona escriba.
  destinatarioLargo: 'El nombre admite hasta 120 caracteres',
  referenciasLargas: 'Las referencias admiten hasta 200 caracteres',
  tarjeta: 'Revisa los datos de la tarjeta',
  total: 'No pudimos confirmar el total. Vuelve a la bolsa e inténtalo de nuevo',

  // Estado de un pedido, desde el panel. Solo se puede pedir uno de los tres a los
  // que se llega; qué transición vale depende del pedido y la dice la base.
  estadoPedido: 'Elige enviado, entregado o cancelado',

  // Marcas y categorías del panel. Los tres de formato tienen copia literal en
  // `catalogMessages` de frontend/src/data/admin.js; el resto depende de lo que
  // ya hay en la base y solo puede salir de aquí.
  nombreLargo: 'El nombre admite hasta 40 caracteres',
  prefijo: 'Escribe tres letras sin acentos ni ñ, como BOT',
  categorias: 'Elige al menos una categoría',
  nombreSinLetras: 'El nombre necesita al menos una letra o un número',
  nombreReservado: 'Ese nombre no está disponible para una categoría',
  marcaDuplicada: 'Ya hay una marca con ese nombre',
  categoriaDuplicada: 'Ya hay una categoría con ese nombre',
  categoriasDesconocidas: 'Elige las categorías de la lista',
  categoriaConArticulos: 'Esta marca tiene artículos en una de las categorías que quitaste',
  prefijoOcupado: 'Ese prefijo ya lo usa otra categoría',
  prefijoFijo: 'El prefijo ya está en el SKU de sus artículos y no se puede cambiar',
  generoFijo: 'La categoría ya tiene artículos: el género no se puede activar ni quitar',
  fieltroFijo: 'Hay artículos con fieltro en esta categoría',
  marcaEnUso: 'Esta marca tiene artículos, contando los archivados, y no se puede borrar',
  categoriaEnUso: 'Esta categoría tiene artículos, contando los archivados, y no se puede borrar',
}

// Topes de los artículos. Los mismos que imponen los check de la tabla
// productos (db/scripts/07): si cambian allí, cambian aquí.
const MAX_TITULO = 120
const MAX_DESCRIPCION = 600

// Hasta ocho cifras enteras y dos decimales: numeric(10, 2).
const PRECIO = /^\d{1,8}(\.\d{1,2})?$/
const STOCK = /^\d{1,6}$/

// Bolsa y reseñas. El tope de piezas por artículo es el de max_cantidad() en
// db/scripts/14; si allí cambia, cambia aquí y en MESSAGES.
const MAX_CANTIDAD = 10
const CANTIDAD = /^\d{1,2}$/
const CALIFICACION = /^[1-5]$/
const MAX_RESENA = 1000

// Compra. Los topes son los check de `pedidos` en db/scripts/15. `MONTO` es el
// total que la persona vio: pesos con hasta dos decimales, y cero no es un total.
const MAX_DESTINATARIO = 120
const MAX_REFERENCIAS = 200
const MONTO = /^\d{1,8}(\.\d{1,2})?$/

// Marcas y categorías: el tope de nombre y el formato del prefijo son los check
// de db/scripts/06 y 11. El prefijo admite minúsculas aquí; el servicio lo pasa
// a mayúsculas antes de escribirlo.
const MAX_NOMBRE_CATALOGO = 40
const PREFIJO = /^[A-Za-z]{3}$/

// Se cuentan dígitos, no caracteres: «81 1234 5678» y «81-1234-5678» son
// teléfonos perfectamente escritos y rechazarlos sería una pedantería.
const digits = (value) => value.replace(/\D/g, '')

/**
 * Reglas de formato. Reciben el valor ya comprobado como no vacío y devuelven el
 * mensaje del error o null.
 *
 * Se indexan por nombre de regla y no por nombre de campo —como sí hace el
 * frontend— porque quién lleva cada regla lo decide auth.schema.js: `password`
 * es el caso que lo obliga, ya que la longitud mínima solo aplica al alta.
 */
const FORMAT = {
  email: (value) => (EMAIL.test(value) ? null : MESSAGES.email),
  telefono: (value) => (digits(value).length === 10 ? null : MESSAGES.telefono),
  codigoPostal: (value) => (digits(value).length === 5 ? null : MESSAGES.codigoPostal),
  minPassword: (value) => (value.length >= MIN_PASSWORD ? null : MESSAGES.passwordShort),
  titulo: (value) => (value.length <= MAX_TITULO ? null : MESSAGES.tituloLargo),
  descripcion: (value) => (value.length <= MAX_DESCRIPCION ? null : MESSAGES.descripcionLarga),
  // «0», «0.00» y «-5» no son precios; «4290» y «1234.5» sí.
  precio: (value) => (PRECIO.test(value) && Number(value) > 0 ? null : MESSAGES.precio),
  stock: (value) => (STOCK.test(value) ? null : MESSAGES.stock),
  // Sumar a la bolsa pide al menos una pieza; fijar admite 0, que la quita.
  cantidad: (value) => (CANTIDAD.test(value) && Number(value) >= 1 && Number(value) <= MAX_CANTIDAD ? null : MESSAGES.cantidad),
  cantidadFijar: (value) => (CANTIDAD.test(value) && Number(value) <= MAX_CANTIDAD ? null : MESSAGES.cantidadFijar),
  calificacion: (value) => (CALIFICACION.test(value) ? null : MESSAGES.calificacion),
  resena: (value) => (value.length <= MAX_RESENA ? null : MESSAGES.resenaLarga),
  destinatario: (value) => (value.length <= MAX_DESTINATARIO ? null : MESSAGES.destinatarioLargo),
  referencias: (value) => (value.length <= MAX_REFERENCIAS ? null : MESSAGES.referenciasLargas),
  monto: (value) => (MONTO.test(value) && Number(value) > 0 ? null : MESSAGES.total),
  estadoPedido: (value) => (['enviado', 'entregado', 'cancelado'].includes(value) ? null : MESSAGES.estadoPedido),
  nombreCatalogo: (value) => (value.length <= MAX_NOMBRE_CATALOGO ? null : MESSAGES.nombreLargo),
  prefijo: (value) => (PREFIJO.test(value) ? null : MESSAGES.prefijo),
  // La única que no recibe un texto: recibe la lista ya limpia de un campo
  // `type: 'list'` (middleware/validate.js).
  categorias: (lista) => (lista.length > 0 ? null : MESSAGES.categorias),
}

module.exports = { MESSAGES, FORMAT }
