import express from 'express';
import cors from 'cors';
import compression from 'compression';
import cacheManager from 'cache-manager';
import fsStore from 'cache-manager-fs-hash';
import { v4 as uuidv4 } from 'uuid';

const store = cacheManager.caching({
  store: fsStore,
  options: {
    path: 'diskcache', // path for cached files
    ttl: 60 * 60 * 24 * 14, // time to live in seconds for the cache
    subdirs: true, // create subdirectories to reduce the files in a single dir
  },
});

const app = express();
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb' }));

app.get('/eval/:id', async (req, res) => {
  const id = req.params.id;

  try {
    const result = await store.get(id);
    if (!result) {
      res.status(404).send('Data not found');
    } else {
      res.status(200).json({ data: JSON.parse(result as string) });
    }
  } catch (err) {
    res.status(500).send('An error occurred while retrieving data');
  }
});

app.post('/eval', async (req, res) => {
  try {
    const id = `f:${uuidv4()}`;
    const evalResult = req.body;
    await store.set(id, JSON.stringify(evalResult));
    res.status(200).json({ id });
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Failed to store evaluation result', error: (error as Error).message });
  }
});

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
