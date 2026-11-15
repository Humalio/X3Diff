import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DOMParser } from '@xmldom/xmldom';
import { compareX3D } from '../src/diff/compare';
import { readMotionScene } from '../src/viewer/motion';
import {
  compareBodyMotion,
  findStretches,
  isArticulated,
  partOf,
  MAX_BODY_JOINTS,
  trailOf,
} from '../src/viewer/bodyMotion';
import { movementFacts, stretchText } from '../src/app/movementTab';

const parse = (xml: string) =>
  readMotionScene(new DOMParser().parseFromString(xml, 'application/xml') as unknown as Document);
const text = (side: string) =>
  readFileSync(
    fileURLToPath(new URL(`../public/examples/avatar/${side}.x3d`, import.meta.url)),
    'utf8',
  );
const scene = (body: string) => parse(`<X3D version="3.3"><Scene>${body}</Scene></X3D>`);
const seconds = (sample: number, body: { samples: number; window: number }) =>
  Number(((sample / body.samples) * body.window).toFixed(1));

/** A two-link arm: a shoulder Transform turning about Z, an elbow under it turning about X. */
const arm = (shoulder: string, elbow: string) =>
  `<Transform DEF="r_shoulder"><Transform DEF="r_elbow" translation="0 -1 0">` +
  `<Shape><Box size=".2 1 .2"/></Shape></Transform></Transform>` +
  `<TimeSensor DEF="Clock" cycleInterval="4" loop="true"/>` +
  `<OrientationInterpolator DEF="S" key="0 .5 1" keyValue="${shoulder}"/>` +
  `<OrientationInterpolator DEF="E" key="0 .5 1" keyValue="${elbow}"/>` +
  `<ROUTE fromNode="Clock" fromField="fraction_changed" toNode="S" toField="set_fraction"/>` +
  `<ROUTE fromNode="Clock" fromField="fraction_changed" toNode="E" toField="set_fraction"/>` +
  `<ROUTE fromNode="S" fromField="value_changed" toNode="r_shoulder" toField="set_rotation"/>` +
  `<ROUTE fromNode="E" fromField="value_changed" toNode="r_elbow" toField="set_rotation"/>`;

describe('humanoid catalog', () => {
  it('compares the H-Anim example completely and names the joints that changed', () => {
    const r = compareX3D(text('before'), text('after'));
    expect(r.summary.status).toBe('complete');
    expect(r.diagnostics).toHaveLength(0);
    const targets = new Set(r.changes.map((c) => c.beforeNode?.defName).filter(Boolean));
    for (const name of ['r_shoulder_rotation', 'l_eyeball_joint_rotation', 'l_hip_rotation'])
      expect(targets.has(name)).toBe(true);
  });

  it('reports a moved joint as a placement change', () => {
    const humanoid = (center: string) =>
      `<X3D version="3.3"><Scene><HAnimHumanoid DEF="H"><HAnimJoint DEF="j" name="l_elbow" containerField="skeleton" center="${center}"/></HAnimHumanoid></Scene></X3D>`;
    const r = compareX3D(humanoid('0 1 0'), humanoid('0 1.1 0'));
    expect(r.changes.map((c) => `${c.category}:${c.field}`)).toEqual(['transform:center']);
  });
});

describe('body parts', () => {
  it('groups H-Anim joint names into parts', () => {
    expect(partOf('l_eyeball_joint')).toBe('eyes');
    expect(partOf('skullbase')).toBe('head');
    expect(partOf('vt1')).toBe('spine');
    expect(partOf('r_shoulder')).toBe('rightArm');
    expect(partOf('l_radiocarpal')).toBe('leftHand');
    expect(partOf('r_talocrural')).toBe('rightLeg');
    expect(partOf('humanoid_root')).toBe('body');
    expect(partOf('hanim_LeftKnee')).toBe('leftLeg');
    expect(partOf('Crane')).toBe('other');
  });

  it('bridges short gaps between differing samples', () => {
    expect(
      findStretches([false, true, true, false, true, false, false, false, false, true]),
    ).toEqual([
      [1, 4],
      [9, 9],
    ]);
  });
});

