// The text the person sees for each error code (decision D5: the server sends codes, the client
// owns the words). Every text is copied letter by letter from the message table of the spec,
// 02-DOCS/wiki/sdd/specs/error-codes.md ("row N" below). A test compares them with that table.
//
// `import type` only: it is erased when the client is built, so no server code reaches the
// bundle. It still makes `tsc` fail here if the server adds a code without a text (decision D7).
import type { ServerErrorCode } from '../../../server/src/modules/errors/errorCodes'

// Codes only the client produces: the server never sends them. One list, used for the type
// and at run time (apiError.ts treats these as unknown if the server ever sends one).
export const CLIENT_ONLY_CODES = [
  'NETWORK_ERROR', // row 36: no connection, or the server does not answer
  'UNKNOWN_ERROR', // row 37: a code the client does not know, or a body without the expected shape
  'LOGOUT_FAILED', // row 10: "Salir" did not close the session
  'TOOLS_LOAD_FAILED', // row 34: the tool list could not be loaded
] as const

export type ClientOnlyCode = (typeof CLIENT_ONLY_CODES)[number]

export type ClientErrorCode = ServerErrorCode | ClientOnlyCode

// Row 37: what a bug, an outage or an unknown answer shows
const GENERIC = 'Algo salió mal. Intentá de nuevo en un momento.'

export const MESSAGES: Record<ClientErrorCode, string> = {
  // --- Register ---
  REGISTER_MISSING_FIELDS: 'Completá todos los campos.', // row 1
  REGISTER_NAME_LENGTH: 'El nombre tiene que tener entre 2 y 50 caracteres.', // row 2
  REGISTER_PASSWORD_LENGTH: 'La contraseña tiene que tener entre 8 y 72 caracteres.', // row 3
  REGISTER_EMAIL_TOO_LONG: 'El email es demasiado largo.', // row 4
  EMAIL_TAKEN: 'Ya hay una cuenta con ese email. Iniciá sesión o usá otro email.', // row 5

  // --- Session ---
  LOGIN_MISSING_FIELDS: 'Escribí tu email y tu contraseña.', // row 6
  INVALID_CREDENTIALS: 'El email o la contraseña no son correctos.', // row 7
  SESSION_REQUIRED: 'Tu sesión terminó. Iniciá sesión para continuar.', // row 8
  LOGOUT_FAILED: 'No pudimos cerrar tu sesión. Revisá tu conexión e intentá de nuevo en un momento.', // row 10

  // --- Account ---
  PASSWORD_CHANGE_MISSING_FIELDS: 'Completá la contraseña actual y la nueva.', // row 11
  CURRENT_PASSWORD_INCORRECT: 'La contraseña actual no es correcta. Revisala e intentá de nuevo.', // row 12
  NEW_PASSWORD_LENGTH: 'La contraseña nueva tiene que tener entre 8 y 72 caracteres.', // row 13
  NEW_PASSWORD_BLANK: 'La contraseña nueva no puede ser solo espacios.', // row 14
  ACCOUNT_NOT_FOUND: 'Esta cuenta ya no existe.', // row 15
  ACCOUNT_HAS_ACTIVE_LOANS: 'No podés eliminar tu cuenta mientras tengas préstamos en curso.', // row 16

  // --- Tools ---
  TOOL_MISSING_FIELDS: 'Completá todos los campos.', // row 17
  TOOL_NAME_LENGTH: 'El nombre tiene que tener entre 3 y 60 caracteres.', // row 18
  TOOL_DESCRIPTION_TOO_LONG: 'La descripción puede tener hasta 500 caracteres.', // row 19
  TOOL_NOT_FOUND: 'Esta herramienta no existe o fue eliminada.', // row 20
  TOOL_NOT_OWNER: 'Solo podés modificar tus propias herramientas.', // row 21
  TOOL_HAS_ACTIVE_LOANS: 'No podés eliminar esta herramienta mientras tenga préstamos en curso.', // row 22
  TOOL_PAUSED: 'Esta herramienta está pausada y no acepta pedidos por ahora.', // row 23

  // --- Loans ---
  LOAN_DATES_MISSING: 'Elegí la fecha de inicio y la de fin.', // row 24
  LOAN_START_IN_PAST: 'La fecha de inicio no puede ser anterior a hoy.', // row 25
  LOAN_END_BEFORE_START: 'La fecha de fin no puede ser anterior a la de inicio.', // row 26
  LOAN_NOTE_TOO_LONG: 'La nota puede tener hasta 300 caracteres.', // row 27
  LOAN_OWN_TOOL: 'No podés pedir prestada tu propia herramienta.', // row 28
  LOAN_DATES_OVERLAP: 'La herramienta ya está reservada en esas fechas. Probá con otras.', // row 29
  LOAN_TRANSITION_INVALID: 'Este préstamo ya cambió de estado. Recargá la página para ver cómo está.', // row 30
  LOAN_TRANSITION_WRONG_ROLE: 'Esta acción le corresponde a la otra persona del préstamo.', // row 31
  LOAN_NOT_FOUND: 'Este préstamo no existe.', // row 32

  // --- Search ---
  SEARCH_QUERY_TOO_LONG: 'La búsqueda puede tener hasta 60 caracteres.', // row 33
  TOOLS_LOAD_FAILED: 'No pudimos cargar las herramientas. Intentá de nuevo en un momento.', // row 34

  // --- General ---
  RATE_LIMITED: 'Hubo demasiados pedidos en poco tiempo. Esperá un minuto y volvé a intentar.', // row 35
  NETWORK_ERROR: 'No hay conexión con el servidor. Revisá tu internet e intentá de nuevo.', // row 36
  UNKNOWN_ERROR: GENERIC, // row 37

  // --- Only a bug or a broken client gets these: the generic row 37 ---
  BAD_REQUEST: GENERIC,
  PAYLOAD_TOO_LARGE: GENERIC,
  ORIGIN_NOT_ALLOWED: GENERIC,
  TOOL_EDIT_EMPTY: GENERIC,
  API_ROUTE_NOT_FOUND: GENERIC,
  INTERNAL_ERROR: GENERIC,
}

export function messageFor(code: ClientErrorCode): string {
  return MESSAGES[code]
}
