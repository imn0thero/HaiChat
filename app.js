const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

const PORT = process.env.PORT || 3000;
const USERS_FILE = path.join(__dirname, 'users.json');
const UPLOAD_DIR = path.join(__dirname, 'public/uploads');

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Setup multer storage with original file extension preserved
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    // Use uuid + original extension
    const ext = path.extname(file.originalname);
    cb(null, uuidv4() + ext);
  }
});
const upload = multer({ storage });

// Init users.json if not exist
if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, JSON.stringify({}));
}

// Create uploads dir if not exist
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

let onlineUsers = {};
let messages = [];

// Clear messages older than 24 hours every minute
setInterval(() => {
  const now = Date.now();
  messages = messages.filter(m => now - m.time < 24 * 60 * 60 * 1000);
}, 60 * 1000);

// Helper functions
function loadUsers() {
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
}
function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// Upload media endpoint
app.post('/upload', upload.single('media'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false });
  // Return relative path for client
  const filePath = 'uploads/' + req.file.filename;
  res.json({ success: true, path: filePath });
});

// Socket.IO
io.on('connection', socket => {
  let currentUser = null;

  // Signup handler
  socket.on('signup', data => {
    const users = loadUsers();
    if (!data.username || !data.password) {
      socket.emit('signupResult', { success: false, message: 'Username dan password wajib diisi' });
      return;
    }
    if (users[data.username]) {
      socket.emit('signupResult', { success: false, message: 'Username sudah dipakai' });
    } else {
      users[data.username] = data.password;
      saveUsers(users);
      socket.emit('signupResult', { success: true });
    }
  });

  // Login handler
  socket.on('login', data => {
    const users = loadUsers();
    if (!data.username || !data.password) {
      socket.emit('loginResult', { success: false, message: 'Username dan password wajib diisi' });
      return;
    }
    if (users[data.username] && users[data.username] === data.password) {
      currentUser = data.username;
      onlineUsers[currentUser] = true;
      socket.emit('loginResult', { success: true, user: currentUser, messages });
      io.emit('userList', Object.keys(onlineUsers));
    } else {
      socket.emit('loginResult', { success: false, message: 'Username atau password salah' });
    }
  });

  // Receive message
  socket.on('message', data => {
    if (!currentUser) return;
    const messageData = {
      id: uuidv4(),
      user: currentUser,
      text: data.text,
      time: Date.now()
    };
    messages.push(messageData);
    io.emit('message', messageData);
  });

  // Logout handler
  socket.on('logout', () => {
    if (currentUser) {
      delete onlineUsers[currentUser];
      io.emit('userList', Object.keys(onlineUsers));
      currentUser = null;
    }
  });

  // Disconnect handler
  socket.on('disconnect', () => {
    if (currentUser) {
      delete onlineUsers[currentUser];
      io.emit('userList', Object.keys(onlineUsers));
      currentUser = null;
    }
  });
});

http.listen(PORT, () => {
  console.log(`Server berjalan di port ${PORT}`);
});