describe('movement of the dancing example', () => {
  const before = parse(text('before')),
    after = parse(text('after'));
  const body = compareBodyMotion(before, after);
  const stretches = (part: string) => body.parts.find((p) => p.part === part)?.stretches ?? [];

  it('is an articulated figure compared over its six-second loop', () => {
    expect(isArticulated(before, after)).toBe(true);
    expect(body.window).toBe(6);
    expect(body.changed).toBe(true);
  });

  it('finds a different right-arm movement from 1 to 3 s, peaking at the shoulder', () => {
    const [arm] = stretches('rightArm');
    expect(stretches('rightArm')).toHaveLength(1);
    expect(arm.kind).toBe('movement');
    expect([seconds(arm.from, body), seconds(arm.to, body)]).toEqual([1, 3]);
    expect(arm.peak.joint).toBe('r_shoulder');
    expect(arm.peak.angle).toBeGreaterThan(90);
  });

  it('finds the added glance as a movement, not as a timing change', () => {
    const [eyes] = stretches('eyes');
    expect(eyes.kind).toBe('movement');
    expect(seconds(eyes.from, body)).toBeCloseTo(2.4, 1);
    expect(eyes.peak.angle).toBeGreaterThan(15);
    expect(eyes.peak.angle).toBeLessThan(25);
  });

  it('recognises the delayed steps as the same movement 0.4 s later', () => {
    for (const part of ['leftLeg', 'rightLeg']) {
      const [step] = stretches(part);
      expect(step.kind).toBe('timing');
      expect(step.lag).toBeCloseTo(0.4, 6);
      expect(stretchText(step, body)).toBe('Same movement, B 0.4 s later');
    }
  });

  it('leaves the shared dance alone', () => {
    for (const part of ['body', 'head', 'spine', 'leftArm']) expect(stretches(part)).toEqual([]);
  });

  it('writes one report entry per part that differs', () => {
    const entries = movementFacts(body);
    expect(entries.map((entry) => entry.object)).toEqual([
      'Eyes',
      'Right arm',
      'Left leg',
      'Right leg',
    ]);
    expect(entries[1].rows[0]).toEqual([
      '1–3 s',
      expect.stringMatching(/^Different movement, up to \d+° at r_shoulder$/),
    ]);
  });
});

describe('movement of Joe, the Web3D walk-and-salute figure', () => {
  const joe = (side: string) =>
    parse(
      readFileSync(
        fileURLToPath(new URL(`../public/examples/joe/${side}.x3d`, import.meta.url)),
        'utf8',
      ),
    );
  const body = compareBodyMotion(joe('before'), joe('after'));
  const first = (part: string) => body.parts.find((p) => p.part === part)!.stretches[0];

  it('finds the four edits of the revision and nothing else', () => {
    expect(body.parts.filter((part) => part.stretches.length).map((part) => part.part)).toEqual([
      'head',
      'eyes',
      'rightHand',
      'leftLeg',
    ]);
  });

  it('reads the later look-around as the same eye movement 0.4 s later', () => {
    for (const stretch of body.parts.find((p) => p.part === 'eyes')!.stretches)
      expect(stretchText(stretch, body)).toBe('Same movement, B 0.4 s later');
  });

  it('names the joint behind each changed movement', () => {
    expect(stretchText(first('head'), body)).toMatch(/at vc6$/);
    expect(stretchText(first('rightHand'), body)).toMatch(/at r_carpometacarpal_1$/);
    const knee = body.parts.find((p) => p.part === 'leftLeg')!.stretches;
    expect(knee).toHaveLength(2);
    for (const stretch of knee) expect(stretchText(stretch, body)).toMatch(/up to 2\d° at l_knee$/);
  });
});

describe('movement of several figures', () => {
  /** Two humanoids with the same joint names; only Ben's arm changes between revisions. */
  const pair = (ben: string) => {
    const figure = (who: string, swing: string) =>
      `<HAnimHumanoid DEF="${who}" name="${who}">` +
      `<HAnimJoint DEF="${who}_r_shoulder" name="r_shoulder" containerField="skeleton">` +
      `<Transform translation="0 -.5 0"><Shape><Box size=".2 1 .2"/></Shape></Transform>` +
      `</HAnimJoint></HAnimHumanoid>` +
      `<OrientationInterpolator DEF="${who}_swing" key="0 .5 1" keyValue="${swing}"/>` +
      `<ROUTE fromNode="Clock" fromField="fraction_changed" toNode="${who}_swing" toField="set_fraction"/>` +
      `<ROUTE fromNode="${who}_swing" fromField="value_changed" toNode="${who}_r_shoulder" toField="set_rotation"/>`;
    return scene(
      `<TimeSensor DEF="Clock" cycleInterval="4" loop="true"/>` +
        figure('Ana', '0 0 1 0, 0 0 1 1, 0 0 1 0') +
        figure('Ben', ben),
    );
  };
  const body = compareBodyMotion(
    pair('0 0 1 0, 0 0 1 1, 0 0 1 0'),
    pair('0 0 1 0, 1 0 0 1, 0 0 1 0'),
  );

  it('keeps each figure’s parts apart and names the figure', () => {
    expect(body.figures).toEqual(['Ana', 'Ben']);
    expect(body.parts.map((part) => part.label)).toEqual(['Ana · Right arm', 'Ben · Right arm']);
    expect(body.parts[0].stretches).toEqual([]);
    expect(body.parts[1].stretches).toHaveLength(1);
    expect(stretchText(body.parts[1].stretches[0], body)).toMatch(/at r_shoulder$/);
  });

  it('traces where the changed arm ends up in each revision', () => {
    const times = [0, 1, 2];
    const [a, b] = [pair('0 0 1 0, 0 0 1 1, 0 0 1 0'), pair('0 0 1 0, 1 0 0 1, 0 0 1 0')].map(
      (figures) => trailOf(figures, body.parts[1].joints, times, body.size)!,
    );
    expect(a[0].distanceTo(b[0])).toBeLessThan(1e-6);
    expect(a[2].distanceTo(b[2])).toBeGreaterThan(0.5);
  });
});

