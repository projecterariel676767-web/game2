import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { User } from './models.js';

const tokenFor = (user) => jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { expiresIn: '30d' });

export async function register(req, res) {
  try {
    const nickname = String(req.body.nickname || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (nickname.length < 2 || nickname.length > 24) return res.status(400).json({ error: 'Nickname must contain 2–24 characters.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must contain at least 8 characters.' });
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ nickname, email, passwordHash });
    return res.status(201).json({ token: tokenFor(user), user: { id: user.id, nickname, email, settings: user.settings } });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: 'This email is already registered.' });
    console.error(error); return res.status(500).json({ error: 'Registration failed.' });
  }
}

export async function login(req, res) {
  const email = String(req.body.email || '').trim().toLowerCase();
  const user = await User.findOne({ email });
  if (!user || !(await bcrypt.compare(String(req.body.password || ''), user.passwordHash))) return res.status(401).json({ error: 'Incorrect email or password.' });
  return res.json({ token: tokenFor(user), user: { id: user.id, nickname: user.nickname, email, settings: user.settings } });
}

export async function requireAuth(req, res, next) {
  try {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(payload.sub).select('-passwordHash');
    if (!req.user) return res.status(401).json({ error: 'Account not found.' });
    next();
  } catch { return res.status(401).json({ error: 'Authentication required.' }); }
}
