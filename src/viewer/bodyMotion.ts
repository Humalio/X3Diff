import { Box3, Quaternion, Vector3 } from 'three';
import {
  attribute,
  objectBox,
  parentOf,
  PLACEMENTS,
  quaternion,
  sample,
  worldMatrixAt,
  type MotionScene,
} from './motion';

/**
 * Where and when two revisions of an articulated figure move differently.
 *
 * Every animated joint (an HAnimJoint, or any Transform that animation moves) is compared by
 * its own pose relative to its parent: rotation as an angle, translation as a distance, scale
 * as a ratio. A difference therefore shows at the joint where it starts: a changed shoulder
 * lights up the shoulder, not every joint of the arm below it. Joints are grouped into body
 * parts by their H-Anim names, so a reviewer reads "right arm, 1 to 3 s" before any detail.
 *
 * A stretch of difference that disappears when one revision is moved in time by a constant
 * amount is reported as a timing change ("the same movement, 0.4 s later"), not as a
 * different movement.
 */

export const BODY_SAMPLES = 240;
export const MAX_BODY_JOINTS = 256;
/** A rotation difference this large (degrees) is drawn at full strength. */
export const FULL_ANGLE = 30;
/** Below this, two poses count as the same (degrees, share of figure size, scale ratio). */
const SAME_ANGLE = 1;
const SAME_SHIFT = 0.005;
const SAME_SCALE = 0.01;

export type Part =
  | 'body'
  | 'head'
  | 'eyes'
  | 'face'
  | 'spine'
  | 'leftArm'
  | 'rightArm'
  | 'leftHand'
  | 'rightHand'
  | 'leftLeg'
  | 'rightLeg'
  | 'other';
export const PART_LABELS: Record<Part, string> = {
  body: 'Whole body',
  head: 'Head and neck',
  eyes: 'Eyes',
  face: 'Face',
  spine: 'Spine',
  leftArm: 'Left arm',
  rightArm: 'Right arm',
  leftHand: 'Left hand',
  rightHand: 'Right hand',
  leftLeg: 'Left leg',
  rightLeg: 'Right leg',
  other: 'Other',
};
const PART_ORDER = Object.keys(PART_LABELS) as Part[];

/** Body part of a joint, from its H-Anim name (or DEF). Unknown names go to "other". */
export function partOf(name: string, nodeType = ''): Part {
  const id = name
    .replace(/^hanim_/i, '')
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toLowerCase();
  if (nodeType === 'HAnimHumanoid' || /^(humanoid_root|root|hips_root)$/.test(id)) return 'body';
  if (/eye(ball|lid|brow|_joint|$|_)/.test(id)) return 'eyes';
  if (/jaw|temporomandibular|lip|tongue|cheek|nose|mouth|ear/.test(id)) return 'face';
  if (/skull|^vc\d|neck|head|atlanto/.test(id)) return 'head';
  if (/^v[lt]\d|sacroiliac|spine|chest|torso|abdomen|pelvis|waist/.test(id)) return 'spine';
  const side = /^(l_|left)|_l$|_left$/.test(id)
    ? 'left'
    : /^(r_|right)|_r$|_right$/.test(id)
      ? 'right'
      : '';
  if (!side) return 'other';
  if (/carpal|metacarpal|phalanx|thumb|index|middle|ring|pinky|finger|hand|wrist/.test(id))
    return side === 'left' ? 'leftHand' : 'rightHand';
  if (/shoulder|clavic|acromio|scapul|elbow|arm/.test(id))
    return side === 'left' ? 'leftArm' : 'rightArm';
  if (/hip|knee|ankle|talocrural|tarsal|subtalar|foot|toe|leg|thigh|calf|heel/.test(id))
    return side === 'left' ? 'leftLeg' : 'rightLeg';
  return 'other';
}

/** The animated fields of one joint at a moment, in its parent's coordinates. */
export interface Pose {
  translation: Vector3;
  rotation: Quaternion;
  scale: Vector3;
}
export function poseAt(scene: MotionScene, node: Element, time: number): Pose {
  const channels = scene.channels.get(node);
  const value = (field: 'translation' | 'rotation' | 'scale', fallback: number[]) => {
    const channel = channels?.find((item) => item.field === field);
    return channel ? sample(channel, time) : attribute(node, field, fallback);
  };
  const r = value('rotation', [0, 0, 1, 0]);
  return {
    translation: new Vector3(...(value('translation', [0, 0, 0]) as number[])),
    rotation: r instanceof Quaternion ? r : quaternion(r as number[]),
    scale: new Vector3(...(value('scale', [1, 1, 1]) as number[])),
  };
}
/**
 * Where the far end of a part is, in scene coordinates, at each of the given times: the end of
 * its deepest joint's limb (twice the way from the joint centre to the middle of what it carries),
 * or for an eye, a point a short way along its gaze. Undefined when the scene lacks the part.
 */
