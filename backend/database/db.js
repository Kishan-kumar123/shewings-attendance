const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

function createDatabasePool() {
  const databaseUrl =
    process.env.DATABASE_URL ||
    process.env.MYSQL_URL ||
    process.env.JAWSDB_URL;

  const poolOptions = {
    waitForConnections: true,
    connectionLimit: parseInt(
      process.env.DB_CONNECTION_LIMIT || '10',
      10
    ),
    queueLimit: 0,
    dateStrings: true,
    timezone: '+05:30',
    charset: 'utf8mb4',
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000
  };

  const isSslRequested =
    process.env.DB_SSL === 'true' ||
    process.env.DB_SSL === '1' ||
    Boolean(
      databaseUrl &&
      (
        databaseUrl.includes('ssl-mode') ||
        databaseUrl.includes('ssl=true') ||
        databaseUrl.includes('tidbcloud') ||
        databaseUrl.includes('aivencloud')
      )
    );

  const sslOptions = isSslRequested
    ? {
        rejectUnauthorized:
          process.env.DB_SSL_REJECT_UNAUTHORIZED === 'false'
            ? false
            : true
      }
    : undefined;

  let poolInstance;

  if (databaseUrl) {
    poolInstance = mysql.createPool({
      uri: databaseUrl,
      ...poolOptions,
      ...(sslOptions ? { ssl: sslOptions } : {})
    });
  } else {
    const requiredVariables = [
      'DB_HOST',
      'DB_USER',
      'DB_PASSWORD',
      'DB_NAME'
    ];

    const missingVariables = requiredVariables.filter(
      (key) => !process.env[key] || !process.env[key].trim()
    );

    if (missingVariables.length > 0) {
      throw new Error(
        `Missing database environment variables: ${missingVariables.join(', ')}`
      );
    }

    const port = Number.parseInt(
      process.env.DB_PORT || '3306',
      10
    );

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('DB_PORT must be a valid port number.');
    }

    poolInstance = mysql.createPool({
      host: process.env.DB_HOST,
      port,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      ...poolOptions,
      ...(sslOptions ? { ssl: sslOptions } : {})
    });
  }

  // Use Indian Standard Time for pooled connections.
  poolInstance.on('connection', (connection) => {
    connection.query(
      "SET time_zone = '+05:30'",
      (error) => {
        if (error) {
          console.error(
            'Failed to set database session timezone:',
            error.message
          );
        }
      }
    );
  });

  return poolInstance;
}

const pool = createDatabasePool();

module.exports = pool;
