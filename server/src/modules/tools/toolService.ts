import type { ToolRepository, CreateToolInput, Tool } from './toolRepo.js'
import { AppError } from '../errors/AppError.js'

const VALID_CATEGORIES = [
  'Herramientas eléctricas',
  'Herramientas manuales',
  'Jardín',
  'Limpieza',
  'Escaleras y altura',
  'Otros',
] as const

const VALID_CONDITIONS = ['nuevo', 'bueno', 'usado'] as const

export class ToolService {
  constructor(private repo: ToolRepository) {}

  async publish(input: CreateToolInput): Promise<Tool> {
    if (!(VALID_CATEGORIES as readonly string[]).includes(input.category)) {
      throw new AppError('BAD_REQUEST', 'Invalid category')
    }
    if (!(VALID_CONDITIONS as readonly string[]).includes(input.condition)) {
      throw new AppError('BAD_REQUEST', 'Invalid condition')
    }
    return this.repo.create(input)
  }

  async getDetail(id: string): Promise<Tool | null> {
    return this.repo.findById(id)
  }

  async edit(id: string, userId: string, updates: Partial<Pick<Tool, 'name' | 'description' | 'category' | 'condition'>>): Promise<Tool | null> {
    // Check ownership
    const tool = await this.repo.findById(id)
    if (!tool) {
      throw new AppError('TOOL_NOT_FOUND', 'Tool not found')
    }
    if (tool.owner_id !== userId) {
      throw new AppError('TOOL_NOT_OWNER', 'You can only edit your own tools')
    }

    // Nothing to change on a tool that exists and is yours. Checked only after the two checks
    // above, so someone else's tool still gets TOOL_NOT_OWNER. The dev message stays the one
    // this case always had (plan §0: dev messages do not change); the code carries the meaning.
    if (Object.keys(updates).length === 0) {
      throw new AppError('TOOL_EDIT_EMPTY', 'Tool not found')
    }

    // Validate category if provided
    if (updates.category !== undefined && !(VALID_CATEGORIES as readonly string[]).includes(updates.category)) {
      throw new AppError('BAD_REQUEST', 'Invalid category')
    }

    // Validate condition if provided
    if (updates.condition !== undefined && !(VALID_CONDITIONS as readonly string[]).includes(updates.condition)) {
      throw new AppError('BAD_REQUEST', 'Invalid condition')
    }

    return this.repo.update(id, updates)
  }

  async delete(id: string, userId: string): Promise<void> {
    // Check ownership
    const tool = await this.repo.findById(id)
    if (!tool) {
      throw new AppError('TOOL_NOT_FOUND', 'Tool not found')
    }
    if (tool.owner_id !== userId) {
      throw new AppError('TOOL_NOT_OWNER', 'You can only delete your own tools')
    }

    // Check for active loans
    const hasActive = await this.repo.hasActiveLoans(id)
    if (hasActive) {
      throw new AppError('TOOL_HAS_ACTIVE_LOANS', 'Cannot delete tool with active loans')
    }

    await this.repo.softDelete(id)
  }

  async pause(id: string, userId: string): Promise<void> {
    // Check ownership
    const tool = await this.repo.findById(id)
    if (!tool) {
      throw new AppError('TOOL_NOT_FOUND', 'Tool not found')
    }
    if (tool.owner_id !== userId) {
      throw new AppError('TOOL_NOT_OWNER', 'You can only pause your own tools')
    }

    // Pause even with active loans (spec line 129)
    await this.repo.pause(id)
  }
}
