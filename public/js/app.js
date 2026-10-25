"use strict";

const $ = (id) => document.getElementById(id);

let currentUser = null;
let authMode = "login";

// Safe API helper
async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || data.message || "An unexpected error occurred.");
  }

  return data;
}

// Escape HTML to prevent XSS
function escapeHTML(value) {
  const entities = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return String(value ?? "").replace(/[&<>"']/g, (c) => entities[c]);
}

// Get helper for elements with flexible fallback IDs
function getNameInput() {
  return $("authName") || $("nameInput");
}

function getEmailInput() {
  return $("authEmail") || $("emailInput");
}

function getPasswordInput() {
  return $("authPassword") || $("passwordInput");
}

function getAuthMessage() {
  return $("authMessage") || $("authError");
}

function getSwitchText() {
  return $("switchText") || $("switchAuthText");
}

function getAuthDescription() {
  return $("authDescription") || $("authSubtitle");
}

// Open login or signup modal
function openAuth(mode = "login") {
  authMode = mode;

  const modal = $("authModal");
  if (!modal) return;

  const isSignup = mode === "signup";

  if ($("authTitle")) {
    $("authTitle").textContent = isSignup ? "Create an Account" : "Login";
  }

  const desc = getAuthDescription();
  if (desc) {
    desc.textContent = isSignup
      ? "Join DiscussHub to ask questions and participate."
      : "Welcome back. Login to continue.";
  }

  if ($("authSubmitBtn")) {
    $("authSubmitBtn").textContent = isSignup ? "Sign Up" : "Login";
  }

  const switchText = getSwitchText();
  if (switchText) {
    switchText.textContent = isSignup
      ? "Already have an account?"
      : "Don't have an account?";
  }

  if ($("switchAuthBtn")) {
    $("switchAuthBtn").textContent = isSignup ? "Login" : "Sign Up";
  }

  const nameField = $("nameField");
  const nameInput = getNameInput();
  if (nameField) {
    nameField.hidden = !isSignup;
  }
  if (nameInput) {
    nameInput.required = isSignup;
  }

  const msg = getAuthMessage();
  if (msg) {
    msg.textContent = "";
    msg.style.color = "#b42318";
  }

  const authForm = $("authForm");
  if (authForm) {
    authForm.reset();
  }

  modal.hidden = false;
  modal.style.display = "flex";

  // Focus the first relevant field
  setTimeout(() => {
    if (isSignup && nameInput) {
      nameInput.focus();
    } else {
      const emailInput = getEmailInput();
      if (emailInput) emailInput.focus();
    }
  }, 100);
}

// Close login or signup modal
function closeAuth() {
  const modal = $("authModal");
  if (!modal) return;

  modal.hidden = true;
  modal.style.display = "none";

  const msg = getAuthMessage();
  if (msg) {
    msg.textContent = "";
  }
}

// Show logged-out home view
function showHome() {
  currentUser = null;

  if ($("authPage")) $("authPage").hidden = false;
  if ($("forumPage")) $("forumPage").hidden = true;
  if ($("navButtons")) $("navButtons").hidden = false;
  if ($("userArea")) $("userArea").hidden = true;
  if ($("welcomeUser")) $("welcomeUser").textContent = "";

  const qForm = $("questionForm");
  if (qForm) qForm.hidden = true;
}

// Show logged-in forum view
function showForum(user) {
  currentUser = user;

  if ($("authPage")) $("authPage").hidden = true;
  if ($("forumPage")) $("forumPage").hidden = false;
  if ($("navButtons")) $("navButtons").hidden = true;
  if ($("userArea")) $("userArea").hidden = false;

  if ($("welcomeUser")) {
    $("welcomeUser").textContent = `Welcome, ${user.name || user.email}`;
  }

  closeAuth();
  loadQuestions();
}

// Load and display discussions / questions
async function loadQuestions() {
  const container = $("questionsList");
  if (!container) return;

  container.innerHTML = `<p class="loading-state">Loading questions...</p>`;

  try {
    const search = $("searchInput") ? $("searchInput").value.trim() : "";
    const data = await api("/api/questions?search=" + encodeURIComponent(search));
    const questions = Array.isArray(data) ? data : data.questions || [];

    if (questions.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">💬</div>
          <h3>No questions found</h3>
          <p>${search ? "Try searching with different keywords." : "Be the first to start a discussion!"}</p>
        </div>
      `;
      return;
    }

    container.innerHTML = questions
      .map((q) => {
        const author = q.author || "Student";
        const date = q.created_at
          ? new Date(q.created_at).toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            })
          : "";
        const category = q.category || "General";
        const answerCount = q.answer_count || 0;

        return `
          <article class="question-card" id="question-${q.id}">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <span class="category-tag">${escapeHTML(category)}</span>
              <span style="font-size:12px; color:var(--muted);">${answerCount} ${answerCount === 1 ? "answer" : "answers"}</span>
            </div>

            <h3 style="margin:6px 0 10px; color:var(--navy); font-size:19px;">${escapeHTML(q.title)}</h3>
            <p style="margin:0 0 15px; color:var(--text); white-space:pre-wrap;">${escapeHTML(q.body || q.description || "")}</p>

            <div class="question-meta">
              <span>Asked by <strong>${escapeHTML(author)}</strong> · ${escapeHTML(date)}</span>
              <button class="btn btn-outline toggle-answers-btn" data-question-id="${q.id}" type="button" style="padding:6px 14px; font-size:13px;">
                💬 View Answers (${answerCount})
              </button>
            </div>

            <div class="answers-area" id="answers-area-${q.id}" hidden>
              <div class="answers-list" id="answers-list-${q.id}">
                <p style="color:var(--muted); font-size:13px;">Loading answers...</p>
              </div>

              <form class="answer-form" id="answer-form-${q.id}" data-question-id="${q.id}" style="margin-top:16px;">
                <label for="answer-input-${q.id}" style="margin:0 0 6px; font-size:12px; font-weight:700;">Your Answer</label>
                <textarea id="answer-input-${q.id}" name="body" rows="3" placeholder="Write your helpful answer here..." required style="width:100%; margin-bottom:8px;"></textarea>
                <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
                  <button class="btn btn-primary" type="submit" style="padding:8px 16px; font-size:13px;">Post Answer</button>
                  <span class="answer-message" id="answer-message-${q.id}" role="status"></span>
                </div>
              </form>
            </div>
          </article>
        `;
      })
      .join("");

    // Attach answer toggle & submission handlers
    attachAnswerHandlers();
  } catch (error) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <h3>Unable to load questions</h3>
        <p class="error-message" style="margin-top:10px;">${escapeHTML(error.message)}</p>
        <button class="btn btn-primary" type="button" id="retryQuestionsBtn" style="margin-top:15px;">Try Again</button>
      </div>
    `;
    const retryBtn = $("retryQuestionsBtn");
    if (retryBtn) retryBtn.addEventListener("click", loadQuestions);
  }
}

// Load answers for a specific question
async function loadAnswers(questionId) {
  const container = $(`answers-list-${questionId}`);
  if (!container) return;

  container.innerHTML = `<p style="color:var(--muted); font-size:13px;">Loading answers...</p>`;

  try {
    const data = await api(`/api/questions/${questionId}/answers`);
    const answers = Array.isArray(data) ? data : data.answers || [];

    if (answers.length === 0) {
      container.innerHTML = `<p style="color:var(--muted); font-size:13px; font-style:italic; padding:6px 0;">No answers yet. Be the first to answer this question!</p>`;
      return;
    }

    container.innerHTML = answers
      .map((a) => {
        const author = a.author || "Student";
        const date = a.created_at
          ? new Date(a.created_at).toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            })
          : "";
        return `
          <div class="answer-item">
            <div style="display:flex; justify-content:space-between; margin-bottom:5px; font-size:12px; color:var(--muted);">
              <span><strong>${escapeHTML(author)}</strong></span>
              <span>${escapeHTML(date)}</span>
            </div>
            <div style="color:var(--text); white-space:pre-wrap; font-size:14px;">${escapeHTML(a.body)}</div>
          </div>
        `;
      })
      .join("");
  } catch (error) {
    container.innerHTML = `<p style="color:#b42318; font-size:13px;">Failed to load answers: ${escapeHTML(error.message)}</p>`;
  }
}

// Wire up answer toggle buttons and forms
function attachAnswerHandlers() {
  document.querySelectorAll(".toggle-answers-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const qId = btn.getAttribute("data-question-id");
      const area = $(`answers-area-${qId}`);
      if (!area) return;

      const isHidden = area.hidden;
      area.hidden = !isHidden;

      if (area.hidden) {
        btn.textContent = btn.textContent.replace("Hide Answers", "View Answers");
      } else {
        btn.textContent = btn.textContent.replace("View Answers", "Hide Answers");
        loadAnswers(qId);
      }
    });
  });

  document.querySelectorAll(".answer-form").forEach((form) => {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const qId = form.getAttribute("data-question-id");
      const statusBox = $(`answer-message-${qId}`);
      const textarea = form.querySelector("textarea");
      const body = textarea ? textarea.value.trim() : "";
      const submitBtn = form.querySelector('button[type="submit"]');

      if (!currentUser) {
        if (statusBox) statusBox.textContent = "Please log in first to answer.";
        openAuth("login");
        return;
      }

      if (!body) {
        if (statusBox) statusBox.textContent = "Please enter your answer.";
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Posting...";
      }
      if (statusBox) statusBox.textContent = "";

      try {
        await api(`/api/questions/${qId}/answers`, {
          method: "POST",
          body: JSON.stringify({ body }),
        });

        textarea.value = "";
        if (statusBox) {
          statusBox.style.color = "#0f766e";
          statusBox.textContent = "Answer posted!";
          setTimeout(() => {
            if (statusBox) statusBox.textContent = "";
          }, 3000);
        }

        // Reload answers for this question
        await loadAnswers(qId);

        // Update answer count badge
        const toggleBtn = document.querySelector(`.toggle-answers-btn[data-question-id="${qId}"]`);
        if (toggleBtn) {
          const area = $(`answers-list-${qId}`);
          const count = area ? area.querySelectorAll(".answer-item").length : 1;
          toggleBtn.textContent = `💬 Hide Answers (${count})`;
        }
      } catch (error) {
        if (statusBox) {
          statusBox.style.color = "#b42318";
          statusBox.textContent = error.message;
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Post Answer";
        }
      }
    });
  });
}

