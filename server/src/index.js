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
const corsOptions = { origin: true, methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'], optionsSuccessStatus: 204 };
const io = new Server(server, { cors: corsOptions, transports: ['polling','websocket'], pingInterval: 25000, pingTimeout: 60000, connectTimeout: 30000, upgradeTimeout: 30000, maxHttpBufferSize: 8e6 });
// Reflect the requesting web origin (no cookies/credentials are used by this API).
// This avoids stale CLIENT_ORIGIN settings blocking the /preview host.
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(express.json({ limit: '1mb' }));
app.get('/favicon.ico', (_req, res) => res.status(204).end());

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
      body: JSON.stringify({ model: 'openai/gpt-oss-120b', messages: [{ role: 'system', content: 'You are Pin Drive AI, a helpful driving-world assistant. Be clear and safety-conscious.' }, { role: 'user', content }], temperature: 0.7 })
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
    await AIMessage.create({ userId: req.user.id, role: 'assistant', content: '[Image generated] ' + prompt });
    res.json({ image: 'data:image/png;base64,' + image });
  } catch (error) { res.status(502).json({ error: error.message }); }
});

// Server-side geodata proxy: keeps third-party requests out of the browser (CORS-safe).
const geoCache = new Map();
app.get('/api/geocode/reverse', async (req, res) => {
  const lat=Number(req.query.lat),lon=Number(req.query.lon);
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)return res.status(400).json({error:'Valid lat and lon are required.'});
  const key='reverse:'+lat.toFixed(4)+':'+lon.toFixed(4),cached=geoCache.get(key);
  if(cached&&cached.expires>Date.now())return res.json(cached.data);
  let lastError;
  try{
    const url=new URL('https://photon.komoot.io/reverse');url.searchParams.set('lat',lat);url.searchParams.set('lon',lon);
    const r=await fetch(url,{headers:{'User-Agent':'PinDrive/1.0'},signal:AbortSignal.timeout(12000)});
    if(!r.ok)throw new Error('Photon HTTP '+r.status);
    const d=await r.json(),p=d.features?.[0]?.properties||{};
    if(p.countrycode){const result={countryCode:String(p.countrycode).toUpperCase(),countryName:p.country||'',city:p.city||p.town||p.village||'',locality:p.district||p.suburb||p.city||p.town||''};geoCache.set(key,{data:result,expires:Date.now()+21600000});return res.json(result)}
    throw new Error('Photon returned no country');
  }catch(e){lastError=e;console.warn('Photon reverse geocode failed:',e.message)}
  try{
    const url=new URL('https://nominatim.openstreetmap.org/reverse');url.searchParams.set('lat',lat);url.searchParams.set('lon',lon);url.searchParams.set('format','jsonv2');
    const r=await fetch(url,{headers:{'User-Agent':'PinDrive/1.0 contact: support'},signal:AbortSignal.timeout(12000)});
    if(!r.ok)throw new Error('Nominatim HTTP '+r.status);
    const d=await r.json(),a=d.address||{},result={countryCode:String(a.country_code||'').toUpperCase(),countryName:a.country||'',city:a.city||a.town||a.village||a.hamlet||'',locality:a.suburb||a.neighbourhood||a.city||a.town||''};
    if(!result.countryCode)throw new Error('Nominatim returned no country');
    geoCache.set(key,{data:result,expires:Date.now()+21600000});return res.json(result);
  }catch(e){lastError=e;console.error('Reverse geocoding providers failed:',e.message);return res.status(502).json({error:'Reverse geocoding providers unavailable.',detail:lastError.message})}
});

app.get('/api/buildings', async (req,res)=>{
  const lat=Number(req.query.lat),lon=Number(req.query.lon);
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)return res.status(400).json({error:'Valid lat and lon are required.'});
  const south=lat-.004,west=lon-.005,north=lat+.004,east=lon+.005,key='buildings:'+lat.toFixed(3)+':'+lon.toFixed(3),cached=geoCache.get(key);
  if(cached&&cached.expires>Date.now())return res.json(cached.data);
  const query='[out:json][timeout:20];(way["building"]('+south+','+west+','+north+','+east+'););out body geom;';
  const endpoints=['https://overpass-api.de/api/interpreter','https://overpass.private.coffee/api/interpreter','https://overpass.kumi.systems/api/interpreter','https://overpass.nchc.org.tw/api/interpreter'];
  let lastError;
  for(const endpoint of endpoints){
    try{
      let r=await fetch(endpoint+'?data='+encodeURIComponent(query),{headers:{'User-Agent':'PinDrive/1.0'},signal:AbortSignal.timeout(18000)});
      if(!r.ok)r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8','User-Agent':'PinDrive/1.0'},body:'data='+encodeURIComponent(query),signal:AbortSignal.timeout(18000)});
      if(!r.ok)throw new Error('Overpass HTTP '+r.status);
      const data=await r.json();geoCache.set(key,{data,expires:Date.now()+1800000});return res.json(data);
    }catch(e){lastError=e;console.warn('Overpass provider failed:',endpoint,e.message)}
  }
  console.error('All building providers failed:',lastError?.message);
  res.status(502).json({error:'Building data providers unavailable.',detail:lastError?.message||'Unknown provider error'});
});

