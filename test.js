// Comprehensive automated test suite for DiscussHub (MongoDB Atlas)
const http = require("http");
const assert = require("assert");
require("dotenv").config();

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
  console.log("==================================================");
  console.log("   Starting DiscussHub Automated Test Suite       ");
  console.log("==================================================");

  if (!process.env.MONGODB_URI) {
    console.error("\n[Test Suite] Notice: MONGODB_URI is not set in environment or .env.");
    console.error("To run the automated tests against MongoDB Atlas:");
    console.error("  1. Copy .env.example to .env:");
    console.error("     copy .env.example .env");
    console.error("  2. In .env, set your MongoDB Atlas connection string:");
    console.error("     MONGODB_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/forum_db?retryWrites=true&w=majority");
    console.error("  3. Run: npm test\n");
    process.exit(1);
  }

  // Initialize DB and server
  const db = require("./db");
  const dbInfo = await db.initDatabase();
  console.log(`[Test] Connected to: ${dbInfo.details}`);

  const { app } = require("./server");
  const server = app.listen(TEST_PORT, "127.0.0.1");

  const testEmail = `test_${Date.now()}@example.com`;
  const testPassword = "Password123!";
  let createdUserId = null;
  let createdQuestionId = null;

  try {
    const client = createClient();

    // Test 1: API Status
    console.log("-> Test 1: Checking /api/status");
    const statusRes = await client.get("/api/status");
    assert.strictEqual(statusRes.status, 200, "Status endpoint should return 200");
    assert.strictEqual(statusRes.body.database, "mongodb", "Should report mongodb as database");
    console.log("   [PASS] API status is active with MongoDB");

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
    assert.ok(signupRes.body.user.id, "User object must include an id");
    createdUserId = signupRes.body.user.id;
    console.log("   [PASS] User successfully created with id:", createdUserId);

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
    createdQuestionId = postQRes.body.id;
    assert.ok(createdQuestionId, "Should return a question id");
    console.log("   [PASS] Question created with ID:", createdQuestionId);

    // Test 7: List questions and verify category + fields
    console.log("-> Test 7: Verify question in /api/questions");
    const listRes = await client.get("/api/questions");
    assert.strictEqual(listRes.status, 200);
    const foundQ = listRes.body.questions.find((q) => String(q.id) === String(createdQuestionId));
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
    assert.ok(searchRes.body.questions.some((q) => String(q.id) === String(createdQuestionId)));
    console.log("   [PASS] Search filter successfully found question by keyword");

    // Test 9: Post an Answer to the question
    console.log("-> Test 9: Post an answer to question ID:", createdQuestionId);
    const postAnsRes = await client.post(`/api/questions/${createdQuestionId}/answers`, {
      body: "Node.js uses libuv which offloads blocking operations to thread pool or OS kernel.",
    });
    assert.strictEqual(postAnsRes.status, 201, "Post answer should return 201");
    const answerId = postAnsRes.body.id;
    assert.ok(answerId, "Should return answer id");
    console.log("   [PASS] Answer posted with ID:", answerId);

    // Test 10: View Answers for the question
    console.log("-> Test 10: Fetch answers for question ID:", createdQuestionId);
    const getAnsRes = await client.get(`/api/questions/${createdQuestionId}/answers`);
    assert.strictEqual(getAnsRes.status, 200);
    assert.strictEqual(getAnsRes.body.answers.length, 1);
    assert.strictEqual(getAnsRes.body.answers[0].author, "Tejaswini Test");
    assert.ok(getAnsRes.body.answers[0].body.includes("libuv"));
    console.log("   [PASS] Answer loaded with author name and text");

    // Test 11: Verify answer_count updated in question listing
    console.log("-> Test 11: Verify updated answer_count");
    const updatedListRes = await client.get("/api/questions");
    const updatedQ = updatedListRes.body.questions.find((q) => String(q.id) === String(createdQuestionId));
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
    // Clean up test data
    try {
      if (createdQuestionId) {
        await db.Answer.deleteMany({ question_id: createdQuestionId });
        await db.Question.deleteOne({ _id: createdQuestionId });
      }
      if (testEmail) {
        await db.User.deleteMany({ email: testEmail });
      }
    } catch (cleanupErr) {
      console.warn("[Test] Cleanup warning:", cleanupErr.message);
    }

    server.close();
    await db.closeDatabase();
  }
}

runTests().catch((err) => {
  if (err.code === 8000 || (err.message && err.message.includes("bad auth"))) {
    console.error("\n[MongoDB Atlas Authentication Error]");
    console.error("Connected to MongoDB Atlas cluster successfully, but authentication was rejected (bad auth : authentication failed).");
    console.error("How to fix:");
    console.error("  1. Log in to cloud.mongodb.com and go to: Security -> Database Access");
    console.error("  2. Check that your Database Username matches what is in .env.");
    console.error("  3. Click 'Edit' -> 'Edit Password', set a password, and click 'Update User'.");
    console.error("  4. Update the password in your .env file MONGODB_URI.");
    console.error("  5. Run: npm.cmd test\n");
  } else {
    console.error("Test Suite Failed:", err);
  }
  process.exit(1);
});
