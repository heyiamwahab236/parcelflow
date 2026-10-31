import { readFileSync } from 'node:fs';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

let client;
export async function readSecret(id) {
  client ??= new SecretsManagerClient({});
  const result = await client.send(new GetSecretValueCommand({ SecretId: id }));
  return JSON.parse(result.SecretString);
}
export async function configFromEnv(env = process.env) {
  let database;
  if (env.DB_SECRET_ARN) {
    const db = await readSecret(env.DB_SECRET_ARN);
    database = {
      host: env.DB_HOST,
      port: 5432,
      database: env.DB_NAME || 'parcelflow',
      user: db.username,
      password: async () => (await readSecret(env.DB_SECRET_ARN)).password,
      ssl: {
        rejectUnauthorized: true,
        ca: readFileSync(env.DB_CA_FILE || '/app/certs/rds.pem', 'utf8'),
      },
    };
  } else {
    if (!env.DATABASE_URL) throw new Error('DATABASE_URL or DB_SECRET_ARN is required');
    if (env.NODE_ENV === 'production' && env.ALLOW_LOCAL_DB !== 'true') {
      throw new Error('Production requires DB_SECRET_ARN and verified RDS TLS');
    }
    database = { connectionString: env.DATABASE_URL };
  }
  const adminToken = env.ADMIN_SECRET_ARN
    ? (await readSecret(env.ADMIN_SECRET_ARN)).token
    : env.ADMIN_TOKEN;
  if (!adminToken || adminToken.length < 32)
    throw new Error('ADMIN_TOKEN must contain at least 32 characters');
  return {
    database,
    adminToken,
    port: Number(env.PORT || 3000),
    trustProxy: env.TRUST_PROXY === 'true',
  };
}