app.get('/api/weather', async (req, res) => {
  const lat=Number(req.query.lat),lon=Number(req.query.lon);
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)return res.status(400).json({error:'Valid lat and lon are required.'});
  let providerError='';
  if(process.env.OPENWEATHER_API_KEY){
    try{
      const url=new URL('https://api.openweathermap.org/data/2.5/weather');
      url.searchParams.set('lat',lat);url.searchParams.set('lon',lon);url.searchParams.set('appid',process.env.OPENWEATHER_API_KEY);url.searchParams.set('units','metric');
      const r=await fetch(url,{signal:AbortSignal.timeout(10000)}),d=await r.json();
      if(r.ok)return res.json({city:d.name||'Open ocean',country:d.sys?.country||'',temperature:d.main?.temp,feels_like:d.main?.feels_like,humidity:d.main?.humidity,description:d.weather?.[0]?.description||'Current conditions',icon:d.weather?.[0]?.icon,wind:d.wind?.speed});
      providerError='OpenWeather HTTP '+r.status+': '+(d.message||'provider error');
      console.warn(providerError);
    }catch(e){providerError='OpenWeather: '+e.message;console.warn(providerError)}
  }else providerError='OPENWEATHER_API_KEY is not configured';
  try{
    const url=new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude',lat);url.searchParams.set('longitude',lon);url.searchParams.set('current','temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m');url.searchParams.set('timezone','auto');
    const r=await fetch(url,{signal:AbortSignal.timeout(10000)}),d=await r.json();
    if(!r.ok||!d.current)throw new Error('Open-Meteo HTTP '+r.status);
    const c=d.current,code=Number(c.weather_code),description=code===0?'clear sky':code<=3?'partly cloudy':code<=48?'fog':code<=67?'rain':code<=77?'snow':code<=82?'rain showers':code<=86?'snow showers':code<=99?'thunderstorm':'weather conditions';
    return res.json({city:'Local area',country:'',temperature:c.temperature_2m,feels_like:c.apparent_temperature,humidity:c.relative_humidity_2m,description,wind:c.wind_speed_10m,source:'Open-Meteo',fallback:true,providerWarning:providerError});
  }catch(e){console.error('All weather providers failed:',providerError,e.message);return res.status(502).json({error:'Weather providers unavailable.',detail:e.message,primary:providerError})}
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
    const r = await fetch(url, { headers: { 'User-Agent': 'PinDrive/1.0' } });
    const data = await r.json();
    if (!data[0]) return res.status(404).json({ error: 'Location not found.' });
    res.json({ lat: Number(data[0].lat), lon: Number(data[0].lon), label: data[0].display_name });
  } catch { res.status(502).json({ error: 'Geocoding service unavailable.' }); }
});

const here = path.dirname(fileURLToPath(import.meta.url));
const webExport = path.join(here, '../../mobile/dist');
// Expo's web export emits root-absolute /_expo and /assets URLs. The app itself
// is mounted under /preview, so expose those generated assets at the root too.
app.use('/_expo', express.static(path.join(webExport, '_expo'), { fallthrough: true, maxAge: '1h' }));
app.use('/assets', express.static(path.join(webExport, 'assets'), { fallthrough: true, maxAge: '1h' }));
app.use('/preview', express.static(webExport));
app.use('/preview', express.static(path.join(here, '../public')));
app.get('/preview', (_req, res) => res.sendFile(path.join(here, '../public/preview.html')));
app.get('/', (_req, res) => res.redirect('/preview'));

const players = new Map();
const voiceListeners = new Set();
io.on('connection', socket => {
  socket.emit('players:snapshot', [...players.values()]);
  socket.on('player:update', data => {
    if (!data || !Number.isFinite(Number(data.lat)) || !Number.isFinite(Number(data.lon))) return;
    const player = { id: socket.id, nickname: String(data.nickname || 'Driver').slice(0,24), vehicleId: String(data.vehicleId || 'sports-coupe'), lat: Number(data.lat), lon: Number(data.lon), heading: Number(data.heading) || 0, updatedAt: Date.now() };
    players.set(socket.id, player); socket.broadcast.emit('player:updated', player); socket.emit('players:snapshot', [...players.values()]);
  });
  socket.on('chat:send', data => {
    const message = { id: socket.id, nickname: String(data?.nickname || 'Driver').slice(0,24), text: String(data?.text || '').slice(0,500), at: Date.now() };
    if (message.text) io.emit('chat:message', message);
  });
  socket.on('voice:listen', enabled => {
    if (enabled) voiceListeners.add(socket.id); else voiceListeners.delete(socket.id);
    socket.emit('voice:listeners', voiceListeners.size);
  });
  socket.on('voice:send', payload => {
    if (!payload || typeof payload.audio !== 'string' || !payload.audio.startsWith('data:audio/')) return;
    if (payload.audio.length > 7_000_000) return socket.emit('voice:error', { message: 'Voice message is too large. Please record a shorter message.' });
    const message = { nickname: String(payload.nickname || 'Driver').slice(0,24), audio: payload.audio, mime: String(payload.mime || 'audio/webm').slice(0,80), at: Date.now() };
    for (const id of voiceListeners) if (id !== socket.id) io.to(id).emit('voice:message', message);
    socket.emit('voice:sent', { at: message.at, listeners: Math.max(0, voiceListeners.size - (voiceListeners.has(socket.id) ? 1 : 0)) });
  });
  socket.on('disconnect', () => { players.delete(socket.id); voiceListeners.delete(socket.id); io.emit('player:left', socket.id); });
});

const port = Number(process.env.PORT || 10000);
try {
  if (process.env.MONGODB_URI) await mongoose.connect(process.env.MONGODB_URI);
  else console.warn('MONGODB_URI is missing; API starts without database.');
} catch (error) { console.error('MongoDB connection failed:', error.message); }
server.listen(port, '0.0.0.0', () => console.log('Pin Drive listening on ' + port));