export function trailOf(
  scene: MotionScene,
  joints: JointDifference[],
  times: number[],
  size: number,
): Vector3[] | undefined {
  const nodes = joints
    .map((joint) => scene.transforms.get(joint.def))
    .filter((node): node is Element => !!node);
  if (!nodes.length) return undefined;
  const depth = (node: Element) => {
    let count = 0;
    for (let at = parentOf(node); at; at = parentOf(at)) count++;
    return count;
  };
  const tip = nodes.reduce((a, b) => (depth(b) > depth(a) ? b : a));
  const centre = new Vector3(...attribute(tip, 'center', [0, 0, 0]));
  const middle = objectBox(scene, tip).getCenter(new Vector3());
  const reach = middle.clone().sub(centre);
  const local =
    reach.length() < 0.02 * size
      ? centre.clone().add(new Vector3(0, 0, 0.25 * size))
      : centre.clone().addScaledVector(reach, 2);
  return times.map((time) => local.clone().applyMatrix4(worldMatrixAt(scene, tip, time)));
}

/** Smallest rotation, in degrees, that takes one orientation to the other. */
export const angleBetween = (a: Quaternion, b: Quaternion) =>
  (2 * Math.acos(Math.min(1, Math.abs(a.dot(b)))) * 180) / Math.PI;

export interface JointDifference {
  def: string;
  /** H-Anim name when the joint has one, otherwise its DEF. */
  name: string;
  part: Part;
  /** The humanoid the joint belongs to, when the scene has more than one figure; otherwise ''. */
  figure: string;
  /** False when the joint is in only one revision. */
  inBoth: boolean;
  /** Per sample: rotation difference in degrees. */
  angle: number[];
  /** Per sample: translation difference in scene units. */
  shift: number[];
  /** Per sample: largest scale ratio difference. */
  scale: number[];
  /** Per sample: 0 (same) to 1 (very different), for drawing. */
  strength: number[];
  /** Per sample: whether this joint differs at all. */
  differs: boolean[];
}
export interface Stretch {
  /** First and last differing sample. */
  from: number;
  to: number;
  kind: 'movement' | 'timing';
  /** Seconds the revised figure is later (positive) or earlier than the original. */
  lag?: number;
  /** The joint and sample of the largest rotation difference in the stretch. */
  peak: { joint: string; def: string; at: number; angle: number };
}
export interface PartDifference {
  /** Unique per figure and part. */
  id: string;
  part: Part;
  figure: string;
  label: string;
  joints: JointDifference[];
  /** Per sample: the strongest joint difference of the part. */
  strength: number[];
  /** Per sample: whether the part differs only in timing. */
  timing: boolean[];
  stretches: Stretch[];
}
export interface BodyMotion {
  /** Seconds compared: the longest clock interval of either revision. */
  window: number;
  samples: number;
  /** Figure size: the diagonal of its rest bounds, for judging translations. */
  size: number;
  parts: PartDifference[];
  joints: JointDifference[];
  /** Names of the figures, when the scene has more than one; otherwise empty. */
  figures: string[];
  /** Whether anything differs. */
  changed: boolean;
}

/** Placement nodes animation moves in either file, and whether they form a figure. */
function animatedJoints(scene: MotionScene): string[] {
  return scene.animated.filter((def) => PLACEMENTS.has(scene.transforms.get(def)?.localName ?? ''));
}
/**
 * Whether two scenes animate an articulated figure: a humanoid, or animated placements nested
 * inside other animated placements. Lone moving objects are better read in Motion paths.
 */
export function isArticulated(before: MotionScene, after: MotionScene): boolean {
  return [before, after].some((scene) => {
    const animated = new Set(animatedJoints(scene).map((def) => scene.transforms.get(def)!));
    for (const node of animated) {
      if (node.localName === 'HAnimJoint' || node.localName === 'HAnimHumanoid') return true;
      for (let at = parentOf(node); at; at = parentOf(at)) if (animated.has(at)) return true;
    }
    return false;
  });
}

