import { assemble, type Cluster, type Point, type Shape, type Vector } from "./creature-parts.ts";
import type { CreatureRecipe } from "./creature-recipe.ts";

// A repo's creature drawn flat, for pictures made without a browser (the Worker's share
// pictures). It draws the same parts as the 3D model (server/creature-parts.ts lists them
// once for both),
// seen from the angle a card's portrait uses (portrait.ts turns the model 0.5 rad).
// Each part is its outline seen from there, filled in two cel bands with an ink edge,
// the way the toon shading and outline read on a card.

type Matrix = [Vector, Vector, Vector];

// The portrait turns the creature to show three quarters of it.
const YAW = 0.5;
// The portrait's sun, from the upper left and in front (portrait.ts: sun at -3, 5, 6).
const SUN: Vector = normalised([-3, 5, 6]);
const INK = "#12151a";
const OUTLINE_WIDTH = 0.05;
// The share of a part the lit band covers, and how far it leans toward the sun.
const LIT_SHARE = 0.84;
const LIT_LEAN = 0.09;
const CURVE_POINTS = 32;
// A box face's angle to the sun, as its dot with the sun: over the first it is lit, under the second shaded.
const LIT_FACE = 0.85;
const SHADED_FACE = 0.3;
const HEADROOM = 0.75;
const FLOAT_LIFT = 0.3;
// The portrait camera (portrait.ts): 30° wide, twice the frame's height away and a little
// above its middle, looking at just under its middle.
const HALF_VIEW = Math.tan((15 * Math.PI) / 180);
const CAMERA_HEIGHT = 0.52;
const CAMERA_DISTANCE = 2;
const CAMERA_AIM = 0.48;

function normalised([x, y, z]: Vector): Vector {
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
}

const multiply = (a: Matrix, b: Matrix): Matrix =>
  a.map((row) => [0, 1, 2].map((column) => row[0] * b[0][column] + row[1] * b[1][column] + row[2] * b[2][column])) as Matrix;
const apply = (m: Matrix, [x, y, z]: Vector): Vector => m.map((row) => row[0] * x + row[1] * y + row[2] * z) as Vector;
const add = (a: Vector, b: Vector): Vector => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const diagonal = ([x, y, z]: Vector): Matrix => [[x, 0, 0], [0, y, 0], [0, 0, z]];

function rotation([x, y, z]: Vector): Matrix {
  const rx: Matrix = [[1, 0, 0], [0, Math.cos(x), -Math.sin(x)], [0, Math.sin(x), Math.cos(x)]];
  const ry: Matrix = [[Math.cos(y), 0, Math.sin(y)], [0, 1, 0], [-Math.sin(y), 0, Math.cos(y)]];
  const rz: Matrix = [[Math.cos(z), -Math.sin(z), 0], [Math.sin(z), Math.cos(z), 0], [0, 0, 1]];
  // three.js turns in X, then Y, then Z order: the matrix is Rx·Ry·Rz.
  return multiply(multiply(rx, ry), rz);
}

/**
 * Where the creature's root puts a part's own space (the portrait's turn and the creature's
 * size), and where the portrait camera sees a point, from -1 to 1 across the picture.
 */
type Placement = { root: Matrix; see: (point: Vector) => Point; scaleAt: (point: Vector) => number };

function portraitCamera(tall: number): Pick<Placement, "see" | "scaleAt"> {
  const eye: Vector = [0, tall * CAMERA_HEIGHT, tall * CAMERA_DISTANCE];
  const [forward, up] = (() => {
    const ahead = normalised([0, tall * CAMERA_AIM - eye[1], -eye[2]]);
    return [ahead, [0, -ahead[2], ahead[1]] as Vector];
  })();
  const ahead = (point: Vector) => (point[0] - eye[0]) * forward[0] + (point[1] - eye[1]) * forward[1] + (point[2] - eye[2]) * forward[2];
  const scaleAt = (point: Vector) => 1 / (ahead(point) * HALF_VIEW);
  const see = (point: Vector): Point => {
    const offset: Vector = [point[0] - eye[0], point[1] - eye[1], point[2] - eye[2]];
    const upward = offset[0] * up[0] + offset[1] * up[1] + offset[2] * up[2];
    return [offset[0] * scaleAt(point), upward * scaleAt(point)];
  };
  return { see, scaleAt };
}

