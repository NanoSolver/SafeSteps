"use strict";

const streetMap = (() => {
  const centre = [12.9766, 77.6034];
  const endpoints = { from: null, to: null };
  let routes = [];
  let selected = 0;
  let mapView;
  let pendingPicker;
  let loadingLeaflet;
  const position = point => [point.lat, point.lon];
  const coordinates = point => `${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}`;
  const labels = { from: "Starting point", to: "Destination", report: "Hazard location", haven: "Haven location" };
  const distance = metres => metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${metres} m`;

  function setDestination(point) {
    endpoints.to = { ...point, label: point.name };
    routes = [];
    mapView = { centre: position(point), zoom: 17 };
  }

  function leaflet() {
    if (loadingLeaflet) return loadingLeaflet;
    const prefix = "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/";
    const script = document.createElement("script");
    script.src = prefix + "leaflet.js";
    script.integrity = "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=";
    script.crossOrigin = "anonymous";
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = prefix + "leaflet.css";
    css.integrity = "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=";
    css.crossOrigin = "anonymous";
    loadingLeaflet = Promise.all([css, script].map(element => new Promise((resolve, reject) => {
      element.addEventListener("load", resolve, { once: true });
      element.addEventListener("error", reject, { once: true });
      document.head.append(element);
    }))).then(() => window.L).catch(() => {
      script.remove();
      css.remove();
      loadingLeaflet = null;
      throw new Error("The street map couldn’t load. Check your connection and reopen this page.");
    });
    return loadingLeaflet;
  }

  function mount(root, { api, profile, community, communityError, refreshCommunity }) {
    const page = new AbortController();
    let map;
    let L;
    let lines;
    let pins;
    let reports;
    let havens;
    let picker;
    let draft;
    let routeRequest;
    let searchRequest;
    let searchKey;
    let locateVersion = 0;
    const inputs = {};
    const tools = {};

    root.innerHTML = `<section class="walk-layout">
      <div class="map-stage">
        <div id="street-map" class="street-map" aria-label="Interactive street map"></div>
        <div id="map-loading" class="map-feedback" role="status">Loading street map…</div>
        <div id="pin-instruction" class="map-instruction" hidden><span></span><button type="button" class="plain-control" id="cancel-pin">Cancel</button></div>
      </div>
      <aside class="directions">
        <div class="directions-head"><span class="walk-icon" aria-hidden="true">↗</span><div><h1>Plan a walk</h1><p>Walking directions</p></div></div>
        <div class="map-form">
          ${["from", "to"].map((key, i) => `<form class="address-row" data-address="${key}">
            <span class="waypoint-icon ${key}" aria-hidden="true">${i ? "B" : "A"}</span>
            <label class="sr-only" for="address-${key}">${labels[key]}</label>
            <input id="address-${key}" name="query" placeholder="${key === "from" ? "Choose starting point" : "Search for a destination"}" maxlength="160" autocomplete="off">
            <button class="plain-control search-control" type="submit" aria-label="Search for ${labels[key].toLowerCase()}">Search</button>
          </form>`).join("")}
          <div class="map-actions">
            <button type="button" class="plain-control" id="locate">◎ My location</button>
            <button type="button" class="plain-control" data-pin="from" aria-pressed="false">Pin start</button>
            <button type="button" class="plain-control" data-pin="to" aria-pressed="false">Pin destination</button>
            <button type="button" class="plain-control" id="swap" aria-label="Swap start and destination">⇅ Swap</button>
          </div>
          <p class="map-privacy">Searches and route points go to our map providers. You can also use a nearby public landmark.</p>
          <div id="search-results"></div>
          <button type="button" class="button directions-button" id="find-walk">Find walking routes</button>
          <p id="map-status" class="status" role="status"></p>
        </div>
        <div id="walking-results" class="walking-results" aria-live="polite"></div>
        <section class="map-community">
          <h2>Along the way</h2>
          <div class="map-actions">
            <label class="map-toggle"><input type="checkbox" id="show-reports" checked>Hazards</label>
            <label class="map-toggle"><input type="checkbox" id="show-havens" checked>Community havens</label>
          </div>
          ${profile ? `<div class="map-actions"><button type="button" class="plain-control" data-pin="report" aria-pressed="false">Report a hazard</button>
            <button type="button" class="plain-control" data-pin="haven" aria-pressed="false">Pin a haven</button></div>` :
            '<p class="muted"><a class="text-link" href="#auth" data-return="map">Sign in</a> to add a report or a haven.</p>'}
          <div id="pin-form"></div>
          <p id="community-status" class="status" role="status"></p>
        </section>
        <p class="map-footnote"><a href="https://routing.openstreetmap.de/about.html" target="_blank" rel="noopener">Walking data</a> · <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener">Report a map issue</a></p>
      </aside>
    </section>`;

    const get = selector => root.querySelector(selector);
    const status = get("#map-status");
    const searchResults = get("#search-results");
    const walkingResults = get("#walking-results");
    const walkingButton = get("#find-walk");
    const mapLoading = get("#map-loading");
    const instruction = get("#pin-instruction");
    const communityStatus = get("#community-status");
    const pinForm = get("#pin-form");
    communityStatus.textContent = communityError;
    for (const key of ["from", "to"]) {
      inputs[key] = get("#address-" + key);
      tools[key] = get(`[data-address="${key}"] button`);
      inputs[key].value = endpoints[key]?.label ?? "";
    }

    function stopSearch() {
      searchRequest?.abort();
      searchRequest = null;
      if (searchKey) tools[searchKey].disabled = false;
      searchResults.replaceChildren();
    }

    function clearRoute() {
      routeRequest?.abort();
      routeRequest = null;
      walkingButton.disabled = false;
      routes = [];
      selected = 0;
      showRoutes();
    }

    function setPoint(key, point, moveMap = false) {
      if (key === "from") locateVersion++;
      endpoints[key] = point;
      inputs[key].value = point.label;
      clearRoute();
      paintPins();
      if (moveMap) focusPoints(point);
      status.textContent = "";
    }

    function focusPoints(point) {
      if (!map) {
        mapView = { centre: position(point), zoom: 17 };
        return;
      }
      if (endpoints.from && endpoints.to) {
        map.fitBounds([position(endpoints.from), position(endpoints.to)], { padding: [48, 48], maxZoom: 17 });
      } else {
        map.setView(position(point), 17);
      }
    }

    function togglePicker(key) {
      picker = key;
      if (key) stopSearch();
      instruction.hidden = !key;
      instruction.querySelector("span").textContent = key ? "Tap the map to choose " + (key === "from" ? "a starting point" : key === "to" ? "a destination" : "the " + labels[key].toLowerCase()) + "." : "";
      root.querySelectorAll("[data-pin]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.pin === key)));
      get(".map-stage").classList.toggle("is-picking", Boolean(key));
      if (key && window.matchMedia("(max-width: 760px)").matches) get(".map-stage").scrollIntoView({ block: "start" });
    }

    function pinIcon(type, letter) {
      return L.divIcon({
        className: "street-marker " + type,
        html: `<span aria-hidden="true"><b>${letter}</b></span>`, iconSize: [30, 34], iconAnchor: [15, 31], popupAnchor: [0, -29]
      });
    }

    function paintPins() {
      if (!map) return;
      pins.clearLayers();
      for (const [index, key] of ["from", "to"].entries()) {
        const point = endpoints[key];
        if (!point) continue;
        const marker = L.marker(position(point), { icon: pinIcon(key, index ? "B" : "A"), title: labels[key], draggable: true }).addTo(pins);
        marker.on("dragend", () => {
          const { lat, lng: lon } = marker.getLatLng().wrap();
          status.textContent = "";
          setPoint(key, { lat, lon, label: coordinates({ lat, lon }) });
        });
      }
      if (draft) L.marker(position(draft), { icon: pinIcon(draft.type, draft.type === "report" ? "!" : "+"), title: labels[draft.type] }).addTo(pins);
    }

    function showRoutes() {
      if (lines) {
        lines.clearLayers();
        routes.forEach((route, i) => {
          if (i === selected) return;
          L.polyline(route.shape, { color: "#758cb1", opacity: .85, weight: 5 }).addTo(lines).on("click", () => selectRoute(i));
        });
        if (routes[selected]) {
          L.polyline(routes[selected].shape, { color: "white", weight: 10, interactive: false }).addTo(lines);
          L.polyline(routes[selected].shape, { color: "#2964df", weight: 6, interactive: false }).addTo(lines);
        }
      }
      walkingResults.innerHTML = routes.length ? `<h2>Walking routes</h2>
        <div class="walking-cards">${routes.map((route, i) => `<button type="button" class="walking-card" data-route="${i}" aria-pressed="${selected === i}">
          <span>${i === 0 ? "Fastest" : "Alternate " + i}</span><strong>${route.minutes} min</strong><span>${distance(route.metres)}</span>
        </button>`).join("")}</div>
        <p class="muted">Lighting and step-free access are unverified.</p>
        <a class="button secondary" href="#walk">Set up a check-in →</a>` : "";
    }

    function selectRoute(index, focus = false) {
      if (!routes[index]) return;
      selected = index;
      showRoutes();
      if (focus) get(`[data-route="${index}"]`)?.focus();
    }

    function fitRoute() {
      if (!map || !routes.length) return;
      const bounds = L.latLngBounds(routes.flatMap(route => route.shape));
      for (const point of Object.values(endpoints)) if (point) bounds.extend(position(point));
      map.fitBounds(bounds, { padding: [42, 42], maxZoom: 18 });
    }

    function showSearch(key, results) {
      searchResults.replaceChildren();
      if (!results.length) {
        status.textContent = "No matches. Add a city to your search or drop a pin.";
        return;
      }
      const list = document.createElement("ul");
      list.className = "search-list";
      list.setAttribute("aria-label", labels[key] + " search results");
      for (const point of results) {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        const label = document.createElement("strong");
        label.textContent = point.label;
        button.append(label);
        if (point.detail) {
          const detail = document.createElement("span");
          detail.textContent = point.detail;
          button.append(detail);
        }
        button.addEventListener("click", () => {
          setPoint(key, point, true);
          stopSearch();
          (key === "from" && !endpoints.to ? inputs.to : walkingButton).focus();
        });
        item.append(button);
        list.append(item);
      }
      searchResults.append(list);
      status.textContent = `${results.length} ${results.length === 1 ? "match" : "matches"}. Choose a result.`;
    }

    for (const key of ["from", "to"]) {
      inputs[key].addEventListener("input", () => {
        if (key === "from") locateVersion++;
        stopSearch();
        if (endpoints[key]) {
          endpoints[key] = null;
          clearRoute();
          paintPins();
        }
        status.textContent = "";
      });
      get(`[data-address="${key}"]`).addEventListener("submit", async event => {
        event.preventDefault();
        togglePicker(null);
        stopSearch();
        const query = inputs[key].value.trim();
        const pair = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/.exec(query);
        if (pair) {
          const [, lat, lon] = pair.map(Number);
          if (Math.abs(lat) > 85.05112878 || Math.abs(lon) > 180) {
            status.textContent = "Those coordinates are outside the map.";
          } else {
            setPoint(key, { lat, lon, label: query }, true);
          }
          return;
        }
        if (query.length < 2) {
          status.textContent = "Enter an address or place name.";
          return;
        }
        const view = map?.getCenter().wrap();
        const near = view ? { lat: view.lat, lon: view.lng } : { lat: centre[0], lon: centre[1] };
        const controller = new AbortController();
        searchRequest = controller;
        searchKey = key;
        tools[key].disabled = true;
        status.textContent = "Searching…";
        try {
          const { results } = await api("/api/map/search", { method: "POST", body: { query, near }, signal: controller.signal });
          if (!controller.signal.aborted) showSearch(key, results);
        } catch (error) {
          if (!controller.signal.aborted) status.textContent = error.message;
        } finally {
          if (searchRequest === controller) tools[key].disabled = false;
        }
      });
    }

    walkingButton.addEventListener("click", async () => {
      if (!endpoints.from || !endpoints.to) {
        status.textContent = "Select a starting point and destination from search results or drop pins.";
        inputs[endpoints.from ? "to" : "from"].focus();
        return;
      }
      stopSearch();
      clearRoute();
      const controller = new AbortController();
      routeRequest = controller;
      walkingButton.disabled = true;
      status.textContent = "Finding walking routes…";
      try {
        const { routes: found } = await api("/api/map/walk", { method: "POST", body: endpoints, signal: controller.signal });
        if (controller.signal.aborted) return;
        routes = found;
        selected = 0;
        showRoutes();
        fitRoute();
        status.textContent = "";
      } catch (error) {
        if (!controller.signal.aborted) status.textContent = error.message;
      } finally {
        if (routeRequest === controller) walkingButton.disabled = false;
      }
    });
    walkingResults.addEventListener("click", event => {
      const button = event.target.closest("[data-route]");
      if (button) selectRoute(Number(button.dataset.route), true);
    });

    get("#locate").addEventListener("click", () => {
      if (!navigator.geolocation) {
        status.textContent = "Location is unavailable. Search for your start or drop a pin.";
        return;
      }
      stopSearch();
      togglePicker(null);
      const version = ++locateVersion;
      status.textContent = "Finding your location…";
      navigator.geolocation.getCurrentPosition(({ coords }) => {
        if (page.signal.aborted || version !== locateVersion) return;
        setPoint("from", { lat: coords.latitude, lon: coords.longitude, label: "My location" }, true);
      }, () => {
        if (!page.signal.aborted && version === locateVersion) status.textContent = "Couldn’t get your location. Check permissions, search for your start or drop a pin.";
      }, { timeout: 8000 });
    });
    get("#swap").addEventListener("click", () => {
      locateVersion++;
      stopSearch();
      [endpoints.from, endpoints.to] = [endpoints.to, endpoints.from];
      for (const key of ["from", "to"]) inputs[key].value = endpoints[key]?.label ?? "";
      clearRoute();
      paintPins();
      status.textContent = "";
    });

    root.querySelectorAll("[data-pin]").forEach(button => button.addEventListener("click", () => {
      togglePicker(picker === button.dataset.pin ? null : button.dataset.pin);
    }));
    get("#cancel-pin").addEventListener("click", () => togglePicker(null));

    function showDraft() {
      pinForm.replaceChildren();
      if (!draft) return;
      const form = document.createElement("form");
      form.className = "stack map-pin-form";
      const report = draft.type === "report";
      const categories = report ? ["Broken streetlight", "Blocked ramp", "Damaged pavement", "Other hazard"] :
        ["Security desk", "Pharmacy", "Shop", "Other"];
      form.innerHTML = `<h3>${report ? "Report this location" : "Register this haven"}</h3>
        <p class="muted">${coordinates(draft)} · This pin will be public.</p>
        ${report ? "" : '<label>Place name<input name="name" maxlength="70" required></label>'}
        <label>Category<select name="type">${categories.map(category => `<option>${category}</option>`).join("")}</select></label>
        <button class="button" type="submit">${report ? "Post hazard report" : "Register haven"}</button>
        <button type="button" class="quiet-button">Cancel</button>`;
      form.querySelector(".quiet-button").addEventListener("click", () => {
        draft = null;
        showDraft();
        paintPins();
      });
      const { lat, lon } = draft;
      form.addEventListener("submit", async event => {
        event.preventDefault();
        const submit = form.querySelector('[type="submit"]');
        submit.disabled = true;
        try {
          await api(report ? "/api/reports" : "/api/havens", { method: "POST",
            body: { ...Object.fromEntries(new FormData(form)), lat, lon }, signal: page.signal });
          if (page.signal.aborted) return;
          draft = null;
          showDraft();
          paintPins();
          community = await refreshCommunity();
          if (page.signal.aborted) return;
          paintCommunity();
          communityStatus.textContent = report ? "Hazard added to the map." : "Haven added to the map.";
        } catch (error) {
          if (!page.signal.aborted) communityStatus.textContent = error.message;
        } finally {
          submit.disabled = false;
        }
      });
      pinForm.append(form);
      form.scrollIntoView({ block: "nearest" });
      form.querySelector("input, select").focus({ preventScroll: true });
    }

    function paintCommunity() {
      if (!map) return;
      reports.clearLayers();
      havens.clearLayers();
      for (const [items, layer, kind] of [[community.reports, reports, "report"], [community.havens, havens, "haven"]]) {
        for (const entry of items) {
          if (!Number.isFinite(entry.lat) || !Number.isFinite(entry.lon)) continue;
          const title = entry.name ?? entry.type;
          const popup = document.createElement("div");
          popup.className = "street-popup";
          const name = document.createElement("strong");
          name.textContent = title;
          const detail = document.createElement("p");
          detail.textContent = kind === "report" ?
            `Reported ${new Date(entry.createdAt).toLocaleDateString()} · ${entry.confirmations} confirmations` :
            `${entry.type} · Community listed`;
          popup.append(name, detail);
          if (kind === "haven" || (profile && !entry.confirmed && !entry.own)) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "plain-control";
            button.textContent = kind === "haven" ? "Set as destination" : "Confirm report";
            button.addEventListener("click", async () => {
              if (kind === "haven") {
                setPoint("to", { ...entry, label: title }, true);
                map.closePopup();
                return;
              }
              button.disabled = true;
              try {
                await api(`/api/reports/${entry.id}/confirm`, { method: "POST", signal: page.signal });
                community = await refreshCommunity();
                if (!page.signal.aborted) {
                  paintCommunity();
                  communityStatus.textContent = "Report confirmed.";
                }
              } catch (error) {
                if (!page.signal.aborted) communityStatus.textContent = error.message;
              } finally {
                button.disabled = false;
              }
            });
            popup.append(button);
          }
          L.marker(position(entry), { title, icon: pinIcon(kind, kind === "report" ? "!" : "+") }).bindPopup(popup).addTo(layer);
        }
      }
    }

    for (const [selector, layer] of [["#show-reports", () => reports], ["#show-havens", () => havens]]) {
      const checkbox = get(selector);
      checkbox.addEventListener("change", () => {
        if (!map) return;
        if (checkbox.checked) layer().addTo(map);
        else layer().remove();
      });
    }

    showRoutes();
    if (pendingPicker && profile) togglePicker(pendingPicker);
    pendingPicker = null;
    leaflet().then(library => {
      if (page.signal.aborted) return;
      L = library;
      map = L.map(get("#street-map"), { zoomControl: false, minZoom: 2, maxZoom: 19 }).setView(mapView?.centre ?? centre, mapView?.zoom ?? 14);
      L.control.zoom({ position: "topright" }).addTo(map);
      const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        referrerPolicy: "strict-origin-when-cross-origin"
      });
      tiles.on("tileload", () => { mapLoading.hidden = true; });
      tiles.on("tileerror", () => {
        if (!mapLoading.hidden) mapLoading.textContent = "Map tiles are unavailable. You can still search for directions.";
      });
      tiles.addTo(map);
      lines = L.layerGroup().addTo(map);
      reports = L.layerGroup();
      havens = L.layerGroup();
      if (get("#show-reports").checked) reports.addTo(map);
      if (get("#show-havens").checked) havens.addTo(map);
      pins = L.layerGroup().addTo(map);
      map.on("click", ({ latlng }) => {
        const mode = picker || (!endpoints.from ? "from" : !endpoints.to ? "to" : null);
        if (!mode) return;
        const { lat, lng: lon } = latlng.wrap();
        const point = { lat, lon };
        togglePicker(null);
        if (mode === "from" || mode === "to") {
          setPoint(mode, { ...point, label: coordinates(point) });
        } else {
          draft = { ...point, type: mode };
          paintPins();
          showDraft();
        }
      });
      paintPins();
      paintCommunity();
      showRoutes();
      if (routes.length) fitRoute();
    }).catch(error => {
      if (!page.signal.aborted) mapLoading.textContent = error.message;
    });
    const resize = new ResizeObserver(() => map?.invalidateSize({ pan: false }));
    resize.observe(get(".map-stage"));
    return () => {
      page.abort();
      routeRequest?.abort();
      searchRequest?.abort();
      resize.disconnect();
      if (map) {
        mapView = { centre: map.getCenter(), zoom: map.getZoom() };
        map.remove();
      }
    };
  }

  return { mount, setDestination, pickHaven: () => { pendingPicker = "haven"; }, minutes: () => routes[selected]?.minutes };
})();
