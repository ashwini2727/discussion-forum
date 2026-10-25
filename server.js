const express = require("express");
const session = require("express-session");
const bcrypt = require("bcrypt");
const path = require("path");
require("dotenv").config();

const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for Vercel deployment
app.set("trust proxy", 1);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret:
      process.env.SESSION_SECRET ||
      "discuss-hub-secure-session-key",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);

// Ensure MongoDB is connected before processing API requests.
app.use(async (req, res, next) => {
  if (!req.path.startsWith("/api")) {
    return next();
  }

  try {
    await db.ensureConnected();
    return next();
  } catch (error) {
    console.error(
      `[Database Error on ${req.method} ${req.path}]:`,
      error.message
    );

    return res.status(503).json({
      error:
        "Database connection failed. Please try again in a moment.",
    });
  }
});

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({
      error: "Please log in first.",
    });
  }

  next();
}

// API status
app.get("/api/status", async (req, res) => {
  try {
    await db.ensureConnected();
    const info = db.getDbInfo();

    return res.status(200).json({
      message: "Discussion Forum API is running",
      database: info.type,
      databaseDetails: info.details,
    });
  } catch (error) {
    console.error("[Database Status Error]:", error.message);

    const info = db.getDbInfo();

    return res.status(503).json({
      message: "Discussion Forum API is running",
      database: info.type,
      databaseDetails: "Database connection failed",
    });
  }
});

// Signup
app.post("/api/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name?.trim() || !email?.trim() || !password) {
      return res.status(400).json({
        error: "Please fill in all fields.",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        error: "Password must have at least 8 characters.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existing = await db.User.findOne({
      email: normalizedEmail,
    });

    if (existing) {
      return res.status(409).json({
        error: "This email is already registered.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const newUser = await db.User.create({
      name: name.trim(),
      email: normalizedEmail,
      password_hash: passwordHash,
    });

    req.session.user = {
      id: newUser._id.toString(),
      name: newUser.name,
      email: newUser.email,
    };

    return res.status(201).json({
      message: "Account created successfully.",
      user: req.session.user,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        error: "This email is already registered.",
      });
    }

    console.error("Signup error:", error);

    return res.status(500).json({
      error: "Could not create account.",
    });
  }
});

// Login
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email?.trim() || !password) {
      return res.status(400).json({
        error: "Please enter your email and password.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await db.User.findOne({
      email: normalizedEmail,
    });

    if (
      !user ||
      !(await bcrypt.compare(password, user.password_hash))
    ) {
      return res.status(401).json({
        error: "Invalid email or password.",
      });
    }

    req.session.user = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
    };

    return res.json({
      message: "Login successful.",
      user: req.session.user,
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      error: "Could not log in.",
    });
  }
});

// Logout
app.post("/api/logout", (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      console.error("Logout error:", error);
      return res.status(500).json({
        error: "Could not log out.",
      });
    }

    res.clearCookie("connect.sid");
    return res.json({
      message: "Logged out successfully.",
    });
  });
});

// Current user
app.get("/api/me", (req, res) => {
  return res.json({
    user: req.session.user || null,
  });
});

// Escape special characters in search terms.
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Get questions and search
app.get("/api/questions", async (req, res) => {
  try {
    const search = String(req.query.search || "").trim();
    const category = String(req.query.category || "").trim();

    const conditions = [];

    if (search) {
      const searchRegex = new RegExp(escapeRegex(search), "i");

      conditions.push({
        $or: [
          { title: searchRegex },
          { body: searchRegex },
          { category: searchRegex },
        ],
      });
    }

    if (category && category.toLowerCase() !== "all") {
      conditions.push({
        category: new RegExp(
          `^${escapeRegex(category)}$`,
          "i"
        ),
      });
    }

    const filter =
      conditions.length > 0 ? { $and: conditions } : {};

    const questions = await db.Question.find(filter)
      .populate("user_id", "name")
      .sort({ created_at: -1 })
      .lean();

    const formatted = questions.map((q) => ({
      id: q._id.toString(),
      title: q.title,
      body: q.body,
      category: q.category || "General",
      created_at: q.created_at,
      author: q.user_id ? q.user_id.name : "Student",
      answer_count: q.answer_count || 0,
    }));

    return res.json({ questions: formatted });
  } catch (error) {
    console.error("Get questions error:", error);

    return res.status(500).json({
      error: "Could not load questions.",
    });
  }
});

