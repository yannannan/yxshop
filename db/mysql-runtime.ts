import mysql, { type ExecuteValues, type Pool, type PoolConnection } from 'mysql2/promise';

// 仅用于兼容现有 Vinext/Cloudflare 构建器的类型导出；商城业务未使用这些基类。
export class WorkerEntrypoint {}
export class DurableObject {}
export class WorkflowEntrypoint {}

type QueryResult<T> = { results: T[] };

let pool: Pool | null = null;

function getPool() {
  if (pool) return pool;
  const host = process.env.MYSQL_HOST;
  const user = process.env.MYSQL_USER;
  const password = process.env.MYSQL_PASSWORD;
  const database = process.env.MYSQL_DATABASE;
  if (!host || !user || !password || !database) throw new Error('MySQL 未配置，请填写 MYSQL_HOST、MYSQL_USER、MYSQL_PASSWORD、MYSQL_DATABASE。');
  pool = mysql.createPool({ host, user, password, database, port: Number(process.env.MYSQL_PORT || 3306), charset: 'utf8mb4_general_ci', waitForConnections: true, connectionLimit: 10 });
  return pool;
}

class Statement {
  constructor(private readonly statement: string, private readonly values: unknown[] = []) {}
  bind(...values: unknown[]) { return new Statement(this.statement, values); }
  private async execute(connection: Pool | PoolConnection = getPool()) {
    const statement = this.statement
      .replace(/^INSERT OR IGNORE/i, 'INSERT IGNORE')
      .replace(/ON CONFLICT\s*\([^)]*\)\s*DO UPDATE SET/ig, 'ON DUPLICATE KEY UPDATE')
      .replace(/excluded\.([a-z_]+)/ig, 'VALUES($1)');
    return connection.execute(statement, this.values as ExecuteValues);
  }
  async all<T>(): Promise<QueryResult<T>> { const [rows] = await this.execute(); return { results: Array.isArray(rows) ? rows as T[] : [] }; }
  async first<T>(): Promise<T | null> { const { results } = await this.all<T>(); return results[0] ?? null; }
  async run() {
    const [result] = await this.execute();
    const value = result as { insertId?: number; affectedRows?: number };
    return { meta: { last_row_id: value.insertId ?? 0, changes: value.affectedRows ?? 0 } };
  }
  async runWith(connection: PoolConnection) { const [result] = await this.execute(connection); const value = result as { insertId?: number; affectedRows?: number }; return { meta: { last_row_id: value.insertId ?? 0, changes: value.affectedRows ?? 0 } }; }
}

export const mysqlEnv = {
  DB: {
    prepare(statement: string) { return new Statement(statement); },
    async batch(statements: Statement[]) {
      const connection = await getPool().getConnection();
      try { await connection.beginTransaction(); const results = []; for (const statement of statements) results.push(await statement.runWith(connection)); await connection.commit(); return results; }
      catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
    },
  },
};

// 与既有 D1 调用保持同名，便于接口层逐步迁移。
export const env = {
  ...mysqlEnv,
  NOTIFICATION_FROM: process.env.NOTIFICATION_FROM,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  ORDER_REPLY_TOKEN: process.env.ORDER_REPLY_TOKEN,
};
