import { Quaternion, type Vector3 } from 'three';
import type { AnalysisFacts } from '../report/export-html';
import { MOVEMENT_LIMITS, MOVEMENT_SHORT } from '../report/limits';
import {
  compareBodyMotion,
  isArticulated,
  poseAt,
  trailOf,
  type BodyMotion,
  type JointDifference,
  type PartDifference,
  type Stretch,
} from '../viewer/bodyMotion';
import { PLACEMENTS, readMotionScene, type MotionScene } from '../viewer/motion';
import { sanitizePreview } from '../viewer/sanitize';
import { prescan } from '../x3d/prescan';
import { COLORS } from './calmScene';
import {
  captionText,
  chip,
  facts,
  icon,
  make,
  measurementLimits,
  n,
  segmented,
  serialize,
  setIcon,
  svg,
  type Tab,
  type Workbench,
} from './ui';

// Movement: where and when two revisions of an animated figure move differently. A grid of
// body parts against time, under the stage, says where to look; the stage shows both figures at
// the chosen moment, the original as a tinted ghost and the revision solid with each joint
// coloured by its difference, and the paths the differing part's far end takes in each.

const GRID = { label: 132, row: 17, joint: 14, top: 4, axis: 16 };
const TIMING = { light: '0.85 0.55 0.10', dark: '0.94 0.71 0.27' };
/** The original figure: a violet ghost, apart from the revision's grey, blue and amber. */
const ORIGINAL = {
  light: { diffuse: '0.55 0.42 0.80', transparency: '0.5' },
  dark: { diffuse: '0.72 0.62 0.95', transparency: '0.55' },
};
/** A skinned figure's mesh: one colour per vertex, set from the joints that move it. */
interface Skin {
  color: string;
  count: number;
  /** The joint moving the vertices and the joints above it, nearest first. */
  influences: Array<{ chain: string[]; index: number[]; weight: number[] }>;
}
const numbers = (value: string | null) =>
  (value ?? '')
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number);

/**
 * The skins of the humanoids under a scene root: each skin shape gets a Color node, and the
 * joints' skinCoordIndex and skinCoordWeight say which vertices each joint moves, and how much.
 */
function skinsOf(root: Element, start: number): Skin[] {
  const skins: Skin[] = [];
  const byDef = new Map<string, Element>();
  for (const node of Array.from(root.getElementsByTagName('*'))) {
    const def = node.getAttribute('DEF');
    if (def) byDef.set(def, node);
  }
  for (const humanoid of Array.from(root.getElementsByTagName('HAnimHumanoid'))) {
    const field = Array.from(humanoid.children).find(
      (child) =>
        child.localName === 'Coordinate' && child.getAttribute('containerField') === 'skinCoord',
    );
    if (!field) continue;
    const coordinate = field.getAttribute('USE') ? byDef.get(field.getAttribute('USE')!) : field;
    const name = coordinate?.getAttribute('DEF');
    if (!coordinate || !name) continue;
    const count = numbers(coordinate.getAttribute('point')).length / 3;
    const influences = Array.from(humanoid.getElementsByTagName('HAnimJoint'))
      .filter((joint) => joint.getAttribute('DEF') && joint.getAttribute('skinCoordIndex'))
      .map((joint) => {
        const index = numbers(joint.getAttribute('skinCoordIndex'));
        const weight = numbers(joint.getAttribute('skinCoordWeight'));
        // A vertex moves with every joint above it: a turned neck moves the head's skin.
        const chain: string[] = [];
        for (let at: Element | null = joint; at && at !== humanoid; at = at.parentElement)
          if (at.localName === 'HAnimJoint' && at.getAttribute('DEF'))
            chain.push(at.getAttribute('DEF')!);
        return { chain, index, weight: index.map((_, i) => weight[i] ?? 1) };
      });
    for (const faces of Array.from(humanoid.getElementsByTagName('IndexedFaceSet'))) {
      const coord = Array.from(faces.children).find((child) => child.localName === 'Coordinate');
      if ((coord?.getAttribute('USE') ?? coord?.getAttribute('DEF')) !== name) continue;
      const color = faces.ownerDocument.createElement('Color');
      const def = `X3DIFF_SKIN_${start + skins.length}`;
      color.setAttribute('DEF', def);
      color.setAttribute('color', Array(count).fill('0.5 0.5 0.5').join(' '));
      faces.removeAttribute('colorIndex');
      faces.setAttribute('colorPerVertex', 'true');
      faces.prepend(color);
      skins.push({ color: def, count, influences });
    }
  }
  return skins;
}

