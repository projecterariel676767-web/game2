import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  nickname: { type: String, required: true, trim: true, minlength: 2, maxlength: 24 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  settings: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now }
});

const messageSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  role: { type: String, enum: ['user', 'assistant'], required: true },
  content: { type: String, required: true, maxlength: 12000 },
  createdAt: { type: Date, default: Date.now }
});

export const User = mongoose.model('User', userSchema);
export const AIMessage = mongoose.model('AIMessage', messageSchema);
