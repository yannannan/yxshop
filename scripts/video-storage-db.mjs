import mysql from 'mysql2/promise';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function videoStorageCommand(job) {
  if (process.argv.length > 2) throw new Error('此命令不接受额外参数');
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  for (const key of ['MYSQL_HOST', 'MYSQL_USER', 'MYSQL_DATABASE']) if (!process.env[key]) throw new Error(`缺少 ${key}，请使用 node --env-file=.env.mysql 执行`);
  const pool = mysql.createPool({ host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306), user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD || '', database: process.env.MYSQL_DATABASE, connectionLimit: 1, multipleStatements: false });
  const db = { prepare(sql) {
    let args = [];
    return { bind(...values) { args = values; return this; }, async all() { const [results] = await pool.execute(sql, args); return { results }; }, async first() { return (await this.all()).results[0] || null; }, async run() { const [result] = await pool.execute(sql, args); return { meta: { changes: result.affectedRows } }; } };
  } };
  try { const result = await job(db, { projectRoot }); console.log(JSON.stringify(result)); if (result.failed) process.exitCode = 1; }
  finally { await pool.end(); }
}
