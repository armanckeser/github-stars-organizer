import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { seededRandom, type Fighter } from "../../../../server/battle";
import type { Look } from "../../../../server/character";
import type { Condition } from "../../../../server/run/hooks";
import { CONDITION_NAMES, sourceOf, type Source } from "../../../../server/run/names";
import { COLS, ROWS, TICK_MS, type FightEvent, type Side } from "../../../../server/run/types";
import { buildCreature, type Creature } from "./creature";
import { dispose, easeOut, overshoot, sphere, toon } from "./kit";
import { buildTrainer, type Trainer } from "./trainer";

// The board a run is played on: a 4 by 4 grid, the player's half near the camera and
// the other team's half behind. Between fights the player drags creatures around their
// half; in a fight every creature walks and hits at once, played from the fight's events.

/** A creature on the board. `x`, `y` is its board cell (server/run/types.ts). */
export type BoardUnit = { id: string; side: Side; fighter: Fighter; x: number; y: number; ranged: boolean };
export type BoardFight = { key: string; ids: [string[], string[]]; events: FightEvent[] };
/** A point on screen, in CSS pixels from the top left of the page. */
export type Point = { clientX: number; clientY: number };

type Actor = {
  unit: BoardUnit;
  creature: Creature;
  /** Where the creature stands, and where it is drawn (which trails behind). */
  home: THREE.Vector3;
  at: THREE.Vector3;
  facing: number;
  hp: number;
  bar: THREE.Group;
  fill: THREE.Mesh;
  /** The condition the creature has, shown over its HP bar. */
  badge: THREE.Mesh;
  /** When each ability, set or boost was last named over the creature, and when the next name may show. */
  named: Map<string, number>;
  nextName: number;
  grow: number;
  lunge: THREE.Vector3;
  flash: number;
  squash: number;
  out: boolean;
  won: boolean;
};

type Tween = { start: number; end: number; update: (k: number) => void; done?: () => void };

const BACKDROP = 0x080b0f;
const CELL = 1.3;
const SIZE = 0.7;
const MINE = [0x0e3a25, 0x0a5a2c];
const THEIRS = [0x2a1d24, 0x3a2129];
const FLOOR: [string, number][] = [["#10151b", 0.62], ["#0e2a1d", 0.2], ["#0a3d22", 0.12], ["#14602c", 0.06]];

/** The colours an ability, set bonus or boost is named in over a creature: background, then text. */
const NAMED: Record<Source["kind"], [string, string]> = { ability: ["#3ea6ff", "#06121d"], set: ["#35c450", "#04140a"], boost: ["#ffd84d", "#1d1600"], condition: ["#a47cff", "#ffffff"] };
const CONDITION_COLOR: Record<Condition, string> = { "merge-conflict": "#ff8f3d", "rate-limited": "#3ea6ff", deprecated: "#a47cff", flaky: "#ffd84d" };
const HEAL = "#5be37a";
/** Names over one creature show at least this far apart, and the same name at most this often, in fight seconds. */
const NAME_GAP = 0.32;
const NAME_REPEAT = 2.4;

const world = (x: number, y: number) => new THREE.Vector3((x - (COLS - 1) / 2) * CELL, 0.1, (ROWS - 0.5 - y) * CELL);