/** One path per revision for each stretch: the far end of the part through the stretch. */
interface Trail {
  stretch: number;
  side: 0 | 1;
  points: Vector3[];
}
const ANIMATION = /Sensor$|Interpolator$|Sequencer$|Trigger$|Filter$|^(ROUTE|Script)$/;
const PREFIX = ['A_', 'B_'] as const;

interface Reading {
  scenes: [MotionScene, MotionScene];
  body: BodyMotion;
}
function read(wb: Workbench): Reading | undefined {
  try {
    const scenes = wb.texts.map((xml) => {
      if (prescan(xml, 'before').length) throw new Error('blocked');
      return readMotionScene(new DOMParser().parseFromString(xml, 'application/xml'));
    }) as [MotionScene, MotionScene];
    if (!isArticulated(...scenes)) return undefined;
    const body = compareBodyMotion(...scenes);
    return body.changed ? { scenes, body } : undefined;
  } catch {
    return undefined;
  }
}

const seconds = (body: BodyMotion, sample: number) => (sample / body.samples) * body.window;
/** Seconds to a tenth: finer than a reviewer reads, coarser than sampling noise. */
const tenth = (value: number) => String(Number(value.toFixed(1)));
const span = (body: BodyMotion, stretch: Stretch) =>
  `${tenth(seconds(body, stretch.from))}–${tenth(seconds(body, stretch.to))} s`;
/** What a stretch is, in a reviewer's words. */
export function stretchText(stretch: Stretch, body: BodyMotion): string {
  if (stretch.kind === 'timing' && stretch.lag !== undefined)
    return `Same movement, B ${tenth(Math.abs(stretch.lag))} s ${stretch.lag > 0 ? 'later' : 'earlier'}`;
  const joint = body.joints.find((item) => item.def === stretch.peak.def);
  if (joint && !joint.inBoth) return `${joint.name} is animated in one revision only`;
  return `Different movement, up to ${Math.round(stretch.peak.angle)}° at ${stretch.peak.joint}`;
}

/** Movement findings for the printable report. */
export function movementFacts(body: BodyMotion): AnalysisFacts[] {
  return body.parts
    .filter((part) => part.stretches.length)
    .map((part, i) => ({
      view: 'Movement',
      object: part.label,
      note:
        i === 0
          ? `Compared over ${n(body.window)} s; joints: ${body.joints.map((joint) => joint.name).join(', ')}.`
          : undefined,
      rows: part.stretches.map(
        (stretch) => [span(body, stretch), stretchText(stretch, body)] as [string, string],
      ),
      limits: MOVEMENT_LIMITS,
    }));
}

/** Axis and angle of a quaternion, as X3D writes a rotation. */
function axisAngle(q: Quaternion): [number, number, number, number] {
  const w = Math.min(1, Math.max(-1, q.w));
  const s = Math.sqrt(1 - w * w);
  return s < 1e-9 ? [0, 0, 1, 0] : [q.x / s, q.y / s, q.z / s, 2 * Math.acos(w)];
}
const mix = (a: string, b: string, t: number) => {
  const [x, y] = [a, b].map((value) => value.split(/\s+/).map(Number));
  return x.map((v, i) => v + (y[i] - v) * t) as [number, number, number];
};

/**
 * Both revisions in one scene with their animation removed (the view poses them), the original
 * as a translucent ghost and the revision with one Material per joint, for colouring.
 */
