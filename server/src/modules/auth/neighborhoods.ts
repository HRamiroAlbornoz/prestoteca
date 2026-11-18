// The fixed list of neighborhoods a user can pick when registering (MVP spec, "Cuentas").
// The register screen has the same list (client/src/pages/RegisterPage.tsx); a test checks they match.
export const VALID_NEIGHBORHOODS = [
  'Centro',
  'Barrio Norte',
  'Barrio Sur',
  'Ciudadela',
  'Villa Luján',
  'Barrio Jardín',
  'Villa 9 de Julio',
  'Yerba Buena',
] as const

export function isValidNeighborhood(value: string): boolean {
  return (VALID_NEIGHBORHOODS as readonly string[]).includes(value)
}
