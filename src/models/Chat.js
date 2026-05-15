const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema({
  userOneId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userTwoId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

// Ensure unique conversation between two users
chatSchema.index({ userOneId: 1, userTwoId: 1 }, { unique: true });

module.exports = mongoose.model('Chat', chatSchema);
