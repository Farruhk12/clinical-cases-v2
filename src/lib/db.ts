import postgres from "postgres";

const globalForSql = globalThis as unknown as {
  sql: ReturnType<typeof postgres> | undefined;
};

/**
 * В типах postgres.js у TransactionSql нет перегрузки вызова как tagged template,
 * хотя в рантайме это тот же интерфейс, что и Sql.
 */
export function asTransactionSql<S extends postgres.Sql>(
  _pool: S,
  txn: postgres.TransactionSql,
): S {
  return txn as unknown as S;
}

/** Подключение к Postgres Neon (pooled URI из Dashboard → Connection string). */
export function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  if (!globalForSql.sql) {
    const onVercel = process.env.VERCEL === "1";
    globalForSql.sql = postgres(url, {
      max: onVercel ? 1 : 12,
      idle_timeout: onVercel ? 5 : 20,
      connect_timeout: 30,
      prepare: false,
    });
  }
  return globalForSql.sql;
}
