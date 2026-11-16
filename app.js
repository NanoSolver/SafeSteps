"use strict";

const main = document.querySelector("#main");
const header = document.querySelector("#site-header");
const pages = { home: "Community safe walking routes", map: "Plan a walk", havens: "Safe Havens", about: "How SafeStride works", auth: "Sign in", walk: "Walk check-in" };
let profile = null;
let community = { reports: [], havens: [] };
let communityError = "";
let leavePage;
let navigation = 0;

async function api(path, { method = "GET", body, headers, signal } = {}) {
  let response;
  try {
    response = await fetch(path, {
      method, signal, credentials: "same-origin",
      headers: body === undefined ? headers : { ...headers, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error("Couldn’t reach the SafeStride server. Check your connection and try again.");
  }
  const content = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(content.error ?? "Couldn’t reach the SafeStride server."), { status: response.status });
  return content;
}

async function refreshCommunity() {
  const data = await api("/api/community");
  community = data;
  communityError = "";
  return data;
}

function escapeHtml(value) {
  const node = document.createElement("span");
  node.textContent = value;
  return node.innerHTML;
}

function footer() {
  return '<footer class="footer">SafeStride · Made for everyday walks <span aria-hidden="true">·</span> <a class="text-link" href="#about">About the prototype</a></footer>';
}

function nav(page, profile) {
  const current = id => id === page ? ' aria-current="page"' : "";
  header.innerHTML = `<div class="site-bar">
    <a href="#home" class="brand"><span class="mark" aria-hidden="true">♧</span>SafeStride</a>
    <nav aria-label="Main navigation">${page === "home" ? "" : `
      <a href="#map"${current("map")}>♧ &nbsp;Plan a walk</a>
      <a href="#havens"${current("havens")}>♢ &nbsp;Safe Havens</a>
      <a href="#walk"${current("walk")}>Check-in</a>`}</nav>
    ${profile ? '<button class="button account" id="sign-out">Sign out</button>' : '<a class="button account" href="#auth">♙ &nbsp;Sign in</a>'}
  </div>`;
  header.querySelector("#sign-out")?.addEventListener("click", async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await api("/api/logout", { method: "POST" });
      setSignedOut();
    } catch (error) {
      if (error.status === 401) setSignedOut();
      else button.textContent = "Retry sign out";
    } finally {
      button.disabled = false;
    }
  });
  function setSignedOut() {
    setProfile(null);
    render();
  }
}

function setProfile(account) {
  profile = account;
  community = { reports: [], havens: [] };
}

function home() {
  main.innerHTML = `
    <section class="home-hero">
      <div class="hero-grid">
        <div>
          <p class="eyebrow">✦ &nbsp; A LITTLE MORE CONFIDENCE, EVERY DAY</p>
          <h1>The way there <span>can feel better.</span></h1>
          <p class="lead">Compare walking routes, check for reported hazards, and let someone know when you get home.</p>
          <div class="hero-actions"><a class="button" href="#map">Plan a walk <span aria-hidden="true">→</span></a><a class="text-link" href="#walk">Check in with a contact</a></div>
        </div>
        <div class="walk-card">
          <div class="card-header"><div><small>YOUR WALK, YOUR WAY</small><strong>Choose what matters</strong></div><span class="mark" aria-hidden="true">♧</span></div>
          <div class="features"><span><b aria-hidden="true">↗</b>Walking routes</span><span><b aria-hidden="true">◎</b>Arrival check-in</span></div>
          <canvas class="route-art" width="660" height="150" aria-hidden="true"></canvas>
        </div>
      </div>
    </section>
    <div class="benefits"><span>◉ &nbsp; Community reports</span><span>↗ &nbsp; Street directions</span><span>◎ &nbsp; Trusted contacts</span></div>
    <section class="home-details">
      <p class="eyebrow">A SAFER WALK STARTS HERE</p>
      <h2>Look out for one another.</h2>
      <p>Small neighbourhood updates can make a big difference to the way home feels.</p>
      <section>
        <a class="feature-card" href="#havens"><h3>A helping hand, nearby</h3><p>Find trusted local places to turn to whenever you need a moment of support.</p><strong>Explore Safe Havens →</strong></a>
        <a class="feature-card" href="#map"><h3>Make the next walk better</h3><p>Share a broken light, blocked ramp or other change with your neighbours.</p><strong>Report a street issue →</strong></a>
        <a class="feature-card" href="#about"><h3>Know what shapes a route</h3><p>Get to know the choices behind route scores and walking preferences.</p><strong>How SafeStride works →</strong></a>
      </section>
    </section>${footer()}`;

  const ctx = main.querySelector("canvas").getContext("2d");
  ctx.beginPath();
  ctx.moveTo(24, 120);
  ctx.bezierCurveTo(91, 124, 163, 59, 221, 65);
  ctx.bezierCurveTo(302, 61, 355, 121, 443, 104);
  ctx.bezierCurveTo(499, 93, 574, 61, 633, 69);
  ctx.strokeStyle = "#afc4b8";
  ctx.lineWidth = 2;
  ctx.setLineDash([3, 8]);
  ctx.stroke();
  ctx.setLineDash([]);
  for (const [x, y, colour] of [[24, 120, "#2c624b"], [221, 65, "#396579"], [443, 104, "#a0584b"], [633, 69, "#2c624b"]]) {
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fillStyle = colour;
    ctx.fill();
  }
}

