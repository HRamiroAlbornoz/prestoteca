import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { VALID_NEIGHBORHOODS, isValidNeighborhood } from '../src/modules/auth/neighborhoods.js'
import { fileURLToPath } from 'node:url'

describe('VALID_NEIGHBORHOODS and isValidNeighborhood', () => {
  it('N2a VALID_NEIGHBORHOODS equals exactly the 8 names in order, and isValidNeighborhood matches exactly', () => {
    expect(VALID_NEIGHBORHOODS).toEqual([
      'Centro',
      'Barrio Norte',
      'Barrio Sur',
      'Ciudadela',
      'Villa Luján',
      'Barrio Jardín',
      'Villa 9 de Julio',
      'Yerba Buena',
    ])
    expect(isValidNeighborhood('Centro')).toBe(true)
    expect(isValidNeighborhood('centro')).toBe(false)
  })
})

describe('drift guard: client RegisterPage matches server list', () => {
  it('N2b drift guard: the neighborhoods in RegisterPage.tsx equal VALID_NEIGHBORHOODS', () => {
    const clientPath = fileURLToPath(
      new URL('../../client/src/pages/RegisterPage.tsx', import.meta.url),
    )
    const clientContent = readFileSync(clientPath, 'utf-8')

    const start = clientContent.indexOf('const NEIGHBORHOODS = [')
    expect(start, 'RegisterPage.tsx no longer declares const NEIGHBORHOODS = [').toBeGreaterThan(-1)
    const end = clientContent.indexOf('] as const', start)
    expect(end, 'the NEIGHBORHOODS list does not end with ] as const').toBeGreaterThan(start)
    const block = clientContent.slice(start, end)
    const clientList = [...block.matchAll(/'([^']+)'/g)].map((m) => m[1])

    expect(clientList.length).toBe(8)
    expect(clientList).toEqual([...VALID_NEIGHBORHOODS])
  })
})
