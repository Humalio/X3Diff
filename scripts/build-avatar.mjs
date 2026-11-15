import { mkdirSync, writeFileSync } from 'node:fs';

// An original, self-contained H-Anim toy figure ("Pip") that dances for six seconds, in two
// revisions. The revised figure differs in three ways a reviewer should be able to tell apart:
//   1. Right arm, 1.0 to 3.0 s: a different movement (raised forward instead of to the side).
//   2. Eyes, 2.4 to 3.6 s: an added glance to the figure's left.
//   3. Legs, 3.5 to 5.0 s: the same step, 0.4 s later (a timing change only).
// Joints follow H-Anim names and place geometry in humanoid coordinates around each centre.

const CYCLE = 6;
const n = (v) => Number(v.toFixed(4));
const colors = {
  skin: '.96 .76 .62',
  shirt: '.10 .43 .91',
  trousers: '.09 .17 .25',
  shoe: '.95 .16 .25',
  hair: '.24 .16 .10',
  white: '.97 .97 .97',
  pupil: '.05 .05 .08',
};
const material = (color) =>
  `<Appearance><Material diffuseColor="${colors[color]}" specularColor=".25 .25 .25" shininess=".3"/></Appearance>`;
const at = (x, y, z, geometry, color, rotation = '') =>
  `<Transform translation="${n(x)} ${n(y)} ${n(z)}"${rotation ? ` rotation="${rotation}"` : ''}><Shape>${material(color)}${geometry}</Shape></Transform>`;
const box = (x, y, z, w, h, d, color) => at(x, y, z, `<Box size="${w} ${h} ${d}"/>`, color);
const ball = (x, y, z, r, color) => at(x, y, z, `<Sphere radius="${r}"/>`, color);
const limb = (x, y, z, r, h, color) => at(x, y, z, `<Cylinder radius="${r}" height="${h}"/>`, color);

const segment = (name, body) => `<HAnimSegment DEF="hanim_${name}" name="${name}">${body}</HAnimSegment>`;
const joint = (name, [x, y, z], body, field = '') =>
  `<HAnimJoint DEF="hanim_${name}" name="${name}" center="${n(x)} ${n(y)} ${n(z)}"${field ? ` containerField="${field}"` : ''}>${body}</HAnimJoint>`;

function figure() {
  const side = (s, prefix) => ({
    arm: joint(
      `${prefix}_shoulder`,
      [s * 0.21, 1.42, 0],
      segment(`${prefix}_upperarm`, limb(s * 0.21, 1.28, 0, 0.045, 0.28, 'shirt')) +
        joint(
          `${prefix}_elbow`,
          [s * 0.21, 1.14, 0],
          segment(`${prefix}_forearm`, limb(s * 0.21, 1.01, 0, 0.038, 0.26, 'skin')) +
            joint(
              `${prefix}_radiocarpal`,
              [s * 0.21, 0.88, 0],
              segment(`${prefix}_hand`, ball(s * 0.21, 0.84, 0, 0.05, 'skin')),
            ),
        ),
    ),
    leg: joint(
      `${prefix}_hip`,
      [s * 0.09, 0.92, 0],
      segment(`${prefix}_thigh`, limb(s * 0.09, 0.72, 0, 0.06, 0.4, 'trousers')) +
        joint(
          `${prefix}_knee`,
          [s * 0.09, 0.51, 0],
          segment(`${prefix}_calf`, limb(s * 0.09, 0.3, 0, 0.05, 0.4, 'trousers')) +
            joint(
              `${prefix}_talocrural`,
              [s * 0.09, 0.08, 0],
              segment(`${prefix}_hindfoot`, box(s * 0.09, 0.04, 0.04, 0.1, 0.07, 0.22, 'shoe')),
            ),
        ),
    ),
  });
  // The figure faces +z, so its left side is +x.
  const left = side(1, 'l'),
    right = side(-1, 'r');
  const eye = (s, prefix) =>
    joint(
      `${prefix}_eyeball_joint`,
      [s * 0.045, 1.67, 0.105],
      segment(
        `${prefix}_eyeball`,
        ball(s * 0.045, 1.67, 0.105, 0.028, 'white') + ball(s * 0.045, 1.67, 0.128, 0.012, 'pupil'),
      ),
    );
  const head = joint(
    'skullbase',
    [0, 1.56, 0],
    segment('skull', ball(0, 1.66, 0, 0.13, 'skin') + box(0, 1.76, -0.02, 0.24, 0.07, 0.22, 'hair')) +
      eye(1, 'l') +
      eye(-1, 'r'),
  );
  const torso = joint(
    'vl1',
    [0, 1.02, 0],
    segment('l1', box(0, 1.12, 0, 0.3, 0.2, 0.17, 'shirt')) +
      joint(
        'vt1',
        [0, 1.24, 0],
        segment('t1', box(0, 1.35, 0, 0.38, 0.22, 0.19, 'shirt')) +
          joint('vc4', [0, 1.48, 0], segment('c4', limb(0, 1.52, 0, 0.04, 0.08, 'skin')) + head) +
          left.arm +
          right.arm,
      ),
  );
  const pelvis = joint(
    'sacroiliac',
    [0, 0.95, 0],
    segment('pelvis', box(0, 0.96, 0, 0.3, 0.12, 0.17, 'trousers')) + left.leg + right.leg,
  );
  return joint('humanoid_root', [0, 0.95, 0], segment('sacrum', '') + pelvis + torso, 'skeleton');
}

