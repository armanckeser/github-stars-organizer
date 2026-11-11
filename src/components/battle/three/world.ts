import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { seededRandom, type Fighter } from "../../../../server/battle";
import { encodeLook, type Look } from "../../../../server/character";
import { TYPE } from "../repo-card";
import { buildCreature, type Creature } from "./creature";
import { cylinder, dispose, easeInOut, easeOut, overshoot, part, sphere, toon } from "./kit";
import { buildTrainer, type Trainer } from "./trainer";

// The arena as a scene: a floor of contribution-graph tiles, each player's character
// behind their creature, and the fight played out between them. The screens only say
// what happened on a beat (who attacked, who was hit, who came in); this file turns
// that into motion.

export type Stance = "enter" | "lunge" | "hit" | "ko" | "idle";

export type SideView = {
  fighter: Fighter;
  look: Look;
  stance: Stance;
  /** The damage this side's card just took. */
  hit?: { damage: number; critical: boolean };
  /** This side's attack on this beat is its special. */
  special?: boolean;
  guarding?: boolean;
  won?: boolean;
};

export type ArenaView = { near: SideView; far: SideView; beat: string | number; speed?: number };
export type Where = "near" | "far";

type Slot = {
  where: Where;
  home: THREE.Vector3;
  post: THREE.Vector3;
  facing: number;
  trainer: Trainer | null;
  look: string;
  /** How far the trainer's throwing arm is through its swing, 0 to 1. */
  throwing: number;
  fighter: Fighter | null;
  creature: Creature | null;
  sparkles: THREE.Group | null;
  offset: THREE.Vector3;
  lean: number;
  squash: number;
  grow: number;
  ring: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  shield: THREE.Mesh<THREE.IcosahedronGeometry, THREE.MeshBasicMaterial>;
  guarding: boolean;
  won: boolean;
};

type Tween = { start: number; end: number; update: (k: number) => void; done?: () => void };

const BACKDROP = 0x080b0f;
// GitHub's contribution greens, darkest to brightest, and how much of the floor each takes.
const TILES: [string, number][] = [["#141a21", 0.5], ["#0e3a25", 0.2], ["#0a5a2c", 0.14], ["#1f8f3d", 0.1], ["#35c450", 0.06]];
const PITCH = 0.74;
const FLOOR_RADIUS = 8.2;
const STAND = 0.13;
const UP = new THREE.Vector3(0, 1, 0);

export class ArenaWorld {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(36, 1, 0.1, 120);
  private eye = new THREE.Vector3();
  private aim = new THREE.Vector3();
  private near: Slot;
  private far: Slot;
  private tiles: THREE.InstancedMesh;
  private tileAt: { x: number; z: number }[] = [];
  private ripple: { x: number; z: number; t: number; power: number } | null = null;
  private tweens: Tween[] = [];
  private now = 0;
  private clock = 0;
  private last = 0;
  private raf = 0;
  private speed = 1;
  private freeze = 0;
  private shake = 0;
  private beat: string | number | undefined;
  private observer: ResizeObserver;
  private pointer = new THREE.Vector2();
  private raycaster = new THREE.Raycaster();
  private labels: HTMLElement[] = [];
  private host: HTMLElement;
  private reduced: boolean;
  private onInspect: (where: Where) => void;

  /** Throws when the browser can't give a WebGL context. */
  constructor(host: HTMLElement, options: { reduced: boolean; onInspect: (where: Where) => void }) {
    this.host = host;
    this.reduced = options.reduced;
    this.onInspect = options.onInspect;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const canvas = this.renderer.domElement;
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
    canvas.setAttribute("aria-hidden", "true");
    host.append(canvas);

    this.scene.background = new THREE.Color(BACKDROP);
    this.scene.fog = new THREE.Fog(BACKDROP, 13, 34);
    this.scene.add(new THREE.HemisphereLight(0xd6e6ff, 0x1c2430, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 2.4);
    sun.position.set(-5, 9, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 30 });
    sun.shadow.bias = -0.0006;
    this.scene.add(sun);

    this.tiles = this.buildFloor();
    this.buildSurroundings();
    this.near = this.slot("near", new THREE.Vector3(-0.9, STAND, 2.0), new THREE.Vector3(-2.6, 0.05, 3.1));
    this.far = this.slot("far", new THREE.Vector3(2.0, STAND, -2.0), new THREE.Vector3(3.7, 0.05, -3.0));
    this.near.facing = Math.atan2(this.far.home.x - this.near.home.x, this.far.home.z - this.near.home.z);
    this.far.facing = this.near.facing + Math.PI;

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    canvas.addEventListener("click", this.click);
    canvas.addEventListener("pointermove", this.hover);
    this.raf = requestAnimationFrame(this.frame);
  }

