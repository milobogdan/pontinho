import https from 'https';
import fs from 'fs';
import path from 'path';

const ranks = ['A','2','3','4','5','6','7','8','9','0','J','Q','K'];
const suits = ['S','H','D','C'];
const dir   = './client/public/cards';

if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, res => {
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', reject);
  });
}

async function run() {
  for (const rank of ranks) {
    for (const suit of suits) {
      const name = `${rank}${suit}.png`;
      console.log(`Downloading ${name}...`);
      await download(`https://deckofcardsapi.com/static/img/${name}`, path.join(dir, name));
    }
  }
  await download('https://deckofcardsapi.com/static/img/X1.png', path.join(dir, 'X1.png'));
  console.log('✅ All done!');
}

run();