/** The humanoid a joint belongs to: its name, or its DEF, or its place among the humanoids. */
function humanoidOf(scene: MotionScene | undefined, node: Element | undefined): string {
  if (!scene || !node) return '';
  for (let at: Element | null = node; at; at = parentOf(at))
    if (at.localName === 'HAnimHumanoid') {
      const name = at.getAttribute('name') || at.getAttribute('DEF');
      if (name) return name;
      const all = Array.from(at.ownerDocument.getElementsByTagName('HAnimHumanoid'));
      return `Figure ${all.indexOf(at) + 1}`;
    }
  return '';
}

const clockWindow = (scene: MotionScene) =>
  Math.max(0, ...[...scene.channels.values()].flat().map((channel) => channel.cycle));

export function compareBodyMotion(
  before: MotionScene,
  after: MotionScene,
  samples = BODY_SAMPLES,
): BodyMotion {
  const names = [...new Set([...animatedJoints(before), ...animatedJoints(after)])];
  if (names.length > MAX_BODY_JOINTS)
    throw new Error(
      `Movement was skipped: more than ${MAX_BODY_JOINTS} animated joints. The file differences remain available.`,
    );
  if (!Number.isInteger(samples) || samples < 2 || samples > 4096)
    throw new Error('Movement sampling requires between 2 and 4096 steps.');
  const window = Math.max(clockWindow(before), clockWindow(after));
  const size = figureSize(before, after);
  const times = Array.from({ length: samples + 1 }, (_, i) => (i / samples) * window);
  const joints: JointDifference[] = [];
  for (const def of names) {
    const a = before.transforms.get(def),
      b = after.transforms.get(def);
    const node = (b ?? a)!;
    const name = node.getAttribute('name') || def;
    const joint: JointDifference = {
      def,
      name,
      part: partOf(name, node.localName),
      figure: humanoidOf(b ? after : before, node),
      inBoth: !!a && !!b,
      angle: [],
      shift: [],
      scale: [],
      strength: [],
      differs: [],
    };
    for (const time of times) {
      if (!a || !b) {
        joint.angle.push(0);
        joint.shift.push(0);
        joint.scale.push(0);
        joint.strength.push(1);
        joint.differs.push(true);
        continue;
      }
      const { angle, shift, scale } = difference(poseAt(before, a, time), poseAt(after, b, time));
      joint.angle.push(angle);
      joint.shift.push(shift);
      joint.scale.push(scale);
      joint.strength.push(strengthOf(angle, shift, scale, size));
      joint.differs.push(isDifferent(angle, shift, scale, size));
    }
    joints.push(joint);
  }
  // Two dancers each have a right arm: with more than one figure, parts are kept per figure.
  const figures = [...new Set(joints.map((joint) => joint.figure))];
  if (figures.length < 2) for (const joint of joints) joint.figure = '';
  const parts: PartDifference[] = [];
  for (const figure of figures.length < 2 ? [''] : figures)
    for (const part of PART_ORDER) {
      const members = joints.filter((joint) => joint.part === part && joint.figure === figure);
      if (!members.length) continue;
      const strength = times.map((_, i) => Math.max(...members.map((joint) => joint.strength[i])));
      const differs = times.map((_, i) => members.some((joint) => joint.differs[i]));
      const stretches = findStretches(differs).map(([from, to]) =>
        describeStretch(before, after, members, from, to, times, size),
      );
      const timing = times.map((_, i) =>
        stretches.some((s) => s.kind === 'timing' && i >= s.from && i <= s.to),
      );
      parts.push({
        id: `${figure}/${part}`,
        part,
        figure,
        label: figure ? `${figure} · ${PART_LABELS[part]}` : PART_LABELS[part],
        joints: members,
        strength,
        timing,
        stretches,
      });
    }
  return {
    window,
    samples,
    size,
    parts,
    joints,
    figures: figures.length < 2 ? [] : figures,
    changed: joints.some((joint) => joint.differs.some(Boolean)),
  };
}

function difference(a: Pose, b: Pose) {
  return {
    angle: angleBetween(a.rotation, b.rotation),
    shift: a.translation.distanceTo(b.translation),
    scale: Math.max(
      Math.abs(a.scale.x - b.scale.x),
      Math.abs(a.scale.y - b.scale.y),
      Math.abs(a.scale.z - b.scale.z),
    ),
  };
}
const strengthOf = (angle: number, shift: number, scale: number, size: number) =>
  Math.min(1, Math.max(angle / FULL_ANGLE, shift / (0.05 * size), scale / 0.25));
