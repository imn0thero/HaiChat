const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const PORT = process.env.PORT || 3000;
const USERS_FILE = path.join(__dirname, 'users.json');
const MESSAGES_FILE = path.join(__dirname, 'messages.json');

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Init users.json & messages.json if not exist
if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, JSON.stringify({}));
}
if (!fs.existsSync(MESSAGES_FILE)) {
  fs.writeFileSync(MESSAGES_FILE, JSON.stringify([]));
}

// Load saved messages
let messages = loadMessages();
let onlineUsers = {};

// Clear messages older than 24 hours every minute
setInterval(() => {
  const now = Date.now();
  messages = messages.filter(m => now - m.time < 24 * 60 * 60 * 1000);
  saveMessages(messages); // Save updated messages
}, 60 * 1000);

// Helper functions
function loadUsers() {
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function loadMessages() {
  try {
    return JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf-8'));
  } catch (err) {
    console.error("Gagal memuat pesan:", err);
    return [];
  }
}

function saveMessages(msgs) {
  fs.writeFileSync(MESSAGES_FILE, JSON.stringify(msgs, null, 2));
}

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

      // Kirim login berhasil dan semua pesan yang disimpan
      socket.emit('loginResult', { success: true, user: currentUser, messages });

      // Perbarui daftar pengguna online
      io.emit('userList', Object.keys(onlineUsers));
    } else {
      socket.emit('loginResult', { success: false, message: 'Username atau password salah' });
    }
  });

  // Receive message
  socket.on('message', data => {
    if (!currentUser || !data.text || data.text.trim() === "") return;

    const messageData = {
      id: uuidv4(),
      user: currentUser,
      text: data.text.trim(),
      time: Date.now()
    };

    messages.push(messageData);
    saveMessages(messages); // Simpan setiap pesan baru ke file

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
