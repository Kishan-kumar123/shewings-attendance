const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

function createDatabasePool() {
  const databaseUrl = process.env.DATABASE_URL || process.env.MYSQL_URL || process.env.JAWSDB_URL;

  // Cloud SSL handling (TiDB Cloud, Aiven, PlanetScale, Clever Cloud)
  const isSslRequested =
    process.env.DB_SSL === 'true' ||
    process.env.DB_SSL === '1' ||
    Boolean(databaseUrl && (databaseUrl.includes('ssl-mode') || databaseUrl.includes('ssl=true') || databaseUrl.includes('tidbcloud') || databaseUrl.includes('aivencloud')));

  const sslOptions = isSslRequested
    ? {
        rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'false' ? false : true
      }
    : undefined;

  const poolOptions = {
    waitForConnections: true,
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '10', 10),
    queueLimit: 0,
    dateStrings: true,
    charset: 'utf8mb4',
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000
  };

  if (databaseUrl) {
    return mysql.createPool({
      uri: databaseUrl,
      ...poolOptions,
      ...(sslOptions ? { ssl: sslOptions } : {})
    });
  }

  return mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'shewings_attendance',
    ...poolOptions,
    ...(sslOptions ? { ssl: sslOptions } : {})
  });
}

const pool = createDatabasePool();

module.exports = pool;
