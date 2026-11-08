import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import multer from 'multer';
import { Server } from 'socket.io';
import { User, AIMessage } from './models.js';
import { register, login, requireAuth } from './auth.js';

const app = express();
const audioUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: process.env.CLIENT_ORIGIN || '*', methods: ['GET','POST'] } });
app.use(cors({ origin: process.env.CLIENT_ORIGIN || '*'}));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'pin-drive', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' }));
app.post('/api/auth/register', register);
app.post('/api/auth/login', login);
app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: { id: req.user.id, nickname: req.user.nickname, email: req.user.email, settings: req.user.settings } }));

app.get('/api/settings', requireAuth, (req, res) => res.json({ settings: req.user.settings || {} }));
app.put('/api/settings', requireAuth, async (req, res) => {
  const allowed = ['earth', 'weather', 'opacity', 'vehicleId', 'cameraMode', 'route', 'pinSystem'];
  const patch = Object.fromEntries(Object.entries(req.body || {}).filter(([key]) => allowed.includes(key)));
  const user = await User.findByIdAndUpdate(req.user.id, { $set: Object.fromEntries(Object.entries(patch).map(([k,v]) => ['settings.' + k, v])) }, { new: true });
  res.json({ settings: user.settings });
});
app.post('/api/ai/voice', requireAuth, audioUpload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Audio file is required.' });
  if (!process.env.GROQ_API_KEY) return res.status(503).json({ error: 'GROQ_API_KEY is not configured.' });
  try {
    const form = new FormData();
    form.append('file', new Blob([req.file.buffer], { type: req.file.mimetype || 'audio/webm' }), req.file.originalname || 'voice.webm');
    form.append('model', 'whisper-large-v3-turbo');
    form.append('language', 'ru');
    const transcriptResponse = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.GROQ_API_KEY }, body: form });
    const transcriptData = await transcriptResponse.json();
    if (!transcriptResponse.ok) throw new Error(transcriptData.error?.message || 'Transcription failed.');
    const transcript = String(transcriptData.text || '').trim();
    if (!transcript) return res.status(422).json({ error: 'No speech detected.' });
    await AIMessage.create({ userId: req.user.id, role: 'user', content: transcript });
    const chatResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.GROQ_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'openai/gpt-oss-120b', messages: [{ role: 'system', content: 'You are Pin Drive AI. Answer helpfully in the language of the user.' }, { role: 'user', content: transcript }] }) });
    const chatData = await chatResponse.json();
    if (!chatResponse.ok) throw new Error(chatData.error?.message || 'AI response failed.');
    const answer = chatData.choices?.[0]?.message?.content || '';
    await AIMessage.create({ userId: req.user.id, role: 'assistant', content: answer });
    res.json({ transcript, answer });
  } catch (error) { res.status(502).json({ error: error.message }); }
});

app.get('/api/ai/history', requireAuth, async (req, res) => {
  const messages = await AIMessage.find({ userId: req.user.id }).sort({ createdAt: 1 }).limit(200);
  res.json({ messages });
});
app.post('/api/ai/message', requireAuth, async (req, res) => {
  const content = String(req.body.message || '').trim();
  if (!content || content.length > 12000) return res.status(400).json({ error: 'Message is empty or too long.' });
  await AIMessage.create({ userId: req.user.id, role: 'user', content });
  if (!process.env.GROQ_API_KEY) return res.status(503).json({ error: 'AI provider is not configured yet. Add GROQ_API_KEY in Render.' });
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', headers: { Authorization: 'Bearer ' + process.env.GROQ_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'system', content: 'You are Pin Drive AI, a helpful driving-world assistant. Be clear and safety-conscious.' }, { role: 'user', content }], temperature: 0.7 })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'AI provider error');
    const answer = data.choices?.[0]?.message?.content || 'No response.';
    await AIMessage.create({ userId: req.user.id, role: 'assistant', content: answer });
    res.json({ answer });
  } catch (error) { res.status(502).json({ error: error.message }); }
});

