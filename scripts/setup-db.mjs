/**
 * Applies db/schema.sql to the database in DATABASE_URL.
 * Safe to re-run: every statement is create-if-not-exists.
 *
 *   npm run db:setup
 */
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Add it to .env.local first.');
  process.exit(1);
}

/**
 * Splits on semicolons, ignoring any inside quoted strings or line comments.
 * A naive /;\s*$/m split silently drops most statements in this file.
 */
export function splitStatements(sql) {
  const out = [];
  let current = '';
  let inSingle = false;
  let inLineComment = false;

  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      current += ch;
      continue;
    }
    if (!inSingle && ch === '-' && next === '-') {
      inLineComment = true;
      current += ch;
      continue;
    }
    if (ch === "'") inSingle = !inSingle;

    if (ch === ';' && !inSingle) {
      out.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  out.push(current);

  return out
    // Drop leading comment lines so a statement isn't judged by its header.
    .map((s) => s.replace(/^\s*(--[^\n]*\n)+/g, '').trim())
    .filter((s) => s.length > 0);
}

const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
const statements = splitStatements(schema);

const sql = neon(url);
console.log(`Applying ${statements.length} statements…`);

for (const statement of statements) {
  const label = statement.split('\n')[0].slice(0, 60);
  try {
    await sql.query(statement);
    console.log('  ok   ' + label);
  } catch (error) {
    console.error('  FAIL ' + label + '\n       ' + error.message);
    process.exit(1);
  }
}

console.log('Schema applied.');
