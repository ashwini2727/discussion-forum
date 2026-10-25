# DiscussHub · Student Discussion Forum & Q&A Board

A full-stack, responsive Discussion Forum and Question & Answer platform designed for students and learners to collaborate, ask questions, share insights, and discuss academic and technical topics.

Built with **HTML, CSS, JavaScript, Node.js, Express.js**, and dual-database support for **SQLite** (instant zero-configuration local development) and **MySQL** (cloud production).

---

## 🚀 Key Features

* **User Authentication**:
  * Secure user registration (Sign Up) and Login.
  * Passwords hashed using `bcrypt` (salted, 12 rounds).
  * Session-based authentication via `express-session` with secure, HTTP-only cookies.
* **Q&A Discussion Board**:
  * Ask questions with title, detailed description, and category tag.
  * Categories supported: *General*, *Technology*, *Programming*, *Education*, *Projects*.
  * Real-time search across question titles, descriptions, and categories.
* **Interactive Answers System**:
  * Expand/collapse answers on any discussion card.
  * Post answers in real-time with author attribution and timestamp.
  * Live answer counter on each question.
* **Dual Database Architecture**:
  * **Default (SQLite)**: Works out of the box with zero external database installation. Ideal for local development, testing, and portable environments.
  * **Production (MySQL)**: Set `DB_HOST` in `.env` to connect to any MySQL server (locally or cloud-hosted such as TiDB, Aiven, or AWS RDS).
* **Responsive UI**:
  * Clean, student-friendly interface with modal popups, responsive navigation, and mobile-friendly layouts.

---

## 🛠️ Tech Stack

| Component | Technology |
| :--- | :--- |
| **Frontend** | HTML5, CSS3, Vanilla JavaScript (DOM & Fetch API) |
| **Backend** | Node.js, Express.js |
| **Authentication** | `bcrypt`, `express-session` |
| **Database** | SQLite (built-in) / MySQL (`mysql2/promise`) |
| **Environment** | `dotenv` |

---

## 📁 Project Structure

```text
disscussion-forum/
├── public/                 # Static frontend assets
│   ├── index.html          # Main application page & modals
│   ├── css/
│   │   └── style.css       # Responsive styling & themes
│   └── js/
│       └── app.js          # Client-side logic, auth, & API calls
├── data/                   # Local SQLite storage directory
│   └── forum.sqlite        # SQLite database (auto-created)
├── server.js               # Express application and API routes
├── db.js                   # Unified database adapter (SQLite & MySQL)
├── test.js                 # Automated end-to-end API test suite
├── package.json            # Node.js dependencies and scripts
├── .env.example            # Sample configuration template
├── .gitignore              # Files ignored by Git
└── README.md               # Project documentation
```

---

## ⚡ Quick Start (Local Setup)

### 1. Prerequisites
* **Node.js** v22.5.0 or higher ([Download Node.js](https://nodejs.org/))

### 2. Installation
Open your terminal in the project directory and install dependencies:
```bash
npm install
```

### 3. Start the Server
Start the application using:
```bash
npm start
```
The server will start at:
```text
http://localhost:3000
```
Open your browser and visit `http://localhost:3000` to use DiscussHub!

> **Note**: No database installation is required! The application automatically initializes a local SQLite database in `./data/forum.sqlite`.

---

## 🗄️ Optional MySQL Configuration

If you prefer to connect to an external or cloud MySQL database:

1. Create a `.env` file in the project root:
   ```bash
   cp .env.example .env
   ```
2. Fill in your MySQL credentials:
   ```env
   PORT=3000
   SESSION_SECRET=your_super_secret_session_key
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=your_mysql_password
   DB_NAME=forum_db
   ```
3. Restart the server (`npm start`). The server will automatically detect `DB_HOST`, create all necessary tables, and connect to MySQL.

---

## 🧪 Running Automated Tests

A comprehensive 15-point test suite is included that verifies:
* API health & status
* Signup validation & duplicate prevention
* Login authentication & bad password handling
* Session persistence & logout
* Question creation, categorization, and search
* Answer posting, retrieval, and counter increments
* Route protection for unauthorized requests

Run the test suite with:
```bash
npm test
```

---

## 🌐 Deployment to Render

To deploy this project to [Render.com](https://render.com/) for free:

### Step 1: Push to GitHub
1. Create a new public repository on [GitHub](https://github.com/new).
2. Push your project to GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial commit of DiscussHub"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo-name>.git
   git push -u origin main
   ```

### Step 2: Deploy on Render
1. Log in to [Render](https://render.com/) and click **New +** → **Web Service**.
2. Connect your GitHub repository.
3. Configure the settings:
   * **Name**: `discusshub` (or your preferred name)
   * **Region**: Choose the closest region (e.g. Frankfurt or Oregon)
   * **Branch**: `main`
   * **Root Directory**: Leave blank
   * **Runtime**: `Node`
   * **Build Command**: `npm install`
   * **Start Command**: `npm start`
   * **Plan**: Free
4. (Optional) In **Environment Variables**:
   * Add `SESSION_SECRET` with any random secret string.
   * If using a Cloud MySQL database (e.g. from [Aiven](https://aiven.io/) or [TiDB Cloud](https://tidbcloud.com/)), add `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME`.
   * *If no database environment variables are set*, the service will seamlessly use SQLite out of the box!
5. Click **Create Web Service**. Once the build finishes, Render will provide you with a live URL (e.g., `https://discusshub.onrender.com`).

---

## 📄 License

This project is licensed under the ISC License.
