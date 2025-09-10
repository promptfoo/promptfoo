// Simple Express API server
const express = require('express');
const app = express();
const port = 3000;

app.use(express.json());

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to the API' });
});

app.get('/users', (req, res) => {
  res.json([
    { id: 1, name: 'Alice' },
    { id: 2, name: 'Bob' },
  ]);
});

app.post('/users', (req, res) => {
  const { name } = req.body;
  res.status(201).json({ id: 3, name });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
