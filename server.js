const express = require("express");
const session = require("express-session");
const bcrypt = require("bcrypt");
const path = require("path");
require("dotenv").config();

const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "discuss-hub-secure-session-key",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE === "true",
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: "Please log in first." });
  }
  next();
}

app.get("/api/status", (req, res) => {
  const info = db.getDbInfo();
  res.json({
    message: "Discussion Forum API is running",
    database: info.type,
    databaseDetails: info.details,
  });
});

app.post("/api/signup", async (req, res) => {
  if (!db.isReady()) {
    return res.status(503).json({ error: "Database is not configured yet." });
  }

  try {
    const { name, email, password } = req.body;

    if (!name?.trim() || !email?.trim() || !password) {
      return res.status(400).json({ error: "Please fill in all fields." });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: "Password must have at least 8 characters." });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const [result] = await db.execute(
      "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
      [name.trim(), email.trim().toLowerCase(), passwordHash]
    );

    req.session.user = {
      id: result.insertId,
      name: name.trim(),
      email: email.trim().toLowerCase(),
    };

    res.status(201).json({ message: "Account created successfully.", user: req.session.user });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY" || (error.message && error.message.includes("UNIQUE"))) {
      return res.status(409).json({ error: "This email is already registered." });
    }
    console.error("Signup error:", error);
    res.status(500).json({ error: "Could not create account." });
  }
});

app.post("/api/login", async (req, res) => {
  if (!db.isReady()) {
    return res.status(503).json({ error: "Database is not configured yet." });
  }

  try {
    const { email, password } = req.body;

    if (!email?.trim() || !password) {
      return res.status(400).json({ error: "Please enter your email and password." });
    }

    const [rows] = await db.execute(
      "SELECT id, name, email, password_hash FROM users WHERE email = ?",
      [String(email || "").trim().toLowerCase()]
    );

    if (!rows.length || !(await bcrypt.compare(password || "", rows[0].password_hash))) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    req.session.user = {
      id: rows[0].id,
      name: rows[0].name,
      email: rows[0].email,
    };

    res.json({ message: "Login successful.", user: req.session.user });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Could not log in." });
  }
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ message: "Logged out successfully." });
  });
});

app.get("/api/me", (req, res) => {
  res.json({ user: req.session.user || null });
});

app.get("/api/questions", async (req, res) => {
  if (!db.isReady()) {
    return res.json({ questions: [], demoMode: true });
  }

  try {
    const search = String(req.query.search || "").trim();
    const searchPattern = `%${search}%`;
    const [questions] = await db.execute(
      `SELECT q.id, q.title, q.body, q.category, q.created_at, u.name AS author,
              (SELECT COUNT(*) FROM answers a WHERE a.question_id = q.id) AS answer_count
       FROM questions q
       JOIN users u ON u.id = q.user_id
       WHERE q.title LIKE ? OR q.body LIKE ? OR q.category LIKE ?
       ORDER BY q.created_at DESC`,
      [searchPattern, searchPattern, searchPattern]
    );

    res.json({ questions });
  } catch (error) {
    console.error("Get questions error:", error);
    res.status(500).json({ error: "Could not load questions." });
  }
});

app.post("/api/questions", requireLogin, async (req, res) => {
  if (!db.isReady()) {
    return res.status(503).json({ error: "Database is not configured yet." });
  }

  try {
    const title = req.body.title;
    const body = req.body.body || req.body.description;
    const category = req.body.category || "General";

    if (!title?.trim() || !body?.trim()) {
      return res.status(400).json({ error: "Enter both a title and question details." });
    }

    const [result] = await db.execute(
      "INSERT INTO questions (user_id, title, body, category) VALUES (?, ?, ?, ?)",
      [req.session.user.id, title.trim(), body.trim(), category.trim()]
    );

    res.status(201).json({ message: "Question posted.", id: result.insertId });
  } catch (error) {
    console.error("Post question error:", error);
    res.status(500).json({ error: "Could not post question." });
  }
});

app.get("/api/questions/:id/answers", async (req, res) => {
  if (!db.isReady()) {
    return res.json({ answers: [], demoMode: true });
  }

  try {
    const [answers] = await db.execute(
      `SELECT a.id, a.body, a.created_at, u.name AS author
       FROM answers a JOIN users u ON u.id = a.user_id
       WHERE a.question_id = ?
       ORDER BY a.created_at ASC`,
      [req.params.id]
    );

    res.json({ answers });
  } catch (error) {
    console.error("Get answers error:", error);
    res.status(500).json({ error: "Could not load answers." });
  }
});

app.post("/api/questions/:id/answers", requireLogin, async (req, res) => {
  if (!db.isReady()) {
    return res.status(503).json({ error: "Database is not configured yet." });
  }

  try {
    const { body } = req.body;

    if (!body?.trim()) {
      return res.status(400).json({ error: "Please write an answer." });
    }

    const [result] = await db.execute(
      "INSERT INTO answers (question_id, user_id, body) VALUES (?, ?, ?)",
      [req.params.id, req.session.user.id, body.trim()]
    );

    res.status(201).json({ message: "Answer posted.", id: result.insertId });
  } catch (error) {
    console.error("Post answer error:", error);
    res.status(500).json({ error: "Could not post answer." });
  }
});

async function startServer() {
  try {
    const dbInfo = await db.initDatabase();
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`--------------------------------------------------`);
      console.log(`Discussion Forum running at http://localhost:${PORT}`);
      console.log(`Active Database: ${dbInfo.details}`);
      console.log(`--------------------------------------------------`);
    });
  } catch (error) {
    console.error("Database connection failed:", error.message);
    process.exit(1);
  }
}

startServer();