describe('movement of plain Transform rigs', () => {
  it('shows a difference at the joint where it starts, not at the joints it carries', () => {
    const body = compareBodyMotion(
      scene(arm('0 0 1 0, 0 0 1 1, 0 0 1 0', '1 0 0 0, 1 0 0 .5, 1 0 0 0')),
      scene(arm('0 0 1 0, 0 0 1 .5, 0 0 1 0', '1 0 0 0, 1 0 0 .5, 1 0 0 0')),
    );
    const shoulder = body.joints.find((joint) => joint.def === 'r_shoulder')!;
    const elbow = body.joints.find((joint) => joint.def === 'r_elbow')!;
    expect(Math.max(...shoulder.angle)).toBeCloseTo((0.5 * 180) / Math.PI, 3);
    expect(Math.max(...elbow.angle)).toBeLessThan(1e-3);
  });

  it('is not used for a lone moving object', () => {
    const lone = scene(
      `<Transform DEF="Box"><Shape><Box/></Shape></Transform><TimeSensor DEF="C" loop="true"/>` +
        `<PositionInterpolator DEF="P" key="0 1" keyValue="0 0 0 1 0 0"/>` +
        `<ROUTE fromNode="C" fromField="fraction_changed" toNode="P" toField="set_fraction"/>` +
        `<ROUTE fromNode="P" fromField="value_changed" toNode="Box" toField="set_translation"/>`,
    );
    expect(isArticulated(lone, lone)).toBe(false);
  });

  it('compares a joint animated in one revision against the other one at rest', () => {
    const still = scene(
      `<Transform DEF="r_shoulder"><Transform DEF="r_elbow"><Shape><Box/></Shape></Transform></Transform>`,
    );
    const body = compareBodyMotion(
      still,
      scene(arm('0 0 1 0, 0 0 1 1, 0 0 1 0', '1 0 0 0, 1 0 0 1, 1 0 0 0')),
    );
    const [stretch] = body.parts.find((part) => part.part === 'rightArm')!.stretches;
    expect(stretchText(stretch, body)).toBe('Different movement, up to 57° at r_shoulder');
  });

  it('names a joint that only one revision has', () => {
    const shoulderOnly = scene(`<Transform DEF="r_shoulder"><Shape><Box/></Shape></Transform>`);
    const body = compareBodyMotion(
      shoulderOnly,
      scene(arm('0 0 1 0, 0 0 1 1, 0 0 1 0', '1 0 0 0, 1 0 0 1, 1 0 0 0')),
    );
    const [stretch] = body.parts.find((part) => part.part === 'rightArm')!.stretches;
    expect(stretchText(stretch, body)).toBe('r_elbow is animated in one revision only');
  });

  it('refuses figures with too many animated joints', () => {
    const many = Array.from({ length: MAX_BODY_JOINTS + 1 }, (_, i) => {
      const def = `j${i}`;
      return (
        `<Transform DEF="${def}"/><OrientationInterpolator DEF="o${i}" key="0 1" keyValue="0 0 1 0, 0 0 1 1"/>` +
        `<ROUTE fromNode="C" fromField="fraction_changed" toNode="o${i}" toField="set_fraction"/>` +
        `<ROUTE fromNode="o${i}" fromField="value_changed" toNode="${def}" toField="set_rotation"/>`
      );
    }).join('');
    const big = scene(`<TimeSensor DEF="C" loop="true"/>${many}`);
    expect(() => compareBodyMotion(big, big)).toThrow(/more than 256 animated joints/);
  });
});
