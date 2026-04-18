import { SQLiteEventRepository } from './repositories/sqliteEventRepository.js';

/**
 * Build a repository from an Expo SQLite database handle.
 *
 * Usage example (Expo):
 *   import * as SQLite from 'expo-sqlite';
 *   const db = SQLite.openDatabaseSync('matender.db');
 *   const repository = await createMatenderRepository(db);
 */
export async function createMatenderRepository(db) {
  const repository = new SQLiteEventRepository(db);
  await repository.migrate();
  return repository;
}