app.post('/api/ai/image', requireAuth, async (req, res) => {
  const prompt = String(req.body.prompt || '').trim();
  if (!prompt || prompt.length > 1800) return res.status(400).json({ error: 'Enter an image prompt (max 1800 characters).' });
  if (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_API_TOKEN) return res.status(503).json({ error: 'Cloudflare image generation is not configured.' });
  try {
    const endpoint = 'https://api.cloudflare.com/client/v4/accounts/' + process.env.CLOUDFLARE_ACCOUNT_ID + '/ai/run/@cf/black-forest-labs/flux-1-schnell';
    const r = await fetch(endpoint, { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.CLOUDFLARE_API_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) });
    if (!r.ok) throw new Error('Image provider request failed.');
    const data = await r.json();
    const image = data.result?.image;
    if (!image) throw new Error('Image provider returned no image.');
    await AIMessage.create({ userId: req.user.id, role: 'user', content: '[Image request] ' + prompt });
    res.json({ image: 'data:image/png;base64,' + image });
  } catch (error) { res.status(502).json({ error: error.message }); }
});

app.get('/api/weather', async (req, res) => {
  if (!process.env.OPENWEATHER_API_KEY) return res.status(503).json({ error: 'OPENWEATHER_API_KEY is not configured.' });
  const lat = Number(req.query.lat), lon = Number(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat)>90 || Math.abs(lon)>180) return res.status(400).json({ error: 'Valid lat and lon are required.' });
  try {
    const url = new URL('https://api.openweathermap.org/data/2.5/weather');
    url.searchParams.set('lat', lat); url.searchParams.set('lon', lon); url.searchParams.set('appid', process.env.OPENWEATHER_API_KEY); url.searchParams.set('units', 'metric');
    const r = await fetch(url); const d = await r.json();
    if (!r.ok) return res.status(502).json({ error: d.message || 'Weather provider error.' });
    res.json({ city: d.name, country: d.sys?.country, temperature: d.main?.temp, feels_like: d.main?.feels_like, humidity: d.main?.humidity, description: d.weather?.[0]?.description, icon: d.weather?.[0]?.icon, wind: d.wind?.speed });
  } catch { res.status(502).json({ error: 'Weather service unavailable.' }); }
});

app.get('/api/config', (_req, res) => res.json({ cesiumIonToken: process.env.CESIUM_ION_TOKEN || '', openWeatherConfigured: Boolean(process.env.OPENWEATHER_API_KEY), openWeatherKey: process.env.OPENWEATHER_API_KEY || '' }));
app.get('/api/geocode', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q || q.length > 160) return res.status(400).json({ error: 'Enter a place name or coordinates.' });
  const pair = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (pair) return res.json({ lat: Number(pair[1]), lon: Number(pair[2]), label: q });
  try {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', q); url.searchParams.set('format', 'jsonv2'); url.searchParams.set('limit', '1');
    const r = await fetch(url, { headers: { 'User-Agent': 'PinDrive/1.0 contact: support@pindrive.app' } });
    const data = await r.json();
    if (!data[0]) return res.status(404).json({ error: 'Location not found.' });
    res.json({ lat: Number(data[0].lat), lon: Number(data[0].lon), label: data[0].display_name });
  } catch { res.status(502).json({ error: 'Geocoding service unavailable.' }); }
});

const here = path.dirname(fileURLToPath(import.meta.url));
app.use('/preview', express.static(path.join(here, '../../mobile/dist')));
app.use('/preview', express.static(path.join(here, '../public')));
app.get('/preview', (_req, res) => res.sendFile(path.join(here, '../public/preview.html')));
app.get('/', (_req, res) => res.redirect('/preview'));

const players = new Map();
io.on('connection', socket => {
  socket.on('player:update', data => {
    if (!data || !Number.isFinite(data.lat) || !Number.isFinite(data.lon)) return;
    const player = { id: socket.id, nickname: String(data.nickname || 'Driver').slice(0,24), vehicleId: String(data.vehicleId || 'sedan'), lat: data.lat, lon: data.lon, heading: Number(data.heading) || 0, updatedAt: Date.now() };
    players.set(socket.id, player); socket.broadcast.emit('player:updated', player); socket.emit('players:snapshot', [...players.values()]);
  });
  socket.on('chat:send', data => {
    const message = { id: socket.id, nickname: String(data?.nickname || 'Driver').slice(0,24), text: String(data?.text || '').slice(0,500), at: Date.now() };
    if (message.text) io.emit('chat:message', message);
  });
  socket.on('disconnect', () => { players.delete(socket.id); io.emit('player:left', socket.id); });
});

const port = Number(process.env.PORT || 10000);
try {
  if (process.env.MONGODB_URI) await mongoose.connect(process.env.MONGODB_URI);
  else console.warn('MONGODB_URI is missing; API starts without database.');
} catch (error) { console.error('MongoDB connection failed:', error.message); }
server.listen(port, '0.0.0.0', () => console.log('Pin Drive listening on ' + port));
