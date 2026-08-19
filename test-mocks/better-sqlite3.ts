// Mock for better-sqlite3-multiple-ciphers native module
// This allows tests to run without rebuilding native modules
export default class Database {
  constructor() {}
  prepare() {
    return {
      run: () => ({ lastInsertRowid: 1 }),
      get: () => ({}),
      all: () => []
    }
  }
  exec() {}
  pragma() {}
  close() {}
}