export class BoardWorld {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(36, 1, 0.1, 120);
  private eye = new THREE.Vector3();
  private aim = new THREE.Vector3();
  private cells: THREE.Mesh[] = [];
  private actors = new Map<string, Actor>();
  private trainers: [Trainer | null, Trainer | null] = [null, null];
  private looks: [string, string] = ["", ""];
  private ring: THREE.Mesh;
  private selected: string | null = null;
  private tweens: Tween[] = [];
  private now = 0;
  private clock = 0;
  private last = 0;
  private raf = 0;
  private speed = 1;
  private shake = 0;
  private fight: { key: string; ids: [string[], string[]]; events: FightEvent[]; next: number; time: number; done: boolean } | null = null;
  private drag: { id: string; startX: number; startY: number; moved: boolean } | null = null;
  private observer: ResizeObserver;
  private raycaster = new THREE.Raycaster();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.1);
  private labels = new Set<HTMLElement>();
  private badges = new Map<Condition, THREE.CanvasTexture>();
  private disposed = false;

  /** Throws when the browser can't give a WebGL context. */
  constructor(
    private host: HTMLElement,
    private options: {
      reduced: boolean;
      lite: boolean;
      onLost: () => void;
      onPlace: (id: string, col: number, row: number) => void;
      onSelect: (id: string | null) => void;
      onFightEnd: (key: string) => void;
      /** A creature is being carried (its id), or was put down (null). */
      onDrag: (id: string | null) => void;
      /** The pointer moved while carrying, or the carry ended (null). */
      onDragAt: (point: Point | null) => void;
      /** A creature put down at a point on screen: true when something off the board (the bench, the shop) took it. */
      onDrop: (id: string, point: Point) => boolean;
    },
  ) {
    const phone = window.matchMedia("(pointer: coarse)").matches;
    this.renderer = new THREE.WebGLRenderer({ antialias: !options.lite && !(phone && window.devicePixelRatio >= 2) });
    this.renderer.setPixelRatio(options.lite ? 1 : Math.min(window.devicePixelRatio, phone ? 1.75 : 2));
    this.renderer.shadowMap.enabled = !options.lite;
    this.renderer.shadowMap.type = phone ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    const canvas = this.renderer.domElement;
    canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      if (!this.disposed) options.onLost();
    });
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none";
    canvas.setAttribute("aria-hidden", "true");
    host.append(canvas);

    this.scene.background = new THREE.Color(BACKDROP);
    this.scene.fog = new THREE.Fog(BACKDROP, 14, 36);
    this.scene.add(new THREE.HemisphereLight(0xd6e6ff, 0x1c2430, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 2.4);
    sun.position.set(-5, 9, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.setScalar(phone ? 512 : 1024);
    Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
    sun.shadow.bias = -0.0006;
    this.scene.add(sun);

    this.buildFloor();
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.44, 0.54, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    this.scene.add(this.ring);

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    canvas.addEventListener("pointerdown", this.down);
    canvas.addEventListener("pointermove", this.move);
    canvas.addEventListener("pointerup", this.up);
    canvas.addEventListener("pointercancel", this.up);
    this.raf = requestAnimationFrame(this.frame);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    for (const label of this.labels) label.remove();
    for (const texture of this.badges.values()) texture.dispose();
    dispose(this.scene);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }

  // --- what the screen asks for ---

  /** The two characters standing at the ends of the board. */
  setLooks(near: Look | null, far: Look | null) {
    ([near, far] as const).forEach((look, side) => {
      const key = look ? JSON.stringify(look) : "";
      if (key === this.looks[side]) return;
      this.looks[side] = key;
      const old = this.trainers[side];
      if (old) {
        this.scene.remove(old.root);
        dispose(old.root);
      }
      this.trainers[side] = null;
      if (!look) return;
      const trainer = buildTrainer(look);
      trainer.root.scale.setScalar(0.8);
      this.scene.add(trainer.root);
      this.trainers[side] = trainer;
    });
    this.post();
  }

  // Where the two characters stand: beside the board on a wide screen, and at its near
  // and far ends on an upright phone, where the sides are off the screen.
  private post() {
    const upright = this.camera.aspect < 1;
    this.trainers.forEach((trainer, side) => {
      if (!trainer) return;
      const sign = side === 0 ? 1 : -1;
      if (upright) trainer.root.position.set(-sign * CELL * 1.5, 0.05, sign * (ROWS * CELL + 0.75));
      else trainer.root.position.set(-sign * (COLS * CELL * 0.5 + 0.85), 0.05, sign * CELL * (side === 0 ? 0.4 : 0.9));
      trainer.root.rotation.y = upright ? (side === 0 ? Math.PI : 0) : side === 0 ? Math.PI * 0.75 : -Math.PI * 0.25;
    });
  }

  /** Every creature on the board between fights. A new one pops in, a missing one leaves, a moved one walks. */
  setUnits(units: BoardUnit[]) {
    if (this.fight && !this.fight.done) return;
    this.fight = null;
    const wanted = new Map(units.map((unit) => [unit.id, unit]));
    for (const [id, actor] of this.actors) if (!wanted.has(id) || wanted.get(id)!.fighter !== actor.unit.fighter) this.remove(id);
    for (const unit of units) {
      const actor = this.actors.get(unit.id) ?? this.add(unit);
      actor.unit = unit;
      actor.home.copy(world(unit.x, unit.y));
      actor.facing = unit.side === 0 ? Math.PI : 0;
      // Back from a fight: on its feet, at full health.
      if (actor.out || actor.hp !== unit.fighter.hp || actor.won) {
        actor.out = false;
        actor.won = false;
        actor.hp = unit.fighter.hp;
        actor.bar.visible = true;
        actor.badge.visible = false;
        actor.named.clear();
        actor.nextName = 0;
        this.fill(actor);
        if (actor.grow < 1) this.tween(0, 0.35, (k) => (actor.grow = overshoot(k)));
      }
    }
  }

  setSelected(id: string | null) {
    this.selected = id;
  }

  setSpeed(speed: number) {
    this.speed = speed;
  }

  /** Plays a fight from its events. A fight already playing under the same key is left alone. */
  play(fight: BoardFight) {
    if (this.fight?.key === fight.key) return;
    this.fight = { ...fight, next: 0, time: -0.6, done: false };
    this.selected = null;
    this.drag = null;
  }

  /** Jumps to the end of the fight being played. */
  skip() {
    if (!this.fight || this.fight.done) return;
    this.fight.time = Infinity;
  }

  /** The player's own cell under a point on screen, as column and row (row 0 in front), or null. */
  cellAt(point: Point): { col: number; row: number } | null {
    const cell = this.cellUnder(point);
    return cell && cell.y < ROWS ? { col: cell.x, row: ROWS - 1 - cell.y } : null;
  }

  /** Lights the player's cell under a point, for a creature carried in from the bench. Null clears. */
  hover(point: Point | null) {
    this.light(point ? this.cellUnder(point) : null);
  }

  /** Where a board cell's middle is on screen. The browser tests drag to it. */
  screenOf(x: number, y: number): Point {
    return this.toScreen(world(x, y));
  }

  /** Where a creature is drawn on screen, or null when it is not on the board. */
  screenOfUnit(id: string): Point | null {
    const actor = this.actors.get(id);
    return actor && !actor.out ? this.toScreen(actor.at.clone().setY(actor.creature.height * SIZE * 0.4)) : null;
  }

  private toScreen(at: THREE.Vector3): Point {
    const point = at.clone().project(this.camera);
    const box = this.renderer.domElement.getBoundingClientRect();
    return { clientX: box.left + (point.x * 0.5 + 0.5) * box.width, clientY: box.top + (-point.y * 0.5 + 0.5) * box.height };
  }

  // --- building ---

  private buildFloor() {
    const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 48), new THREE.MeshBasicMaterial({ color: 0x0b0f14 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.06;
    this.scene.add(ground);

    // The contribution-graph floor the board sits on.
    const random = seededRandom("board-floor");
    const pitch = 0.74;
    const spots: THREE.Vector3[] = [];
    const colours: THREE.Color[] = [];
    for (let i = -13; i <= 13; i++) {
      for (let j = -13; j <= 13; j++) {
        const x = i * pitch;
        const z = j * pitch;
        if (Math.hypot(x, z) > 9.4 || (Math.abs(x) < COLS * CELL * 0.5 + 0.2 && Math.abs(z) < ROWS * CELL + 0.2)) continue;
        spots.push(new THREE.Vector3(x, -0.02, z));
        let roll = random();
        colours.push(new THREE.Color((FLOOR.find(([, share]) => (roll -= share) < 0) ?? FLOOR[0])[0]));
      }
    }
    const tiles = new THREE.InstancedMesh(new RoundedBoxGeometry(pitch - 0.1, 0.1, pitch - 0.1, 2, 0.04), toon(0xffffff), spots.length);
    tiles.receiveShadow = true;
    const place = new THREE.Object3D();
    spots.forEach((spot, i) => {
      place.position.copy(spot);
      place.updateMatrix();
      tiles.setMatrixAt(i, place.matrix);
      tiles.setColorAt(i, colours[i]);
    });
    this.scene.add(tiles);

    const slab = new RoundedBoxGeometry(CELL - 0.08, 0.16, CELL - 0.08, 3, 0.07);
    for (let y = 0; y < ROWS * 2; y++) {
      for (let x = 0; x < COLS; x++) {
        const cell = new THREE.Mesh(slab, toon((y < ROWS ? MINE : THEIRS)[(x + y) % 2]));
        cell.position.copy(world(x, y)).setY(0.02);
        cell.receiveShadow = true;
        cell.userData = { x, y, colour: (cell.material as THREE.MeshToonMaterial).color.getHex() };
        this.cells.push(cell);
        this.scene.add(cell);
      }
    }

    const skyline = seededRandom("board-skyline");
    const shades = [0x0f151c, 0x131b25, 0x18222e];
    for (let i = 0; i < 54; i++) {
      const angle = (i / 54) * Math.PI * 2 + skyline() * 0.08;
      const distance = 11 + skyline() * 9;
      const tall = 1.5 + skyline() * skyline() * 9;
      const wide = 0.9 + skyline() * 1.6;
      const tower = new THREE.Mesh(new THREE.BoxGeometry(wide, tall, wide), new THREE.MeshBasicMaterial({ color: shades[i % 3] }));
      tower.position.set(Math.cos(angle) * distance, tall / 2 - 0.06, Math.sin(angle) * distance);
      tower.rotation.y = skyline() * Math.PI;
      this.scene.add(tower);
    }
  }

  private add(unit: BoardUnit): Actor {
    const creature = buildCreature(unit.fighter);
    creature.root.traverse((child) => (child.userData.actor = unit.id));
    const bar = new THREE.Group();
    const back = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.12), new THREE.MeshBasicMaterial({ color: 0x05070a, depthTest: false, transparent: true, opacity: 0.85 }));
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.07), new THREE.MeshBasicMaterial({ color: unit.side === 0 ? 0x35c450 : 0xe5484d, depthTest: false, transparent: true }));
    fill.position.z = 0.002;
    back.renderOrder = 10;
    fill.renderOrder = 11;
    const badge = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.21), new THREE.MeshBasicMaterial({ depthTest: false, transparent: true }));
    badge.position.set(0, 0.19, 0.004);
    badge.renderOrder = 12;
    badge.visible = false;
    bar.add(back, fill, badge);
    this.scene.add(creature.root, bar);
    const home = world(unit.x, unit.y);
    const actor: Actor = { unit, creature, home, at: home.clone(), facing: 0, hp: unit.fighter.hp, bar, fill, badge, named: new Map(), nextName: 0, grow: 0, lunge: new THREE.Vector3(), flash: 0, squash: 0, out: false, won: false };
    this.actors.set(unit.id, actor);
    this.tween(0, 0.4, (k) => (actor.grow = overshoot(k)));
    return actor;
  }

  private remove(id: string) {
    const actor = this.actors.get(id);
    if (!actor) return;
    this.actors.delete(id);
    this.scene.remove(actor.creature.root, actor.bar);
    dispose(actor.creature.root);
    dispose(actor.bar);
  }

  private fill(actor: Actor) {
    const share = Math.max(0, Math.min(1, actor.hp / actor.unit.fighter.hp));
    actor.fill.scale.x = Math.max(0.001, share);
    actor.fill.position.x = -0.42 * (1 - share);
  }

  // --- the fight ---

  private apply(event: FightEvent, quick: boolean) {
    const fight = this.fight!;
    if (event.kind === "end") {
      fight.done = true;
      for (const actor of this.actors.values()) actor.won = !actor.out && event.winner === actor.unit.side;
      this.after(quick ? 0.2 : 1.1, () => !this.disposed && this.fight === fight && this.options.onFightEnd(fight.key));
      return;
    }
    const actor = this.actors.get(fight.ids[event.side][event.unit]);
    if (!actor) return;
    if (event.kind === "move") {
      actor.home.copy(world(event.x, event.y));
    } else if (event.kind === "faint") {
      actor.out = true;
      actor.bar.visible = false;
      if (quick) actor.grow = 0;
      else this.tween(0.12, 0.4, (k) => (actor.grow = 1 - easeOut(k)));
    } else if (event.kind === "ability") {
      if (!quick) this.name(actor, event.ability);
    } else if (event.kind === "hp") {
      actor.hp = Math.max(0, Math.min(actor.unit.fighter.hp, actor.hp + event.change));
      this.fill(actor);
      if (quick) return;
      if (event.change > 0) actor.flash = 0.5;
      this.label(this.over(actor, 0.5), event.change > 0 ? `+${event.change}` : String(event.change), { color: event.change > 0 ? HEAL : CONDITION_COLOR[event.cause as Condition] ?? "#ff8f93" });
    } else if (event.kind === "condition") {
      const condition = event.condition as Condition;
      actor.badge.visible = event.on && condition in CONDITION_NAMES;
      if (actor.badge.visible) {
        const material = actor.badge.material as THREE.MeshBasicMaterial;
        material.map = this.badgeFor(condition);
        material.needsUpdate = true;
      }
    } else if (event.kind === "hit") {
      const target = this.actors.get(fight.ids[event.side === 0 ? 1 : 0][event.target]);
      if (!target) return;
      target.hp = Math.max(0, target.hp - event.damage);
      this.fill(target);
      if (quick) return;
      const toward = target.home.clone().sub(actor.home);
      actor.facing = Math.atan2(toward.x, toward.z);
      const land = () => {
        target.flash = 1;
        target.squash = event.critical ? 0.3 : 0.16;
        if (event.critical) this.shake = 0.12;
        this.label(this.over(target, 0.5), String(event.damage), event.critical ? { color: "#ffd84d", size: 22 } : {});
      };
      if (actor.unit.ranged) {
        const shot = new THREE.Mesh(sphere(0.11, 10), new THREE.MeshBasicMaterial({ color: actor.unit.fighter.color && /^#[0-9a-f]{6}$/i.test(actor.unit.fighter.color) ? actor.unit.fighter.color : 0xffffff }));
        const from = actor.at.clone().setY(actor.creature.height * SIZE * 0.6);
        const to = target.at.clone().setY(target.creature.height * SIZE * 0.5);
        this.scene.add(shot);
        actor.squash = 0.14;
        this.tween(0, 0.22, (k) => shot.position.lerpVectors(from, to, k).setY(from.y + (to.y - from.y) * k + Math.sin(k * Math.PI) * 0.5), () => {
          this.scene.remove(shot);
          dispose(shot);
          land();
        });
      } else {
        const reach = toward.setY(0).normalize().multiplyScalar(0.45);
        this.tween(0, 0.11, (k) => actor.lunge.copy(reach).multiplyScalar(easeOut(k)), land);
        this.tween(0.11, 0.2, (k) => actor.lunge.copy(reach).multiplyScalar(1 - easeOut(k)));
      }
    }
  }

  /** A point over the creature's head. */
  private over(actor: Actor, above: number) {
    return actor.at.clone().setY(actor.creature.height * SIZE + above);
  }

  /** A number or a name that rises over the board and fades. */
  private label(at: THREE.Vector3, text: string, style: { color?: string; size?: number; background?: string }) {
    if (this.options.reduced && !style.background) return;
    const point = at.project(this.camera);
    const label = document.createElement("span");
    label.textContent = text;
    const pill = style.background ? `background:${style.background};padding:2px 7px;border-radius:999px;white-space:nowrap;box-shadow:0 1px 4px #0008;` : "text-shadow:0 1px 0 #000,0 0 6px #000;";
    const life = style.background ? 1100 : 650;
    label.style.cssText = `position:absolute;left:${(point.x * 0.5 + 0.5) * 100}%;top:${(-point.y * 0.5 + 0.5) * 100}%;transform:translate(-50%,-50%);pointer-events:none;z-index:5;font:700 ${style.size ?? (style.background ? 12 : 15)}px/1.2 var(--font-display, system-ui);color:${style.color ?? "#fff"};${pill}transition:transform ${life}ms ease-out,opacity ${life}ms ease-in`;
    if (style.background) label.dataset.named = text;
    this.host.append(label);
    this.labels.add(label);
    requestAnimationFrame(() => {
      if (!this.options.reduced) label.style.transform = `translate(-50%,${style.background ? -260 : -190}%)`;
      label.style.opacity = "0";
    });
    setTimeout(() => {
      label.remove();
      this.labels.delete(label);
    }, life);
  }

  /** Names the ability, set bonus or boost that just fired, over the creature. Names queue a little apart, and the same one does not repeat on every hit. */
  private name(actor: Actor, id: string) {
    const last = actor.named.get(id);
    if (last !== undefined && this.now - last < NAME_REPEAT) return;
    actor.named.set(id, this.now);
    const at = Math.max(this.now, actor.nextName);
    actor.nextName = at + NAME_GAP;
    const source = sourceOf(id);
    const [background, color] = NAMED[source.kind];
    const fight = this.fight;
    this.after(at - this.now, () => {
      if (this.disposed || this.fight !== fight || actor.out) return;
      actor.squash = Math.max(actor.squash, 0.1);
      this.label(this.over(actor, 0.95), source.name, { background, color });
    });
  }

  private badgeFor(condition: Condition): THREE.CanvasTexture {
    const made = this.badges.get(condition);
    if (made) return made;
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const pen = canvas.getContext("2d")!;
    pen.fillStyle = CONDITION_COLOR[condition];
    pen.beginPath();
    pen.roundRect(4, 6, 248, 52, 26);
    pen.fill();
    pen.fillStyle = "#0b0f14";
    pen.font = "700 30px system-ui, sans-serif";
    pen.textAlign = "center";
    pen.textBaseline = "middle";
    pen.fillText(CONDITION_NAMES[condition], 128, 33);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.badges.set(condition, texture);
    return texture;
  }

  // --- time ---

  private tween(delay: number, duration: number, update: (k: number) => void, done?: () => void) {
    this.tweens.push({ start: this.now + delay, end: this.now + delay + duration, update, done });
  }

  private after(delay: number, done: () => void) {
    this.tween(delay, 0, () => {}, done);
  }

  private frame = (ms: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const seconds = Math.min(0.05, (ms - this.last) / 1000);
    this.last = ms;
    const step = seconds * this.speed;
    this.now += step;
    if (!this.options.reduced) this.clock += seconds;

    const fight = this.fight;
    if (fight && !fight.done) {
      const quick = fight.time === Infinity;
      fight.time += step;
      while (!fight.done && fight.next < fight.events.length && (fight.events[fight.next].t * TICK_MS) / 1000 <= fight.time) this.apply(fight.events[fight.next++], quick);
      if (quick) for (const actor of this.actors.values()) actor.at.copy(actor.home);
    }

    this.tweens = this.tweens.filter((tween) => {
      if (this.now < tween.start) return true;
      const k = tween.end === tween.start ? 1 : Math.min(1, (this.now - tween.start) / (tween.end - tween.start));
      tween.update(k);
      if (k < 1) return true;
      tween.done?.();
      return false;
    });

    this.pose(seconds);
    this.renderer.render(this.scene, this.camera);
  };

  private pose(seconds: number) {
    const dragging = this.drag?.moved ? this.drag.id : null;
    for (const [id, actor] of this.actors) {
      const { creature } = actor;
      const t = this.clock + creature.phase;
      // The creature trails toward where it stands, so a walk and a swap are both a glide.
      if (id !== dragging) actor.at.lerp(actor.home, 1 - Math.exp(-seconds * this.speed * 9));
      const walking = id !== dragging && actor.at.distanceTo(actor.home) > 0.06;
      const hop = actor.won ? Math.abs(Math.sin(t * 5)) * 0.3 : walking ? Math.abs(Math.sin(this.now * 14)) * 0.12 : 0;
      const breath = this.options.reduced ? 0 : Math.sin(t * 2.3) * 0.028;
      actor.squash = Math.max(0, actor.squash - seconds * 1.6);
      actor.flash = Math.max(0, actor.flash - seconds * 6);
      const base = creature.root.userData.scale as THREE.Vector3;
      creature.root.position.copy(actor.at).add(actor.lunge);
      if (id === dragging) creature.root.position.y += 0.45;
      creature.root.scale.copy(base).multiplyScalar(SIZE * actor.grow * (id === this.selected ? 1.08 : 1));
      creature.root.visible = actor.grow > 0.02;
      creature.root.rotation.y += (((actor.facing - creature.root.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, seconds * 12);
      creature.body.position.y = hop + (creature.floats ? 0.3 + Math.sin(t * 1.7) * 0.08 : 0);
      creature.body.scale.set(1 - breath * 0.5 + actor.squash * 0.6, 1 + breath - actor.squash, 1 - breath * 0.5 + actor.squash * 0.6);
      const blink = t % 3.6 < 0.11 ? 0.12 : 1;
      for (const eye of creature.eyes) eye.scale.y = blink;
      creature.limbs.forEach((limb, i) => (limb.rotation.x = Math.sin(t * 2.3 + i * Math.PI) * 0.16));
      for (const spinner of creature.spinners) spinner.rotation.y = t * 0.9;
      for (const skin of creature.skins) skin.emissive.setScalar(actor.flash * 0.8);
      actor.bar.position.copy(creature.root.position).setY(creature.height * SIZE * base.y + 0.55 + (id === dragging ? 0.45 : 0));
      actor.bar.quaternion.copy(this.camera.quaternion);
    }

    const chosen = this.selected ? this.actors.get(this.selected) : undefined;
    this.ring.visible = Boolean(chosen) && !chosen!.out;
    if (chosen) {
      this.ring.position.copy(chosen.at).setY(0.12);
      this.ring.scale.setScalar(1 + Math.sin(this.clock * 4) * 0.05);
    }

    this.trainers.forEach((trainer, side) => {
      if (!trainer) return;
      const beat = this.clock + side * 1.3;
      const won = this.fight?.done ? [...this.actors.values()].some((actor) => actor.won && actor.unit.side === side) : false;
      trainer.root.position.y = 0.05 + (won ? Math.abs(Math.sin(beat * 5)) * 0.22 : 0);
      trainer.head.rotation.y = Math.sin(beat * 0.6) * 0.12;
      trainer.arms[0].rotation.x = -Math.sin(beat * 1.4) * 0.04;
      trainer.arms[1].rotation.x = Math.sin(beat * 1.4) * 0.04;
      trainer.arms[0].rotation.z = won ? -2.7 : -0.12;
      trainer.arms[1].rotation.z = won ? 2.7 : 0.12;
    });

    this.shake = Math.max(0, this.shake - seconds * 0.6);
    const drift = this.options.reduced ? 0 : 1;
    this.camera.position.set(this.eye.x + drift * Math.sin(this.clock * 0.3) * 0.12 + (Math.random() - 0.5) * this.shake, this.eye.y + (Math.random() - 0.5) * this.shake, this.eye.z);
    this.camera.lookAt(this.aim);
  }

  // --- the frame around it ---

  private resize() {
    const { clientWidth: width, clientHeight: height } = this.host;
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    // The shop covers the bottom of the view, so the camera aims in front of the board to lift the board clear.
    if (this.camera.aspect < 1) {
      this.camera.fov = 50;
      this.eye.set(0, 12.2, 7.4);
      this.aim.set(0, 0, 0.5);
    } else {
      this.camera.fov = 34;
      this.eye.set(0, 7.0, 7.8);
      this.aim.set(0, 0, 0.85);
    }
    this.camera.updateProjectionMatrix();
    this.post();
  }

  private ray(event: Point) {
    const box = this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2(((event.clientX - box.left) / box.width) * 2 - 1, -((event.clientY - box.top) / box.height) * 2 + 1), this.camera);
  }

  private actorUnder(event: PointerEvent): string | null {
    this.ray(event);
    const [hit] = this.raycaster.intersectObjects([...this.actors.values()].filter((actor) => !actor.out).map((actor) => actor.creature.root), true);
    return (hit?.object.userData.actor as string | undefined) ?? null;
  }

  private cellUnder(event: Point): { x: number; y: number } | null {
    this.ray(event);
    const point = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.ground, point)) return null;
    const x = Math.round(point.x / CELL + (COLS - 1) / 2);
    const y = Math.round(ROWS - 0.5 - point.z / CELL);
    return x >= 0 && x < COLS && y >= 0 && y < ROWS * 2 ? { x, y } : null;
  }

  private light(cell: { x: number; y: number } | null) {
    for (const mesh of this.cells) {
      const on = cell !== null && mesh.userData.x === cell.x && mesh.userData.y === cell.y && cell.y < ROWS;
      (mesh.material as THREE.MeshToonMaterial).color.setHex(on ? 0x35c450 : (mesh.userData.colour as number));
    }
  }

  private down = (event: PointerEvent) => {
    if (this.fight && !this.fight.done) return;
    const id = this.actorUnder(event);
    if (!id) return this.options.onSelect(null);
    this.drag = { id, startX: event.clientX, startY: event.clientY, moved: false };
    this.renderer.domElement.setPointerCapture(event.pointerId);
  };

  private move = (event: PointerEvent) => {
    const drag = this.drag;
    if (!drag) {
      this.renderer.domElement.style.cursor = (!this.fight || this.fight.done) && this.actorUnder(event) ? "grab" : "";
      return;
    }
    const actor = this.actors.get(drag.id);
    // Only the player's own creatures can be carried.
    if (!actor || actor.unit.side !== 0 || this.fight) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 8) return;
    if (!drag.moved) this.options.onDrag(drag.id);
    drag.moved = true;
    this.options.onDragAt(event);
    this.renderer.domElement.style.cursor = "grabbing";
    const point = new THREE.Vector3();
    this.ray(event);
    if (this.raycaster.ray.intersectPlane(this.ground, point)) actor.at.set(point.x, 0.1, point.z);
    this.light(this.cellUnder(event));
  };

  private up = (event: PointerEvent) => {
    const drag = this.drag;
    this.drag = null;
    this.light(null);
    this.renderer.domElement.style.cursor = "";
    if (!drag) return;
    if (!drag.moved) return this.options.onSelect(drag.id);
    this.options.onDrag(null);
    this.options.onDragAt(null);
    if (this.options.onDrop(drag.id, event)) return;
    const cell = this.cellUnder(event);
    // Board cell back to the player's own column and row: row 0 is the front.
    if (cell && cell.y < ROWS) this.options.onPlace(drag.id, cell.x, ROWS - 1 - cell.y);
  };
}
