// Reconstruct a CI launcher from the maintainer's own committed mark if the
// legacy 1024px source is truncated. Never download an icon from elsewhere.
import sharp from '../../astrological-charts/node_modules/sharp/lib/index.js';
import { mkdir } from 'node:fs/promises';
const icon = 'src/assets/virgostars-icon.png';
const fallback = 'src/assets/virgostars-mark.png';
const output = '.local/ios-ci-launcher.png';
await mkdir('.local', { recursive: true });
try {
  const image = sharp(icon, { failOnError: true });
  const meta = await image.metadata();
  if (meta.width !== 1024 || meta.height !== 1024) throw Error('Expected 1024px logo');
  await image.png().toFile(output);
  console.log('Using validated original VirgoStars launcher.');
} catch (e) {
  await sharp(fallback, { failOnError: true })
    .resize(1024, 1024, { fit: 'contain', background: '#101726' })
    .flatten({ background: '#101726' }).png().toFile(output);
  console.log('Reconstructed CI launcher from the official transparent mark; original PNG could not be decoded.');
}
