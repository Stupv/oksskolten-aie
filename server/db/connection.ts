import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import Database from 'libsql'

// --- DB instance ---

function isRemote(url: string): boolean {
  return url.startsWith('libsql://') || url.startsWith('https://')
}

function openDb(dbUrl: string) {
  const remote = isRemote(dbUrl)
  if (!remote && dbUrl !== ':memory:') {
    // For local file paths, ensure the parent directory exists
    const filePath = dbUrl.startsWith('file:') ? dbUrl.slice(5) : dbUrl
    const dbDir = path.dirname(filePath)
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true })
    }
  }
  const authToken = process.env.TURSO_AUTH_TOKEN
  // libsql types don't include authToken but it's supported at runtime for Turso connections
  const instance = authToken
    ? new Database(dbUrl, { authToken } as Database.Options & { authToken: string })
    : new Database(dbUrl)
  if (!remote) {
    instance.pragma('journal_mode = WAL')
  }
  instance.pragma('foreign_keys = ON')
  return instance
}

let db = openDb(process.env.DATABASE_URL || 'file:./data/rss.db')

export function getDb() {
  return db
}

export function _resetDb(dbPath = ':memory:') {
  db.close()
  db = openDb(dbPath)
}

export function bindNamedParams(sql: string, params: Record<string, unknown>): { sql: string; args: unknown[] } {
  const args: unknown[] = []
  const boundSql = sql.replace(/@([A-Za-z_][A-Za-z0-9_]*)/g, (_match, key: string) => {
    if (!(key in params)) {
      throw new Error(`Missing SQL parameter: ${key}`)
    }
    args.push(params[key])
    return '?'
  })
  return { sql: boundSql, args }
}

export function runNamed(sql: string, params: Record<string, unknown>) {
  const bound = bindNamedParams(sql, params)
  return db.prepare(bound.sql).run(...bound.args)
}

export function getNamed<T>(sql: string, params: Record<string, unknown>) {
  const bound = bindNamedParams(sql, params)
  return db.prepare(bound.sql).get(...bound.args) as T
}

export function allNamed<T>(sql: string, params: Record<string, unknown>) {
  const bound = bindNamedParams(sql, params)
  return db.prepare(bound.sql).all(...bound.args) as T[]
}

// --- Migrations ---

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '../..')

/**
 * Run SQL statements one-by-one, skipping ones that fail due to
 * already-applied schema changes (duplicate column, missing column, etc.).
 */
function execSafe(sql: string, file: string) {
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0)
  for (const stmt of statements) {
    try {
      db.exec(stmt)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('duplicate column name') || msg.includes('no such column')) {
        console.warn(`Migration ${file}: skipping statement (${msg})`)
      } else {
        throw err
      }
    }
  }
}

export function runMigrations() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  const migrationsDir = path.join(projectRoot, 'migrations')
  if (!fs.existsSync(migrationsDir)) return

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort()

  const applied = new Set(
    (db.prepare('SELECT name FROM _migrations').all() as { name: string }[])
      .map(row => row.name)
  )

  const remote = isRemote(process.env.DATABASE_URL || '')
  for (const file of files) {
    if (applied.has(file)) continue
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8')
    if (!remote) db.pragma('foreign_keys = OFF')
    try {
      db.exec(sql)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('duplicate column name')) {
        // Column already exists from a partially-applied migration.
        // Strip the ALTER TABLE ADD COLUMN statement and re-run the rest.
        const remaining = sql.replace(/ALTER TABLE \w+ ADD COLUMN [^;]+;/g, '')
        console.warn(`Migration ${file}: column already exists, running remaining statements`)
        execSafe(remaining, file)
      } else if (msg.includes('no such column')) {
        console.warn(`Migration ${file}: column already dropped, running safe statements`)
        execSafe(sql, file)
      } else {
        throw err
      }
    }
    if (!remote) db.pragma('foreign_keys = ON')
    db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file)
    console.log(`Migration applied: ${file}`)
  }
}