// Keyframes as [seconds, value]; interpolators run over one six-second loop.
const axis = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
const turn = (direction, angle) => [...axis[direction], n(angle)].join(' ');
const wave = (frequency, amplitude, phase = 0, count = 48) =>
  Array.from({ length: count + 1 }, (_, i) => {
    const t = (i / count) * CYCLE;
    return [t, amplitude * Math.sin(2 * Math.PI * frequency * t + phase)];
  });
/** Rest, then each [start, peak, end] bump to `angle`, then rest; times in seconds. */
const bumps = (list) => {
  const keys = [[0, 0]];
  for (const [start, peak, end, angle] of list) keys.push([start, 0], [peak, angle], [end, 0]);
  keys.push([CYCLE, 0]);
  return keys;
};
const shifted = (list, by) => list.map(([a, b, c, angle]) => [a + by, b + by, c + by, angle]);

function animation(revised) {
  const parts = [];
  const routes = [];
  const add = (target, field, kind, keys, value) => {
    const name = `${target}_${field}`;
    const key = keys.map(([t]) => n(t / CYCLE)).join(' ');
    const values = keys.map(([, v]) => value(v)).join(kind === 'Orientation' ? ', ' : ' ');
    parts.push(`<${kind}Interpolator DEF="${name}" key="${key}" keyValue="${values}"/>`);
    routes.push(
      `<ROUTE fromNode="Dance" fromField="fraction_changed" toNode="${name}" toField="set_fraction"/>`,
      `<ROUTE fromNode="${name}" fromField="value_changed" toNode="hanim_${target}" toField="set_${field}"/>`,
    );
  };
  const rotate = (target, direction, keys) =>
    add(target, 'rotation', 'Orientation', keys, (angle) => turn(direction, angle));

  // A bounce on every beat and a sway of the hips: the same in both revisions.
  add('humanoid_root', 'translation', 'Position', wave(2, 1), (v) => `0 ${n(0.025 * Math.abs(v))} 0`);
  rotate('sacroiliac', 'y', wave(0.5, 0.18));
  rotate('vt1', 'z', wave(0.5, 0.07, Math.PI));
  rotate('skullbase', 'x', wave(1, 0.08));
  rotate('l_shoulder', 'x', wave(0.5, 0.35));
  rotate('l_elbow', 'x', wave(0.5, 0.3, Math.PI / 2).map(([t, v]) => [t, -0.4 - Math.abs(v)]));

  // Right arm, 1.0 to 3.0 s: raised to the side in the original, forward in the revision.
  if (revised) {
    rotate('r_shoulder', 'x', bumps([[1, 2, 3, -1.45]]));
    rotate('r_elbow', 'x', bumps([[1, 2, 3, -1.1]]));
  } else {
    rotate('r_shoulder', 'z', bumps([[1, 2, 3, -1.25]]));
    rotate('r_elbow', 'x', bumps([[1, 2, 3, -0.35]]));
  }

  // Eyes: one glance to the right in both; the revision adds a glance to the left.
  const glances = [[0.6, 0.9, 1.4, -0.35]];
  if (revised) glances.push([2.4, 2.9, 3.6, 0.38]);
  rotate('l_eyeball_joint', 'y', bumps(glances));
  rotate('r_eyeball_joint', 'y', bumps(glances));

  // Legs, a left then a right step. The revision takes the same steps 0.4 s later.
  const delay = revised ? 0.4 : 0;
  const step = (prefix, start) => {
    rotate(`${prefix}_hip`, 'x', bumps(shifted([[start, start + 0.3, start + 0.6, -0.55]], delay)));
    rotate(`${prefix}_knee`, 'x', bumps(shifted([[start, start + 0.3, start + 0.6, 0.95]], delay)));
  };
  step('l', 3.5);
  step('r', 4.0);
  return { parts: parts.join('\n    '), routes: routes.join('\n    ') };
}

function scene(revised) {
  const { parts, routes } = animation(revised);
  return `<?xml version="1.0" encoding="UTF-8"?>
<X3D version="3.3" profile="Immersive">
  <head>
    <component name="H-Anim" level="1"/>
    <meta name="title" content="Pip dances (${revised ? 'revised' : 'original'})"/>
    <meta name="description" content="Original toy humanoid for X3Diff. Generated by scripts/build-avatar.mjs."/>
    <meta name="license" content="MIT"/>
  </head>
  <Scene>
    <WorldInfo title="Pip dances"/>
    <Viewpoint DEF="Front" description="Front" position="0.6 1.15 2.6" orientation="0 1 0 0.23"/>
    <Background skyColor=".91 .94 .95"/>
    <Transform DEF="Stage" translation="0 -0.02 0">
      <Shape><Appearance><Material diffuseColor=".80 .83 .86"/></Appearance><Cylinder radius="0.8" height="0.04"/></Shape>
    </Transform>
    <HAnimHumanoid DEF="Pip" name="Pip" info='"authorName=X3Diff examples"'>
      ${figure()}
    </HAnimHumanoid>
    <TimeSensor DEF="Dance" cycleInterval="${CYCLE}" loop="true"/>
    ${parts}
    ${routes}
  </Scene>
</X3D>
`;
}

mkdirSync('public/examples/avatar', { recursive: true });
writeFileSync('public/examples/avatar/before.x3d', scene(false));
writeFileSync('public/examples/avatar/after.x3d', scene(true));
console.log('Wrote public/examples/avatar/before.x3d and after.x3d');
