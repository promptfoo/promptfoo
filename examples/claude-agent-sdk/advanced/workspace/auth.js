// Authentication module
const users = [];

function login(email, password, callback) {
  setTimeout(() => {
    const user = users.find((u) => u.email === email);
    if (!user) {
      return callback(new Error('User not found'));
    }
    if (user.password !== password) {
      return callback(new Error('Invalid password'));
    }
    callback(null, { id: user.id, email: user.email });
  }, 10);
}

function register(email, password, callback) {
  setTimeout(() => {
    const existingUser = users.find((u) => u.email === email);
    if (existingUser) {
      return callback(new Error('User already exists'));
    }
    const user = {
      id: Math.random().toString(36).substr(2, 9),
      email: email,
      password: password,
    };
    users.push(user);
    callback(null, { id: user.id, email: user.email });
  }, 10);
}

function getUserById(id, callback) {
  setTimeout(() => {
    const user = users.find((u) => u.id === id);
    if (!user) {
      return callback(new Error('User not found'));
    }
    callback(null, { id: user.id, email: user.email });
  }, 10);
}

module.exports = {
  login,
  register,
  getUserById,
};