  set(view: ArenaView) {
    this.speed = view.speed ?? 1;
    const sides = [[this.near, view.near], [this.far, view.far]] as const;
    for (const [slot, side] of sides) {
      this.dress(slot, side.look);
      slot.guarding = side.guarding ?? false;
      slot.won = side.won ?? false;
    }
    if (view.beat === this.beat) return;
    const first = this.beat === undefined;
    this.beat = view.beat;
    this.finish();

    const attacking = sides.find(([, side]) => side.stance === "lunge");
    if (first || !attacking) {
      let delay = 0.1;
      for (const [slot, side] of [sides[1], sides[0]]) {
        if (side.stance === "ko") this.clear(slot);
        else if (first || side.stance === "enter" || slot.fighter?.fullName !== side.fighter.fullName) {
          this.enter(slot, side.fighter, delay);
          delay += 0.4;
        }
      }
    } else {
      const [from, attacker] = attacking;
      const [to, target] = sides.find((pair) => pair !== attacking)!;
      let delay = 0;
      if (from.fighter?.fullName !== attacker.fighter.fullName || !from.creature) {
        this.enter(from, attacker.fighter, 0, true);
        delay = 0.5;
      }
      // A card that was knocked out and already replaced: the old one falls, then the new one comes in.
      let next: Fighter | undefined;
      if (to.creature && to.fighter?.fullName !== target.fighter.fullName) next = target.fighter;
      else if (!to.creature) {
        this.enter(to, target.fighter, 0, true);
        delay = 0.5;
      }
      const then = next ? () => this.enter(to, next, 0) : undefined;
      this.attack(from, to, delay, { special: attacker.special ?? false, critical: target.hit?.critical ?? false, damage: target.hit?.damage, ko: target.stance === "ko" || Boolean(next) }, then);
    }
    if (this.reduced) this.finish();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener("click", this.click);
    canvas.removeEventListener("pointermove", this.hover);
    for (const label of this.labels) label.remove();
    dispose(this.scene);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    canvas.remove();
  }

  // --- building ---