function about() {
  main.innerHTML = `<div class="content about">
    <h1>How SafeStride works</h1>
    <p class="muted">SafeStride is a college prototype for exploring how walking preferences and neighbourhood reports can shape a route.</p>
    <section><h2>Plan a walk</h2><p>Search for an address or pick two points on the map. Compare mapped walking directions by time and distance, and look for community reports along the way.</p></section>
    <section><h2>Neighbourhood support</h2><p>Sign in to register a haven or report an issue. People using the same SafeStride server can see these records. Community-listed havens are unverified.</p></section>
    <section><h2>Trusted-contact check-in</h2><p>A private link shows your display name, expected arrival time and check-in status. Share it with someone you trust and tap I’m home on arrival.</p></section>
    <section><h2>Map data</h2><p>Walking routes use OpenStreetMap data. Lighting and accessibility are unverified. Search terms and route points are sent to the map service providers when you request a search or route.</p></section>
    <a class="button" href="#map">Plan a walk →</a>
  </div>${footer()}`;
}

function auth(account) {
  if (account) {
    main.innerHTML = `<section class="auth"><h1>Your account</h1><p>Signed in as ${escapeHtml(account.displayName)}.</p><div class="stack"><a class="button" href="#walk">Walk check-in</a></div></section>`;
    return;
  }
  let register = false;
  function show() {
    main.innerHTML = `<section class="auth"><h1>${register ? "Create account" : "Welcome back"}</h1>
      <p class="muted">Use your SafeStride account to share check-ins and contribute to the map.</p>
      <form class="stack">
        ${register ? '<label>Display name<input name="displayName" autocomplete="nickname" maxlength="40" required></label>' : ""}
        <label>Username<input name="username" autocomplete="username" pattern="[A-Za-z0-9_.\\-]{3,32}" minlength="3" maxlength="32" required></label>
        <label>Password<input name="password" type="password" autocomplete="${register ? "new-password" : "current-password"}" minlength="10" maxlength="128" required></label>
        ${register ? '<p class="muted status">Use at least 10 characters for your password.</p>' : ""}
        <button class="button" type="submit">${register ? "Create account" : "Sign in"}</button>
        <button class="quiet-button" type="button" id="auth-toggle">${register ? "Already have an account? Sign in" : "New here? Create an account"}</button>
        <p class="status" role="status"></p>
      </form></section>`;
    const form = main.querySelector("form");
    form.querySelector("#auth-toggle").addEventListener("click", () => {
      register = !register;
      show();
      main.querySelector("input").focus();
    });
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const submit = form.querySelector('[type="submit"]');
      const toggle = form.querySelector("#auth-toggle");
      submit.disabled = toggle.disabled = true;
      try {
        const { account: signedIn } = await api(register ? "/api/register" : "/api/login", {
          method: "POST", body: Object.fromEntries(new FormData(form))
        });
        setProfile(signedIn);
        if (form.isConnected) {
          const next = history.state?.returnTo;
          location.hash = ["map", "havens", "walk"].includes(next) ? next : "map";
        } else {
          render();
        }
      } catch (error) {
        form.querySelector('[role="status"]').textContent = error.message;
      } finally {
        submit.disabled = toggle.disabled = false;
      }
    });
  }
  show();
}