function buildStage(wb: Workbench, reading: Reading, layout: 'overlay' | 'side', trails: Trail[]) {
  const humanoid = wb.texts.some((xml) => xml.includes('HAnim'));
  const doc = new DOMParser().parseFromString(
    `<X3D version="3.3" profile="Immersive"><head>${humanoid ? '<component name="H-Anim" level="1"/>' : ''}</head><Scene/></X3D>`,
    'application/xml',
  );
  const scene = doc.getElementsByTagName('Scene')[0];
  // A soft light from above, so the tops of things do not go black under the camera light alone.
  const light = doc.createElement('DirectionalLight');
  light.setAttribute('direction', '-0.3 -1 -0.4');
  light.setAttribute('intensity', '0.4');
  light.setAttribute('ambientIntensity', '0.2');
  scene.append(light);
  const palette = COLORS[wb.theme];
  const joints = new Set(reading.body.joints.map((joint) => joint.def));
  const materials = new Map<string, string[]>();
  const skins: Skin[] = [];
  let count = 0,
    viewpoint = false;
  const offset = layout === 'side' ? reading.body.size * 0.35 : 0;
  wb.texts.forEach((xml, side) => {
    const source = new DOMParser().parseFromString(sanitizePreview(xml).xml, 'application/xml');
    const root = source.getElementsByTagName('Scene')[0];
    if (!root) return;
    if (side === 1) {
      const view = Array.from(root.children).find((child) => child.localName === 'Viewpoint');
      if (view && layout === 'overlay') {
        scene.append(doc.importNode(view, true));
        viewpoint = true;
      }
    }
    for (const node of Array.from(root.getElementsByTagName('*')))
      if (
        ANIMATION.test(node.localName) ||
        ['Viewpoint', 'OrthoViewpoint', 'Background', 'NavigationInfo', 'WorldInfo'].includes(
          node.localName,
        )
      )
        node.remove();
    // The figure's own colours (a rainbow skin, coloured markers) would hide the comparison's.
    for (const node of Array.from(root.getElementsByTagName('*')))
      if (node.localName === 'Color' || node.localName === 'ColorRGBA') node.remove();
    // The revision's skin is coloured per vertex, from the joints that move each vertex.
    if (side === 1) skins.push(...skinsOf(root, skins.length));
    for (const shape of Array.from(root.getElementsByTagName('Shape'))) {
      if (shape.getAttribute('USE')) continue;
      for (const child of Array.from(shape.children))
        if (child.localName === 'Appearance') child.remove();
      const appearance = source.createElement('Appearance');
      const material = source.createElement('Material');
      // Each shape takes its colour (B) or its visibility (A) from the animated joint carrying it.
      let owner: Element | null = shape.parentElement;
      while (
        owner &&
        !(PLACEMENTS.has(owner.localName) && joints.has(owner.getAttribute('DEF') ?? ''))
      )
        owner = owner.parentElement;
      const def = owner?.getAttribute('DEF');
      if (side === 0) {
        material.setAttribute('diffuseColor', ORIGINAL[wb.theme].diffuse);
        material.setAttribute('transparency', layout === 'side' ? '0' : '1');
      } else material.setAttribute('diffuseColor', palette.unchanged.diffuse);
      if (def) {
        const name = `X3DIFF_JOINT_${++count}`;
        material.setAttribute('DEF', name);
        const key = `${side}:${def}`;
        materials.set(key, [...(materials.get(key) ?? []), name]);
      }
      material.setAttribute('specularColor', '0.2 0.2 0.2');
      appearance.append(material);
      shape.prepend(appearance);
    }
    for (const node of Array.from(root.getElementsByTagName('*')))
      for (const key of ['DEF', 'USE']) {
        const value = node.getAttribute(key);
        if (value && !value.startsWith('X3DIFF_')) node.setAttribute(key, PREFIX[side] + value);
      }
    const group = doc.createElement('Transform');
    group.setAttribute('translation', `${side ? offset : -offset} 0 0`);
    for (const child of Array.from(root.children)) group.append(doc.importNode(child, true));
    // Paths sit with their figure, so they move with it when the figures stand side by side.
    for (const trail of trails.filter((item) => item.side === side)) {
      const choice = doc.createElement('Switch');
      choice.setAttribute('DEF', `X3DIFF_TRAIL_${side}_${trail.stretch}`);
      choice.setAttribute('whichChoice', '-1');
      const shape = doc.createElement('Shape');
      const appearance = doc.createElement('Appearance');
      const material = doc.createElement('Material');
      material.setAttribute('diffuseColor', '0 0 0');
      material.setAttribute(
        'emissiveColor',
        side === 0 ? ORIGINAL[wb.theme].diffuse : palette.changed.diffuse,
      );
      appearance.append(material);
      // A thin tube: the preview has no line widths, and a one-pixel line is lost on a figure.
      const radius = reading.body.size * 0.005;
      const ring = Array.from({ length: 9 }, (_, i) => {
        const a = (i / 8) * 2 * Math.PI;
        return `${(radius * Math.cos(a)).toFixed(5)} ${(radius * Math.sin(a)).toFixed(5)}`;
      });
      const spine = trail.points.filter(
        (p, i, all) => i === 0 || p.distanceTo(all[i - 1]) > radius * 0.2,
      );
      if (spine.length < 2) continue;
      const tube = doc.createElement('Extrusion');
      tube.setAttribute('crossSection', ring.join(', '));
      tube.setAttribute(
        'spine',
        spine.map((p) => `${p.x.toFixed(4)} ${p.y.toFixed(4)} ${p.z.toFixed(4)}`).join(', '),
      );
      tube.setAttribute('beginCap', 'false');
      tube.setAttribute('endCap', 'false');
      tube.setAttribute('solid', 'false');
      shape.append(appearance, tube);
      choice.append(shape);
      group.append(choice);
    }
    scene.append(group);
  });
  return { xml: serialize(doc), materials, skins, viewpoint };
}

