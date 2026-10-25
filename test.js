// Comprehensive automated test suite for DiscussHub
const http = require("http");
const assert = require("assert");

const TEST_PORT = 3100;
process.env.PORT = TEST_PORT;
process.env.NODE_ENV = "test";

// Helper to make HTTP requests and preserve cookies across calls (session jar)
function createClient() {
  let cookies = [];

  function request(method, path, body = null) {
    return new Promise((resolve, reject) => {
      const payload = body ? JSON.stringify(body) : null;
      const headers = {
        "Content-Type": "application/json",
      };

      if (cookies.length > 0) {
        headers["Cookie"] = cookies.join("; ");
      }

      if (payload) {
        headers["Content-Length"] = Buffer.byteLength(payload);
      }

      const req = http.request(
        {
          hostname: "127.0.0.1",
          port: TEST_PORT,
          path,
          method,
          headers,
        },
        (res) => {
          if (res.headers["set-cookie"]) {
            // Update cookie jar
            res.headers["set-cookie"].forEach((c) => {
              const cookiePart = c.split(";")[0];
              // Update or append
              const name = cookiePart.split("=")[0];
              cookies = cookies.filter((existing) => !existing.startsWith(name + "="));
              if (!c.includes("Expires=Thu, 01 Jan 1970")) {
                cookies.push(cookiePart);
              }
            });
          }

          let responseBody = "";
          res.on("data", (chunk) => (responseBody += chunk));
          res.on("end", () => {
            let parsed = {};
            try {
              parsed = JSON.parse(responseBody);
            } catch (e) {
              parsed = { raw: responseBody };
            }
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: parsed,
            });
          });
        }
      );

      req.on("error", reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  return {
    get: (path) => request("GET", path),
    post: (path, data) => request("POST", path, data),
    clearCookies: () => {
      cookies = [];
    },
  };
}

async function runTests() {
  console.log("=== Starting Automated Test Suite ===");

  // Initialize DB and start server in background
  const db = require("./db");
  const dbInfo = await db.initDatabase();
  console.log(`[Test] Using database: ${dbInfo.details}`);

  // Require server logic
  const express = require("express");
  const session = require("express-session");
  const bcrypt = require("bcrypt");
  const path = require("path");

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use(
    session({
      secret: "test-secret-key-12345",
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true, sameSite: "lax", secure: false },
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
    try {
      const { name, email, password } = req.body;
      if (!name?.trim() || !email?.trim() || !password) {
        return res.status(400).json({ error: "Please fill in all fields." });
      }
      if (password.length < 8) {
        return res.status(400).json({ error: "Password must have at least 8 characters." });
      }
      const passwordHash = await bcrypt.hash(password, 10);
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
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/login", async (req, res) => {
    try {
      const { email, password } = req.body;
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
      res.status(500).json({ error: error.message });
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
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/questions", requireLogin, async (req, res) => {
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
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/questions/:id/answers", async (req, res) => {
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
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/questions/:id/answers", requireLogin, async (req, res) => {
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
      res.status(500).json({ error: error.message });
    }
  });

  const server = app.listen(TEST_PORT, "127.0.0.1");

  try {
    const client = createClient();
    const testEmail = `test_${Date.now()}@example.com`;
    const testPassword = "Password123!";

    // Test 1: API Status
    console.log("-> Test 1: Checking /api/status");
    const statusRes = await client.get("/api/status");
    assert.strictEqual(statusRes.status, 200, "Status endpoint should return 200");
    assert.strictEqual(statusRes.body.database, "sqlite", "Should report sqlite as database");
    console.log("   [PASS] API status is active with SQLite");

    // Test 2: Signup with validation (password too short)
    console.log("-> Test 2: Signup validation (short password)");
    const shortPassRes = await client.post("/api/signup", {
      name: "Short Pass",
      email: "short@example.com",
      password: "123",
    });
    assert.strictEqual(shortPassRes.status, 400, "Short password must return 400");
    console.log("   [PASS] Short password rejected");

    // Test 3: Successful Signup
    console.log("-> Test 3: Successful user signup");
    const signupRes = await client.post("/api/signup", {
      name: "Tejaswini Test",
      email: testEmail,
      password: testPassword,
    });
    assert.strictEqual(signupRes.status, 201, "Signup should return 201");
    assert.strictEqual(signupRes.body.user.name, "Tejaswini Test");
    assert.strictEqual(signupRes.body.user.email, testEmail);
    console.log("   [PASS] User successfully created with id:", signupRes.body.user.id);

    // Test 4: Duplicate Email Signup
    console.log("-> Test 4: Duplicate signup check");
    const dupRes = await client.post("/api/signup", {
      name: "Tejaswini Duplicate",
      email: testEmail,
      password: testPassword,
    });
    assert.strictEqual(dupRes.status, 409, "Duplicate email should return 409");
    console.log("   [PASS] Duplicate registration rejected with 409");

    // Test 5: Check session via /api/me
    console.log("-> Test 5: Check session via /api/me");
    const meRes = await client.get("/api/me");
    assert.strictEqual(meRes.status, 200);
    assert.strictEqual(meRes.body.user.email, testEmail);
    console.log("   [PASS] Session persisted for user:", meRes.body.user.name);

    // Test 6: Post a Question (with category and description/body)
    console.log("-> Test 6: Create a new question");
    const postQRes = await client.post("/api/questions", {
      title: "How does Node.js handle async I/O?",
      description: "Can someone explain libuv event loop in detail?",
      category: "Programming",
    });
    assert.strictEqual(postQRes.status, 201, "Question creation should return 201");
    const questionId = postQRes.body.id;
    assert.ok(questionId, "Should return a question id");
    console.log("   [PASS] Question created with ID:", questionId);

    // Test 7: List questions and verify category + fields
    console.log("-> Test 7: Verify question in /api/questions");
    const listRes = await client.get("/api/questions");
    assert.strictEqual(listRes.status, 200);
    const foundQ = listRes.body.questions.find((q) => q.id === questionId);
    assert.ok(foundQ, "Created question must be in list");
    assert.strictEqual(foundQ.title, "How does Node.js handle async I/O?");
    assert.strictEqual(foundQ.category, "Programming");
    assert.strictEqual(foundQ.author, "Tejaswini Test");
    assert.strictEqual(Number(foundQ.answer_count), 0);
    console.log("   [PASS] Question listed correctly with category 'Programming'");

    // Test 8: Search questions
    console.log("-> Test 8: Search questions with query");
    const searchRes = await client.get("/api/questions?search=libuv");
    assert.strictEqual(searchRes.status, 200);
    assert.ok(searchRes.body.questions.some((q) => q.id === questionId));
    console.log("   [PASS] Search filter successfully found question by keyword");

    // Test 9: Post an Answer to the question
    console.log("-> Test 9: Post an answer to question ID:", questionId);
    const postAnsRes = await client.post(`/api/questions/${questionId}/answers`, {
      body: "Node.js uses libuv which offloads blocking operations to thread pool or OS kernel.",
    });
    assert.strictEqual(postAnsRes.status, 201, "Post answer should return 201");
    const answerId = postAnsRes.body.id;
    assert.ok(answerId, "Should return answer id");
    console.log("   [PASS] Answer posted with ID:", answerId);

    // Test 10: View Answers for the question
    console.log("-> Test 10: Fetch answers for question ID:", questionId);
    const getAnsRes = await client.get(`/api/questions/${questionId}/answers`);
    assert.strictEqual(getAnsRes.status, 200);
    assert.strictEqual(getAnsRes.body.answers.length, 1);
    assert.strictEqual(getAnsRes.body.answers[0].author, "Tejaswini Test");
    assert.ok(getAnsRes.body.answers[0].body.includes("libuv"));
    console.log("   [PASS] Answer loaded with author name and text");

    // Test 11: Verify answer_count updated in question listing
    console.log("-> Test 11: Verify updated answer_count");
    const updatedListRes = await client.get("/api/questions");
    const updatedQ = updatedListRes.body.questions.find((q) => q.id === questionId);
    assert.strictEqual(Number(updatedQ.answer_count), 1);
    console.log("   [PASS] Answer count incremented to 1");

    // Test 12: Logout
    console.log("-> Test 12: Logout");
    const logoutRes = await client.post("/api/logout");
    assert.strictEqual(logoutRes.status, 200);
    const meLoggedOut = await client.get("/api/me");
    assert.strictEqual(meLoggedOut.body.user, null);
    console.log("   [PASS] Logged out successfully");

    // Test 13: Attempt to post question without login (should fail with 401)
    console.log("-> Test 13: Unauthorized post question protection");
    const unauthQRes = await client.post("/api/questions", {
      title: "Should fail",
      body: "No auth",
    });
    assert.strictEqual(unauthQRes.status, 401, "Must return 401 Unauthorized");
    console.log("   [PASS] Unauthorized question posting blocked with 401");

    // Test 14: Login again with correct credentials
    console.log("-> Test 14: Login with created credentials");
    const loginRes = await client.post("/api/login", {
      email: testEmail,
      password: testPassword,
    });
    assert.strictEqual(loginRes.status, 200);
    assert.strictEqual(loginRes.body.user.email, testEmail);
    console.log("   [PASS] Logged in successfully");

    // Test 15: Login with wrong password (should fail with 401)
    console.log("-> Test 15: Login with wrong password");
    const badLoginRes = await client.post("/api/login", {
      email: testEmail,
      password: "WrongPassword!",
    });
    assert.strictEqual(badLoginRes.status, 401);
    console.log("   [PASS] Bad credentials rejected with 401");

    console.log("\n============================================");
    console.log("ALL 15 TESTS PASSED SUCCESSFULLY! (100% OK)");
    console.log("============================================\n");
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error("Test Suite Failed:", err);
  process.exit(1);
});
