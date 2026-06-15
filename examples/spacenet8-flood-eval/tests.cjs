const fs = require('node:fs');
const path = require('node:path');

const dataset = require('./dataset.json');
const TILE_ID_PATTERN = /^(germany|louisiana-east)-[0-9-]+$/;

function imageDataUrl(tileId, name) {
  if (!TILE_ID_PATTERN.test(tileId) || !['pre', 'post'].includes(name)) {
    throw new Error(`Invalid generated image reference: ${tileId}/${name}`);
  }
  const imagePath = path.join(__dirname, 'assets', tileId, `${name}.jpg`);
  if (!fs.existsSync(imagePath)) {
    throw new Error(`Missing ${imagePath}. Run python scripts/build_dataset.py first.`);
  }
  return `data:image/jpeg;base64,${fs.readFileSync(imagePath).toString('base64')}`;
}

module.exports = dataset.tiles.map((tile, index) => ({
  description: `${tile.geography} labeled pair ${index + 1} (${tile.tileId})`,
  metadata: {
    collection: tile.collection,
    event: tile.event,
    geography: tile.geography,
  },
  vars: {
    tile_id: tile.tileId,
    pre_image: imageDataUrl(tile.tileId, 'pre'),
    post_image: imageDataUrl(tile.tileId, 'post'),
  },
}));
