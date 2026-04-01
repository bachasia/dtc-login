import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db/database'
import type { Profile, CreateProfileInput, UpdateProfileInput } from '../../shared/types'

type ProfileRow = Record<string, unknown>

function safeJsonParse<T>(value: unknown, fallback: T): T {
  try { return JSON.parse((value as string) || JSON.stringify(fallback)) }
  catch { return fallback }
}

function deserialize(row: ProfileRow): Profile {
  return {
    ...row,
    fingerprint: safeJsonParse(row.fingerprint, {}),
    tags: safeJsonParse(row.tags, []),
  } as Profile
}

export const profileService = {
  list(groupId?: string): Profile[] {
    const db = getDb()
    const rows = groupId
      ? db.prepare('SELECT * FROM profiles WHERE group_id = ? ORDER BY created_at DESC').all(groupId)
      : db.prepare('SELECT * FROM profiles ORDER BY created_at DESC').all()
    return (rows as ProfileRow[]).map(deserialize)
  },

  getById(id: string): Profile | null {
    const row = getDb().prepare('SELECT * FROM profiles WHERE id = ?').get(id) as ProfileRow | undefined
    return row ? deserialize(row) : null
  },

  create(input: CreateProfileInput): Profile {
    const db = getDb()
    const id = uuidv4()
    db.prepare(`
      INSERT INTO profiles (id, name, group_id, proxy_id, fingerprint, notes, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.name,
      input.group_id ?? null,
      input.proxy_id ?? null,
      JSON.stringify(input.fingerprint ?? {}),
      input.notes ?? null,
      JSON.stringify(input.tags ?? []),
    )
    const created = this.getById(id)
    if (!created) throw new Error(`Profile ${id} not found after insert`)
    return created
  },

  update(id: string, input: UpdateProfileInput): Profile {
    const db = getDb()
    const fields: string[] = []
    const values: unknown[] = []

    if (input.name !== undefined) { fields.push('name = ?'); values.push(input.name) }
    if (input.group_id !== undefined) { fields.push('group_id = ?'); values.push(input.group_id) }
    if (input.proxy_id !== undefined) { fields.push('proxy_id = ?'); values.push(input.proxy_id) }
    if (input.fingerprint !== undefined) { fields.push('fingerprint = ?'); values.push(JSON.stringify(input.fingerprint)) }
    if (input.notes !== undefined) { fields.push('notes = ?'); values.push(input.notes) }
    if (input.tags !== undefined) { fields.push('tags = ?'); values.push(JSON.stringify(input.tags)) }

    if (fields.length === 0) return this.getById(id)!

    fields.push('updated_at = unixepoch()')
    values.push(id)

    db.prepare(`UPDATE profiles SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    const updated = this.getById(id)
    if (!updated) throw new Error(`Profile ${id} not found after update`)
    return updated
  },

  delete(id: string): void {
    getDb().prepare('DELETE FROM profiles WHERE id = ?').run(id)
  },

  bulkDelete(ids: string[]): void {
    const db = getDb()
    const del = db.prepare('DELETE FROM profiles WHERE id = ?')
    const txn = db.transaction((list: string[]) => list.forEach((i) => del.run(i)))
    txn(ids)
  },
}
