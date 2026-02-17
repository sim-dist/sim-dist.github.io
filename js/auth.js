(function () {
  "use strict";

  const USERNAME = "simdist";
  const PASSWORD = "simdist-rules";
  const SESSION_KEY = "simdist_auth_ok";
  const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

  function isLocalHost() {
    return LOCAL_HOSTS.has(window.location.hostname);
  }

  function isAuthorized() {
    return window.sessionStorage.getItem(SESSION_KEY) === "1";
  }

  function lockPage() {
    document.documentElement.classList.add("auth-locked");
  }

  function unlockPage() {
    document.documentElement.classList.remove("auth-locked");
  }

  function setAuthorized() {
    window.sessionStorage.setItem(SESSION_KEY, "1");
  }

  function buildGate() {
    const gate = document.createElement("div");
    gate.className = "auth-gate";
    gate.innerHTML =
      '<form class="auth-card" id="auth-form" autocomplete="off">' +
      '<h1>Private Preview</h1>' +
      "<p>Enter credentials to view this GitHub Pages preview.</p>" +
      '<label for="auth-user">Username</label>' +
      '<input id="auth-user" name="username" type="text" required />' +
      '<label for="auth-pass">Password</label>' +
      '<input id="auth-pass" name="password" type="password" required />' +
      '<p class="auth-error" id="auth-error" role="alert" aria-live="polite"></p>' +
      '<button type="submit">Enter</button>' +
      "</form>";

    document.body.appendChild(gate);

    const form = gate.querySelector("#auth-form");
    const userInput = gate.querySelector("#auth-user");
    const passInput = gate.querySelector("#auth-pass");
    const errorEl = gate.querySelector("#auth-error");

    userInput.focus();

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const user = userInput.value.trim();
      const pass = passInput.value;

      if (user === USERNAME && pass === PASSWORD) {
        setAuthorized();
        gate.remove();
        unlockPage();
        return;
      }

      errorEl.textContent = "Incorrect username or password.";
      passInput.value = "";
      passInput.focus();
    });
  }

  if (isLocalHost() || isAuthorized()) {
    unlockPage();
    return;
  }

  lockPage();

  document.addEventListener("DOMContentLoaded", () => {
    if (!document.body.querySelector(".auth-gate")) {
      buildGate();
    }
  });
})();
