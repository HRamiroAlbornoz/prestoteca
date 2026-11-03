// zod/mini: same validation as full Zod, about 20 KB lighter in the bundle (checks go inside .check())
import * as z from 'zod/mini'

// The fixed lists from the MVP spec. They must match the server (toolService.ts).
export const TOOL_CATEGORIES = [
  'Herramientas eléctricas',
  'Herramientas manuales',
  'Jardín',
  'Limpieza',
  'Escaleras y altura',
  'Otros',
] as const

export const TOOL_CONDITIONS = ['nuevo', 'bueno', 'usado'] as const

// The rules of the publish/edit form. The same limits the server checks, with messages for people.
export const toolFormSchema = z.object({
  // z.trim() goes first, so the length checks see the value without spaces at the ends
  name: z.string().check(
    z.trim(),
    z.minLength(3, 'El nombre debe tener al menos 3 caracteres'),
    z.maxLength(60, 'El nombre no puede tener más de 60 caracteres'),
  ),
  description: z.string().check(
    z.trim(),
    z.minLength(1, 'Escribí una descripción'),
    z.maxLength(500, 'La descripción no puede tener más de 500 caracteres'),
  ),
  category: z.enum(TOOL_CATEGORIES, 'Seleccioná una categoría'),
  condition: z.enum(TOOL_CONDITIONS, 'Seleccioná un estado'),
})

// What the form holds while the user types: every field is text (an empty select is '')
export type ToolFormValues = Record<keyof typeof toolFormSchema.shape, string>

export const EMPTY_TOOL_FORM: ToolFormValues = { name: '', description: '', category: '', condition: '' }

// The part of GET /api/tools/:id the edit form needs. Anything else in the answer is ignored.
export const loadedToolSchema = z.object({
  name: z.string(),
  description: z.string(),
  category: z.string(),
  condition: z.string(),
})

// Checks one field on its own. Returns the message to show, or undefined when the value is valid.
export function validateToolField(field: keyof ToolFormValues, value: string): string | undefined {
  const result = toolFormSchema.shape[field].safeParse(value)
  return result.success ? undefined : result.error.issues[0]?.message
}
