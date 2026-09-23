import { DatabaseSync } from "node:sqlite";
import {
  generateSQLiteDrizzleJson,
  generateSQLiteMigration,
} from "drizzle-kit/api";
import { is, sql, SQL } from "drizzle-orm";
import { getTableConfig, SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import * as schema from "../src/schema";
import { readMigrations, readNamedMigrations } from "../testing/d1";

const namedMigrations = readNamedMigrations();

function applyMigrationsThrough(database: DatabaseSync, migrationName: string) {
  for (const migration of namedMigrations) {
    database.exec(migration.sql);
    if (migration.name === migrationName) return;
  }
  throw new Error(`Migration ${migrationName} was not found`);
}

function applyMigrationsAfter(
  database: DatabaseSync,
  migrationName: string,
  throughName: string,
) {
  let foundStart = false;
  for (const migration of namedMigrations) {
    if (foundStart) database.exec(migration.sql);
    if (migration.name === migrationName) foundStart = true;
    if (migration.name === throughName) return;
  }
  throw new Error(
    `Migration range ${migrationName}..${throughName} was not found`,
  );
}

function insertLegacyInvestmentRows(database: DatabaseSync, suffix: string) {
  database.exec(`
    INSERT INTO investment_positions
      (id, connector_id, source_id, asset_type, name, quantity, market_value,
       currency, as_of_date, created_at, updated_at)
    VALUES ('position-${suffix}', 'tdcc', 'holding-${suffix}', 'stock', '2317',
      3, 300, 'TWD', '2026-08-01', '2026-08-01', '2026-08-01');
    INSERT INTO investment_transactions
      (id, connector_id, account_id, source_id, asset_type, quantity, amount,
       currency, created_at, updated_at)
    VALUES ('trade-${suffix}', 'tdcc', 'broker-mask', 'trade-source-${suffix}',
      'stock', 3, 300, 'TWD', '2026-08-01', '2026-08-01');
  `);
}

function parenthesized(sql: string, start: number) {
  let depth = 1;
  let quoted = false;
  for (let i = start; i < sql.length; i++) {
    if (sql[i] === "'") {
      if (quoted && sql[i + 1] === "'") {
        i++;
        continue;
      }
      quoted = !quoted;
    }
    if (quoted) continue;
    if (sql[i] === "(") depth++;
    if (sql[i] === ")" && --depth === 0) return sql.slice(start, i);
  }
  throw new Error("Unbalanced schema expression");
}

// Normalize SQL identifiers/whitespace only; string literals stay case-sensitive.
function normalizeSql(sql: string) {
  return sql
    .split(/('(?:[^']|'')*')/)
    .map((part, i) =>
      i % 2
        ? part
        : part
            .replace(/["`\[\]]/g, "")
            .replace(/\s+/g, "")
            .toLowerCase(),
    )
    .join("");
}

function inspect(database: DatabaseSync) {
  const tables = database
    .prepare(
      "SELECT name, sql FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all() as Array<{ name: string; sql: string }>;
  return tables.map(({ name, sql }) => {
    const columns = database.prepare(`PRAGMA table_xinfo('${name}')`).all();
    const foreignKeys = database
      .prepare(`PRAGMA foreign_key_list('${name}')`)
      .all()
      .map(({ id: _id, ...fk }) => fk)
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    const checks = [...sql.matchAll(/\bCHECK\s*\(/gi)]
      .map((match) =>
        normalizeSql(parenthesized(sql, match.index + match[0].length)),
      )
      .sort();
    const generated = [...sql.matchAll(/\bAS\s*\(/gi)].map((match) =>
      normalizeSql(parenthesized(sql, match.index + match[0].length)),
    );
    const indexes = database
      .prepare(`PRAGMA index_list('${name}')`)
      .all()
      .map((index) => {
        const indexName = String(index.name);
        const indexSql = database
          .prepare("SELECT sql FROM sqlite_schema WHERE name = ?")
          .get(indexName)?.sql;
        const details = database
          .prepare(`PRAGMA index_xinfo('${indexName}')`)
          .all()
          .filter((column) => column.key === 1)
          .map(({ seqno, cid: _cid, ...column }) => ({ seqno, ...column }));
        // Kit represents inline UNIQUE constraints as named unique indexes.
        // Keep application index names, compare unnamed constraints by semantics.
        const isApplicationIndex = indexName.startsWith("idx_");
        let expression: string | undefined;
        let where: string | undefined;
        if (isApplicationIndex && typeof indexSql === "string") {
          const start = indexSql.indexOf("(");
          const body = parenthesized(indexSql, start + 1);
          expression = normalizeSql(body);
          where = normalizeSql(indexSql.slice(start + body.length + 2));
        }
        return {
          name: isApplicationIndex ? indexName : undefined,
          unique: index.unique,
          primary: index.origin === "pk",
          partial: index.partial,
          details,
          expression,
          where,
        };
      })
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    return { name, columns, foreignKeys, indexes, checks, generated };
  });
}

const TEXT_PRIMARY_KEY_COLUMNS: Array<{ table: string; column: string }> = [
  { table: "bank_accounts", column: "id" },
  { table: "bank_balance_snapshots", column: "id" },
  { table: "bank_transaction_preferences", column: "transaction_id" },
  { table: "bank_transactions", column: "id" },
  { table: "classification_categories", column: "id" },
  { table: "classification_overrides", column: "id" },
  { table: "classification_rules", column: "id" },
  { table: "connector_settings", column: "id" },
  { table: "credit_card_bills", column: "id" },
  { table: "einvoice_sync_run_items", column: "id" },
  { table: "einvoice_sync_runs", column: "id" },
  { table: "exchange_rates", column: "currency" },
  { table: "investment_positions", column: "id" },
  { table: "investment_accounts", column: "id" },
  { table: "investment_transactions", column: "id" },
  { table: "liability_accounts", column: "id" },
  { table: "liability_balance_snapshots", column: "id" },
  { table: "collateral_relationships", column: "id" },
  { table: "invoice_line_items", column: "id" },
  { table: "invoice_transaction_preferences", column: "invoice_id" },
  { table: "invoices", column: "id" },
  { table: "manual_assets", column: "id" },
  { table: "net_worth_history", column: "id" },
  { table: "notification_preferences", column: "id" },
  { table: "push_subscriptions", column: "id" },
  { table: "scheduled_sync_batches", column: "id" },
  { table: "sync_jobs", column: "id" },
  { table: "sync_schedule_settings", column: "id" },
  { table: "tdcc_sync_run_items", column: "id" },
  { table: "tdcc_sync_runs", column: "id" },
];

describe("TEXT primary key NOT NULL constraints", () => {
  it("requires NOT NULL on single-column TEXT primary keys after migrations", () => {
    const database = new DatabaseSync(":memory:");
    try {
      for (const migration of readMigrations()) database.exec(migration);
      for (const { table, column } of TEXT_PRIMARY_KEY_COLUMNS) {
        const info = database
          .prepare(`PRAGMA table_xinfo('${table}')`)
          .all()
          .find((row) => row.name === column);
        expect(info, `${table}.${column}`).toBeDefined();
        expect(info?.pk, `${table}.${column} pk`).toBe(1);
        expect(info?.notnull, `${table}.${column} notnull`).toBe(1);
      }
    } finally {
      database.close();
    }
  });

  it("rejects NULL primary key inserts", () => {
    const database = new DatabaseSync(":memory:");
    try {
      for (const migration of readMigrations()) database.exec(migration);
      expect(() =>
        database
          .prepare(
            "INSERT INTO bank_accounts (id, connector_id, source_id, created_at, updated_at) VALUES (NULL, 'c', 's', '2020-01-01T00:00:00.000Z', '2020-01-01T00:00:00.000Z')",
          )
          .run(),
      ).toThrow(/NOT NULL/i);
      expect(() =>
        database
          .prepare(
            "INSERT INTO exchange_rates (currency, rate_to_twd, updated_at) VALUES (NULL, 1.0, '2020-01-01T00:00:00.000Z')",
          )
          .run(),
      ).toThrow(/NOT NULL/i);
    } finally {
      database.close();
    }
  });
});

describe("Drizzle schema parity", () => {
  it("preserves the migrated schema, including generated columns and index semantics", async () => {
    const migrated = new DatabaseSync(":memory:");
    const generated = new DatabaseSync(":memory:");
    try {
      for (const migration of readMigrations()) migrated.exec(migration);
      const empty = await generateSQLiteDrizzleJson({});
      const current = await generateSQLiteDrizzleJson(schema);
      const statements = await generateSQLiteMigration(empty, current);
      // Kit 0.31 quotes SQLite expression index fragments as column names.
      // Compare table DDL from Kit, and index DDL from Drizzle's own SQL dialect.
      // Production continues to apply the existing reviewed SQL via Wrangler.
      for (const statement of statements.filter(
        (statement) => !/^CREATE (?:UNIQUE )?INDEX/i.test(statement),
      ))
        generated.exec(statement);
      const dialect = new SQLiteSyncDialect();
      for (const table of Object.values(schema)) {
        const config = getTableConfig(table);
        for (const index of config.indexes) {
          const { name, columns, unique, where } = index.config;
          const query = sql`CREATE ${unique ? sql`UNIQUE ` : sql``}INDEX ${sql.identifier(name)} ON ${sql.identifier(config.name)} (${sql.join(
            columns.map((column) =>
              is(column, SQL) ? column : sql.identifier(column.name),
            ),
            sql`, `,
          )})${where ? sql` WHERE ${where}` : sql``}`;
          generated.exec(dialect.sqlToQuery(query).sql);
        }
        for (const constraint of config.uniqueConstraints) {
          generated.exec(
            dialect.sqlToQuery(
              sql`CREATE UNIQUE INDEX ${sql.identifier(constraint.getName())} ON ${sql.identifier(config.name)} (${sql.join(
                constraint.columns.map((column) => sql.identifier(column.name)),
                sql`, `,
              )})`,
            ).sql,
          );
        }
      }
      const expected = inspect(migrated);
      expect(expected).toHaveLength(35);
      expect(inspect(generated)).toEqual(expected);
      expect(generated.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
      // An unchanged schema must never produce an initialization migration.
      expect(
        await generateSQLiteMigration(
          current,
          await generateSQLiteDrizzleJson(schema),
        ),
      ).toEqual([]);
    } finally {
      migrated.close();
      generated.close();
    }
  });
});

describe("personal balance-sheet migration", () => {
  it("0048 preserves legacy TDCC positions and transactions while adding account fields", () => {
    const database = new DatabaseSync(":memory:");
    try {
      applyMigrationsThrough(database, "0047_sync_activity_details.sql");
      insertLegacyInvestmentRows(database, "0048");
      applyMigrationsAfter(
        database,
        "0047_sync_activity_details.sql",
        "0048_personal_balance_sheet.sql",
      );
      expect(
        database
          .prepare(
            "SELECT id, connector_id, source_id, quantity, market_value, investment_account_id, custody_status FROM investment_positions",
          )
          .all(),
      ).toEqual([
        {
          id: "position-0048",
          connector_id: "tdcc",
          source_id: "holding-0048",
          quantity: 3,
          market_value: 300,
          investment_account_id: null,
          custody_status: "free",
        },
      ]);
      expect(
        database
          .prepare(
            "SELECT id, source_id, quantity, amount FROM investment_transactions",
          )
          .all(),
      ).toEqual([
        {
          id: "trade-0048",
          source_id: "trade-source-0048",
          quantity: 3,
          amount: 300,
        },
      ]);
    } finally {
      database.close();
    }
  });

  it("0049 preserves 0048 investment data while adding option and observation metadata", () => {
    const database = new DatabaseSync(":memory:");
    try {
      applyMigrationsThrough(database, "0048_personal_balance_sheet.sql");
      insertLegacyInvestmentRows(database, "0049");
      applyMigrationsAfter(
        database,
        "0048_personal_balance_sheet.sql",
        "0049_balance_sheet_repair_options_and_observations.sql",
      );
      expect(
        database
          .prepare(
            `SELECT id, source_id, quantity, market_value, investment_account_id,
                    custody_status, contract_multiplier, observation_coverage
             FROM investment_positions WHERE id = 'position-0049'`,
          )
          .get(),
      ).toEqual({
        id: "position-0049",
        source_id: "holding-0049",
        quantity: 3,
        market_value: 300,
        investment_account_id: null,
        custody_status: "free",
        contract_multiplier: 1,
        observation_coverage: "complete",
      });
      expect(
        database
          .prepare(
            `SELECT id, source_id, quantity, amount, asset_type,
                    underlying_symbol, contract_symbol
             FROM investment_transactions WHERE id = 'trade-0049'`,
          )
          .get(),
      ).toEqual({
        id: "trade-0049",
        source_id: "trade-source-0049",
        quantity: 3,
        amount: 300,
        asset_type: "stock",
        underlying_symbol: null,
        contract_symbol: null,
      });
    } finally {
      database.close();
    }
  });

  it("preserves TDCC positions and trades across the explicit 0047→0048→0049 chain", () => {
    const database = new DatabaseSync(":memory:");
    try {
      applyMigrationsThrough(database, "0047_sync_activity_details.sql");
      insertLegacyInvestmentRows(database, "full-chain");
      applyMigrationsAfter(
        database,
        "0048_personal_balance_sheet.sql",
        "0049_balance_sheet_repair_options_and_observations.sql",
      );
      expect(
        database
          .prepare(
            `SELECT p.source_id AS positionSource, p.market_value AS marketValue,
                    t.source_id AS transactionSource, t.amount
             FROM investment_positions p
             JOIN investment_transactions t ON t.id = 'trade-full-chain'
             WHERE p.id = 'position-full-chain'`,
          )
          .get(),
      ).toEqual({
        positionSource: "holding-full-chain",
        marketValue: 300,
        transactionSource: "trade-source-full-chain",
        amount: 300,
      });
      expect(database.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally {
      database.close();
    }
  });
});
