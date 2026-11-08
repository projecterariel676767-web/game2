# Pin Drive

Cross-platform driving-world prototype built with Expo / React Native, Cesium, Express, MongoDB and Socket.IO.

## Repository
- `mobile/` — Expo app for Android, iOS and web.
- `server/` — Express API, MongoDB models, Socket.IO presence/chat, and static browser preview.
- `server/public/world.html` — Cesium world scene and draggable Time / Voice / Map / Flag HUD panels.

## Render Web Service
Create a **Web Service** from this repository:
- Runtime: Node
- Branch: `main`
- Root directory: leave empty (repository root)
- Build command: `npm install && npm run build`
- Start command: `npm start`
- Health check path: `/api/health`
- Instance: Free is suitable for initial testing (it may sleep when idle).

Environment variables:
- `MONGODB_URI` — MongoDB Atlas connection string.
- `JWT_SECRET` — long random secret (Render can generate one).
- `CESIUM_ION_TOKEN` — Cesium Ion token for global terrain and OSM 3D buildings.
- `OPENWEATHER_API_KEY` — OpenWeather API key for map overlays and weather details.
- `GROQ_API_KEY` — Groq key for text AI and Whisper transcription.
- `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` — Cloudflare Workers AI image generation.

The app URL is the Render service URL. The Expo app currently uses `https://pin-drive.onrender.com` as its default API URL; if Render assigns a different URL, update `mobile/app.json` `expo.extra.apiUrl` and rebuild the client.

## Local development
1. Node.js 20+.
2. Copy `server/.env.example` to `server/.env` and fill in provider credentials.
3. From repository root run `npm install`.
4. Run `npm run dev`.

## Browser and native
- `/preview` serves the Expo web export after the Render build; if the web export is not present, it falls back to a Cesium-only preview.
- `/preview/world.html` is the standalone Cesium scene.
- Android and iOS packages are built with EAS Build from `mobile/`.
- Windows can use the browser app initially; a packaged Windows desktop client is a separate packaging step.

## Current implementation status
Implemented foundation: registration/login, JWT-protected settings, MongoDB persistence, AI text/history endpoint, Cloudflare image endpoint, Groq Whisper voice endpoint, OpenWeather conditions endpoint, geocoding, Cesium imagery/weather layers, Ion terrain/OSM buildings, route pin, movable HUD panels, and Socket.IO presence/chat server.

The current 20 vehicle choices are catalogue presets linked to the Shuriken Town Vehicles pack. That pack is stylised low-poly rather than photorealistic; individual realistic car GLBs, vehicle physics, true player-car rendering/synchronisation, voice recording UI, and full AI image/voice UI still require follow-up integration. No model or provider asset is claimed to be bundled or licensed until its exact file and licence are verified.

## Vehicle asset source
[Shuriken Studio — Town Vehicles (24 GLB vehicles)](https://shuriken.studio/kits/town-vehicles). The current catalogue links to this collection; the visual style is game-ready low-poly, not photorealistic.