  private buildFloor(): THREE.InstancedMesh {
    const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 48), new THREE.MeshBasicMaterial({ color: 0x0b0f14 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.06;
    this.scene.add(ground);

    const random = seededRandom("arena-floor");
    const reach = Math.ceil(FLOOR_RADIUS / PITCH);
    const colours: THREE.Color[] = [];
    for (let i = -reach; i <= reach; i++) {
      for (let j = -reach; j <= reach; j++) {
        const x = i * PITCH;
        const z = j * PITCH;
        if (Math.hypot(x, z) > FLOOR_RADIUS) continue;
        this.tileAt.push({ x, z });
        let roll = random();
        const [colour] = TILES.find(([, share]) => (roll -= share) < 0) ?? TILES[0];
        colours.push(new THREE.Color(colour));
      }
    }
    const tiles = new THREE.InstancedMesh(new RoundedBoxGeometry(PITCH - 0.1, 0.1, PITCH - 0.1, 2, 0.04), toon(0xffffff), this.tileAt.length);
    tiles.receiveShadow = true;
    const place = new THREE.Object3D();
    this.tileAt.forEach(({ x, z }, i) => {
      place.position.set(x, 0, z);
      place.updateMatrix();
      tiles.setMatrixAt(i, place.matrix);
      tiles.setColorAt(i, colours[i]);
    });
    this.scene.add(tiles);
    return tiles;
  }

  // A ring of dark towers past the floor, and stars over them.
  private buildSurroundings() {
    const random = seededRandom("arena-skyline");
    const shades = [0x0f151c, 0x131b25, 0x18222e];
    for (let i = 0; i < 54; i++) {
      const angle = (i / 54) * Math.PI * 2 + random() * 0.08;
      const distance = 10 + random() * 9;
      const tall = 1.5 + random() * random() * 9;
      const wide = 0.9 + random() * 1.6;
      const tower = new THREE.Mesh(new THREE.BoxGeometry(wide, tall, wide), new THREE.MeshBasicMaterial({ color: shades[i % 3] }));
      tower.position.set(Math.cos(angle) * distance, tall / 2 - 0.06, Math.sin(angle) * distance);
      tower.rotation.y = random() * Math.PI;
      this.scene.add(tower);
    }
    const points: number[] = [];
    for (let i = 0; i < 260; i++) {
      const around = random() * Math.PI * 2;
      const up = 0.08 + random() * 1.1;
      points.push(Math.cos(around) * Math.cos(up) * 70, Math.sin(up) * 70, Math.sin(around) * Math.cos(up) * 70);
    }
    const sky = new THREE.BufferGeometry();
    sky.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    this.scene.add(new THREE.Points(sky, new THREE.PointsMaterial({ color: 0xcfe0ff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.7 })));
  }

  private slot(where: Where, home: THREE.Vector3, post: THREE.Vector3): Slot {
    const platform = part(cylinder(1.12, 1.2, 0.18, 40), toon(0x1b222b), { at: [home.x, STAND - 0.09, home.z] });
    platform.receiveShadow = true;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.045, 8, 48), new THREE.MeshBasicMaterial({ color: 0x3a4049 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(home.x, STAND + 0.01, home.z);
    const shield = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xbfe3ff, wireframe: true, transparent: true, opacity: 0, depthWrite: false }));
    shield.visible = false;
    this.scene.add(platform, ring, shield);
    return { where, home, post, facing: 0, trainer: null, look: "", throwing: 0, fighter: null, creature: null, sparkles: null, offset: new THREE.Vector3(), lean: 0, squash: 0, grow: 1, ring, shield, guarding: false, won: false };
  }

  private dress(slot: Slot, look: Look) {
    const key = encodeLook(look);
    if (slot.look === key) return;
    if (slot.trainer) dispose(slot.trainer.root);
    slot.look = key;
    slot.trainer = buildTrainer(look);
    slot.trainer.root.position.copy(slot.post);
    slot.trainer.root.rotation.y = slot.facing;
    this.scene.add(slot.trainer.root);
  }

  private clear(slot: Slot) {
    if (slot.creature) dispose(slot.creature.root);
    if (slot.sparkles) dispose(slot.sparkles);
    slot.creature = null;
    slot.sparkles = null;
  }

  // --- the fight ---

  /** The trainer throws a card at the platform and the creature comes out of it. */
  private enter(slot: Slot, fighter: Fighter, delay: number, quick = false) {
    slot.fighter = fighter;
    const colour = TYPE[fighter.type].color;
    const flight = quick ? 0.24 : 0.44;
    this.after(delay, () => {
      this.clear(slot);
      const creature = buildCreature(fighter);
      creature.root.rotation.y = slot.facing;
      slot.creature = creature;
      slot.offset.set(0, 0, 0);
      slot.lean = slot.squash = 0;
      slot.grow = 0.001;
      slot.ring.material.color.set(colour);
      this.scene.add(creature.root);
      if (creature.shiny) {
        slot.sparkles = new THREE.Group();
        const gold = new THREE.MeshBasicMaterial({ color: 0xffe07a });
        for (let i = 0; i < 9; i++) {
          const spark = new THREE.Mesh(new THREE.OctahedronGeometry(0.06), gold);
          const angle = (i / 9) * Math.PI * 2;
          spark.position.set(Math.cos(angle) * 0.85, 0.25 + ((i * 5) % 9) * 0.16, Math.sin(angle) * 0.85);
          spark.scale.set(0.6, 1.5, 0.6);
          slot.sparkles.add(spark);
        }
        this.scene.add(slot.sparkles);
      }

      const card = part(new RoundedBoxGeometry(0.34, 0.48, 0.02, 2, 0.01), toon(0xf4f1ea));
      card.add(part(new THREE.PlaneGeometry(0.26, 0.4), new THREE.MeshBasicMaterial({ color: colour, side: THREE.DoubleSide }), { at: [0, 0, 0.012], outline: false }));
      const from = slot.post.clone().add(new THREE.Vector3(0, 1.5, 0));
      const to = slot.home.clone().add(new THREE.Vector3(0, 0.5, 0));
      this.scene.add(card);
      this.tween(0, flight + 0.2, (k) => (slot.throwing = Math.sin(k * Math.PI)));
      this.tween(0, flight, (k) => {
        card.position.lerpVectors(from, to, k);
        card.position.y += Math.sin(k * Math.PI) * 1.5;
        card.rotation.set(k * 10, k * 6, 0);
      }, () => {
        dispose(card);
        this.burst(to, colour, 0.9);
      });
      this.tween(flight, quick ? 0.26 : 0.44, (k) => (slot.grow = Math.max(0.001, overshoot(k))));
    });
  }

  private attack(from: Slot, to: Slot, delay: number, hit: { special: boolean; critical: boolean; damage?: number; ko: boolean }, then?: () => void) {
    const toward = to.home.clone().sub(from.home);
    const reach = toward.length() * 0.62;
    toward.normalize();
    let impact = delay + 0.3;
    if (hit.special) {
      // Charge a ball of the card's type colour, then let it go.
      impact = delay + 0.72;
      const colour = TYPE[from.fighter?.type ?? "docs"].color;
      const orb = new THREE.Mesh(sphere(1, 16), new THREE.MeshBasicMaterial({ color: colour }));
      orb.add(new THREE.PointLight(colour, 14, 7));
      const start = new THREE.Vector3();
      const end = to.home.clone().add(new THREE.Vector3(0, 0.6, 0));
      this.after(delay, () => {
        start.copy(from.home).addScaledVector(toward, 0.75).add(new THREE.Vector3(0, (from.creature?.height ?? 1) * 0.6, 0));
        orb.position.copy(start);
        orb.scale.setScalar(0.001);
        this.scene.add(orb);
      });
      this.tween(delay, 0.45, (k) => {
        from.squash = 0.1 * k + Math.sin(k * Math.PI * 4) * 0.04;
        from.offset.copy(toward).multiplyScalar(-0.22 * k);
        orb.scale.setScalar(0.001 + easeOut(k) * 0.36);
      });
      this.tween(delay + 0.45, 0.27, (k) => {
        from.squash = 0;
        from.lean = Math.sin(k * Math.PI) * 0.35;
        from.offset.copy(toward).multiplyScalar(-0.22 * (1 - k));
        orb.position.lerpVectors(start, end, k * k);
      }, () => dispose(orb));
    } else {
      // Rock back, jump at the other creature, land where it started.
      this.tween(delay, 0.12, (k) => {
        from.squash = Math.sin(k * Math.PI) * 0.18;
        from.offset.copy(toward).multiplyScalar(-0.25 * easeOut(k));
      });
      this.tween(delay + 0.12, 0.18, (k) => {
        const e = easeInOut(k);
        from.offset.copy(toward).multiplyScalar(-0.25 + (reach + 0.25) * e);
        from.offset.y = Math.sin(k * Math.PI) * 0.55;
        from.lean = 0.5 * e;
      });
      this.tween(impact, 0.36, (k) => {
        const e = easeOut(k);
        from.offset.copy(toward).multiplyScalar(reach * (1 - e));
        from.offset.y = Math.sin(k * Math.PI) * 0.35;
        from.lean = 0.5 * (1 - e);
      });
    }
    this.after(impact, () => this.impact(from, to, toward, hit));
    if (then) this.after(impact + 0.9, then);
  }

  private impact(from: Slot, to: Slot, toward: THREE.Vector3, hit: { special: boolean; critical: boolean; damage?: number; ko: boolean }) {
    const tall = to.creature?.height ?? 1;
    const centre = to.home.clone().add(new THREE.Vector3(0, tall * 0.55, 0));
    this.burst(centre, hit.critical ? "#ffd23f" : TYPE[from.fighter?.type ?? "docs"].color, hit.special || hit.critical ? 1.5 : 1);
    this.ripple = { x: to.home.x, z: to.home.z, t: 0, power: hit.special || hit.critical ? 1.7 : 1 };
    this.shake = hit.critical ? 0.22 : hit.special ? 0.15 : 0.08;
    // A critical holds the frame for a moment before anything moves.
    if (hit.critical && !this.reduced) this.freeze = 0.09;
    if (hit.damage !== undefined) this.label(centre.clone().add(new THREE.Vector3(0, tall * 0.6, 0)), hit.damage, hit.critical);

    const skins = to.creature?.skins ?? [];
    this.tween(0, 0.3, (k) => skins.forEach((skin) => skin.emissive.setScalar((1 - k) * 0.85)));
    this.tween(0, 0.38, (k) => {
      to.offset.copy(toward).multiplyScalar(0.42 * Math.sin(k * Math.PI));
      to.offset.x += Math.sin(k * 40) * 0.04 * (1 - k);
      to.squash = 0.16 * Math.sin(k * Math.PI);
    });
    if (hit.ko) {
      this.tween(0.38, 0.5, (k) => {
        to.lean = -1.5 * easeInOut(k);
        to.offset.copy(toward).multiplyScalar(0.5 * k);
        to.grow = Math.max(0.001, 1 - k * k);
      }, () => {
        this.burst(to.home.clone().add(new THREE.Vector3(0, 0.3, 0)), "#aeb6c2", 1.1);
        this.clear(to);
      });
    }
  }

  /** A ring and a scatter of shards, facing the camera. */
  private burst(at: THREE.Vector3, colour: THREE.ColorRepresentation, size: number) {
    const paint = new THREE.MeshBasicMaterial({ color: colour, transparent: true, side: THREE.DoubleSide, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.56, 36), paint);
    ring.position.copy(at);
    ring.lookAt(this.camera.position);
    const shards = Array.from({ length: 10 }, () => {
      const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), paint);
      shard.userData.fly = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5).normalize().multiplyScalar((1.2 + Math.random() * 1.4) * size);
      return shard;
    });
    const group = new THREE.Group();
    group.add(ring, ...shards);
    this.scene.add(group);
    this.tween(0, 0.5, (k) => {
      ring.scale.setScalar((0.3 + easeOut(k) * 1.6) * size);
      paint.opacity = 1 - k * k;
      for (const shard of shards) {
        shard.position.copy(at).addScaledVector(shard.userData.fly as THREE.Vector3, easeOut(k));
        shard.position.y -= k * k * 0.8;
        shard.scale.setScalar(1 - k * 0.7);
        shard.rotation.set(k * 6, k * 4, 0);
      }
    }, () => dispose(group));
  }

  /** The damage number, drawn over the canvas where the creature's head is. */
  private label(at: THREE.Vector3, damage: number, critical: boolean) {
    const point = at.clone().project(this.camera);
    const label = document.createElement("span");
    label.textContent = `-${damage}`;
    label.className = `pointer-events-none absolute z-10 font-display font-bold tabular-nums ${critical ? "text-[#ffd23f]" : "text-white"}`;
    label.style.cssText = `left:${((point.x + 1) / 2) * 100}%;top:${((1 - point.y) / 2) * 100}%;font-size:max(${critical ? 6 : 4.6}cqw,${critical ? 30 : 24}px);text-shadow:0 2px 0 #000,0 0 12px rgb(0 0 0 / 0.6);translate:-50% -50%`;
    this.host.append(label);
    this.labels.push(label);
    const rise = this.reduced ? 0 : 46;
    const fade = label.animate(
      [
        { opacity: 0, transform: `translateY(${rise * 0.3}px) scale(0.6)` },
        { opacity: 1, transform: "translateY(0) scale(1.15)", offset: 0.18 },
        { opacity: 1, transform: `translateY(${-rise * 0.5}px) scale(1)`, offset: 0.7 },
        { opacity: 0, transform: `translateY(${-rise}px) scale(1)` },
      ],
      { duration: 1100 / this.speed, easing: "ease-out", fill: "forwards" },
    );
    fade.onfinish = () => {
      label.remove();
      this.labels = this.labels.filter((other) => other !== label);
    };
  }

  // --- time ---

  private tween(delay: number, duration: number, update: (k: number) => void, done?: () => void) {
    this.tweens.push({ start: this.now + delay, end: this.now + delay + duration, update, done });
  }

  private after(delay: number, done: () => void) {
    this.tween(delay, 0, () => {}, done);
  }

  private advance(seconds: number) {
    this.now += seconds;
    for (const tween of [...this.tweens]) {
      if (tween.start > this.now) continue;
      const k = tween.end === tween.start ? 1 : Math.min(1, (this.now - tween.start) / (tween.end - tween.start));
      tween.update(k);
      if (k < 1) continue;
      this.tweens.splice(this.tweens.indexOf(tween), 1);
      tween.done?.();
    }
  }

  /** Runs everything still playing to its end, in order: a new beat starts from a settled scene. */
  private finish() {
    for (let guard = 0; this.tweens.length > 0 && guard < 400; guard++) {
      const next = this.tweens.reduce((a, b) => (a.end <= b.end ? a : b));
      this.tweens.splice(this.tweens.indexOf(next), 1);
      this.now = Math.max(this.now, next.end);
      next.update(1);
      next.done?.();
    }
  }

  private frame = (ms: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const seconds = Math.min(0.05, (ms - this.last) / 1000);
    this.last = ms;
    if (this.freeze > 0) this.freeze -= seconds;
    else this.advance(seconds * this.speed);
    if (!this.reduced) this.clock += seconds;
    this.pose(seconds);
    this.renderer.render(this.scene, this.camera);
  };

  // Where everything is this frame: what the fight asked for, plus the idle loop on top.
  private pose(seconds: number) {
    for (const slot of [this.near, this.far]) {
      const { creature, trainer } = slot;
      const beat = this.clock + (slot.where === "near" ? 0 : 1.3);
      if (trainer) {
        const cheer = slot.won ? Math.abs(Math.sin(beat * 5)) : 0;
        trainer.root.position.y = slot.post.y + cheer * 0.22;
        trainer.root.rotation.z = Math.sin(beat * 1.1) * 0.015;
        trainer.head.rotation.y = Math.sin(beat * 0.6) * 0.12;
        trainer.arms[1].rotation.x = -slot.throwing * 2.7 + Math.sin(beat * 1.4) * 0.04;
        trainer.arms[0].rotation.x = -Math.sin(beat * 1.4) * 0.04;
        trainer.arms[0].rotation.z = slot.won ? -2.7 : -0.12;
        trainer.arms[1].rotation.z = slot.won ? 2.7 : 0.12;
      }
      slot.shield.visible = slot.guarding && Boolean(creature);
      if (!creature) continue;
      const t = this.clock + creature.phase;
      const breath = this.reduced ? 0 : Math.sin(t * 2.3) * 0.028;
      const hop = slot.won ? Math.abs(Math.sin(t * 5)) * 0.32 : 0;
      const base = creature.root.userData.scale as THREE.Vector3;
      creature.root.position.copy(slot.home).add(slot.offset);
      creature.root.scale.copy(base).multiplyScalar(slot.grow);
      creature.body.position.y = hop + (creature.floats ? 0.3 + Math.sin(t * 1.7) * 0.08 : 0);
      creature.body.scale.set(1 - breath * 0.5 + slot.squash * 0.6, 1 + breath - slot.squash, 1 - breath * 0.5 + slot.squash * 0.6);
      creature.body.rotation.x = slot.lean;
      const blink = t % 3.6 < 0.11 ? 0.12 : 1;
      for (const eye of creature.eyes) eye.scale.y = blink;
      creature.limbs.forEach((limb, i) => (limb.rotation.x = Math.sin(t * 2.3 + i * Math.PI) * 0.16));
      for (const spinner of creature.spinners) spinner.rotation.y = t * 0.9;
      if (slot.sparkles) {
        slot.sparkles.position.copy(creature.root.position);
        slot.sparkles.rotation.y = t * 0.7;
        slot.sparkles.children.forEach((spark, i) => spark.scale.setScalar(0.5 + Math.abs(Math.sin(t * 2.4 + i * 1.7)) * 0.9));
        slot.sparkles.visible = slot.grow > 0.6;
      }
      if (slot.shield.visible) {
        slot.shield.position.copy(creature.root.position).add(new THREE.Vector3(0, creature.height * 0.5, 0));
        slot.shield.scale.setScalar(creature.height * 0.82);
        slot.shield.rotation.y = t * 0.4;
        slot.shield.material.opacity = 0.5 + Math.sin(t * 3) * 0.15;
      }
    }

    if (this.ripple) {
      const ripple = this.ripple;
      ripple.t += seconds * this.speed;
      const over = ripple.t > 1.1 || this.reduced;
      const front = ripple.t * 9;
      const place = new THREE.Object3D();
      this.tileAt.forEach(({ x, z }, i) => {
        const from = Math.hypot(x - ripple.x, z - ripple.z);
        place.position.set(x, over ? 0 : ripple.power * 0.24 * Math.exp(-((from - front) ** 2) / 1.1) * (1 - ripple.t / 1.1), z);
        place.updateMatrix();
        this.tiles.setMatrixAt(i, place.matrix);
      });
      this.tiles.instanceMatrix.needsUpdate = true;
      if (over) this.ripple = null;
    }

    this.shake = Math.max(0, this.shake - seconds * 0.6);
    const drift = this.reduced ? 0 : 1;
    this.camera.position.set(
      this.eye.x + drift * Math.sin(this.clock * 0.35) * 0.18 + (Math.random() - 0.5) * this.shake,
      this.eye.y + drift * Math.sin(this.clock * 0.5) * 0.06 + (Math.random() - 0.5) * this.shake,
      this.eye.z,
    );
    this.camera.lookAt(this.aim);
  }

  // --- the frame around it ---

  private resize() {
    const { clientWidth: width, clientHeight: height } = this.host;
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    // A phone holds the arena upright, so the camera stands further back and higher.
    if (this.camera.aspect < 1.1) {
      this.camera.fov = 46;
      this.eye.set(0.5, 5.0, 10.6);
      this.aim.set(0.4, 0.1, -0.2);
    } else {
      this.camera.fov = 36;
      this.eye.set(0.3, 3.5, 8.8);
      this.aim.set(0.45, 0.35, -0.5);
    }
    this.camera.updateProjectionMatrix();
    this.camera.up.copy(UP);
  }

  private under(event: MouseEvent): Where | null {
    const box = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((event.clientX - box.left) / box.width) * 2 - 1, -((event.clientY - box.top) / box.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    let found: { where: Where; distance: number } | null = null;
    for (const slot of [this.near, this.far]) {
      const [hit] = slot.creature ? this.raycaster.intersectObject(slot.creature.root, true) : [];
      if (hit && (!found || hit.distance < found.distance)) found = { where: slot.where, distance: hit.distance };
    }
    return found?.where ?? null;
  }

  private click = (event: MouseEvent) => {
    const where = this.under(event);
    if (where) this.onInspect(where);
  };

  private hover = (event: MouseEvent) => {
    this.renderer.domElement.style.cursor = this.under(event) ? "zoom-in" : "";
  };
}
