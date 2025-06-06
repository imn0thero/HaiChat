const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

app.use(express.static(path.join(__dirname, 'public')));
const PORT = process.env.PORT || 3000;

const USERS_FILE = path.join(__dirname, 'users.json');

// Inisialisasi file users.json jika belum ada
if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, JSON.stringify({}));
}

let onlineUsers = {};
let messages = [];

// Hapus otomatis pesan > 24 jam
setInterval(() => {
  const now = Date.now();
  messages = messages.filter(m => now - m.time < 24 * 60 * 60 * 1000);
}, 60 * 1000);

// Helper load/simpan user
function loadUsers() {
  return JSON.parse(fs.readFileSync(USERS_FILE));
}
function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

io.on('connection', socket => {
  let currentUser = null;

  socket.on('signup', data => {
    const users = loadUsers();
    if (users[data.username]) {
      socket.emit('signupResult', { success: false, message: 'Username sudah dipakai' });
    } else {
      users[data.username] = data.password;
      saveUsers(users);
      socket.emit('signupResult', { success: true });
    }
  });

  socket.on('login', data => {
    const users = loadUsers();
    if (users[data.username] && users[data.username] === data.password) {
      currentUser = data.username;
      onlineUsers[currentUser] = true;
      socket.emit('loginResult', { success: true, user: currentUser });
      io.emit('userList', Object.keys(onlineUsers));
    } else {
      socket.emit('loginResult', { success: false, message: 'Username atau password salah' });
    }
  });

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

  socket.on('logout', () => {
    if (currentUser) {
      delete onlineUsers[currentUser];
      io.emit('userList', Object.keys(onlineUsers));
    }
  });

  socket.on('disconnect', () => {
    if (currentUser) {
      delete onlineUsers[currentUser];
      io.emit('userList', Object.keys(onlineUsers));
    }
  });
});

http.listen(PORT, () => {
  console.log(`Server berjalan di port ${PORT}`);
});
