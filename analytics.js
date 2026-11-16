import { inject, pageview } from "./vercel-analytics.js";

const publicPaths = new Map([
  ["", "/"],
  ["#home", "/"],
  ["#map", "/map"],
  ["#havens", "/havens"],
  ["#about", "/about"]
]);

let initialized = false;
let previousPath;

function recordPage() {
  const path = publicPaths.get(location.hash);
  if (!path) {
    previousPath = undefined;
    return;
  }
  if (path === previousPath) return;
  previousPath = path;

  if (!initialized) {
    inject({
      mode: "production",
      disableAutoTrack: true,
      beforeSend(event) {
        if (event.type !== "pageview" || !publicPaths.has(location.hash)) return null;
        const url = new URL(event.url, location.origin);
        if (url.origin !== location.origin || url.hash) return null;
        url.search = "";
        return { ...event, url: url.href };
      }
    });
    initialized = true;
  }

  pageview({ route: path, path });
}

window.addEventListener("safesteps:navigate", recordPage);
recordPage();
