#!/usr/bin/env tsx
/**
 * Verify migration files exist and are valid.
 * Run before deploy to catch migration issues early.
 * Does not require Supabase to be linked.
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const migrationsDir = join(process.cwd(), 'supabase', 'migrations');

function verifyMigrations(): void {
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
  if (files.length === 0) {
    console.warn('No migration files found');
    return;
  }

  for (const file of files) {
    const path = join(migrationsDir, file);
    const content = readFileSync(path, 'utf-8');
    if (!content.trim()) {
      throw new Error(`Empty migration file: ${file}`);
    }
    // Basic SQL validation: no obvious syntax errors
    if (content.includes(';\n;')) {
      throw new Error(`Suspicious double semicolon in: ${file}`);
    }
  }

  console.log(`Verified ${files.length} migration files`);
}

verifyMigrations();
