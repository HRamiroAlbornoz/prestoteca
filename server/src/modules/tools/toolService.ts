import type { ToolRepository, CreateToolInput, Tool } from './toolRepo.js'

export class ToolService {
  constructor(private repo: ToolRepository) {}

  async publish(input: CreateToolInput): Promise<Tool> {
    return this.repo.create(input)
  }

  async getDetail(id: string): Promise<Tool | null> {
    return this.repo.findById(id)
  }

  async edit(id: string, userId: string, updates: Partial<Pick<Tool, 'name' | 'description' | 'category' | 'condition'>>): Promise<Tool | null> {
    // Check ownership
    const tool = await this.repo.findById(id)
    if (!tool) {
      throw new Error('Tool not found')
    }
    if (tool.owner_id !== userId) {
      throw new Error('You can only edit your own tools')
    }

    return this.repo.update(id, updates)
  }

  async delete(id: string, userId: string): Promise<void> {
    // Check ownership
    const tool = await this.repo.findById(id)
    if (!tool) {
      throw new Error('Tool not found')
    }
    if (tool.owner_id !== userId) {
      throw new Error('You can only delete your own tools')
    }

    // Check for active loans
    const hasActive = await this.repo.hasActiveLoans(id)
    if (hasActive) {
      throw new Error('Cannot delete tool with active loans')
    }

    await this.repo.softDelete(id)
  }

  async pause(id: string, userId: string): Promise<void> {
    // Check ownership
    const tool = await this.repo.findById(id)
    if (!tool) {
      throw new Error('Tool not found')
    }
    if (tool.owner_id !== userId) {
      throw new Error('You can only pause your own tools')
    }

    // Pause even with active loans (spec line 129)
    await this.repo.pause(id)
  }
}
