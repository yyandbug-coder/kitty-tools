import Database from '@tauri-apps/plugin-sql'

type SettingsRow = {
  value: string
}

type SqliteKeyValueStoreOptions = {
  dbPath: string
  tableName?: string
}

const dbCache = new Map<string, Promise<Database>>()

async function ensureTable(db: Database, tableName: string): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS ${tableName} (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)
}

async function getDatabase(dbPath: string, tableName: string): Promise<Database> {
  const cached = dbCache.get(dbPath)
  if (cached) {
    return cached
  }

  const created = (async () => {
    const db = await Database.load(dbPath)
    await ensureTable(db, tableName)
    return db
  })()

  dbCache.set(dbPath, created)

  try {
    return await created
  } catch (error) {
    dbCache.delete(dbPath)
    throw error
  }
}

export function createSqliteKeyValueStore({
  dbPath,
  tableName = 'settings',
}: SqliteKeyValueStoreOptions) {
  const loadValue = async (key: string): Promise<string | null> => {
    const db = await getDatabase(dbPath, tableName)
    const rows = await db.select<SettingsRow[]>(
      `SELECT value FROM ${tableName} WHERE key = $1`,
      [key],
    )
    return rows.length > 0 ? rows[0].value : null
  }

  const saveValue = async (key: string, value: string): Promise<void> => {
    const db = await getDatabase(dbPath, tableName)
    await db.execute(
      `INSERT INTO ${tableName} (key, value, updated_at) VALUES ($1, $2, $3)
       ON CONFLICT(key) DO UPDATE SET value = $2, updated_at = $3`,
      [key, value, Date.now()],
    )
  }

  return {
    loadValue,
    saveValue,
  }
}