function partMatrix(shape: Shape, placement: Placement): Matrix {
  return multiply(placement.root, multiply(rotation(shape.turn ?? [0, 0, 0]), diagonal(shape.scale ?? [1, 1, 1])));
}

const toWorld = (shape: Shape, placement: Placement, local: Vector): Vector => add(apply(placement.root, shape.at), apply(partMatrix(shape, placement), local));

function hull(points: Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Point, a: Point, b: Point) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: Point[]) =>
    list.reduce<Point[]>((kept, point) => {
      while (kept.length >= 2 && cross(kept[kept.length - 2], kept[kept.length - 1], point) <= 0) kept.pop();
      kept.push(point);
      return kept;
    }, []);
  const lower = half(sorted);
  const upper = half([...sorted].reverse());
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

const circle = (radius: number, y: number, count: number): Vector[] =>
  Array.from({ length: count }, (_, i) => [Math.cos((i / count) * Math.PI * 2) * radius, y, Math.sin((i / count) * Math.PI * 2) * radius] as Vector);

/** The sphere's outline seen from the front: an ellipsoid always shows an ellipse. */
function ellipseOf(matrix: Matrix, centre: Point, scale: number): Point[] {
  const [a, b, c] = [
    matrix[0][0] ** 2 + matrix[0][1] ** 2 + matrix[0][2] ** 2,
    matrix[0][0] * matrix[1][0] + matrix[0][1] * matrix[1][1] + matrix[0][2] * matrix[1][2],
    matrix[1][0] ** 2 + matrix[1][1] ** 2 + matrix[1][2] ** 2,
  ];
  const angle = 0.5 * Math.atan2(2 * b, a - c);
  const spread = Math.sqrt(((a - c) / 2) ** 2 + b ** 2);
  const [wide, narrow] = [Math.sqrt((a + c) / 2 + spread), Math.sqrt(Math.max(0, (a + c) / 2 - spread))];
  return Array.from({ length: CURVE_POINTS }, (_, i) => {
    const t = (i / CURVE_POINTS) * Math.PI * 2;
    const [x, y] = [Math.cos(t) * wide * scale, Math.sin(t) * narrow * scale];
    return [centre[0] + x * Math.cos(angle) - y * Math.sin(angle), centre[1] + x * Math.sin(angle) + y * Math.cos(angle)] as Point;
  });
}

/** The points of a shape's own space whose outline, seen from the front, is the shape's outline. */
function samples(shape: Shape): Vector[] {
  switch (shape.kind) {
    case "cone":
      return [[0, shape.height / 2, 0], ...circle(shape.radius, -shape.height / 2, shape.sides ?? 16)];
    case "cylinder":
      return [...circle(shape.top, shape.height / 2, 16), ...circle(shape.bottom, -shape.height / 2, 16)];
    case "capsule":
      return [-1, 1].flatMap((end) =>
        [0, 0.4, 0.8, 1.2, 1.57].flatMap((tilt) => circle(Math.cos(tilt) * shape.radius, end * (shape.length / 2 + Math.sin(tilt) * shape.radius), 16)),
      );
    case "octahedron":
      return [[shape.radius, 0, 0], [-shape.radius, 0, 0], [0, shape.radius, 0], [0, -shape.radius, 0], [0, 0, shape.radius], [0, 0, -shape.radius]];
    default:
      return [];
  }
}

const number = (value: number) => (Math.round(value * 1000) / 1000).toString();
const pointsOf = (points: Point[]) => points.map(([x, y]) => `${number(x)},${number(y)}`).join(" ");