// Post a question
app.post("/api/questions", requireLogin, async (req, res) => {
  try {
    const title = req.body.title;
    const body = req.body.body || req.body.description;
    const category = req.body.category || "General";

    if (!title?.trim() || !body?.trim()) {
      return res.status(400).json({
        error: "Enter both a title and question details.",
      });
    }

    const question = await db.Question.create({
      user_id: req.session.user.id,
      title: title.trim(),
      body: body.trim(),
      category: category.trim(),
      answer_count: 0,
    });

    return res.status(201).json({
      message: "Question posted.",
      id: question._id.toString(),
    });
  } catch (error) {
    console.error("Post question error:", error);

    return res.status(500).json({
      error: "Could not post question.",
    });
  }
});

// Get answers
app.get("/api/questions/:id/answers", async (req, res) => {
  try {
    const questionId = req.params.id;

    if (!db.isValidObjectId(questionId)) {
      return res.status(400).json({
        error: "Invalid question ID.",
      });
    }

    const answers = await db.Answer.find({
      question_id: questionId,
    })
      .populate("user_id", "name")
      .sort({ created_at: 1 })
      .lean();

    const formatted = answers.map((answer) => ({
      id: answer._id.toString(),
      body: answer.body,
      created_at: answer.created_at,
      author: answer.user_id
        ? answer.user_id.name
        : "Student",
    }));

    return res.json({ answers: formatted });
  } catch (error) {
    console.error("Get answers error:", error);

    return res.status(500).json({
      error: "Could not load answers.",
    });
  }
});

// Post an answer
app.post(
  "/api/questions/:id/answers",
  requireLogin,
  async (req, res) => {
    try {
      const questionId = req.params.id;

      if (!db.isValidObjectId(questionId)) {
        return res.status(400).json({
          error: "Invalid question ID.",
        });
      }

      const { body } = req.body;

      if (!body?.trim()) {
        return res.status(400).json({
          error: "Please write an answer.",
        });
      }

      const questionExists = await db.Question.exists({
        _id: questionId,
      });

      if (!questionExists) {
        return res.status(404).json({
          error: "Question not found.",
        });
      }

      const answer = await db.Answer.create({
        question_id: questionId,
        user_id: req.session.user.id,
        body: body.trim(),
      });

      await db.Question.findByIdAndUpdate(questionId, {
        $inc: { answer_count: 1 },
      });

      return res.status(201).json({
        message: "Answer posted.",
        id: answer._id.toString(),
      });
    } catch (error) {
      console.error("Post answer error:", error);

      return res.status(500).json({
        error: "Could not post answer.",
      });
    }
  }
);

// Start server locally
async function startServer() {
  try {
    console.log(
      "[Server] Connecting to MongoDB before starting..."
    );

    const dbInfo = await db.initDatabase();

    app.listen(PORT, "0.0.0.0", () => {
      console.log("------------------------------------------");
      console.log(`Discussion Forum running at http://localhost:${PORT}`);
      console.log(`Active Database: ${dbInfo.details}`);
      console.log("------------------------------------------");
    });
  } catch (error) {
    console.error(
      "[Server] Initial database connection error:",
      error.message
    );

    app.listen(PORT, "0.0.0.0", () => {
      console.log("------------------------------------------");
      console.log(`Discussion Forum running at http://localhost:${PORT}`);
      console.log(
        "Database is unavailable. Requests will retry the connection."
      );
      console.log("------------------------------------------");
    });
  }
}

if (require.main === module) {
  startServer();
}

// REQUIRED FOR VERCEL: Export app directly
module.exports = app;