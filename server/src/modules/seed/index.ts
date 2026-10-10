import type { Pool } from 'pg'
import bcrypt from 'bcrypt'

const SALT_ROUNDS = 12

const USERS = [
  { name: 'Ana García', email: 'ana@example.com', neighborhood: 'Centro', password: 'ana123' },
  { name: 'Carlos López', email: 'carlos@example.com', neighborhood: 'Barrio Norte', password: 'carlos123' },
  { name: 'María Fernández', email: 'maria@example.com', neighborhood: 'Barrio Sur', password: 'maria123' },
]

const TOOLS = [
  { name: 'Taladro percutor', description: 'Taladro percutor 800W, ideal para concreto.', category: 'Herramientas eléctricas', condition: 'bueno', ownerEmail: 'ana@example.com' },
  { name: 'Sierra circular', description: 'Sierra circular 140mm, disco incluido.', category: 'Herramientas eléctricas', condition: 'nuevo', ownerEmail: 'ana@example.com' },
  { name: 'Martillo de uña', description: 'Martillo de uña 16oz, mango de fibra.', category: 'Herramientas manuales', condition: 'bueno', ownerEmail: 'carlos@example.com' },
  { name: 'Pala recta', description: 'Pala recta punta fina, mango largo.', category: 'Jardín', condition: 'usado', ownerEmail: 'carlos@example.com' },
  { name: 'Carretilla', description: 'Carretilla 6 pies, estructura metálica.', category: 'Jardín', condition: 'bueno', ownerEmail: 'maria@example.com' },
  { name: 'Escalera aluminio', description: 'Escalera aluminio 3 pasos, peldaños antideslizantes.', category: 'Escaleras y altura', condition: 'nuevo', ownerEmail: 'maria@example.com' },
]

const LOANS = [
  { toolName: 'Martillo de uña', borrowerEmail: 'ana@example.com', ownerEmail: 'carlos@example.com', startDate: '2026-10-01', endDate: '2026-10-15', status: 'aceptado', note: 'Para reparar puerta del garaje' },
  { toolName: 'Taladro percutor', borrowerEmail: 'maria@example.com', ownerEmail: 'ana@example.com', startDate: '2026-10-02', endDate: '2026-10-10', status: 'pendiente', note: null },
  { toolName: 'Carretilla', borrowerEmail: 'carlos@example.com', ownerEmail: 'maria@example.com', startDate: '2026-09-20', endDate: '2026-09-30', status: 'devuelto', note: 'Devuelto sin novedades' },
]

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS)
}

export async function seed(pool: Pool): Promise<void> {
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    // Insert users (idempotent via ON CONFLICT)
    for (const user of USERS) {
      const passwordHash = await hashPassword(user.password)
      await client.query(
        `INSERT INTO users (name, email, password_hash, neighborhood)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) DO NOTHING`,
        [user.name, user.email, passwordHash, user.neighborhood],
      )
    }

    // Insert tools (idempotent via name + owner_email check)
    for (const tool of TOOLS) {
      const ownerRes = await client.query('SELECT id FROM users WHERE email = $1', [tool.ownerEmail])
      if (ownerRes.rowCount === 0) continue
      const ownerId = ownerRes.rows[0].id

      await client.query(
        `INSERT INTO tools (owner_id, name, description, category, condition)
         SELECT $1, $2, $3, $4, $5
         WHERE NOT EXISTS (
           SELECT 1 FROM tools WHERE name = $2 AND owner_id = $1
         )`,
        [ownerId, tool.name, tool.description, tool.category, tool.condition],
      )
    }

    // Insert loans (idempotent via tool_name + borrower_email)
    for (const loan of LOANS) {
      const toolRes = await client.query('SELECT id FROM tools WHERE name = $1', [loan.toolName])
      if (toolRes.rowCount === 0) continue
      const toolId = toolRes.rows[0].id

      const borrowerRes = await client.query('SELECT id FROM users WHERE email = $1', [loan.borrowerEmail])
      if (borrowerRes.rowCount === 0) continue
      const borrowerId = borrowerRes.rows[0].id

      const ownerRes = await client.query('SELECT id FROM users WHERE email = $1', [loan.ownerEmail])
      if (ownerRes.rowCount === 0) continue
      const ownerId = ownerRes.rows[0].id

      await client.query(
        `INSERT INTO loans (tool_id, borrower_id, owner_id, start_date, end_date, status, note)
         SELECT $1, $2, $3, $4, $5, $6, $7
         WHERE NOT EXISTS (
           SELECT 1 FROM loans WHERE tool_id = $1 AND borrower_id = $2 AND end_date = $5
         )`,
        [toolId, borrowerId, ownerId, loan.startDate, loan.endDate, loan.status, loan.note],
      )
    }

    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
