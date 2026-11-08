# Pin Drive — cross-platform driving world

Pin Drive is a React Native + Expo game for Android, iOS, Windows (web/desktop wrapper) and browser preview. The first milestone establishes the Expo client, Cesium world view, Express/MongoDB API, Socket.IO multiplayer, saved player settings, and Render deployment.

## Repository layout
- `mobile/` — Expo React Native app (Android/iOS/web).
- `server/` — Express API, MongoDB persistence, Socket.IO multiplayer, and web preview hosting.

## Local development
1. Install Node.js 20+.
2. Copy `server/.env.example` to `server/.env` and configure MongoDB and provider keys.
3. `npm install`
4. `npm run dev`

## Render Web Service
- Root directory: repository root
- Build command: `npm install && npm run build`
- Start command: `npm start`
- Health check path: `/api/health`

Set `MONGODB_URI`, `JWT_SECRET`, `CESIUM_ION_TOKEN`, `OPENWEATHER_API_KEY`, and (when enabling AI) `GROQ_API_KEY` and `CLOUDFLARE_*` in Render Environment.

## Important
The browser route `/preview` serves the same Expo web client. Native builds are produced with EAS Build. The 3D world uses Cesium inside a WebView on native platforms and directly in the browser on web. Real-time multiplayer requires Socket.IO over the Render service.
