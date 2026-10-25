# DiscussHub · Student Discussion Forum & Q&A Board

A full-stack, responsive Discussion Forum and Question & Answer platform designed for students and learners to collaborate, ask questions, share insights, and discuss academic and technical topics.

Built with **HTML, CSS, JavaScript, Node.js, Express.js**, and **MongoDB Atlas** with **Mongoose**.

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
  * Live answer counter automatically incremented on each question.
* **Cloud Database (MongoDB Atlas)**:
  * Powered by MongoDB Atlas cloud cluster using Mongoose ODM.
  * Reads connection string securely from `process.env.MONGODB_URI`.
  * Safe credential handling: `.env` is ignored by Git and masked in logs.
* **Responsive UI**:
  * Clean, student-friendly interface with modal popups, responsive navigation, and mobile-friendly layouts.

---

## 🛠️ Tech Stack

| Component | Technology |
| :--- | :--- |
| **Frontend** | HTML5, CSS3, Vanilla JavaScript (DOM & Fetch API) |
| **Backend** | Node.js, Express.js |
| **Database** | MongoDB Atlas (Cloud) |
| **ODM / Driver**| Mongoose |
| **Authentication** | `bcrypt`, `express-session` |
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
├── server.js               # Express application and API routes
├── db.js                   # Mongoose database models & connection manager
├── test.js                 # Automated end-to-end API test suite (15 tests)
├── package.json            # Node.js dependencies and scripts
├── .env.example            # Sample configuration template
├── .gitignore              # Files ignored by Git (.env, node_modules, etc.)
└── README.md               # Project documentation
```

---

## ⚙️ Setting Up MongoDB Atlas

1. **Create an Account / Log in**:
   * Visit [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) and sign in or create a free account.
2. **Create a Free Cluster**:
   * Click **Create**, select the **M0 Free** tier, choose your preferred cloud provider and region, and click **Create Deployment**.
3. **Configure Database Access (User)**:
   * Navigate to **Security** → **Database Access**.
   * Click **Add New Database User**.
   * Choose **Password Authentication**. Set a username (e.g. `tejaswini`) and a secure password.
   * Assign the role **Read and write to any database** (Atlas admin or `readWriteAnyDatabase`).
   * Click **Add User**.
4. **Configure Network Access (IP Whitelist)**:
   * Navigate to **Security** → **Network Access**.
   * Click **Add IP Address**.
   * Select **Allow Access from Anywhere** (`0.0.0.0/0`) or add your current IP address.
   * Click **Confirm**.
5. **Get your Connection String**:
   * Go to **Database** → Click **Connect** on your cluster.
   * Choose **Drivers** (Node.js).
   * Copy the connection string (format: `mongodb+srv://<username>:<password>@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority`).
   * Add your database name after `.mongodb.net/` (for example, `/forum_db`):
     ```text
     mongodb+srv://<username>:<password>@cluster0.abcde.mongodb.net/forum_db?retryWrites=true&w=majority
     ```

---

## ⚡ Quick Start (Local Setup)

### 1. Prerequisites
* **Node.js** v22.5.0 or higher ([Download Node.js](https://nodejs.org/))
* A free **MongoDB Atlas** cluster connection string

### 2. Installation
Open your terminal in the project directory and install dependencies:
```bash
npm install
```

### 3. Configure `.env`
Create your `.env` file from the provided `.env.example`:
```bash
# On Windows PowerShell:
Copy-Item .env.example .env

# On macOS / Linux / Git Bash:
cp .env.example .env
```

Open `.env` and configure your credentials:
```env
PORT=3000
SESSION_SECRET=your_super_secret_session_key
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.abcde.mongodb.net/forum_db?retryWrites=true&w=majority
```
> **Security Note**: Never commit your `.env` file to version control. The `.gitignore` file is pre-configured to ensure `.env` is never pushed to GitHub.

### 4. Start the Server
Start the application using:
```bash
npm start
```
The server will connect to MongoDB Atlas and start at:
```text
http://localhost:3000
```
Open your browser and visit `http://localhost:3000` to use DiscussHub!

---

## 🧪 Running Automated Tests

A comprehensive 15-point test suite is included that verifies:
1. API health & status (confirms `database: "mongodb"`)
2. Signup validation & short password rejection
3. Successful user registration
4. Duplicate email check (409 Conflict)
5. Session persistence via `/api/me`
6. Question creation with category and details
7. Question retrieval and author attribution
8. Real-time search by keyword and category
9. Answer posting to questions
10. Answer retrieval with author and timestamp
11. Automatic `answer_count` increments
12. User logout & session destruction
13. Route protection against unauthorized question posting (401)
14. User login with valid credentials
15. Bad password rejection (401)

Run the test suite with:
```bash
npm test
```

---

## 🌐 Deployment to Render

To deploy this project to [Render.com](https://render.com/) for free:

### Step 1: Push to GitHub
1. Create a new repository on [GitHub](https://github.com/new).
2. Commit your local changes and push to GitHub (ensure `.env` is **not** committed):
   ```bash
   git add .
   git commit -m "Migrate database from SQLite to MongoDB Atlas"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo-name>.git
   git push -u origin main
   ```

### Step 2: Deploy on Render
1. Log in to [Render](https://render.com/) and click **New +** → **Web Service**.
2. Connect your GitHub repository.
3. Configure settings:
   * **Name**: `discusshub`
   * **Region**: Choose your nearest region (e.g. Frankfurt or Oregon)
   * **Branch**: `main`
   * **Runtime**: `Node`
   * **Build Command**: `npm install`
   * **Start Command**: `npm start`
   * **Plan**: Free
4. In **Environment Variables**:
   * Add `PORT` = `3000`
   * Add `SESSION_SECRET` = (any random string)
   * Add `MONGODB_URI` = `mongodb+srv://<username>:<password>@cluster0.abcde.mongodb.net/forum_db?retryWrites=true&w=majority`
5. Click **Create Web Service**. Once deployed, Render will generate a live URL for your forum.

---

## 📄 License

This project is licensed under the ISC License.
