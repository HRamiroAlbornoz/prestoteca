// PostgreSQL errors that mean "this id can never exist", so a lookup by id answers "no such row":
// - 22P02 (invalid_text_representation): the value has the wrong format for its column, e.g. not a UUID;
// - 22021 (character_not_in_repertoire): the text itself is invalid, e.g. a NUL byte from /api/tools/%00.
const INVALID_ID_CODES = ['22P02', '22021']

export function isInvalidIdError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  const code = (err as { code?: unknown }).code
  return typeof code === 'string' && INVALID_ID_CODES.includes(code)
}
