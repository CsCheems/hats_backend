// Espejo de `authFields` en frontend/src/data/auth.js, Y EN EL MISMO ORDEN.
//
// El orden importa: validate se detiene en el primer campo que falla, así que
// decide cuál es el error que la persona ve, y tiene que ser el orden en que los
// campos aparecen en pantalla. Si el formulario reordena sus campos, este
// archivo se reordena con él.
//
// Cada campo declara qué regla de formato lleva —FORMAT en rules.js— y si se le
// recortan los espacios. `trim: false` solo en las contraseñas: los espacios son
// parte de ellas.

const loginSchema = {
  fields: [
    { name: 'email', format: 'email' },
    // Sin minPassword a propósito: en el login la contraseña ya existe y decirle
    // a alguien que «necesita 8 caracteres» al entrar es ruido. Misma excepción
    // que el REGISTER_ONLY del frontend. Una contraseña corta cae en el 401 de
    // credenciales, que es lo que de verdad ocurrió.
    { name: 'password', trim: false },
  ],
}

const registerSchema = {
  fields: [
    { name: 'nombre' },
    { name: 'apellido' },
    { name: 'telefono', format: 'telefono' },
    { name: 'pais' },
    { name: 'estado' },
    { name: 'codigoPostal', format: 'codigoPostal' },
    { name: 'colonia' },
    { name: 'calle' },
    { name: 'numero' },
    { name: 'email', format: 'email' },
    { name: 'password', trim: false, format: 'minPassword' },
    { name: 'confirmPassword', trim: false },
  ],

  // Regla cruzada: se comprueba al final, cuando los dos campos ya pasaron por
  // obligatorio. Antes pisaría el «campo obligatorio» de la confirmación.
  matchPassword: true,
}

// Edición del perfil: los mismos campos y reglas que el alta, en el orden de la
// pantalla de /perfil. Sin `email` —en la edición es de solo lectura y no se
// envía— y con `currentPassword` delante de las otras dos, como se ve.
const updateMeSchema = {
  fields: [
    { name: 'nombre' },
    { name: 'apellido' },
    { name: 'telefono', format: 'telefono' },
    { name: 'pais' },
    { name: 'estado' },
    { name: 'codigoPostal', format: 'codigoPostal' },
    { name: 'colonia' },
    { name: 'calle' },
    { name: 'numero' },
    // Sin formato: si no coincide con la de verdad lo dice Supabase, igual que
    // en el login.
    { name: 'currentPassword', trim: false },
    { name: 'password', trim: false, format: 'minPassword' },
    { name: 'confirmPassword', trim: false },
  ],

  // Cambiar la contraseña es opcional: si los tres campos llegan vacíos se
  // omiten y la contraseña no cambia. En cuanto llega uno, los tres son
  // obligatorios como cualquier otro campo. Espejo de validateProfile en
  // frontend/src/utils/validation.js.
  optionalGroup: ['currentPassword', 'password', 'confirmPassword'],

  matchPassword: true,
}

module.exports = { loginSchema, registerSchema, updateMeSchema }
