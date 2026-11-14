// PostgreSQL error 22P02 (invalid_text_representation): a value with the wrong format for its column,
// for example an id that is not a UUID. For a lookup by id it means "no such row".
export function isInvalidIdError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === '22P02'
}
