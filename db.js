const mongoose = require("mongoose");
const dns = require("dns");

// Prefer IPv4 where available.
if (typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}

let connectionPromise = null;

// User schema
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 150,
    },
    password_hash: {
      type: String,
      required: true,
    },
    created_at: {
      type: Date,
      default: Date.now,
    },
  },
  {
    versionKey: false,
    timestamps: false,
  }
);

// Question schema
const questionSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    body: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      default: "General",
      trim: true,
      maxlength: 50,
      index: true,
    },
    answer_count: {
      type: Number,
      default: 0,
    },
    created_at: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    versionKey: false,
    timestamps: false,
  }
);

// Answer schema
const answerSchema = new mongoose.Schema(
  {
    question_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Question",
      required: true,
      index: true,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    body: {
      type: String,
      required: true,
      trim: true,
    },
    created_at: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    versionKey: false,
    timestamps: false,
  }
);

// Models
const User =
  mongoose.models.User ||
  mongoose.model("User", userSchema);

const Question =
  mongoose.models.Question ||
  mongoose.model("Question", questionSchema);

const Answer =
  mongoose.models.Answer ||
  mongoose.model("Answer", answerSchema);

// Hide username/password from MongoDB URI in terminal.
function maskMongoUri(uri) {
  if (!uri) {
    return "Undefined";
  }

  try {
    return uri.replace(
      /(mongodb(?:\+srv)?:\/\/)([^@/]+)@/i,
      "$1****@"
    );
  } catch {
    return "MongoDB Atlas (credentials hidden)";
  }
}

// Build database information from the REAL mongoose connection.
function getConnectionInfo() {
  const state = mongoose.connection.readyState;

  // 0 = disconnected
  if (state === 0) {
    return {
      type: "disconnected",
      details: "Not connected",
      databaseName: null,
      host: null,
      readyState: 0,
      connected: false,
    };
  }

  // 1 = connected
  if (state === 1) {
    const dbName =
      mongoose.connection.name || "discussion_forum";

    const host =
      mongoose.connection.host || "MongoDB Atlas";

    return {
      type: "mongodb",
      details: `MongoDB Atlas (${host}/${dbName})`,
      databaseName: dbName,
      host,
      readyState: 1,
      connected: true,
    };
  }

  // 2 = connecting
  if (state === 2) {
    return {
      type: "connecting",
      details: "Connecting to MongoDB Atlas...",
      databaseName: null,
      host: null,
      readyState: 2,
      connected: false,
    };
  }

  // 3 = disconnecting
  return {
    type: "disconnecting",
    details: "Disconnecting from MongoDB Atlas...",
    databaseName: null,
    host: null,
    readyState: state,
    connected: false,
  };
}

// Connection events
mongoose.connection.on("connected", () => {
  console.log(
    "[Database] MongoDB connection is ready."
  );

  console.log(
    `[Database] Database: ${
      mongoose.connection.name || "discussion_forum"
    }`
  );

  console.log(
    `[Database] Host: ${
      mongoose.connection.host || "MongoDB Atlas"
    }`
  );
});

mongoose.connection.on("disconnected", () => {
  console.error(
    "[Database] MongoDB disconnected."
  );
});

mongoose.connection.on("error", (error) => {
  console.error(
    "[Database] MongoDB connection error:",
    error.message
  );
});

// Initialize MongoDB connection.
async function initDatabase(customUri = null) {
  // Already connected.
  if (mongoose.connection.readyState === 1) {
    return getConnectionInfo();
  }

  // Another connection attempt is already running.
  if (connectionPromise) {
    return connectionPromise;
  }

  const mongoUri =
    customUri || process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error(
      "MONGODB_URI is missing. Check your .env file."
    );
  }

  console.log(
    "[Database] Connecting to MongoDB Atlas:",
    maskMongoUri(mongoUri)
  );

  connectionPromise = (async () => {
    let lastError = null;

    // Try up to 3 times.
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        // If mongoose is in a failed/disconnecting state,
        // clean it before trying again.
        if (mongoose.connection.readyState !== 0) {
          try {
            await mongoose.disconnect();
          } catch {
            // Ignore cleanup errors.
          }
        }

        await mongoose.connect(mongoUri, {
          serverSelectionTimeoutMS: 15000,
          connectTimeoutMS: 15000,
          socketTimeoutMS: 45000,
          maxPoolSize: 10,
          minPoolSize: 0,
          retryWrites: true,
        });

        const info = getConnectionInfo();

        console.log(
          `[Database] Connected successfully to ${info.details}`
        );

        return info;
      } catch (error) {
        lastError = error;

        console.error(
          `[Database] Connection attempt ${attempt} failed:`,
          error.message
        );

        if (attempt < 3) {
          console.log(
            "[Database] Retrying MongoDB connection..."
          );

          await new Promise((resolve) =>
            setTimeout(resolve, 2000)
          );
        }
      }
    }

    throw lastError;
  })();

  try {
    return await connectionPromise;
  } finally {
    connectionPromise = null;
  }
}

// Make sure database is connected before API requests.
async function ensureConnected() {
  if (mongoose.connection.readyState === 1) {
    return getConnectionInfo();
  }

  return initDatabase();
}

// Close database.
async function closeDatabase() {
  connectionPromise = null;

  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  console.log(
    "[Database] MongoDB connection closed."
  );
}

// Get CURRENT database status.
function getDbInfo() {
  return getConnectionInfo();
}

// Check whether MongoDB is currently connected.
function isReady() {
  return mongoose.connection.readyState === 1;
}

// Validate MongoDB ObjectId.
function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

module.exports = {
  initDatabase,
  ensureConnected,
  closeDatabase,
  getDbInfo,
  isReady,
  isValidObjectId,
  maskMongoUri,
  User,
  Question,
  Answer,
  mongoose,
};