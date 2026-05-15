const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']); // Use Google DNS to fix ECONNREFUSED querySrv
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const User = require('./models/User');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Adjust in production
    methods: ["GET", "POST"]
  }
});

// Database Connection
const dbUrl = process.env.DATABASE_URL;
console.log('Attempting to connect to MongoDB...');
console.log('URL:', dbUrl?.replace(/:([^@]+)@/, ':****@'));

mongoose.connect(dbUrl, {
  serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
})
  .then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err.message);
    if (err.message.includes('querySrv ESERVFAIL') || err.message.includes('querySrv ECONNREFUSED')) {
      console.error('👉 Suggestion: Your network is blocking MongoDB SRV records. Try using the long-form connection string instead of mongodb+srv://');
    }
  });

mongoose.connection.on('error', err => {
  console.error('Mongoose connection error event:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('Mongoose disconnected');
});

// Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/chat', require('./routes/chatRoutes'));

app.get('/', (req, res) => {
  res.send('PrivateChat API is running');
});

// Socket.io Logic
io.on('connection', (socket) => {
  let currentUserId = null;

  socket.on('join', async (userId) => {
    currentUserId = userId;
    socket.join(`user_${userId}`);
    
    // Update status to online
    try {
      await User.findByIdAndUpdate(userId, { status: 'online' });
      io.emit('user_status', { userId, status: 'online' });
    } catch (err) {
      console.error('Status update error:', err);
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
        io.emit('user_status', { userId: currentUserId, status: 'offline', lastSeen });
      } catch (err) {
        console.error('Status disconnect error:', err);
      }
    }
    console.log('User disconnected:', socket.id);
  });

  // Calling Signaling
  socket.on('call-user', ({ to, offer, fromName, type }) => {
    io.to(`user_${to}`).emit('incoming-call', { from: currentUserId, fromName, offer, type });
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

if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 5000;
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
