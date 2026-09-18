import { DatabaseSync } from 'node:sqlite';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import mysql from 'mysql2/promise';

const sourceDirectory = join(process.cwd(), '.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject');
const sourceFile = process.env.D1_SQLITE_FILE || join(sourceDirectory, readdirSync(sourceDirectory).find((name) => name.endsWith('.sqlite') && name !== 'metadata.sqlite') || '');
if (!sourceFile || sourceFile.endsWith(sourceDirectory)) throw new Error('找不到本地 D1 数据库文件，请设置 D1_SQLITE_FILE。');

const config = { host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306), user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE || 'yxshop', charset: 'utf8mb4_general_ci' };
for (const key of ['host', 'user', 'password', 'database']) if (!config[key]) throw new Error(`缺少 MySQL 配置：MYSQL_${key.toUpperCase()}`);

const tables = ['users', 'categories', 'products', 'credentials', 'payment_qrs', 'orders', 'credential_assignments', 'notification_settings', 'order_notifications', 'email_config'];
const sqlite = new DatabaseSync(sourceFile, { readOnly: true });
const connection = await mysql.createConnection(config);

try {
  await connection.beginTransaction();
  for (const table of tables) {
    const exists = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
    if (!exists) continue;
    const rows = sqlite.prepare(`SELECT * FROM \`${table}\``).all();
    if (!rows.length) continue;
    const columns = Object.keys(rows[0]);
    const names = columns.map((name) => `\`${name}\``).join(',');
    const values = columns.map(() => '?').join(',');
    const update = columns.filter((name) => name !== 'id').map((name) => `\`${name}\`=VALUES(\`${name}\`)`).join(',');
    const query = `INSERT INTO \`${table}\` (${names}) VALUES (${values}) ON DUPLICATE KEY UPDATE ${update || '`id`=`id`'}`;
    for (const row of rows) await connection.execute(query, columns.map((column) => row[column] ?? null));
    console.log(`已导入 ${table}：${rows.length} 条`);
  }
  await connection.commit();
  console.log('D1 数据导入 MySQL 完成。');
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  sqlite.close();
  await connection.end();
}