function channelsOf(hex: string): Vector {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** `hex` moved `amount` of the way toward `toward`. */
function mix(hex: string, toward: string, amount: number): string {
  const [from, to] = [channelsOf(hex), channelsOf(toward)];
  return `#${from.map((channel, i) => Math.round(channel + (to[i] - channel) * amount).toString(16).padStart(2, "0")).join("")}`;
}

// The portrait's lights are bright: its middle band is a little over the paint, its shade under it.
const shadeOf = (paint: string) => mix(paint, "#000000", 0.18);
const bandOf = (paint: string) => mix(paint, "#ffffff", 0.08);
const litOf = (paint: string) => mix(paint, "#ffffff", 0.2);

/** A drawn part and how far toward the viewer it is, so nearer parts are drawn over farther ones. */
type Drawn = { depth: number; svg: string };

/** A solid's outline in two cel bands: the shade, then the lit band leaning toward the sun, then the ink edge. */
function banded(outline: Point[], paint: string, edgeWidth: number | null): string {
  const [cx, cy] = outline.reduce(([x, y], [px, py]) => [x + px / outline.length, y + py / outline.length], [0, 0]);
  const reach = Math.max(...outline.map(([x, y]) => Math.hypot(x - cx, y - cy)));
  const lit = outline.map(([x, y]) => [cx + (x - cx) * LIT_SHARE + SUN[0] * reach * LIT_LEAN, cy + (y - cy) * LIT_SHARE + SUN[1] * reach * LIT_LEAN] as Point);
  const edge = edgeWidth === null ? "" : ` stroke="${INK}" stroke-width="${number(edgeWidth)}" stroke-linejoin="round"`;
  return `<polygon points="${pointsOf(outline)}" fill="${shadeOf(paint)}"${edge}/><polygon points="${pointsOf(lit)}" fill="${bandOf(paint)}"/>`;
}

const FACES: { normal: Vector; corners: Vector[] }[] = [
  { normal: [0, 0, 1], corners: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
  { normal: [0, 0, -1], corners: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
  { normal: [1, 0, 0], corners: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]] },
  { normal: [-1, 0, 0], corners: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] },
  { normal: [0, 1, 0], corners: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]] },
  { normal: [0, -1, 0], corners: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] },
];

/** A box shows two or three faces; each takes the band its angle to the sun gives it, as the toon shading does. */
function boxFaces(shape: Extract<Shape, { kind: "box" }>, placement: Placement, edgeWidth: number | null): string {
  const turn = multiply(placement.root, rotation(shape.turn ?? [0, 0, 0]));
  const half: Vector = [shape.size[0] / 2, shape.size[1] / 2, shape.size[2] / 2];
  const corner = (local: Vector) => placement.see(toWorld(shape, placement, [local[0] * half[0], local[1] * half[1], local[2] * half[2]]));
  // The outline goes round the whole box, as the 3D rim does; the faces meet with no line between them.
  const silhouette = hull(FACES.flatMap(({ corners }) => corners.map(corner)));
  const edge = edgeWidth === null ? "" : `<polygon points="${pointsOf(silhouette)}" fill="${shadeOf(shape.paint)}" stroke="${INK}" stroke-width="${number(edgeWidth)}" stroke-linejoin="round"/>`;
  return edge + FACES.map(({ normal, corners }) => ({ facing: apply(turn, normal), corners }))
    .filter(({ facing }) => facing[2] > 0)
    .sort((a, b) => a.facing[2] - b.facing[2])
    .map(({ facing, corners }) => {
      const light = facing[0] * SUN[0] + facing[1] * SUN[1] + facing[2] * SUN[2];
      // The front and the sunny side read as one band on a model, as the toon shading's wide middle band does.
      const fill = light > LIT_FACE ? litOf(shape.paint) : light > SHADED_FACE ? bandOf(shape.paint) : shadeOf(shape.paint);
      return `<polygon points="${pointsOf(corners.map(corner))}" fill="${fill}"/>`;
    })
    .join("");
}