// Check session on load
async function checkSession() {
  try {
    const data = await api("/api/me");
    if (data.user) {
      showForum(data.user);
    } else {
      showHome();
    }
  } catch (error) {
    showHome();
  }
}

// Login button in navbar
if ($("loginBtn")) {
  $("loginBtn").addEventListener("click", () => openAuth("login"));
}

// Sign up button in navbar
if ($("signupBtn")) {
  $("signupBtn").addEventListener("click", () => openAuth("signup"));
}

// Hero login button
if ($("heroLoginBtn")) {
  $("heroLoginBtn").addEventListener("click", () => openAuth("login"));
}

// Close modal button (X)
if ($("closeModalBtn")) {
  $("closeModalBtn").addEventListener("click", closeAuth);
}

// Switch between login and signup in modal
if ($("switchAuthBtn")) {
  $("switchAuthBtn").addEventListener("click", () => {
    openAuth(authMode === "login" ? "signup" : "login");
  });
}

// Close modal when clicking on the backdrop
if ($("authModal")) {
  $("authModal").addEventListener("click", (event) => {
    if (event.target === $("authModal")) {
      closeAuth();
    }
  });
}

// Close modal using Escape key
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeAuth();
  }
});

// Auth form submission (login / signup)
if ($("authForm")) {
  $("authForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    const msg = getAuthMessage();
    const submitBtn = $("authSubmitBtn");

    if (msg) {
      msg.textContent = "";
      msg.style.color = "#b42318";
    }

    const nameInput = getNameInput();
    const emailInput = getEmailInput();
    const passwordInput = getPasswordInput();

    const name = nameInput ? nameInput.value.trim() : "";
    const email = emailInput ? emailInput.value.trim() : "";
    const password = passwordInput ? passwordInput.value : "";

    if (authMode === "signup" && !name) {
      if (msg) msg.textContent = "Please enter your full name.";
      if (nameInput) nameInput.focus();
      return;
    }

    if (!email || !password) {
      if (msg) msg.textContent = "Please enter your email and password.";
      return;
    }

    if (password.length < 8) {
      if (msg) msg.textContent = "Password must have at least 8 characters.";
      if (passwordInput) passwordInput.focus();
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Please wait...";
    }

    try {
      const endpoint = authMode === "signup" ? "/api/signup" : "/api/login";
      const payload =
        authMode === "signup"
          ? { name, email, password }
          : { email, password };

      const data = await api(endpoint, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (data.user) {
        showForum(data.user);
      } else {
        await checkSession();
      }
    } catch (error) {
      if (msg) {
        msg.textContent = error.message;
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = authMode === "signup" ? "Sign Up" : "Login";
      }
    }
  });
}

