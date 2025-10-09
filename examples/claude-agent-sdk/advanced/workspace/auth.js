// Simple authentication module that needs refactoring
const users = [];

function login(email, password) {
  const user = users.find(u => u.email === email);
  if (!user) {
    throw new Error('User not found');
  }
  if (user.password !== password) {
    throw new Error('Invalid password');
  }
  return user;
}

function register(email, password) {
  if (users.find(u => u.email === email)) {
    throw new Error('User already exists');
  }
  
  const user = {
    id: Math.random().toString(36).substr(2, 9),
    email,
    password,
    createdAt: new Date()
  };
  
  users.push(user);
  return user;
}

function getUserById(id) {
  const user = users.find(u => u.id === id);
  if (!user) {
    throw new Error('User not found');
  }
  return user;
}

module.exports = {
  login,
  register,
  getUserById
};