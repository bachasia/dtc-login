import { randomUUID as uuidv4 } from 'crypto'
import { getDb } from '../db/database'
import type {
  Group,
  CreateGroupInput,
  UpdateGroupInput,
} from '../../shared/types'

export const groupService = {
  list(): Group[] {
    return getDb()
      .prepare('SELECT * FROM groups ORDER BY created_at DESC')
      .all() as Group[]
  },

  getById(id: string): Group | null {
    return (
      (getDb().prepare('SELECT * FROM groups WHERE id = ?').get(id) as
        | Group
        | undefined) ?? null
    )
  },

  create(input: CreateGroupInput): Group {
    const db = getDb()
    const id = uuidv4()
    db.prepare('INSERT INTO groups (id, name, color) VALUES (?, ?, ?)').run(
      id,
      input.name,
      input.color ?? '#6366f1'
    )
    const created = this.getById(id)
    if (!created) throw new Error(`Group ${id} not found after insert`)
    return created
  },

  update(id: string, input: UpdateGroupInput): Group {
    const db = getDb()
    const fields: string[] = []
    const values: unknown[] = []

    if (input.name !== undefined) {
      fields.push('name = ?')
      values.push(input.name)
    }
    if (input.color !== undefined) {
      fields.push('color = ?')
      values.push(input.color)
    }

    if (fields.length > 0) {
      values.push(id)
      db.prepare(`UPDATE groups SET ${fields.join(', ')} WHERE id = ?`).run(
        ...values
      )
    }

    const updated = this.getById(id)
    if (!updated) throw new Error(`Group ${id} not found after update`)
    return updated
  },

  delete(id: string): void {
    getDb().prepare('DELETE FROM groups WHERE id = ?').run(id)
  },
}
