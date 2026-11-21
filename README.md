# SafeStride

SafeStride is a college prototype for planning local walks and checking in with a trusted contact. The frontend uses HTML, CSS and JavaScript. Node.js serves the site and JSON API, and SQLite stores accounts, check-ins, reports and havens.

## Run it

Use Node.js 24 LTS. From this folder, run:

```powershell
node server.js
```

Open [SafeStride on localhost](http://127.0.0.1:8765/). No package installation is required. The database is created in `.safestride/` and persists across restarts.

## Demo the check-in

1. Create an account. In **Plan a walk**, search for **Cubbon Park Bengaluru** and **MG Road Metro**, or drop two pins. Choose **Find walking routes** and then **Set up a check-in**. You can also go directly to **Check-in**.
2. Choose an ETA and start the check-in. Copy the private link and open it in a second browser window or an incognito tab. The contact does not need an account.
3. With a one-minute ETA, leave the contact view open and let it reach **Check-in overdue**. Then tap **I’m home** in the walker’s window. The contact view updates within one polling interval (about four seconds while active).
4. Revoke the link to end access. Links also expire 24 hours after the ETA. The link shares the walker’s display name, ETA and status. It omits coordinates and street addresses.

For a class demo on two devices, run the server on a trusted local network with `$env:SAFESTRIDE_HOST = '0.0.0.0'` before starting it. Open the site on both devices using the host computer’s LAN IP and port 8765. Create and copy the link from that LAN URL so the second device can reach it. Use demo credentials over local HTTP. For an internet-accessible deployment, use HTTPS end to end from the browser to the public origin and set `SAFESTRIDE_SECURE_COOKIE=1` behind the TLS proxy.

## Password recovery

After creating an account, save a recovery code from **Account → Password recovery**.
Existing users can sign in and open **Account** to generate one. Confirming the current
password is required; generating a new code replaces the old one. Store the code in
a password manager. The database stores only its hash.

Use **Forgot password?** on the sign-in screen with your username, saved code and a new
password. A successful reset consumes the code and signs out every existing session.
Sign in again and generate a replacement code. This flow does not send email; accounts
without a previously saved code cannot recover a forgotten password through this flow.
Authentication throttling is per running server instance, so production deployments
should also apply shared rate limits at the hosting layer.

## Community data

Signed-in users can pin hazards and havens anywhere and confirm someone else’s report once. Results are available on the same server across browsers. Existing SQLite records pinned to landmarks still appear at their original coordinates. Community listings, route lighting and step-free access are unverified.

## Street map

The map needs internet access. Leaflet displays attributed OpenStreetMap tiles. Search requests go to the Photon demo geocoder, and route coordinates go to the FOSSGIS pedestrian router. These public services are for light demo use and do not guarantee availability. Place suggestions appear after two characters and a short typing pause, with requests spaced at least 1.2 seconds apart in the browser. Search text is sent to the provider as you type. Arrow Down moves into suggestions, arrow keys move between them, Enter selects, and Escape dismisses. The server also limits each upstream service to about one request per second. Set `SAFESTRIDE_GEOCODER` or `SAFESTRIDE_ROUTER` to replace those endpoints with Photon- and OSRM-compatible services.

## Deploy on Vercel

1. In Turso, create a database and generate a write-capable database token. The app creates its tables on first use.
2. In the Vercel project, add `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` under **Settings → Environment Variables** for the environment being deployed. Keep the token in Vercel.
3. Deploy from the repository root. `vercel.json` configures the build output and rewrites `/api/*` to a Node.js function. `package.json` pins Node.js 24.
4. Verify the hosted home page, then create a demo account and open a check-in link in a separate browser session.

The Vercel database starts empty. Local SQLite data remains in `.safestride/`. Deployments missing the database settings can serve the site and map routes. Storage endpoints return HTTP 503 until the database is connected.

The contact page provides status updates while it is open. SMS, push and background notification delivery are outside this local implementation.

## Tests

```powershell
npm test
```
