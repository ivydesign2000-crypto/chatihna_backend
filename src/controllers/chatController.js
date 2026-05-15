const Chat = require('../models/Chat');
const Message = require('../models/Message');
const User = require('../models/User');

const getChats = async (req, res) => {
  try {
    const userId = req.userId;

    const chats = await Chat.find({
      $or: [
        { userOneId: userId },
        { userTwoId: userId }
      ]
    })
      .populate('userOneId', 'name image status')
      .populate('userTwoId', 'name image status')
      .sort({ updatedAt: -1 });

    // Format and get last message for each chat
    const formattedChats = await Promise.all(chats.map(async (chat) => {
      const lastMessage = await Message.findOne({ chatId: chat._id })
        .sort({ createdAt: -1 });

      const otherUser = chat.userOneId._id.toString() === userId.toString()
        ? chat.userTwoId
        : chat.userOneId;

      return {
        id: chat._id,
        otherUser: {
          id: otherUser._id,
          name: otherUser.name,
          image: otherUser.image,
          status: otherUser.status
        },
        lastMessage,
        updatedAt: chat.updatedAt
      };
    }));

    res.json(formattedChats);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getMessages = async (req, res) => {
  try {
    const { chatId } = req.params;
    const messages = await Message.find({ chatId })
      .populate('senderId', 'name')
      .sort({ createdAt: 1 });

    // Format to match what frontend expects
    const formattedMessages = messages.map(msg => ({
      id: msg._id,
      chatId: msg.chatId,
      senderId: msg.senderId._id,
      sender: msg.senderId,
      content: msg.content,
      isSeen: msg.isSeen,
      createdAt: msg.createdAt
    }));

    res.json(formattedMessages);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const sendMessage = async (req, res) => {
  try {
    const { receiverId, content } = req.body;
    const senderId = req.userId;

    if (!receiverId || !content) {
      return res.status(400).json({ message: "Receiver and content required" });
    }

    // Find or create chat
    let chat = await Chat.findOne({
      $or: [
        { userOneId: senderId, userTwoId: receiverId },
        { userOneId: receiverId, userTwoId: senderId }
      ]
    });

    if (!chat) {
      // Sort IDs to maintain consistency
      const ids = [senderId, receiverId].sort();
      chat = await Chat.create({
        userOneId: ids[0],
        userTwoId: ids[1]
      });
    }

    const message = await Message.create({
      chatId: chat._id,
      senderId,
      content
    });

    // Populate sender for frontend
    const populatedMessage = await Message.findById(message._id)
      .populate('senderId', 'name');

    const result = {
      id: populatedMessage._id,
      chatId: populatedMessage.chatId,
      senderId: populatedMessage.senderId._id,
      sender: populatedMessage.senderId,
      content: populatedMessage.content,
      isSeen: populatedMessage.isSeen,
      createdAt: populatedMessage.createdAt
    };

    // Emit real-time event
    req.io.to(`user_${receiverId}`).emit('receive_message', result);

    res.status(201).json(result);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getContacts = async (req, res) => {
  try {
    const userId = req.userId;
    const users = await User.find({ _id: { $ne: userId } })
      .select('name email image status lastSeen')
      .sort({ name: 1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const searchAll = async (req, res) => {
  try {
    const { query } = req.query;
    const userId = req.userId;

    if (!query) return res.json({ users: [], messages: [] });

    // Search Users
    const users = await User.find({
      $and: [
        { _id: { $ne: userId } },
        {
          $or: [
            { name: { $regex: query, $options: 'i' } },
            { email: { $regex: query, $options: 'i' } }
          ]
        }
      ]
    }).select('name email image status lastSeen');

    // Search Messages in chats where user is participant
    const chats = await Chat.find({
      $or: [{ userOneId: userId }, { userTwoId: userId }]
    });
    const chatIds = chats.map(c => c._id);

    const messages = await Message.find({
      chatId: { $in: chatIds },
      content: { $regex: query, $options: 'i' }
    }).populate('chatId').sort({ createdAt: -1 }).limit(20);

    // Format messages to include context
    const formattedMessages = await Promise.all(messages.map(async (msg) => {
      const chat = msg.chatId;
      const otherUser = chat.userOneId.toString() === userId.toString() 
        ? await User.findById(chat.userTwoId).select('name image status')
        : await User.findById(chat.userOneId).select('name image status');
      
      return {
        id: msg._id,
        content: msg.content,
        createdAt: msg.createdAt,
        chatId: chat._id,
        otherUser
      };
    }));

    res.json({ users, messages: formattedMessages });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const markAsSeen = async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.userId;

    await Message.updateMany(
      { chatId, senderId: { $ne: userId }, isSeen: false },
      { $set: { isSeen: true, seenAt: new Date() } }
    );

    // Notify the sender that their messages have been seen
    const chat = await Chat.findById(chatId);
    const otherUserId = chat.userOneId.toString() === userId.toString()
      ? chat.userTwoId
      : chat.userOneId;

    req.io.to(`user_${otherUserId}`).emit('messages_seen', { chatId, seenBy: userId });

    res.json({ message: "Messages marked as seen" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;
    const userId = req.userId;

    const message = await Message.findOne({ _id: messageId, senderId: userId });
    if (!message) {
      return res.status(404).json({ message: "Message not found or unauthorized" });
    }

    message.content = content;
    await message.save();

    // Notify the other user
    const chat = await Chat.findById(message.chatId);
    const otherUserId = chat.userOneId.toString() === userId.toString()
      ? chat.userTwoId
      : chat.userOneId;

    req.io.to(`user_${otherUserId}`).emit('message_updated', {
      messageId,
      content,
      chatId: message.chatId
    });

    res.json(message);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.userId;

    const message = await Message.findOne({ _id: messageId, senderId: userId });
    if (!message) {
      return res.status(404).json({ message: "Message not found or unauthorized" });
    }

    const chatId = message.chatId;
    await Message.deleteOne({ _id: messageId });

    // Notify the other user
    const chat = await Chat.findById(chatId);
    const otherUserId = chat.userOneId.toString() === userId.toString() 
      ? chat.userTwoId 
      : chat.userOneId;

    req.io.to(`user_${otherUserId}`).emit('message_deleted', { messageId, chatId });
    res.json({ message: "Message deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteChat = async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.userId;

    const chat = await Chat.findOne({
      _id: chatId,
      $or: [{ userOneId: userId }, { userTwoId: userId }]
    });

    if (!chat) return res.status(404).json({ message: "Chat not found" });

    const otherUserId = chat.userOneId.toString() === userId.toString() ? chat.userTwoId : chat.userOneId;

    await Message.deleteMany({ chatId });
    await Chat.deleteOne({ _id: chatId });

    req.io.to(`user_${otherUserId}`).emit('chat_deleted', { chatId });
    res.json({ message: "Chat deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getChats,
  getMessages,
  sendMessage,
  getContacts,
  searchUsers: searchAll,
  markAsSeen,
  updateMessage,
  deleteMessage,
  deleteChat
};