// Logout button
if ($("logoutBtn")) {
  $("logoutBtn").addEventListener("click", async () => {
    try {
      await api("/api/logout", { method: "POST" });
    } catch (err) {
      console.error("Logout error:", err);
    }
    showHome();
  });
}

// Start Discussion button (+ Start Discussion)
if ($("startDiscussionBtn")) {
  $("startDiscussionBtn").addEventListener("click", () => {
    if (!currentUser) {
      openAuth("login");
      return;
    }

    const formCard = $("questionForm");
    if (!formCard) return;

    formCard.hidden = !formCard.hidden;

    if (!formCard.hidden) {
      const titleInput = $("questionTitle");
      if (titleInput) {
        titleInput.focus();
        formCard.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  });
}

// Cancel Question button
if ($("cancelQuestionBtn")) {
  $("cancelQuestionBtn").addEventListener("click", () => {
    const formCard = $("questionForm");
    if (formCard) formCard.hidden = true;

    const askForm = $("askQuestionForm");
    if (askForm) askForm.reset();

    const msg = $("questionMessage");
    if (msg) msg.textContent = "";
  });
}

// Submit Question handler (attached to askQuestionForm)
const askQuestionForm = $("askQuestionForm") || $("questionForm");
if (askQuestionForm) {
  askQuestionForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const titleInput = $("questionTitle");
    const descInput = $("questionDescription");
    const catInput = $("questionCategory");
    const message = $("questionMessage");
    const submitBtn = $("questionSubmitBtn");

    const title = titleInput ? titleInput.value.trim() : "";
    const description = descInput ? descInput.value.trim() : "";
    const category = catInput ? catInput.value : "General";

    if (message) {
      message.textContent = "";
      message.style.color = "#b42318";
    }

    if (!title || !description) {
      if (message) message.textContent = "Please fill in both a title and description.";
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Posting...";
    }

    try {
      await api("/api/questions", {
        method: "POST",
        body: JSON.stringify({
          title,
          body: description,
          description,
          category,
        }),
      });

      // Clear the form
      if ($("askQuestionForm")) $("askQuestionForm").reset();

      // Hide the form
      const formCard = $("questionForm");
      if (formCard) formCard.hidden = true;

      // Reload questions
      await loadQuestions();
    } catch (error) {
      if (message) {
        message.style.color = "#b42318";
        message.textContent = error.message;
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Post Question";
      }
    }
  });
}

// Search debounce
let searchTimer = null;
if ($("searchInput")) {
  $("searchInput").addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadQuestions, 300);
  });
  $("searchInput").addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      clearTimeout(searchTimer);
      loadQuestions();
    }
  });
}

if ($("searchBtn")) {
  $("searchBtn").addEventListener("click", loadQuestions);
}

// Initial session check on page load
checkSession();
