// Builds the "Joe" Movement example from the Web3D Consortium's H-Anim walk-and-salute figure:
// public/examples/joe/before.x3d is the original, and after.x3d is a revision with four
// deliberate differences for the Movement view to find.
//
//   node scripts/build-joe.mjs <path to JoeSkeletonSkinSiteSaluteWalk.x3d>
//
// Source: https://www.web3d.org/x3d/content/examples/HumanoidAnimation/Skin/JoeSkeletonSkinSiteSaluteWalk.x3d
// (Joe D. Williams; Web3D Consortium Open-Source License, a BSD-style licence, copied next to the
// example as LICENSE.html). Both files drop the source's coordinate-axes Inline and its background
// texture, which the preview omits anyway; nothing else in the original changes.
//
// The revision:
//   - Eyes: the look-around starts 17/240 of its 5.8 s cycle (about 0.4 s) later; the same movement.
//   - Head and neck: the first neck turn of the salute goes the other way.
//   - Right hand: the saluting thumb bends about half as far.
//   - Left leg: the knee lifts higher in each step of the walk.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const SHA256 = 'a5dac443f4f5741771ea666867193824a91e5e73ea15df674a7364589b758698';
const source = process.argv[2];
if (!source)
  throw new Error('Usage: node scripts/build-joe.mjs <JoeSkeletonSkinSiteSaluteWalk.x3d>');
const original = readFileSync(source, 'utf8');
const hash = createHash('sha256').update(readFileSync(source)).digest('hex');
if (hash !== SHA256) throw new Error(`Unexpected source file (SHA-256 ${hash}).`);

const note = (text) => `    <meta content='${text}' name='X3Diff'/>\n  </head>`;
const clean = (xml) =>
  xml
    .replace(/\s*<Inline DEF='CoordinateAxes'[^>]*\/>/, '')
    .replace(/\s*<ImageTexture DEF='zBlueSpiralBkg2'[^>]*\/>/, '');

/** Rewrites one interpolator's key and keyValue. */
function interpolator(xml, def, change) {
  const pattern = new RegExp(
    `(<[A-Za-z]+Interpolator DEF='${def}' key=')([^']*)(' keyValue=')([^']*)'`,
  );
  const match = xml.match(pattern);
  if (!match) throw new Error(`No interpolator ${def}`);
  const key = match[2].trim().split(/\s+/).map(Number);
  const flat = match[4].trim().split(/\s+/).map(Number);
  const values = key.map((_, i) => flat.slice(i * 4, i * 4 + 4));
  const next = change(key, values);
  const number = (value) => String(Number(value.toFixed(6)));
  return xml.replace(
    pattern,
    `$1${next.key.map(number).join(' ')}$3${next.values.map((v) => v.map(number).join(' ')).join(' ')}'`,
  );
}

const before = clean(original).replace(
  '  </head>',
  note(
    'Movement example for X3Diff: the original. Coordinate axes Inline and background texture removed.',
  ),
);

let after = before.replace(
  "content='Movement example for X3Diff: the original. Coordinate axes Inline and background texture removed.'",
  "content='Movement example for X3Diff: the revision. Eyes 0.4 s later, neck turns the other way, smaller thumb salute, higher left knee.'",
);
// Eyes: a pure shift. The glance rests from 0 to 0.1 and from 0.8 to 1, so moving its keys
// later by d keeps the whole movement inside the cycle.
const d = 17 / 240;
after = interpolator(after, 'EyeballsRotation', (key, values) => ({
  key: [0, ...key.slice(0, -1).map((k) => k + d), 1],
  values: [values[0], ...values.slice(0, -1), values[values.length - 1]],
}));
// Head: the neck's first turn to the left becomes a smaller turn to the right.
after = interpolator(after, 'vc6Yaw', (key, values) => {
  values[1] = [0, -1, 0, 0.6];
  return { key, values };
});
// Right hand: the thumb bends about half as far in the salute.
after = interpolator(after, 'r_thumb1Pitch', (key, values) => {
  values[1] = [1, 0, 0, 0.25];
  values[2] = [1, 0, 0, 0.35];
  return { key, values };
});
// Left leg: a higher knee in the swing of each step.
after = interpolator(after, 'L_KNEE_ANIMATOR', (key, values) => {
  values[4] = [1, 0, 0, 1.6];
  return { key, values };
});

mkdirSync('public/examples/joe', { recursive: true });
writeFileSync('public/examples/joe/before.x3d', before);
writeFileSync('public/examples/joe/after.x3d', after);
console.log('Wrote public/examples/joe/before.x3d and after.x3d');
