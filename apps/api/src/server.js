import { configFromEnv } from './config.js';
import { createPool, createStore } from './store.js';
import { createApp } from './app.js';

const config = await configFromEnv();
const pool = createPool(config.database);
pool.on('error', (error) =>
  console.error(
    JSON.stringify({ level: 'error', code: error.code, message: 'Database pool error' }),
  ),
);
const server = createApp({ ...config, store: createStore(pool) }).listen(
  config.port,
  '0.0.0.0',
  () => {
    console.info(
      JSON.stringify({ level: 'info', message: 'ParcelFlow API listening', port: config.port }),
    );
  },
);
for (const signal of ['SIGTERM', 'SIGINT'])
  process.once(signal, () => {
    const timeout = setTimeout(() => process.exit(1), 25000).unref();
    server.close(async () => {
      await pool.end();
      clearTimeout(timeout);
      process.exit(0);
    });
  });
