"use strict";

const checkIn = (() => {
  const copyLink = async input => {
    if (!navigator.clipboard?.writeText) {
      input.select();
      return "Link selected. Use your device’s Copy command.";
    }
    try {
      await navigator.clipboard.writeText(input.value);
      return "Link copied. Send it to your trusted contact.";
    } catch {
      input.select();
      return "Link selected. Use your device’s Copy command.";
    }
  };
  const clock = value => new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(value);
  const fullTime = value => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(value);
  const moment = value => `<time datetime="${new Date(value).toISOString()}" title="${fullTime(value)}">${clock(value)}</time>`;
  const heading = { walking: "Walk in progress", overdue: "Check-in overdue", arrived: "Arrived" };

  function summary(walk) {
    return `<p class="check-state" data-status="${walk.status}">${heading[walk.status]}</p>
      <p class="check-time">${walk.status === "arrived" ? "Checked in at " + moment(walk.arrivedAt) : "Expected check-in by " + moment(walk.dueAt)}</p>`;
  }

  function owner(root, profile, { api, suggestedMinutes, escapeHtml }) {
    const controller = new AbortController();
    root.innerHTML = `<section class="check-shell"><a class="text-link back" href="#map">← Plan a walk</a>
      <h1>Trusted-contact check-in</h1>
      <p class="muted">Tell someone when you expect to arrive and check in when you get there.</p>
      ${profile ? `<div class="check-card" id="check-panel" aria-busy="true">Loading your walk…</div><p class="status check-message" role="status"></p>` :
        '<div class="check-card"><p>Sign in to set up a check-in and share a private link.</p><a class="button" href="#auth" data-return="walk">Sign in</a></div>'}
      </section>`;
    if (!profile) return () => {};
    const panel = root.querySelector("#check-panel");
    const message = root.querySelector(".check-message");
    const eta = Math.min(180, Math.max(1, suggestedMinutes ?? 20));
    let current;
    let timer;
    let busy = false;
    function show(walk) {
      current = walk;
      clearTimeout(timer);
      panel.removeAttribute("aria-busy");
      if (!walk) {
        panel.innerHTML = `<form class="stack" id="start-walk">
          <label>Expected walk time (minutes)<input name="minutes" type="number" min="1" max="180" value="${eta}" required></label>
          <p class="muted">Your contact will see your display name, ETA and check-in status.</p>
          <button type="submit" class="button">Start check-in</button></form>`;
        return;
      }
      const shareUrl = new URL(location.href);
      shareUrl.hash = "check-in/" + walk.token;
      panel.innerHTML = `<div class="check-summary" aria-live="polite">${summary(walk)}</div>
        <div class="stack">
          <label>Private contact link<input id="contact-link" readonly value="${escapeHtml(shareUrl.href).replaceAll('"', "&quot;")}"></label>
          <button type="button" class="button secondary" data-action="copy">Copy contact link</button>
          ${walk.status === "arrived" ? "" : '<button type="button" class="button" data-action="arrive">I’m home</button>'}
          ${walk.status === "arrived" ? '<button type="button" class="button" data-action="new">Start another check-in</button>' : ""}
          <button type="button" class="quiet-button" data-action="close">${walk.status === "arrived" ? "Revoke link" : "End walk and revoke link"}</button>
          <p class="muted">Anyone with this link can view the status until it expires or you revoke it. Your contact can follow updates while the link is open.</p>
        </div>`;
      // Refresh the owner status at the deadline using the server's clock.
      if (walk.status === "walking") {
        timer = setTimeout(async () => {
          try {
            const { walk: latest } = await api("/api/walk", { signal: controller.signal });
            if (busy || controller.signal.aborted) return;
            if (latest && latest.id === current?.id && latest.status === "overdue") {
              current = latest;
              panel.querySelector(".check-summary").innerHTML = summary(latest);
            } else if (latest?.id !== current?.id || latest?.status !== current?.status) {
              show(latest);
            }
          } catch {
            if (!controller.signal.aborted) message.textContent = "Couldn’t refresh walk status. Reload to try again.";
          }
        }, Math.max(1000, walk.dueAt - Date.now() + 1500));
      }
    }
    async function update(path, body, success, focusSelector) {
      if (busy) return;
      busy = true;
      const buttons = [...panel.querySelectorAll("button")];
      buttons.forEach(button => { button.disabled = true; });
      message.textContent = "";
      try {
        const { walk } = await api(path, { method: "POST", body, signal: controller.signal });
        if (controller.signal.aborted) return;
        show(walk);
        message.textContent = success;
        panel.querySelector(focusSelector)?.focus();
      } catch (error) {
        if (!controller.signal.aborted) message.textContent = error.message;
      } finally {
        busy = false;
        buttons.forEach(button => { button.disabled = false; });
      }
    }
    panel.addEventListener("submit", event => {
      event.preventDefault();
      const minutes = Number(new FormData(event.target).get("minutes"));
      update("/api/walk", { minutes }, "Walk started. Share the contact link.", '[data-action="copy"]');
    });
    panel.addEventListener("click", async event => {
      const action = event.target.closest("[data-action]")?.dataset.action;
      if (!action || busy) return;
      if (action === "copy") {
        message.textContent = await copyLink(panel.querySelector("#contact-link"));
        return;
      }
      if (action === "new") {
        show(null);
        panel.querySelector("input")?.focus();
        return;
      }
      if (action === "arrive") {
        update(`/api/walk/${current.id}/arrive`, undefined, "Checked in. Your contact can see that you arrived.", '[data-action="copy"]');
      } else {
        update(`/api/walk/${current.id}/close`, undefined, "Walk link revoked.", "input");
      }
    });
    api("/api/walk", { signal: controller.signal }).then(({ walk }) => {
      if (!controller.signal.aborted) show(walk);
    }).catch(error => {
      if (controller.signal.aborted) return;
      panel.removeAttribute("aria-busy");
      panel.textContent = error.message;
    });
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }

  function contact(root, token, { api }) {
    const controller = new AbortController();
    root.innerHTML = `<section class="check-shell">
      <p class="eyebrow">SAFESTRIDE</p><h1>Walk check-in</h1>
      <div class="check-card" aria-busy="true">
        <h2 id="walker"></h2><div id="contact-status" aria-live="polite">Loading check-in…</div>
        <p id="contact-connection" class="status" role="status"></p>
      </div>
      <p class="muted">This page refreshes while open. If a check-in is late, contact the walker directly.</p>
    </section>`;
    const panel = root.querySelector(".check-card");
    const walker = root.querySelector("#walker");
    const status = root.querySelector("#contact-status");
    const connection = root.querySelector("#contact-connection");
    let timer;
    let last;
    async function refresh() {
      try {
        const walk = await api("/api/contact", { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
        if (controller.signal.aborted) return;
        panel.removeAttribute("aria-busy");
        walker.textContent = walk.displayName;
        if (last !== walk.status) {
          last = walk.status;
          status.innerHTML = summary(walk);
        }
        connection.textContent = "";
      } catch (error) {
        if (controller.signal.aborted) return;
        panel.removeAttribute("aria-busy");
        if (error.status === 404) {
          walker.textContent = "";
          status.textContent = error.message;
          connection.textContent = "";
          return;
        }
        connection.textContent = last ? "Connection lost. The status shown may be out of date." : "Couldn’t load the status. Retrying…";
      }
      timer = setTimeout(refresh, 4000);
    }
    if (/^[a-f0-9]{64}$/.test(token)) {
      refresh();
    } else {
      panel.removeAttribute("aria-busy");
      status.textContent = "This check-in link is invalid.";
    }
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }

  return { owner, contact };
})();
