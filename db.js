const path = require("path");
const fs = require("fs");

let currentDbType = null;
let mysqlPool = null;
let sqliteDb = null;
let dbInfo = { type: "uninitialized", details: "Not connected" };

async function initDatabase() {
  // If DB_HOST is set, user explicitly configured MySQL
  if (process.env.DB_HOST) {
    console.log(`[Database] Attempting MySQL connection to ${process.env.DB_HOST}:${process.env.DB_PORT || 3306}...`);
    const mysql = require("mysql2/promise");
    mysqlPool = mysql.createPool({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME || "forum_db",
      waitForConnections: true,
      connectionLimit: 10,
    });

    // Test connection
    const conn = await mysqlPool.getConnection();
    conn.release();

    await mysqlPool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(150) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await mysqlPool.query(`
      CREATE TABLE IF NOT EXISTS questions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        title VARCHAR(200) NOT NULL,
        body TEXT NOT NULL,
        category VARCHAR(50) DEFAULT 'General',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Verify category column exists if table was created previously without it
    try {
      await mysqlPool.query("ALTER TABLE questions ADD COLUMN category VARCHAR(50) DEFAULT 'General'");
    } catch (e) {
      // Column already exists, ignore
    }

    await mysqlPool.query(`
      CREATE TABLE IF NOT EXISTS answers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        question_id INT NOT NULL,
        user_id INT NOT NULL,
        body TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    currentDbType = "mysql";
    dbInfo = {
      type: "mysql",
      details: `MySQL (${process.env.DB_HOST}:${process.env.DB_PORT || 3306}/${process.env.DB_NAME || "forum_db"})`,
    };
    console.log(`[Database] Connected successfully to ${dbInfo.details}`);
    return dbInfo;
  }

  // Default / fallback: local SQLite database (zero configuration needed)
  console.log("[Database] DB_HOST not specified. Initializing local SQLite database...");
  const dataDir = path.join(__dirname, "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = path.join(dataDir, "forum.sqlite");
  const { DatabaseSync } = require("node:sqlite");
  sqliteDb = new DatabaseSync(dbPath);
  sqliteDb.exec("PRAGMA foreign_keys = ON;");

  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      category TEXT DEFAULT 'General',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      body TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  try {
    sqliteDb.exec("ALTER TABLE questions ADD COLUMN category TEXT DEFAULT 'General';");
  } catch (e) {
    // Already exists
  }

  currentDbType = "sqlite";
  dbInfo = {
    type: "sqlite",
    details: `SQLite (local file: data/forum.sqlite)`,
  };
  console.log(`[Database] Connected successfully to ${dbInfo.details}`);
  return dbInfo;
}

async function execute(sql, params = []) {
  if (currentDbType === "mysql") {
    return await mysqlPool.execute(sql, params);
  }

  if (currentDbType === "sqlite") {
    const trimmed = sql.trim().toUpperCase();
    if (trimmed.startsWith("SELECT")) {
      const stmt = sqliteDb.prepare(sql);
      const rows = stmt.all(...params);
      return [rows, []];
    } else {
      const stmt = sqliteDb.prepare(sql);
      const info = stmt.run(...params);
      const result = {
        insertId: Number(info.lastInsertRowid),
        affectedRows: Number(info.changes),
      };
      return [result, []];
    }
  }

  throw new Error("Database is not configured yet.");
}

function getDbInfo() {
  return dbInfo;
}

function isReady() {
  return currentDbType !== null;
}

module.exports = {
  initDatabase,
  execute,
  getDbInfo,
  isReady,
};
