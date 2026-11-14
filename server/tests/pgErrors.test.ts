import { describe, expect, it } from 'vitest'
import { isInvalidIdError } from '../src/modules/db/pgErrors.js'

describe('L3d isInvalidIdError', () => {
  it.each<[unknown, boolean]>([
    [{ code: '22P02' }, true],
    [{ code: '23505' }, false],
    [{}, false],
    [null, false],
    [undefined, false],
    ['22P02', false],
  ])('returns %s for %j', (input, expected) => {
    expect(isInvalidIdError(input)).toBe(expected)
  })
})