export function movementTab(wb: Workbench): Tab {
  const reading = read(wb);
  let step = 0,
    timer = 0,
    layout: 'overlay' | 'side' = 'overlay',
    focus: string | undefined,
    showAll = false,
    paths = true;
  const open = new Set<string>();
  let materials = new Map<string, string[]>();
  let skins: Skin[] = [];
  // The scene on the stage, so redrawing the timeline (a new width, an opened part) keeps it.
  let loaded = '';
  let drawn = 0;
  let observer: ResizeObserver | undefined;
  // The paths of every stretch, worked out once: they do not depend on the moment or the layout.
  const allStretches = reading
    ? reading.body.parts
        .flatMap((part) => part.stretches.map((stretch) => ({ part, stretch })))
        .sort((a, b) => a.stretch.from - b.stretch.from)
    : [];
  let trails: Trail[] | undefined;
  const trailsOf = (): Trail[] => {
    if (trails || !reading) return trails ?? [];
    const { body, scenes } = reading;
    const result: Trail[] = [];
    allStretches.forEach(({ part, stretch }, index) => {
      const times: number[] = [];
      for (let i = stretch.from; i <= stretch.to; i++) times.push(seconds(body, i));
      if (times.length < 2) return;
      scenes.forEach((scene, side) => {
        const points = trailOf(scene, part.joints, times, body.size);
        if (points) result.push({ stretch: index, side: side as 0 | 1, points });
      });
    });
    return (trails = result);
  };
  // Open on the peak of the earliest difference, so the stage shows something to look at.
  const first = reading?.body.parts
    .flatMap((part) => part.stretches)
    .sort((a, b) => a.from - b.from)[0];
  if (first) step = first.peak.at;
  const stop = () => {
    cancelAnimationFrame(timer);
    timer = 0;
  };
  const hide = () => {
    stop();
    observer?.disconnect();
    observer = undefined;
    loaded = '';
  };

  const tab: Tab = {
    id: 'movement',
    label: 'Movement',
    short: 'Movement',
    available: () => !!reading,
    facts: () => (reading ? movementFacts(reading.body) : []),
    hide,
    async show(alive) {
      stop();
      if (!reading) return;
      const { body, scenes } = reading;
      wb.setFlat(false);
      const byDef = new Map(body.joints.map((joint) => [joint.def, joint]));
      const partOfJoint = new Map(
        body.parts.flatMap((part) => part.joints.map((joint) => [joint, part] as const)),
      );
      const theme = wb.theme;
      const palette = COLORS[theme];
      const last = body.samples;

      // The grid: one row per body part, one column per sample, opened parts list their joints.
      type Row = {
        label: string;
        strength: number[];
        timing: boolean[];
        part: PartDifference;
        joint?: JointDifference;
      };
      const rows: Row[] = [];
      const quiet = body.parts.filter((part) => !part.stretches.length);
      for (const part of body.parts) {
        if (!part.stretches.length && !showAll) continue;
        rows.push({ label: part.label, strength: part.strength, timing: part.timing, part });
        if (open.has(part.id))
          for (const joint of part.joints)
            rows.push({
              label: joint.name,
              strength: joint.strength,
              timing: part.timing,
              part,
              joint,
            });
      }
      // Drawn at the strip's own width, so the labels keep their real size.
      wb.timeline.hidden = false;
      const width = Math.max(280, (wb.timeline.clientWidth || 640) - 24);
      drawn = width;
      // A rotated phone or a dragged splitter redraws the grid at its new width.
      observer?.disconnect();
      observer = new ResizeObserver(() => {
        const now = wb.timeline.clientWidth - 24;
        if (alive() && !wb.timeline.hidden && now > 0 && Math.abs(Math.max(280, now) - drawn) > 8)
          void tab.show(alive);
      });
      observer.observe(wb.timeline);
      // Figure names lengthen the labels; a phone keeps the short column.
      const labels = width < 480 ? 96 : GRID.label;
      const wide = width - labels - 4;
      // A finger needs a taller row than a mouse pointer.
      const coarse = matchMedia('(pointer: coarse)').matches;
      const rowHeight = coarse ? 24 : GRID.row,
        jointHeight = coarse ? 20 : GRID.joint;
      let y = GRID.top;
      const placed = rows.map((row) => {
        const height = row.joint ? jointHeight : rowHeight;
        const top = y;
        y += height + 2;
        return { row, top, height };
      });
      const floor = y;
      const chart = svg('svg', {
        viewBox: `0 0 ${width} ${floor + GRID.axis}`,
        width,
        class: 'movement-grid',
        role: 'img',
        'aria-label': 'Difference between the two figures for each body part over time',
      });
      const x = (sample: number) => labels + (sample / last) * wide;
      for (const { row, top, height } of placed) {
        const differs = row.part.stretches.length > 0;
        const label = svg('text', {
          x: row.joint ? 14 : 2,
          y: top + height / 2 + 4,
          class: `${row.joint ? 'joint' : 'part'}${differs ? ' differs' : ''}`,
        });
        label.textContent = row.joint
          ? row.label
          : `${row.part.joints.length > 1 ? (open.has(row.part.id) ? '▾ ' : '▸ ') : '  '}${row.label}`;
        chart.append(svg('rect', { x: labels, y: top, width: wide, height, class: 'band' }), label);
        // Neighbouring cells of the same shade are drawn as one rectangle.
        let start = 0;
        const shade = (i: number) =>
          row.strength[i] < 0.005
            ? 0
            : (row.timing[i] ? 100 : 0) + Math.max(1, Math.round(row.strength[i] * 10));
        for (let i = 1; i <= last + 1; i++) {
          if (i <= last && shade(i) === shade(start)) continue;
          const value = shade(start);
          if (value)
            chart.append(
              svg('rect', {
                x: x(start),
                y: top,
                width: Math.max(x(i) - x(start), 0.6),
                height,
                class: value >= 100 ? 'cell timing' : 'cell',
                'fill-opacity': (0.18 + 0.82 * ((value % 100) / 10)).toFixed(2),
              }),
            );
          start = i;
        }
        // The label opens the part; the cells pick the moment.
        if (!row.joint && row.part.joints.length > 1) {
          const hit = svg('rect', { x: 0, y: top, width: labels, height, class: 'hit' });
          hit.setAttribute('role', 'button');
          hit.setAttribute('tabindex', '0');
          hit.setAttribute(
            'aria-label',
            `${open.has(row.part.id) ? 'Close' : 'Open'} ${row.part.label}: ${row.part.joints.length} joints`,
          );
          const toggle = () => {
            if (open.has(row.part.id)) open.delete(row.part.id);
            else open.add(row.part.id);
            void tab.show(alive);
          };
          hit.addEventListener('click', toggle);
          hit.addEventListener('keydown', (event) => {
            if ((event as KeyboardEvent).key === 'Enter' || (event as KeyboardEvent).key === ' ') {
              event.preventDefault();
              toggle();
            }
          });
          chart.append(hit);
        }
      }
      const tick = (sample: number, text: string, anchor: string) => {
        const node = svg('text', {
          x: x(sample),
          y: floor + 11,
          'text-anchor': anchor,
          class: 'tick',
        });
        node.textContent = text;
        chart.append(node);
      };
      // A tick every 0.5, 1, 2, 5 or 10 s, the finest that leaves room for its label.
      const every =
        [0.5, 1, 2, 5, 10, 30, 60].find((value) => (wide / body.window) * value >= 44) ??
        body.window;
      for (let t = 0; ((body.window - t) / body.window) * wide >= 40; t += every)
        tick((t / body.window) * last, n(t), t === 0 ? 'start' : 'middle');
      tick(last, `${n(body.window)} s`, 'end');
      const cursor = svg('line', { y1: GRID.top - 2, y2: floor, class: 'cursor' });
      chart.append(cursor);
      const scrub = (event: PointerEvent) => {
        const box = chart.getBoundingClientRect();
        const at = ((event.clientX - box.left) / box.width) * width;
        if (at < labels) return;
        step = Math.round(Math.min(1, Math.max(0, (at - labels) / wide)) * last);
        place();
      };
      chart.addEventListener('pointerdown', (event) => {
        scrub(event);
        const stopScrub = () => chart.removeEventListener('pointermove', scrub);
        chart.addEventListener('pointermove', scrub);
        addEventListener('pointerup', stopScrub, { once: true });
        addEventListener('pointercancel', stopScrub, { once: true });
      });

      const slider = make('input');
      slider.type = 'range';
      slider.min = '0';
      slider.max = String(last);
      slider.step = '1';
      slider.className = 'movement-time';
      slider.setAttribute('aria-label', 'Time');
      slider.addEventListener('input', () => {
        step = Number(slider.value);
        place();
      });
      const readout = make('span', 'movement-clock');
      readout.setAttribute('aria-live', 'off');
      const leaders = make('ol', 'movement-now');

      // The stretches, in time order: the review in a few sentences.
      const stretches = allStretches;
      const list = make('ul', 'movement-list');
      for (const { part, stretch } of stretches) {
        const item = make('li');
        const go = make('button', `movement-stretch ${stretch.kind}`);
        go.type = 'button';
        go.append(
          make('span', `dot ${stretch.kind === 'timing' ? 'ruler' : 'changed'}`),
          make('strong', '', `${part.label} · ${span(body, stretch)}`),
          make('span', 'what', stretchText(stretch, body)),
        );
        go.addEventListener('click', () => {
          stop();
          setIcon(play, '▶', 'Play');
          step = stretch.peak.at;
          focus = part.id;
          place();
        });
        item.append(go);
        list.append(item);
      }

      const setPose = (time: number) => {
        const stage = wb.scene();
        if (!stage) return;
        scenes.forEach((motion, side) => {
          for (const joint of body.joints) {
            const node = motion.transforms.get(joint.def);
            if (!node || !motion.channels.has(node)) continue;
            const pose = poseAt(motion, node, time);
            try {
              const target = stage.getNamedNode(PREFIX[side] + joint.def);
              const fields = new Set(motion.channels.get(node)!.map((channel) => channel.field));
              if (fields.has('translation'))
                Object.assign(target.translation, {
                  x: pose.translation.x,
                  y: pose.translation.y,
                  z: pose.translation.z,
                });
              if (fields.has('rotation')) {
                const [ax, ay, az, angle] = axisAngle(pose.rotation);
                Object.assign(target.rotation, { x: ax, y: ay, z: az, angle });
              }
              if (fields.has('scale'))
                Object.assign(target.scale, { x: pose.scale.x, y: pose.scale.y, z: pose.scale.z });
            } catch {}
          }
        });
        for (const joint of body.joints) {
          const part = partOfJoint.get(joint)!;
          const strength = joint.strength[step] ?? 0;
          const color =
            strength < 0.005
              ? mix(palette.unchanged.diffuse, palette.unchanged.diffuse, 0)
              : mix(
                  palette.unchanged.diffuse,
                  part.timing[step] ? TIMING[theme] : palette.changed.diffuse,
                  0.35 + 0.65 * strength,
                );
          for (const name of materials.get(`1:${joint.def}`) ?? [])
            try {
              Object.assign(stage.getNamedNode(name).diffuseColor, {
                r: color[0],
                g: color[1],
                b: color[2],
              });
            } catch {}
          // Overlaid, the ghost shows only where the part differs now: elsewhere it would sit
          // inside the revision and tint the whole figure.
          const ghost =
            layout === 'side'
              ? 0
              : part.strength[step] >= 0.005
                ? Number(ORIGINAL[theme].transparency)
                : 1;
          for (const name of materials.get(`0:${joint.def}`) ?? [])
            try {
              stage.getNamedNode(name).transparency = ghost;
            } catch {}
        }
        // A skin vertex takes the colour of the strongest weighted difference among its joints.
        for (const skin of skins) {
          const strength = new Float32Array(skin.count);
          const timing = new Uint8Array(skin.count);
          for (const influence of skin.influences) {
            let joint: JointDifference | undefined,
              value = 0;
            for (const def of influence.chain) {
              const candidate = byDef.get(def);
              if (candidate && candidate.strength[step] > value)
                [joint, value] = [candidate, candidate.strength[step]];
            }
            if (!joint || value < 0.005) continue;
            const late = partOfJoint.get(joint)!.timing[step] ? 1 : 0;
            influence.index.forEach((vertex, i) => {
              const weighted = value * influence.weight[i];
              if (vertex < skin.count && weighted > strength[vertex]) {
                strength[vertex] = weighted;
                timing[vertex] = late;
              }
            });
          }
          try {
            const colors = stage.getNamedNode(skin.color).color;
            for (let i = 0; i < skin.count; i++) {
              const [r, g, b] =
                strength[i] < 0.005
                  ? mix(palette.unchanged.diffuse, palette.unchanged.diffuse, 0)
                  : mix(
                      palette.unchanged.diffuse,
                      timing[i] ? TIMING[theme] : palette.changed.diffuse,
                      0.35 + 0.65 * strength[i],
                    );
              Object.assign(colors[i], { r, g, b });
            }
          } catch {}
        }
      };
      const place = () => {
        slider.value = String(step);
        cursor.setAttribute('x1', String(x(step)));
        cursor.setAttribute('x2', String(x(step)));
        const time = seconds(body, step);
        readout.textContent = `${tenth(time)} / ${n(body.window)} s`;
        const now = body.joints
          .filter((joint) => joint.differs[step])
          .sort((a, b) => b.strength[step] - a.strength[step] || b.angle[step] - a.angle[step])
          .slice(0, 4);
        leaders.replaceChildren(
          ...(now.length
            ? now.map((joint) => {
                const part = partOfJoint.get(joint)!;
                const value = !joint.inBoth
                  ? 'one revision only'
                  : joint.angle[step] >= 1
                    ? `${Math.round(joint.angle[step])}°`
                    : `${n(joint.shift[step])} units`;
                const item = make('li', part.timing[step] ? 'timing' : '');
                item.append(
                  make('span', '', `${part.label} · ${joint.name}`),
                  make('strong', '', value),
                );
                return item;
              })
            : [make('li', 'same', 'Both figures hold the same pose at this moment')]),
        );
        for (const node of Array.from(list.querySelectorAll('button')))
          node.classList.remove('current');
        const stage = wb.scene();
        stretches.forEach(({ part, stretch }, i) => {
          const current =
            step >= stretch.from && step <= stretch.to && (!focus || focus === part.id);
          if (current) list.querySelectorAll('button')[i]?.classList.add('current');
          // The paths of the stretch in view, so its shape reads without playing it.
          for (const side of [0, 1])
            try {
              const node = stage?.getNamedNode(`X3DIFF_TRAIL_${side}_${i}`);
              if (node) node.whichChoice = current && paths ? 0 : -1;
            } catch {}
        });
        captionText(
          wb.caption,
          'Movement',
          now.length
            ? `t = ${tenth(time)} s · ${[...new Set(now.map((joint) => partOfJoint.get(joint)!.label))].join(', ')}`
            : `t = ${tenth(time)} s · same pose`,
        );
        setPose(time);
      };

      const jump = (direction: 1 | -1) => {
        stop();
        setIcon(play, '▶', 'Play');
        const order = stretches.map(({ part, stretch }) => ({ part, at: stretch.peak.at }));
        const next =
          direction > 0
            ? (order.find((item) => item.at > step) ?? order[0])
            : ([...order].reverse().find((item) => item.at < step) ?? order[order.length - 1]);
        if (!next) return;
        step = next.at;
        focus = next.part.id;
        place();
      };
      const previous = icon('⏮', 'Previous difference', () => jump(-1));
      const following = icon('⏭', 'Next difference', () => jump(1));
      const play = icon('▶', 'Play', () => {
        if (timer) {
          stop();
          setIcon(play, '▶', 'Play');
          return;
        }
        setIcon(play, '❚❚', 'Pause');
        focus = undefined;
        const started = performance.now() - (step / last) * body.window * 1000;
        const frame = (now: number) => {
          if (!alive()) return stop();
          step = Math.round((((now - started) / 1000 / body.window) % 1) * last);
          place();
          timer = requestAnimationFrame(frame);
        };
        timer = requestAnimationFrame(frame);
      });
      wb.tools.replaceChildren(icon('fit', 'Fit scene', () => wb.pane.refreshView(true)));
      wb.footer.replaceChildren(
        chip('original', 'A original', true, undefined, 'The original figure, see-through'),
        chip('unchanged', 'B', true, undefined, 'The revised figure'),
        chip(
          'changed',
          'Moves differently',
          true,
          undefined,
          'Joint pose differs from the original',
        ),
        chip('ruler', 'Timing only', true, undefined, 'The same movement at another moment'),
        chip(
          'path',
          'Paths',
          paths,
          () => {
            paths = !paths;
            (wb.footer.lastElementChild as HTMLElement).setAttribute('aria-pressed', String(paths));
            place();
          },
          'Where the far end of the differing part travels in each figure',
        ),
      );
      const changedParts = body.parts.filter((part) => part.stretches.length);
      wb.side.replaceChildren(
        make('h2', '', 'Movement'),
        segmented(
          [
            ['overlay', 'Overlay', 'Both figures in one place'],
            ['side', 'Side by side', 'The original on the left, the revision on the right'],
          ],
          layout,
          (next) => {
            layout = next;
            void tab.show(alive);
          },
        ),
        make('p', 'selection-note movement-note', MOVEMENT_SHORT),
        leaders,
        make('h2', '', `What differs · ${stretches.length}`),
        list,
        facts([
          ['Parts that differ', `${changedParts.length} of ${body.parts.length}`],
          ['Joints compared', String(body.joints.length)],
          ['Compared over', `${n(body.window)} s`],
        ]),
        measurementLimits(MOVEMENT_LIMITS),
      );
      const transport = make('div', 'movement-transport');
      const buttons = make('div', 'movement-buttons');
      buttons.style.width = `${labels}px`;
      for (const node of [previous, play, following])
        node.title = node.getAttribute('aria-label') ?? '';
      buttons.append(previous, play, following);
      transport.append(buttons, slider, readout);
      const more = make('button', 'quiet movement-more');
      more.type = 'button';
      more.textContent = showAll
        ? 'Hide unchanged parts'
        : `Show ${quiet.length} unchanged part${quiet.length === 1 ? '' : 's'}`;
      more.setAttribute('aria-expanded', String(showAll));
      more.addEventListener('click', () => {
        showAll = !showAll;
        void tab.show(alive);
      });
      wb.timeline.replaceChildren(chart, transport, ...(quiet.length ? [more] : []));
      const key = `${layout}:${theme}`;
      if (loaded !== key) {
        loaded = '';
        const stage = buildStage(wb, reading, layout, trailsOf());
        materials = stage.materials;
        skins = stage.skins;
        await wb.pane.load(stage.xml);
        if (!alive()) return;
        loaded = key;
        // Side by side, or with no viewpoint of its own, the camera frames the figures.
        if (layout === 'side' || !stage.viewpoint) wb.pane.refreshView(true);
      }
      place();
    },
  };
  return tab;
}