/** A ring is its centre line drawn as a thick stroke, piece by piece, so it passes behind and in front of the body it circles. */
function ringPieces(shape: Extract<Shape, { kind: "ring" }>, placement: Placement): Drawn[] {
  const arc = shape.arc ?? Math.PI * 2;
  const along = Array.from({ length: CURVE_POINTS + 1 }, (_, i) => (i / CURVE_POINTS) * arc).map((t) => toWorld(shape, placement, [Math.cos(t) * shape.radius, Math.sin(t) * shape.radius, 0]));
  return along.slice(1).map((end, i) => {
    const start = along[i];
    const [[x1, y1], [x2, y2]] = [placement.see(start), placement.see(end)];
    const line = `<line x1="${number(x1)}" y1="${number(y1)}" x2="${number(x2)}" y2="${number(y2)}" stroke="${shape.paint}" stroke-width="${number(shape.tube * 2 * placement.scaleAt(start))}" stroke-linecap="round"/>`;
    return { depth: (start[2] + end[2]) / 2, svg: line };
  });
}

function drawShape(shape: Shape, placement: Placement): Drawn[] {
  const centre = apply(placement.root, shape.at);
  const edgeWidth = shape.outline === false ? null : OUTLINE_WIDTH * placement.scaleAt(centre);
  switch (shape.kind) {
    case "ring":
      return ringPieces(shape, placement);
    case "box":
      return [{ depth: centre[2], svg: boxFaces(shape, placement, edgeWidth) }];
    case "slice": {
      // A star, bolt or heart has dents a hull would fill in, so it is drawn as its front face.
      const outline = shape.points.map(([x, y]) => placement.see(toWorld(shape, placement, [x, y, shape.depth / 2])));
      return [{ depth: centre[2], svg: banded(outline, shape.paint, edgeWidth) }];
    }
    case "sphere": {
      const matrix = multiply(partMatrix(shape, placement), diagonal([shape.radius, shape.radius, shape.radius]));
      return [{ depth: centre[2], svg: banded(ellipseOf(matrix, placement.see(centre), placement.scaleAt(centre)), shape.paint, edgeWidth) }];
    }
    default: {
      const outline = hull(samples(shape).map((local) => placement.see(toWorld(shape, placement, local))));
      return [{ depth: centre[2], svg: banded(outline, shape.paint, edgeWidth) }];
    }
  }
}

const shifted = (shapes: Shape[], by: Vector): Shape[] => shapes.map((shape) => ({ ...shape, at: add(shape.at, by) }));
const unclustered = (cluster: Cluster) => shifted(cluster.shapes, cluster.at);

/** A repo's creature (its `creatureRecipe`) as a square `<svg>` at `place`, framed the way a card's portrait frames it. */
export function creatureSticker(recipe: CreatureRecipe, place: { x: number; y: number; size: number }): string {
  const assembly = assemble(recipe);
  const lift: Vector = [0, assembly.floats ? FLOAT_LIFT : 0, 0];
  // The portrait frames the body, whatever stands on its head and whatever floats over that.
  const tall = assembly.height * recipe.scale[1] + HEADROOM;
  const placement: Placement = { root: multiply(rotation([0, YAW, 0]), diagonal(recipe.scale)), ...portraitCamera(tall) };
  const draw = (shapes: Shape[]) => shifted(shapes, lift).flatMap((shape) => drawShape(shape, placement));
  const onBody = assembly.body.filter((shape) => shape.layer !== "face");
  const onFace = assembly.body.filter((shape) => shape.layer === "face");
  const body = draw([...onBody, ...(assembly.emblem ? unclustered(assembly.emblem) : [])]).sort((a, b) => a.depth - b.depth);
  // The face sits on the body's surface toward the viewer; sorting it by depth against
  // whole parts would put a wide part's middle over it, so it is drawn last.
  const face = draw([...assembly.eyes.flatMap(unclustered), assembly.mouth, ...onFace]);
  const drawn = [...body, ...face].map((part) => part.svg).join("");
  return (
    `<svg x="${number(place.x)}" y="${number(place.y)}" width="${number(place.size)}" height="${number(place.size)}" viewBox="-1 -1 2 2">` +
    `<g transform="scale(1,-1)">${drawn}</g></svg>`
  );
}
