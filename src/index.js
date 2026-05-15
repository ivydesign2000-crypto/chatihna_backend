const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const User = require('./models/User');

const app = express();
const server = http.createServer(app);

// Socket.io setup
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});


// ======================
// DATABASE CONNECTION
// ======================
const dbUrl = process.env.DATABASE_URL;

console.log('Attempting MongoDB connection...');
console.log('DB:', dbUrl ? 'Loaded ✔' : 'Missing ❌');

mongoose.connect(dbUrl, {
  serverSelectionTimeoutMS: 5000,
})
  .then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch((err) => {
    console.error('❌ MongoDB error:', err.message);
  });

mongoose.connection.on('error', err => {
  console.error('Mongoose error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected');
});


// ======================
// MIDDLEWARES
// ======================
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use((req, res, next) => {
  req.io = io;
  next();
});


// ======================
// ROUTES
// ======================
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/chat', require('./routes/chatRoutes'));

app.get('/', (req, res) => {
  res.send('PrivateChat API is running 🚀');
});


// ======================
// SOCKET.IO LOGIC
// ======================
io.on('connection', (socket) => {
  let currentUserId = null;

  socket.on('join', async (userId) => {
    currentUserId = userId;
    socket.join(`user_${userId}`);

    try {
      await User.findByIdAndUpdate(userId, { status: 'online' });
      io.emit('user_status', { userId, status: 'online' });
    } catch (err) {
      console.error('Join status error:', err);
    }
  });

  socket.on('disconnect', async () => {
    if (currentUserId) {
      try {
        const lastSeen = new Date();

        await User.findByIdAndUpdate(currentUserId, {
          status: 'offline',
          lastSeen
        });

        io.emit('user_status', {
          userId: currentUserId,
          status: 'offline',
          lastSeen
        });
      } catch (err) {
        console.error('Disconnect error:', err);
      }
    }

    console.log('User disconnected:', socket.id);
  });

  // Calling system
  socket.on('call-user', ({ to, offer, fromName, type }) => {
    io.to(`user_${to}`).emit('incoming-call', {
      from: currentUserId,
      fromName,
      offer,
      type
    });
  });

  socket.on('answer-call', ({ to, answer }) => {
    io.to(`user_${to}`).emit('call-answered', { answer });
  });

  socket.on('ice-candidate', ({ to, candidate }) => {
    io.to(`user_${to}`).emit('ice-candidate', { candidate });
  });

  socket.on('end-call', ({ to }) => {
    io.to(`user_${to}`).emit('call-ended');
  });
});


// ======================
// START SERVER (FIXED)
// ======================
const PORT = process.env.PORT || 5000;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

module.exports = app;