const isDifferent = (angle: number, shift: number, scale: number, size: number) =>
  angle > SAME_ANGLE || shift > SAME_SHIFT * size || scale > SAME_SCALE;

function figureSize(...scenes: MotionScene[]): number {
  const box = new Box3();
  for (const scene of scenes)
    for (const def of animatedJoints(scene)) {
      const node = scene.transforms.get(def)!;
      // Only the outermost animated node: its bounds already hold every joint below it.
      let nested = false;
      for (let at = parentOf(node); at; at = parentOf(at))
        if (scene.channels.has(at)) nested = true;
      if (!nested) box.union(objectBox(scene, node));
    }
  return box.isEmpty() ? 1 : box.getSize(new Vector3()).length() || 1;
}

/** Runs of differing samples; gaps of a sample or two are bridged, as sampling noise. */
export function findStretches(differs: boolean[], bridge = 2): Array<[number, number]> {
  const runs: Array<[number, number]> = [];
  for (let i = 0; i < differs.length; i++) {
    if (!differs[i]) continue;
    const last = runs[runs.length - 1];
    if (last && i - last[1] <= bridge + 1) last[1] = i;
    else runs.push([i, i]);
  }
  return runs;
}

/**
 * A stretch is a timing change when one constant shift of the revised figure makes every joint
 * of the part match the original across the whole stretch, and the original actually moves in
 * it (a still pose would otherwise "match" any moment of a movement that passes through it).
 */
function describeStretch(
  before: MotionScene,
  after: MotionScene,
  joints: JointDifference[],
  from: number,
  to: number,
  times: number[],
  size: number,
): Stretch {
  let peak = { joint: joints[0].name, def: joints[0].def, at: from, angle: -1 };
  for (const joint of joints)
    for (let i = from; i <= to; i++)
      if (joint.angle[i] > peak.angle)
        peak = { joint: joint.name, def: joint.def, at: i, angle: joint.angle[i] };
  // A joint that only one revision has is the finding, whatever else moves.
  const missing = joints.find((joint) => !joint.inBoth);
  if (missing)
    return {
      from,
      to,
      kind: 'movement',
      peak: { joint: missing.name, def: missing.def, at: from, angle: 0 },
    };
  const stretch: Stretch = { from, to, kind: 'movement', peak };
  const nodes = joints.map((joint) => [
    before.transforms.get(joint.def)!,
    after.transforms.get(joint.def)!,
  ]);
  const step = times[1] - times[0];
  const window = times[times.length - 1];
  // The original must move within the stretch for a shifted copy of it to mean anything.
  const moves = nodes.some(([a]) => {
    const start = poseAt(before, a, times[from]);
    for (let i = from + 1; i <= to; i++) {
      const pose = poseAt(before, a, times[i]);
      if (!isSame(difference(start, pose), size)) return true;
    }
    return false;
  });
  if (!moves) return stretch;
  const longest = Math.max(step, Math.min(1.5, window / 4));
  const shifts: number[] = [];
  for (let k = 1; k * step <= longest + 1e-9; k++) shifts.push(k * step, -k * step);
  // Every shift that matches within tolerance is a candidate; slow movements match several
  // nearby shifts, so the one that fits best (then the smallest) is the lag reported.
  let best: { lag: number; error: number } | undefined;
  for (const lag of shifts) {
    let error = 0;
    let matches = true;
    for (let i = from; i <= to && matches; i++)
      for (const [a, b] of nodes) {
        const shifted = times[i] + lag;
        if (shifted < 0 || shifted > window + 1e-9) {
          matches = false;
          break;
        }
        const d = difference(poseAt(before, a, times[i]), poseAt(after, b, shifted));
        if (!isSame(d, size)) {
          matches = false;
          break;
        }
        error += d.angle + (d.shift / size) * 100;
      }
    if (matches && (!best || error < best.error - 1e-9)) best = { lag, error };
  }
  return best ? { ...stretch, kind: 'timing', lag: Number(best.lag.toFixed(6)) } : stretch;
}
/** Two poses match when every difference is under a few times the "same" threshold. */
const isSame = (d: { angle: number; shift: number; scale: number }, size: number) =>
  d.angle <= 3 * SAME_ANGLE && d.shift <= 3 * SAME_SHIFT * size && d.scale <= 3 * SAME_SCALE;