function havens(profile) {
  const entries = community.havens;
  main.innerHTML = `<div class="content split">
    <section><h1>Safe Havens</h1><p class="muted">A helping hand along the way — pharmacies, shops and security desks where you can find support.</p>
      <div class="list">${entries.length ? entries.map(haven => `
        <article class="entry"><h3>${escapeHtml(haven.name)}</h3><p class="muted">${escapeHtml(haven.type)}${haven.landmark ? " · Near " + escapeHtml(haven.landmark) : ""} · Community listed</p>
        <button class="button secondary" type="button" data-haven="${haven.id}">Walk here →</button></article>`).join("") :
        `<p class="muted">${communityError || "No Safe Havens registered yet in this community."}</p>`}</div>
    </section>
    <aside><h2>Register a haven</h2>
    ${profile ? '<p class="muted">Pin a pharmacy, shop or staffed desk on the map.</p><button class="button" id="pin-haven">Pin a haven →</button>' :
      '<p class="muted"><a class="text-link" href="#auth" data-return="havens">Sign in</a> to register your shop or desk.</p>'}
    </aside>
  </div>`;
  main.querySelector("#pin-haven")?.addEventListener("click", () => {
    streetMap.pickHaven();
    location.hash = "map";
  });
  main.querySelectorAll("[data-haven]").forEach(button => button.addEventListener("click", () => {
    const haven = entries.find(entry => entry.id === Number(button.dataset.haven));
    streetMap.setDestination(haven);
    location.hash = "map";
  }));
}

async function render(moveFocus = false) {
  const currentNavigation = ++navigation;
  leavePage?.();
  leavePage = null;
  const hash = location.hash.slice(1);
  const contact = hash.startsWith("check-in/");
  const page = contact ? "walk" : Object.hasOwn(pages, hash) ? hash : "home";
  document.title = page === "home" ? "SafeStride — " + pages.home : pages[page] + " — SafeStride";
  if (contact) {
    header.innerHTML = "";
    leavePage = checkIn.contact(main, hash.slice("check-in/".length), { api });
  } else {
    nav(page, profile);
    if (page === "map" || page === "havens") {
      main.innerHTML = '<p class="content" role="status">Loading community updates…</p>';
      try {
        const data = await api("/api/community");
        if (currentNavigation !== navigation) return;
        community = data;
        communityError = "";
      } catch {
        if (currentNavigation !== navigation) return;
        communityError = "Community updates are unavailable. Reload to try again.";
      }
    }
    if (page === "walk") {
      leavePage = checkIn.owner(main, profile, { api, suggestedMinutes: streetMap.minutes(), escapeHtml });
    } else if (page === "map") {
      leavePage = streetMap.mount(main, { api, profile, community, communityError, refreshCommunity });
    } else {
      ({ home, about, havens, auth })[page](profile);
    }
  }
  if (moveFocus) {
    window.scrollTo(0, 0);
    main.focus({ preventScroll: true });
  }
}

document.addEventListener("click", event => {
  const returnTo = event.target.closest("[data-return]")?.dataset.return;
  if (returnTo) {
    event.preventDefault();
    history.pushState({ returnTo }, "", "#auth");
    render(true);
  }
  if (event.target.closest(".skip")) {
    event.preventDefault();
    main.focus();
  }
});
window.addEventListener("hashchange", () => render(true));
if (location.hash.startsWith("#check-in/")) {
  render();
} else {
  api("/api/session").then(session => setProfile(session.account ?? null)).catch(() => {}).finally(() => render());
}
