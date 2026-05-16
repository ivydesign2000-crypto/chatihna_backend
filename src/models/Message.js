const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  chatId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', required: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true },
  type: { type: String, enum: ['text', 'audio', 'image'], default: 'text' },
  audioUrl: { type: String },
  isSeen: { type: Boolean, default: false },
  seenAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('Message', messageSchema);
