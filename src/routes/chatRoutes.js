const express = require('express');
const router = express.Router();
const { getChats, getContacts, getMessages, sendMessage, searchUsers, markAsSeen, updateMessage, deleteMessage, deleteChat } = require('../controllers/chatController');
const authMiddleware = require('../middlewares/authMiddleware');

router.use(authMiddleware);

router.get('/list', getChats);
router.get('/contacts', getContacts);
router.get('/messages/:chatId', getMessages);
router.post('/send', sendMessage);
router.get('/search', searchUsers);
router.post('/mark-seen/:chatId', markAsSeen);
router.put('/message/:messageId', updateMessage);
router.delete('/message/:messageId', deleteMessage);
router.delete('/:chatId', deleteChat);

module.exports = router;
