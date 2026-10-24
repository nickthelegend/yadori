/**
 * Yadori's main system: finds the room's labelled furniture (WebXR mesh detection in a
 * headset or the emulator; the den diorama in a plain browser), lets you wake a piece by
 * pinching it (or clicking it), puts a living face on it, and runs the face, the hands,
 * the voices and the gossip.
 */
import * as IW from '@iwsdk/core';
import {
  type Entity,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  type PositionalAudio,
  Quaternion,
  type ShaderMaterial,
  type Texture,
  TextureLoader,
  Vector3,
  XRAnchor,
  XRMesh,
  createSystem,
} from '@iwsdk/core';
import { FaceRig, isExpression } from '@yadori/rig';
import {
  type FacePlacement,
  type Gesture,
  GestureTracker,
  type OBB,
  type RoomObject,
  type StrokeSample,
  type Vec3,
  buildRoomContext,
  chipText,
  classifyStroke,
  cleanUserLabel,
  labelKind,
  normaliseLabel,
  obbDims,
  obbFromMinMax,
  placeFace,
  rayObb,
  rematchAll,
  turnToward,
} from '@yadori/room';
import { buildDen, type Den, type DenVariant } from './den/den.js';
import { applyFaceParams, createFaceMaterial } from './face/face-material.js';
import { Outline } from './fx/outline.js';
import { PKind, Particles } from './fx/particles.js';
import { Bubble, Chip } from './fx/text-plane.js';
import {
  type ChatEvent,
  type GatewayStatus,
  type Persona,
  type Sheet,
  chat as gatewayChat,
  fetchStatus,
  forget as gatewayForget,
  transcribe as gatewayTranscribe,
  wake as gatewayWake,
} from './gateway.js';
import { emulatorPresent, requestedRoom } from './dev-room.js';
import { recordWav } from './recorder.js';
import { FaceSource, Spirit, SpiritState } from './spirit-component.js';
import { type SavedSpirit, deleteSpirit, loadSpirits, saveSpirit } from './storage.js';
import { type CardData, MAX_SPIRITS, Overlay } from './ui/overlay.js';
import { Voice, type VoiceMode } from './voice.js';

interface Target {
  id: string;
  label: string;
  box: OBB;
  dims: [number, number, number];
}

interface SpiritRT {
  id: string;
  targetId: string;
  label: string;
  name: string;
  persona: Persona | null;
  sheet: Sheet | null;
  sheetTex: Map<string, Texture> | null;
  faceSource: 'built-in' | 'sheet';
  source: 'label' | 'camera';
  firstWoke: string;
  lines: number;
  memories: number;
  entity: Entity;
  root: Object3D;
  face: Mesh;
  faceMat: ShaderMaterial | MeshBasicMaterial;
  rig: FaceRig;
  placement: FacePlacement;
  bubble: Bubble;
  bubbleUntil: number;
  srcChip: Chip;
  srcChipUntil: number;
  voiceAudio: PositionalAudio;
  sfxAudio: PositionalAudio;
  trackers: [GestureTracker, GestureTracker];
  hover: number;
  glanceAt: string | null;
  glanceUntil: number;
  listeningTo: string | null;
  speaking: boolean;
  speakingTo: string | null;
  nextSocial: number;
  awake: boolean;
  // world-space frame of the rendered face (updated every frame)
  pos: Vector3;
  dir: Vector3;
  up: Vector3;
  right: Vector3;
}

const HANDS = ['left', 'right'] as const;
const WAKE_MIN_S = 1.15;
const BRAND = { cobalt: '#2b4cff', cream: '#fff8ec', pink: '#ff9db0', ink: '#121212' };

const v3 = (v: Vector3): Vec3 => [v.x, v.y, v.z];
const title = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
const easeOutBack = (r: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const x = r - 1;
  return 1 + c3 * x * x * x + c1 * x * x;
};

export class YadoriSystem extends createSystem({
  meshes: { required: [XRMesh] },
  spirits: { required: [Spirit] },
}) {
  private overlay!: Overlay;
  private voice!: Voice;
  private den!: Den;
  private denEntity!: Entity;
  private denVariant: DenVariant = 'den';
  private particles!: Particles;
  private hoverOutline!: Outline;
  private wakeOutline!: Outline;
  private hoverChip!: Chip;
  private spirits = new Map<string, SpiritRT>();
  private targets: Target[] = [];
  private targetSig = '';
  private status: GatewayStatus = { online: false };
  private waking: { target: Target; start: number } | null = null;
  private t = 0;
  private xrActive = false;
  private emulator = false;
  private roomKey = '';
  private pendingSaved: SavedSpirit[] = [];
  private rematchAt = 0;
  private lineQueue: Promise<void> = Promise.resolve();
  private session: XRSession | null = null;
  // ray hover state: 0 left hand, 1 right hand, 2 browser pointer, 3 gaze (Meta VR Glasses)
  private hoverTarget: (Target | null)[] = [null, null, null, null];
  private hoverFace: (SpiritRT | null)[] = [null, null, null, null];
  private gazeSeen = false;
  // browser pointer
  private pointerNdc: { x: number; y: number } | null = null;
  private pointerDown: { x: number; y: number; t: number; target: Target | null; face: SpiritRT | null; orbit: boolean } | null = null;
  private stroke: { spirit: SpiritRT; samples: StrokeSample[] } | null = null;
  private orbit = { yaw: -0.12, pitch: 0.2, dist: 4.4, focus: new Vector3(0.15, 0.85, -2.45) };
  /** where the browser camera eases to: the room, or the spirits that just woke */
  private shot = { focus: new Vector3(0.15, 0.85, -2.45), dist: 4.4, until: 0 };
  private userOrbitAt = -Infinity;
  private recording: { stop: () => Promise<Blob> } | null = null;
  // scratch
  private tmpA = new Vector3();
  private tmpB = new Vector3();
  private tmpC = new Vector3();
  private tmpQ = new Quaternion();
  private tmpM = new Matrix4();
  private head = new Vector3();
  private rayO = new Vector3();
  private rayD = new Vector3();
  private tips: (Vector3 | null)[] = [new Vector3(), new Vector3()];
  private palms: (Vector3 | null)[] = [new Vector3(), new Vector3()];
  private textureLoader = new TextureLoader();
  private faceGeo = new PlaneGeometry(1, 1);
  private onSessionSelectStart = (e: XRInputSourceEvent) => this.handleSelect(e.inputSource, true);
  private onSessionSelectEnd = (e: XRInputSourceEvent) => this.handleSelect(e.inputSource, false);

  init(): void {
    this.emulator = emulatorPresent();
    this.denVariant = requestedRoom() === 'yadori_bare' ? 'bare' : 'den';
    this.voice = new Voice();
    this.camera.add(this.voice.listener);

    // browser diorama (hidden while an XR session shows the real or emulated room)
    this.den = buildDen(IW as unknown as Parameters<typeof buildDen>[0], this.denVariant);
    this.denEntity = this.world.createTransformEntity(this.den.root);
    this.den.root.traverse((o) => {
      if ((o as Mesh).isMesh) (o as Mesh).matrixAutoUpdate = true;
    });

    this.particles = new Particles('YadoriParticles');
    this.world.createTransformEntity(this.particles.points);
    this.hoverOutline = new Outline('HoverOutline');
    this.world.createTransformEntity(this.hoverOutline.mesh);
    this.wakeOutline = new Outline('WakeOutline');
    this.world.createTransformEntity(this.wakeOutline.mesh);
    this.hoverChip = new Chip('HoverChip');
    this.world.createTransformEntity(this.hoverChip.mesh);

    this.overlay = new Overlay({
      onSay: (id, text, to) => this.puppetLine(id, text, to),
      onTalk: (id, text) => void this.talk(id, text),
      onForget: (id) => this.forget(id),
      onSelect: () => this.syncCards(),
      onEnterXR: () => {
        this.voice.unlock();
        this.world.launchXR();
      },
      onMic: (id) => void this.toggleMic(id),
    });
    this.updateModeLabel();
    void this.refreshStatus();
    const statusTimer = window.setInterval(() => void this.refreshStatus(), 15000);
    this.cleanupFuncs.push(() => clearInterval(statusTimer));
    // phones get the browser diorama only (no emulator, and no phone AR: it has no mesh detection)
    const phone = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) && !/OculusBrowser|Quest/i.test(navigator.userAgent);
    if (navigator.xr && !phone) {
      navigator.xr
        .isSessionSupported('immersive-ar')
        .then((ok) => this.overlay.setXRAvailable(ok, this.emulator ? 'Enter mixed reality (emulated)' : 'Enter mixed reality'))
        .catch(() => this.overlay.setXRAvailable(false));
    }

    // browser pointer input on the canvas
    const el = this.renderer.domElement;
    const down = (e: PointerEvent) => this.onPointerDown(e);
    const move = (e: PointerEvent) => this.onPointerMove(e);
    const up = (e: PointerEvent) => this.onPointerUp(e);
    const leave = () => (this.pointerNdc = null);
    const wheel = (e: WheelEvent) => {
      if (this.xrActive) return;
      e.preventDefault();
      this.orbit.dist = Math.min(7, Math.max(1.6, this.orbit.dist * (1 + Math.sign(e.deltaY) * 0.08)));
      this.userOrbitAt = this.t;
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', leave);
    el.addEventListener('wheel', wheel, { passive: false });
    this.cleanupFuncs.push(() => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('pointerleave', leave);
      el.removeEventListener('wheel', wheel);
    });
    const onResize = () => this.particles.setScale(this.renderer.domElement.clientHeight || 800);
    onResize();
    window.addEventListener('resize', onResize);
    this.cleanupFuncs.push(() => window.removeEventListener('resize', onResize));

    // XR session lifecycle: select events for pinch-to-wake
    this.cleanupFuncs.push(
      this.visibilityState.subscribe(() => {
        const s = this.world.session ?? null;
        if (s === this.session) return;
        if (this.session) {
          this.session.removeEventListener('selectstart', this.onSessionSelectStart as EventListener);
          this.session.removeEventListener('selectend', this.onSessionSelectEnd as EventListener);
        }
        this.session = s;
        if (s) {
          s.addEventListener('selectstart', this.onSessionSelectStart as EventListener);
          s.addEventListener('selectend', this.onSessionSelectEnd as EventListener);
          this.voice.unlock();
        }
      }),
    );

    // browser voices load asynchronously; refresh the "Voice out" label when they arrive
    if (typeof speechSynthesis !== 'undefined') {
      speechSynthesis.getVoices();
      const onVoices = () => this.overlay.setStatus(this.status, this.voice.nextMode());
      speechSynthesis.addEventListener('voiceschanged', onVoices);
      this.cleanupFuncs.push(() => speechSynthesis.removeEventListener('voiceschanged', onVoices));
    }
    this.exposeDebug();
  }

  // ------------------------------------------------------------------ status & labels

  private async refreshStatus(): Promise<void> {
    this.status = await fetchStatus();
    this.voice.ttsReady = !!(this.status.online && this.status.tts?.ready);
    this.overlay.setStatus(this.status, this.voice.nextMode());
    this.updateHint();
  }

  private modeLabel(): string {
    if (this.xrActive) return this.emulator ? 'Emulated room (IWER), not your room' : 'Your room';
    return 'Browser diorama, not your room';
  }

  private updateModeLabel(): void {
    this.overlay.setMode(this.modeLabel());
    this.overlay.setVisible(!this.xrActive || this.emulator);
    this.overlay.setCompact(this.xrActive);
  }

  private updateHint(): void {
    const verb = this.xrActive ? 'Pinch' : 'Click';
    if (this.waking) this.overlay.setHint(`Waking the ${this.waking.target.label}…`);
    else if (this.spirits.size === 0)
      this.overlay.setHint(
        this.targets.length || !this.xrActive
          ? `${verb} a piece of furniture to wake it`
          : 'Looking for furniture… (Space Setup labels: couch, table, lamp…)',
        this.xrActive ? 'Point your hand at the couch, the lamp or the plant, then pinch' : 'Then poke it, pet it, flick it · drag the room to look around',
      );
    else if (this.spirits.size === 1)
      this.overlay.setHint(`${verb === 'Pinch' ? 'Poke, pet or flick' : 'Tap, rub or swipe'} its face · wake a second one and they gossip`);
    else this.overlay.setHint('');
  }

  // ------------------------------------------------------------------ targets

  private refreshTargets(): void {
    let list: Target[];
    if (this.xrActive) {
      list = [];
      for (const e of this.queries.meshes.entities) {
        if (!e.getValue(XRMesh, 'isBounded3D')) continue;
        const label = normaliseLabel(e.getValue(XRMesh, 'semanticLabel') as string);
        if (labelKind(label) === 'structure') continue;
        const min = e.getVectorView(XRMesh, 'min');
        const max = e.getVectorView(XRMesh, 'max');
        const o = e.object3D;
        if (!o) continue;
        o.updateWorldMatrix(true, false);
        o.getWorldPosition(this.tmpA);
        o.getWorldQuaternion(this.tmpQ);
        const box = obbFromMinMax([min[0], min[1], min[2]], [max[0], max[1], max[2]], v3(this.tmpA), [this.tmpQ.x, this.tmpQ.y, this.tmpQ.z, this.tmpQ.w]);
        const d = obbDims(box);
        list.push({ id: `mesh-${e.index}`, label, box, dims: [d.w, d.h, d.d] });
      }
    } else {
      list = this.den.targets.map((t) => {
        const box: OBB = { center: t.center, quat: t.quat, half: t.half };
        const d = obbDims(box);
        return { id: `den-${t.id}`, label: t.label, box, dims: [d.w, d.h, d.d] as [number, number, number] };
      });
    }
    this.targets = list;
    const sig = list.map((t) => t.id).join(',');
    if (sig !== this.targetSig) {
      this.targetSig = sig;
      this.rematchAt = this.t + (this.xrActive ? 1.5 : 0.1);
      this.updateHint();
    }
  }

  private roomObjects(): RoomObject[] {
    return this.targets.map((t) => ({ id: t.id, label: t.label, box: t.box }));
  }

  private currentRoomKey(): string {
    if (this.xrActive) return this.emulator ? `iwer:${requestedRoom()}` : 'headset';
    return `diorama:${this.denVariant}`;
  }

  /** Bring back spirits saved in this room: by label, size (±10%) and position (≤ 30 cm). */
  private rematchSaved(): void {
    const key = this.currentRoomKey();
    if (key !== this.roomKey) {
      this.roomKey = key;
      this.pendingSaved = loadSpirits(key).filter((s) => !this.spirits.has(s.spiritId));
    }
    if (!this.pendingSaved.length || !this.targets.length) return;
    const homes = this.pendingSaved.map((s) => ({ spiritId: s.spiritId, label: s.label, dims: s.dims, position: s.position }));
    const cands = this.targets
      .filter((t) => ![...this.spirits.values()].some((s) => s.targetId === t.id))
      .map((t) => ({ id: t.id, label: t.label, dims: t.dims, position: t.box.center }));
    const m = rematchAll(homes, cands);
    for (const saved of this.pendingSaved) {
      const c = m.get(saved.spiritId);
      const t = c && this.targets.find((x) => x.id === c.id);
      if (t) this.createSpirit(t, saved, true);
    }
    this.frameSpirits();
    this.pendingSaved = this.pendingSaved.filter((s) => !m.has(s.spiritId));
    this.syncCards();
    this.updateHint();
  }

  // ------------------------------------------------------------------ picking

  private pickTarget(o: Vector3, d: Vector3): Target | null {
    let best: Target | null = null;
    let bestT = Infinity;
    const ov = v3(o);
    const dv = v3(d);
    for (const t of this.targets) {
      if ([...this.spirits.values()].some((s) => s.targetId === t.id && s.awake)) continue;
      const hit = rayObb(ov, dv, t.box);
      if (hit !== null && hit < bestT) {
        bestT = hit;
        best = t;
      }
    }
    // a face in front of its own object wins over the object
    return best;
  }

  private pickFace(o: Vector3, d: Vector3): SpiritRT | null {
    let best: SpiritRT | null = null;
    let bestT = Infinity;
    for (const s of this.spirits.values()) {
      if (!s.awake || s.rig.params.reveal < 0.5) continue;
      const denom = d.dot(s.dir);
      if (Math.abs(denom) < 1e-4) continue;
      const t = this.tmpA.copy(s.pos).sub(o).dot(s.dir) / denom;
      if (t <= 0) continue;
      const hit = this.tmpB.copy(d).multiplyScalar(t).add(o);
      const r = s.placement.size * 0.55;
      if (hit.distanceTo(s.pos) <= r && t < bestT) {
        bestT = t;
        best = s;
      }
    }
    return best;
  }

  private pointerRay(ndcX: number, ndcY: number): void {
    this.camera.updateMatrixWorld();
    this.rayO.setFromMatrixPosition(this.camera.matrixWorld);
    this.rayD.set(ndcX, ndcY, 0.5).unproject(this.camera).sub(this.rayO).normalize();
  }

  private ndc(e: PointerEvent): { x: number; y: number } {
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 };
  }

  private onPointerDown(e: PointerEvent): void {
    if (this.xrActive) return;
    this.voice.unlock();
    const p = this.ndc(e);
    this.pointerNdc = p;
    this.pointerRay(p.x, p.y);
    const face = this.pickFace(this.rayO, this.rayD);
    const target = face ? null : this.pickTarget(this.rayO, this.rayD);
    this.pointerDown = { x: e.clientX, y: e.clientY, t: performance.now(), target, face, orbit: !face && !target };
    if (face) {
      this.stroke = { spirit: face, samples: [] };
      this.addStrokeSample(face);
    }
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  private addStrokeSample(s: SpiritRT): void {
    const denom = this.rayD.dot(s.dir);
    if (Math.abs(denom) < 1e-4 || !this.stroke) return;
    const t = this.tmpA.copy(s.pos).sub(this.rayO).dot(s.dir) / denom;
    const hit = this.tmpB.copy(this.rayD).multiplyScalar(t).add(this.rayO).sub(s.pos);
    const r = s.placement.size / 2;
    this.stroke.samples.push({ t: performance.now() / 1000, x: hit.dot(s.right) / r, y: hit.dot(s.up) / r });
  }

  private onPointerMove(e: PointerEvent): void {
    if (this.xrActive) return;
    const p = this.ndc(e);
    const prev = this.pointerNdc;
    this.pointerNdc = p;
    if (!this.pointerDown) return;
    if (this.stroke) {
      this.pointerRay(p.x, p.y);
      this.addStrokeSample(this.stroke.spirit);
      return;
    }
    const moved = Math.hypot(e.clientX - this.pointerDown.x, e.clientY - this.pointerDown.y);
    if (moved > 6) this.pointerDown.orbit = true;
    if (this.pointerDown.orbit && prev) {
      this.userOrbitAt = this.t;
      this.orbit.yaw -= (p.x - prev.x) * 1.6;
      this.orbit.pitch = Math.min(0.75, Math.max(-0.05, this.orbit.pitch - (p.y - prev.y) * 0.9));
      this.orbit.yaw = Math.min(0.9, Math.max(-0.9, this.orbit.yaw));
    }
  }

  private onPointerUp(e: PointerEvent): void {
    if (this.xrActive || !this.pointerDown) return;
    const pd = this.pointerDown;
    this.pointerDown = null;
    if (this.stroke) {
      const s = this.stroke;
      this.stroke = null;
      const g = classifyStroke(s.samples);
      if (g) this.react(s.spirit, g);
      return;
    }
    const moved = Math.hypot(e.clientX - pd.x, e.clientY - pd.y);
    if (pd.target && moved <= 6) void this.wakeTarget(pd.target);
  }

  private handleSelect(src: XRInputSource, start: boolean): void {
    // On Meta VR Glasses the gaze ray picks and a pinch from either hand selects: the
    // select event then comes from the gaze source (or the hand while gaze is tracked).
    let h = src.targetRayMode === 'gaze' ? 3 : src.handedness === 'left' ? 0 : src.handedness === 'right' ? 1 : -1;
    if (h !== 3 && this.gazeSeen && !this.hoverTarget[h] && !this.hoverFace[h] && (this.hoverTarget[3] || this.hoverFace[3])) h = 3;
    if (h < 0 || !start) return;
    this.voice.unlock();
    const face = this.hoverFace[h];
    if (face) {
      // a pinch aimed at a face from a distance: a gentle poke, and it becomes the speaker
      this.react(face, 'poke');
      this.overlay.setCards(this.cards(), face.id);
      return;
    }
    const t = this.hoverTarget[h];
    if (t) void this.wakeTarget(t);
  }

  // ------------------------------------------------------------------ waking

  private async wakeTarget(target: Target, description?: string): Promise<void> {
    if (this.waking) return;
    if (this.spirits.size >= MAX_SPIRITS) {
      this.overlay.toast(`At most ${MAX_SPIRITS} spirits (persistent anchors are limited); forget one first.`);
      return;
    }
    let t = target;
    if (labelKind(t.label) === 'needs-name') {
      if (this.xrActive && !this.emulator) {
        this.overlay.toast('Tell me what this is: naming by voice needs Muse Voice Transcribe (Setup required).');
        return;
      }
      const typed = await new Promise<string | null>((res) => this.overlay.askName(res, () => res(null)));
      const clean = typed ? cleanUserLabel(typed) : null;
      if (!clean) {
        this.overlay.toast('Tell me what this is: it needs a name before it can wake.');
        return;
      }
      t = { ...t, label: clean };
    }
    this.waking = { target: t, start: this.t };
    this.updateHint();
    const c = t.box.center;
    this.particles.burstBox(c[0], c[1], c[2], t.box.half[0], t.box.half[1], t.box.half[2], 70, [BRAND.cream, BRAND.pink, BRAND.cobalt]);
    const head: Vec3 = v3(this.head);
    const ctx = buildRoomContext({ id: t.id, label: t.label, box: t.box }, this.roomObjects(), head, {
      awakeIds: new Set([...this.spirits.values()].map((s) => s.targetId)),
      description,
      source: 'label',
    });
    let saved: SavedSpirit | null = null;
    const started = performance.now();
    if (this.status.online) {
      const r = await gatewayWake({ mesh: { id: t.id, label: t.label, dims: t.dims, room_context: ctx }, description });
      if ('error' in r) {
        this.overlay.toast(`Gateway: ${r.error}. Waking with the built-in face.`);
      } else if (r.refused) {
        this.overlay.toast(`${title(t.label)} stays asleep: ${r.refused}`);
        this.waking = null;
        this.updateHint();
        return;
      } else {
        saved = this.newSaved(t, r.spirit_id, r.persona, r.sheet, r.face, r.source);
        if (r.setup && Object.keys(r.setup).length) {
          this.overlay.toast(`Built-in face and puppet mode: ${Object.values(r.setup)[0]}`);
        }
      }
    }
    if (!saved) saved = this.newSaved(t, `local-${Math.random().toString(36).slice(2, 10)}`, null, null, 'built-in', 'label');
    const waited = (performance.now() - started) / 1000;
    if (waited < WAKE_MIN_S) await new Promise((r) => setTimeout(r, (WAKE_MIN_S - waited) * 1000));
    this.waking = null;
    saveSpirit(saved);
    const s = this.createSpirit(t, saved, false);
    this.frameSpirits();
    this.syncCards(s.id);
    this.updateHint();
    if (saved.persona?.greeting) this.queueLine(s, saved.persona.greeting, 'Muse Spark', null);
  }

  private newSaved(
    t: Target,
    id: string,
    persona: Persona | null,
    sheet: Sheet | null,
    face: 'built-in' | 'sheet',
    source: 'label' | 'camera',
  ): SavedSpirit {
    const sameLabel = [...this.spirits.values()].filter((s) => s.label === t.label).length;
    return {
      spiritId: id,
      label: t.label,
      name: persona?.name ?? (sameLabel ? `${title(t.label)} ${sameLabel + 1}` : title(t.label)),
      dims: t.dims,
      position: t.box.center,
      persona,
      sheet,
      faceSource: face === 'sheet' && sheet ? 'sheet' : 'built-in',
      source,
      firstWoke: new Date().toLocaleDateString('en-CA'),
      lines: 0,
      memories: 0,
      room: this.currentRoomKey(),
    };
  }

  private createSpirit(t: Target, saved: SavedSpirit, returning: boolean): SpiritRT {
    const placement = placeFace(t.box, v3(this.head));
    const root = new Object3D();
    root.name = `Spirit:${saved.name}`;
    let faceMat: ShaderMaterial | MeshBasicMaterial;
    let sheetTex: Map<string, Texture> | null = null;
    if (saved.faceSource === 'sheet' && saved.sheet) {
      sheetTex = new Map();
      for (const [k, url] of [...Object.entries(saved.sheet.expressions), ...Object.entries(saved.sheet.mouths).map(([m, u]) => [`mouth:${m}`, u] as const)]) {
        const tex = this.textureLoader.load(url);
        tex.colorSpace = IW.SRGBColorSpace;
        sheetTex.set(k, tex);
      }
      faceMat = new MeshBasicMaterial({ map: sheetTex.get('neutral') ?? null, transparent: true, depthWrite: false });
    } else {
      faceMat = createFaceMaterial({ onDark: t.label === 'screen' });
    }
    const face = new Mesh(this.faceGeo, faceMat);
    face.name = `Face:${saved.name}`;
    face.renderOrder = 15;
    root.add(face);
    const bubble = new Bubble(`Bubble:${saved.name}`);
    root.add(bubble.mesh);
    const srcChip = new Chip(`SourceChip:${saved.name}`);
    root.add(srcChip.mesh);
    const voiceAudio = this.voice.makeAudio();
    const sfxAudio = this.voice.makeAudio();
    face.add(voiceAudio);
    face.add(sfxAudio);
    const entity = this.world.createTransformEntity(root);
    entity.addComponent(Spirit, {
      spiritId: saved.spiritId,
      targetId: t.id,
      label: t.label,
      name: saved.name,
      state: SpiritState.Awake,
      faceSource: saved.faceSource === 'sheet' ? FaceSource.Sheet : FaceSource.BuiltIn,
      hasPersona: !!saved.persona,
      faceSize: placement.size,
      lines: saved.lines,
    });
    const a = entity.getVectorView(Spirit, 'anchor');
    a[0] = placement.position[0];
    a[1] = placement.position[1];
    a[2] = placement.position[2];
    if (this.xrActive) entity.addComponent(XRAnchor);
    const rig = new FaceRig(Math.floor(Math.random() * 1e6));
    const r = placement.size / 2;
    const frame = { center: placement.position, normal: placement.normal, radius: r };
    const s: SpiritRT = {
      id: saved.spiritId,
      targetId: t.id,
      label: t.label,
      name: saved.name,
      persona: saved.persona,
      sheet: saved.sheet,
      sheetTex,
      faceSource: saved.faceSource,
      source: saved.source,
      firstWoke: saved.firstWoke,
      lines: saved.lines,
      memories: saved.memories,
      entity,
      root,
      face,
      faceMat,
      rig,
      placement,
      bubble,
      bubbleUntil: 0,
      srcChip,
      srcChipUntil: this.t + 6,
      voiceAudio,
      sfxAudio,
      trackers: [new GestureTracker({ ...frame }), new GestureTracker({ ...frame })],
      hover: 0,
      glanceAt: null,
      glanceUntil: 0,
      listeningTo: null,
      speaking: false,
      speakingTo: null,
      nextSocial: this.t + 3 + Math.random() * 3,
      awake: true,
      pos: new Vector3(...placement.position),
      dir: new Vector3(...placement.normal),
      up: new Vector3(...placement.up),
      right: new Vector3(),
    };
    if (saved.persona?.voice) (s as SpiritRT & { voice?: Persona['voice'] }).voice = saved.persona.voice;
    this.spirits.set(s.id, s);
    srcChip.set(saved.faceSource === 'sheet' ? 'Muse Image face' : 'Built-in face · not generated', saved.faceSource === 'sheet' ? 'cobalt' : 'ink');
    rig.react('wake');
    rig.lookAt(0, 0);
    if (!returning) {
      this.voice.sfx(this.voiceTarget(s), 'wake');
      setTimeout(() => {
        this.particles.fountain(s.pos.x, s.pos.y, s.pos.z, 26, PKind.Sparkle, BRAND.pink, 0.9);
        this.particles.fountain(s.pos.x, s.pos.y, s.pos.z, 18, PKind.Sparkle, BRAND.cream, 0.7);
      }, 250);
      this.showGlyph(s, '!', 0.9);
    }
    return s;
  }

  private voiceTarget(s: SpiritRT) {
    return { id: s.id, rig: s.rig, voiceAudio: s.voiceAudio, sfxAudio: s.sfxAudio, voice: s.persona?.voice };
  }

  // ------------------------------------------------------------------ reactions & speech

  private react(s: SpiritRT, g: Gesture): void {
    s.rig.react(g);
    this.voice.sfx(this.voiceTarget(s), g);
    const field = g === 'poke' ? 'pokes' : g === 'pet' ? 'pets' : 'flicks';
    s.entity.setValue(Spirit, field, ((s.entity.getValue(Spirit, field) as number) ?? 0) + 1);
    if (g === 'pet') {
      this.particles.fountain(s.pos.x, s.pos.y + s.placement.size * 0.4, s.pos.z, 7, PKind.Heart, '#ff4f7a', 0.45);
      this.showGlyph(s, '♥', 1.2);
    } else if (g === 'flick') {
      this.particles.fountain(s.pos.x, s.pos.y, s.pos.z, 14, PKind.Sparkle, '#ffe066', 1.1);
      this.showGlyph(s, '?!', 1.1);
    } else {
      this.particles.fountain(s.pos.x, s.pos.y, s.pos.z, 8, PKind.Sparkle, BRAND.cream, 0.5);
      this.showGlyph(s, '!', 0.8);
    }
  }

  private showGlyph(s: SpiritRT, glyph: string, seconds: number): void {
    if (s.speaking) return;
    s.bubble.set({ speaker: s.name, tag: '', text: '', shown: 0, glyph });
    s.bubbleUntil = this.t + seconds;
  }

  private puppetLine(speakerId: string, text: string, toId: string | null): void {
    const s = this.spirits.get(speakerId);
    if (!s) return;
    this.queueLine(s, text, 'puppet line (you)', toId);
    if (toId) this.lineQueue.then(() => this.overlay.promptReply(speakerId, toId));
  }

  private queueLine(s: SpiritRT, text: string, tag: string, toId: string | null): Promise<void> {
    this.lineQueue = this.lineQueue.then(() => this.speakLine(s, text, tag, toId)).catch(() => undefined);
    return this.lineQueue;
  }

  private async speakLine(s: SpiritRT, text: string, tag: string, toId: string | null): Promise<void> {
    if (!this.spirits.has(s.id) || !s.awake) return;
    const to = toId ? this.spirits.get(toId) ?? null : null;
    s.speaking = true;
    s.speakingTo = to?.id ?? null;
    s.entity.setValue(Spirit, 'speaking', true);
    for (const o of this.spirits.values()) if (o !== s) o.listeningTo = s.id;
    let shown = 0;
    const content = { speaker: to ? `${s.name} → ${to.name}` : s.name, tag, text, shown: 0 };
    s.bubble.set(content);
    s.bubbleUntil = Infinity;
    const handle = await this.voice.speak(this.voiceTarget(s), text, (n) => {
      if (n !== shown) {
        shown = n;
        s.bubble.set({ ...content, shown: n });
      }
    });
    s.entity.setValue(Spirit, 'voiceMode', handle.mode);
    await handle.done;
    s.bubble.set({ ...content, shown: 999 });
    s.lines++;
    s.entity.setValue(Spirit, 'lines', s.lines);
    s.entity.setValue(Spirit, 'speaking', false);
    s.speaking = false;
    s.speakingTo = null;
    s.bubbleUntil = this.t + 3.5;
    const saved = loadSpirits(this.currentRoomKey()).find((x) => x.spiritId === s.id);
    if (saved) saveSpirit({ ...saved, lines: s.lines });
    this.syncCards();
    await new Promise((r) => setTimeout(r, 350));
    for (const o of this.spirits.values()) if (o.listeningTo === s.id) o.listeningTo = null;
  }

  /** With MODEL_API_KEY: Muse Spark answers as the spirit, with tools. */
  private async talk(id: string, text: string): Promise<void> {
    const s = this.spirits.get(id);
    if (!s) return;
    s.rig.react('think');
    const ctx = buildRoomContext({ id: s.targetId, label: s.label, box: this.targets.find((t) => t.id === s.targetId)?.box ?? { center: v3(s.pos), quat: [0, 0, 0, 1], half: [0.2, 0.2, 0.2] } }, this.roomObjects(), v3(this.head), {
      awakeIds: new Set([...this.spirits.values()].map((x) => x.targetId)),
    });
    await gatewayChat(
      {
        spirit_id: id,
        text,
        room_context: ctx,
        spirits: [...this.spirits.values()].map((x) => ({ spirit_id: x.id, name: x.name, label: x.label })),
      },
      (e: ChatEvent) => this.onChatEvent(s, e),
    );
    s.rig.thinking = false;
  }

  private onChatEvent(asked: SpiritRT, e: ChatEvent): void {
    switch (e.type) {
      case 'line': {
        const sp = this.spirits.get(e.speaker) ?? asked;
        const to = e.to ?? (sp === asked ? null : asked.id);
        void this.queueLine(sp, e.text, e.source || 'Muse Spark', to);
        break;
      }
      case 'emote': {
        const sp = this.spirits.get(e.speaker) ?? asked;
        if (isExpression(e.expression)) sp.rig.setExpression(e.expression);
        break;
      }
      case 'glance': {
        const sp = this.spirits.get(e.speaker) ?? asked;
        sp.glanceAt = e.target;
        sp.glanceUntil = this.t + 2.5;
        break;
      }
      case 'sleep': {
        const sp = this.spirits.get(e.speaker) ?? asked;
        this.lineQueue.then(() => this.sleep(sp));
        break;
      }
      case 'error':
        asked.rig.thinking = false;
        this.overlay.toast(e.setup_required ? `Setup required: ${e.setup_required}` : e.message);
        break;
      default:
        break;
    }
  }

  private sleep(s: SpiritRT): void {
    s.rig.react('sleep');
    s.awake = false;
    s.entity.setValue(Spirit, 'state', SpiritState.Asleep);
    this.voice.sfx(this.voiceTarget(s), 'sleep');
    this.showGlyph(s, 'zzz', 2);
    this.syncCards();
  }

  private removeRuntime(id: string): void {
    const s = this.spirits.get(id);
    if (!s) return;
    this.spirits.delete(id);
    if (s.voiceAudio.isPlaying) s.voiceAudio.stop();
    s.bubble.dispose();
    s.srcChip.dispose();
    s.faceMat.dispose();
    s.sheetTex?.forEach((t) => t.dispose());
    s.entity.dispose();
  }

  private forget(id: string): void {
    deleteSpirit(id);
    void gatewayForget(id);
    this.pendingSaved = this.pendingSaved.filter((p) => p.spiritId !== id);
    this.removeRuntime(id);
    this.frameSpirits();
    this.syncCards();
    this.updateHint();
  }

  private async toggleMic(id: string): Promise<void> {
    if (!this.status.transcribe?.ready) {
      this.overlay.toast('Setup required: MODEL_API_KEY (Muse Voice Transcribe). Type instead.');
      return;
    }
    if (this.recording) {
      const rec = this.recording;
      this.recording = null;
      this.overlay.setHint('Transcribing…');
      const wav = await rec.stop();
      const r = await gatewayTranscribe(wav);
      this.updateHint();
      if (r.ok && r.text.trim()) void this.talk(id, r.text.trim());
      else this.overlay.toast(r.ok ? 'Heard nothing.' : r.setup ? `Setup required: ${r.setup}` : r.error);
      return;
    }
    try {
      this.recording = await recordWav();
      this.overlay.setHint('Listening… press the mic again to send', 'Muse Voice Transcribe via the gateway');
    } catch (err) {
      this.overlay.toast(`Microphone unavailable: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ------------------------------------------------------------------ cards

  private cards(): CardData[] {
    const live: CardData[] = [...this.spirits.values()].map((s) => ({
      id: s.id,
      name: s.name,
      label: s.label,
      dims: this.targets.find((t) => t.id === s.targetId)?.dims ?? [0, 0, 0],
      faceSource: s.faceSource,
      faceImage: s.sheet?.expressions?.neutral,
      source: s.source,
      persona: s.persona,
      firstWoke: s.firstWoke,
      memories: s.memories,
      lines: s.lines,
      awake: s.awake,
    }));
    const asleep: CardData[] = this.pendingSaved.map((p) => ({
      id: p.spiritId,
      name: p.name,
      label: p.label,
      dims: p.dims,
      faceSource: p.faceSource,
      faceImage: p.sheet?.expressions?.neutral,
      source: p.source,
      persona: p.persona,
      firstWoke: p.firstWoke,
      memories: p.memories,
      lines: p.lines,
      awake: false,
    }));
    return [...live, ...asleep];
  }

  private syncCards(selected?: string): void {
    this.overlay.setCards(this.cards(), selected ?? null);
  }

  // ------------------------------------------------------------------ per frame

  update(dt: number, time: number): void {
    this.t = time;
    const xr = this.renderer.xr.isPresenting;
    if (xr !== this.xrActive) {
      this.xrActive = xr;
      // a different room: put this room's spirits away (they stay saved) and re-find the
      // new room's own spirits once its furniture is detected
      for (const id of [...this.spirits.keys()]) this.removeRuntime(id);
      this.roomKey = '';
      this.pendingSaved = [];
      this.waking = null;
      this.den.root.visible = !xr;
      this.updateModeLabel();
      this.hoverTarget.fill(null);
      this.hoverFace.fill(null);
      this.targetSig = '';
    }
    if (!xr) this.updateOrbitCamera(dt);
    // head
    if (xr) this.player.head.getWorldPosition(this.head);
    else this.camera.getWorldPosition(this.head);

    this.refreshTargets();
    if (this.rematchAt && this.t >= this.rematchAt) {
      this.rematchAt = 0;
      this.rematchSaved();
    }

    // hover + hands
    let hovered: Target | null = null;
    if (xr) {
      for (let h = 0; h < 2; h++) {
        const ray = this.player.raySpaces[HANDS[h]];
        ray.getWorldPosition(this.rayO);
        ray.getWorldQuaternion(this.tmpQ);
        this.rayD.set(0, 0, -1).applyQuaternion(this.tmpQ);
        this.hoverFace[h] = this.pickFace(this.rayO, this.rayD);
        this.hoverTarget[h] = this.hoverFace[h] ? null : this.pickTarget(this.rayO, this.rayD);
        hovered = hovered ?? this.hoverTarget[h];
        const tip = this.player.indexTipSpaces[HANDS[h]];
        const grip = this.player.gripSpaces[HANDS[h]];
        if (tip && this.handTracked(HANDS[h])) {
          tip.getWorldPosition(this.tips[h]!);
          grip.getWorldPosition(this.palms[h]!);
        } else {
          this.tips[h] = this.tips[h] ?? new Vector3();
        }
      }
      // gaze (Meta VR Glasses): the eye ray from the frame
      this.hoverFace[3] = null;
      this.hoverTarget[3] = null;
      const frame = this.xrFrame;
      const ref = this.renderer.xr.getReferenceSpace();
      const session = this.world.session;
      if (frame && ref && session) {
        for (const src of session.inputSources) {
          if (src.targetRayMode !== 'gaze') continue;
          const pose = frame.getPose(src.targetRaySpace, ref);
          if (!pose) continue;
          this.gazeSeen = true;
          const m = this.tmpM.fromArray(pose.transform.matrix).premultiply(this.player.matrixWorld);
          this.rayO.setFromMatrixPosition(m);
          this.rayD.set(0, 0, -1).transformDirection(m);
          this.hoverFace[3] = this.pickFace(this.rayO, this.rayD);
          this.hoverTarget[3] = this.hoverFace[3] ? null : this.pickTarget(this.rayO, this.rayD);
          hovered = hovered ?? this.hoverTarget[3];
        }
      }
    } else if (this.pointerNdc && !this.pointerDown?.orbit) {
      this.pointerRay(this.pointerNdc.x, this.pointerNdc.y);
      this.hoverFace[2] = this.pickFace(this.rayO, this.rayD);
      this.hoverTarget[2] = this.hoverFace[2] ? null : this.pickTarget(this.rayO, this.rayD);
      hovered = this.hoverTarget[2];
      this.renderer.domElement.style.cursor = this.hoverFace[2] || hovered ? 'pointer' : 'grab';
    } else {
      this.hoverFace[2] = null;
      this.hoverTarget[2] = null;
    }
    this.updateHover(hovered);

    // waking outline
    if (this.waking) {
      const w = this.waking.target;
      this.wakeOutline.mesh.position.set(...w.box.center);
      this.wakeOutline.mesh.quaternion.set(...w.box.quat);
      this.wakeOutline.fit(...w.box.half);
      const k = Math.min(1, (this.t - this.waking.start) / 0.25);
      this.wakeOutline.set(this.t, 0, k * (0.6 + 0.4 * Math.sin((this.t - this.waking.start) * Math.PI * 2.4)), BRAND.pink);
      if (Math.random() < dt * 30) {
        const c = w.box.center;
        this.particles.burstBox(c[0], c[1], c[2], w.box.half[0], w.box.half[1], w.box.half[2], 1, [BRAND.cream, BRAND.pink]);
      }
    } else this.wakeOutline.set(this.t, 0, 0, BRAND.pink);

    // spirits
    const handsLive = xr && (this.handTracked('left') || this.handTracked('right'));
    for (const s of this.spirits.values()) this.updateSpirit(s, dt, handsLive);

    this.voice.update();
    this.particles.update(dt);
  }

  private handTracked(hand: 'left' | 'right'): boolean {
    const s = this.world.session;
    if (!s) return false;
    for (const src of s.inputSources) if (src.handedness === hand && src.hand) return true;
    return false;
  }

  /** Frame the awake spirits (browser only): a slow dolly in, the "whoa" shot. */
  private frameSpirits(): void {
    const awake = [...this.spirits.values()].filter((s) => s.awake);
    if (!awake.length) {
      this.shot.focus.set(0.15, 0.85, -2.45);
      this.shot.dist = 4.4;
      return;
    }
    const c = this.tmpC.set(0, 0, 0);
    for (const s of awake) c.add(this.tmpA.set(...s.placement.position));
    c.multiplyScalar(1 / awake.length);
    let spread = 0;
    for (const s of awake) spread = Math.max(spread, c.distanceTo(this.tmpA.set(...s.placement.position)));
    this.shot.focus.copy(c);
    this.shot.dist = Math.min(4.6, awake.length === 1 ? 2.9 : Math.max(2.4, 1.9 + spread * 1.3));
  }

  private updateOrbitCamera(dt: number): void {
    const o = this.orbit;
    // ease toward the shot unless the user moved the camera in the last few seconds
    if (this.t - this.userOrbitAt > 4) {
      const k = 1 - Math.exp(-1.6 * Math.min(0.1, dt));
      o.focus.lerp(this.shot.focus, k);
      o.dist += (this.shot.dist - o.dist) * k;
    }
    const aspect = this.renderer.domElement.clientWidth / Math.max(1, this.renderer.domElement.clientHeight);
    // portrait screens: pull back for the whole room, much less once a spirit is the subject
    const fit = this.spirits.size ? Math.min(1, Math.max(0.72, aspect * 1.4)) : Math.min(1, Math.max(0.45, aspect * 0.95));
    const dist = o.dist / fit;
    const cp = Math.cos(o.pitch);
    this.camera.position.set(o.focus.x + Math.sin(o.yaw) * cp * dist, o.focus.y + Math.sin(o.pitch) * dist, o.focus.z + Math.cos(o.yaw) * cp * dist);
    this.camera.lookAt(o.focus);
    // leave room for the binder rail on wide screens: shift the picture left
    const el = this.renderer.domElement;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (w >= 900) this.camera.setViewOffset(w, h, 150, 0, w, h);
    else if (this.camera.view) this.camera.clearViewOffset();
  }

  private updateHover(hovered: Target | null): void {
    if (hovered && !this.waking) {
      this.hoverOutline.mesh.position.set(...hovered.box.center);
      this.hoverOutline.mesh.quaternion.set(...hovered.box.quat);
      this.hoverOutline.fit(...hovered.box.half);
      this.hoverOutline.set(this.t, 1, 0, BRAND.cream);
      const c = hovered.box.center;
      const top = c[1] + obbDims(hovered.box).h / 2 + 0.16;
      this.hoverChip.mesh.position.set(c[0], top, c[2]);
      this.hoverChip.mesh.lookAt(this.head);
      const dist = this.head.distanceTo(this.hoverChip.mesh.position);
      const w = Math.min(0.7, Math.max(0.22, dist * 0.13));
      this.hoverChip.mesh.scale.set(w, w / 5.7, 1);
      const kind = labelKind(hovered.label);
      this.hoverChip.set(chipText(hovered.label, hovered.dims[0], hovered.dims[1]), kind === 'needs-name' ? 'pink' : 'ink');
    } else {
      this.hoverOutline.set(this.t, 0, 0, BRAND.cream);
      this.hoverChip.set(null);
    }
  }

  private updateSpirit(s: SpiritRT, dt: number, handsLive: boolean): void {
    // the object may move (re-detected mesh): follow its box
    const target = this.targets.find((t) => t.id === s.targetId);
    if (target) {
      const c = target.box.center;
      const p = s.placement.position;
      if (Math.abs(c[0] - p[0]) + Math.abs(c[2] - p[2]) > 0) {
        const fresh = placeFace(target.box, v3(this.head));
        if (fresh.faceIndex === s.placement.faceIndex || this.dist3(fresh.position, p) > 0.05) s.placement = fresh;
      }
    }
    const pl = s.placement;
    // gestures from tracked hands
    let nearTip: Vector3 | null = null;
    if (handsLive) {
      for (let h = 0; h < 2; h++) {
        const tip = this.tips[h];
        const tr = s.trackers[h];
        // gestures are measured against the face as drawn (turned toward you), not the box side
        tr.face.center = [s.pos.x, s.pos.y, s.pos.z];
        tr.face.normal = [s.dir.x, s.dir.y, s.dir.z];
        tr.face.radius = pl.size / 2;
        if (!tip || !this.handTracked(HANDS[h])) {
          tr.update(this.t, null, null);
          continue;
        }
        const g = tr.update(this.t, v3(tip), this.palms[h] ? v3(this.palms[h]!) : null);
        if (g && s.awake) this.react(s, g);
        if (tr.near) nearTip = tip;
      }
    }
    // gaze: speaker > glance > hand > pointer > social > you
    let look: Vector3 | null = null;
    if (s.speakingTo && this.spirits.get(s.speakingTo)) look = this.spirits.get(s.speakingTo)!.pos;
    else if (s.listeningTo && this.spirits.get(s.listeningTo)) look = this.spirits.get(s.listeningTo)!.pos;
    else if (s.glanceAt && this.t < s.glanceUntil) {
      const other = this.spirits.get(s.glanceAt);
      if (other) look = other.pos;
      else if (s.glanceAt === 'user') look = this.head;
      else {
        const t = this.targets.find((x) => x.label === normaliseLabel(s.glanceAt!));
        if (t) look = this.tmpC.set(...t.box.center);
      }
    } else if (nearTip) look = nearTip;
    else if (this.hoverFace[2] === s || (this.pointerNdc && !this.xrActive && this.pointerDown === null && this.hoverFace[2] !== null)) {
      look = this.tmpC.copy(this.rayO).addScaledVector(this.rayD, this.rayO.distanceTo(s.pos));
    } else if (this.spirits.size > 1 && this.t >= s.nextSocial) {
      const others = [...this.spirits.values()].filter((o) => o !== s && o.awake);
      if (others.length) {
        s.glanceAt = others[Math.floor(Math.random() * others.length)].id;
        s.glanceUntil = this.t + 1.1 + Math.random() * 0.8;
      }
      s.nextSocial = this.t + 4 + Math.random() * 5;
    }
    if (!look) look = this.head;
    if (s.rig.thinking) s.rig.lookAt(0.5, 0.6);
    else this.lookAtWorld(s, look);

    const p = s.rig.update(dt);

    // face frame: turned toward you (≤ 40°) around its own up axis
    const dirArr = turnToward(pl.normal, pl.up, pl.position, v3(this.head));
    s.dir.set(...dirArr);
    s.up.set(...pl.up).addScaledVector(s.dir, -s.dir.dot(this.tmpA.set(...pl.up))).normalize();
    s.right.crossVectors(s.up, s.dir).normalize();
    const turnSin = Math.sqrt(Math.max(0, 1 - Math.min(1, s.dir.dot(this.tmpA.set(...pl.normal))) ** 2));
    s.pos.set(...pl.position).addScaledVector(s.dir, (pl.size / 2) * turnSin);
    this.tmpM.makeBasis(s.right, s.up, s.dir);
    this.tmpQ.setFromRotationMatrix(this.tmpM);
    s.face.quaternion.copy(this.tmpQ);
    // wobble around the face normal
    s.face.rotateZ(p.wobble);
    const k = easeOutBack(Math.min(1, p.reveal)) * pl.size;
    s.face.scale.set(k * (1 + 0.18 * p.squash), k * (1 - 0.3 * p.squash), 1);
    s.face.position.copy(s.pos);

    // hover glow
    const hoveredNow = this.hoverFace.some((f) => f === s);
    s.hover += ((hoveredNow ? 1 : 0) - s.hover) * Math.min(1, dt * 10);
    if ('uniforms' in s.faceMat) applyFaceParams(s.faceMat as ShaderMaterial, p, this.t, s.hover);
    else {
      const m = s.faceMat as MeshBasicMaterial;
      const key = s.rig.speaking ? `mouth:${s.rig.mouth}` : s.rig.expression;
      const tex = s.sheetTex?.get(key) ?? s.sheetTex?.get('neutral') ?? null;
      if (m.map !== tex) {
        m.map = tex;
        m.needsUpdate = true;
      }
      m.opacity = Math.min(1, p.reveal);
    }

    // bubble above the face, facing you
    const dist = this.head.distanceTo(s.pos);
    if (this.t > s.bubbleUntil && !s.speaking) s.bubble.set(null);
    if (s.bubble.mesh.visible) {
      const w = Math.min(1.2, Math.max(0.42, dist * 0.32));
      const h = w / s.bubble.aspect;
      s.bubble.mesh.scale.set(w, h, 1);
      s.bubble.mesh.position.copy(s.pos).addScaledVector(s.up, pl.size * 0.55 + h * 0.48);
      s.bubble.mesh.lookAt(this.head);
    }
    // whispers while gossiping
    if (s.speaking && s.speakingTo) {
      const to = this.spirits.get(s.speakingTo);
      if (to && Math.random() < dt * 40) {
        this.particles.whisper(s.pos.x, s.pos.y, s.pos.z, to.pos.x, to.pos.y, to.pos.z, Math.random() < 0.5 ? BRAND.pink : BRAND.cream);
      }
    }
    // source chip under the face for a few seconds after waking
    if (this.t < s.srcChipUntil) {
      const cw = Math.min(0.5, Math.max(0.2, dist * 0.09));
      s.srcChip.mesh.scale.set(cw, cw / 5.7, 1);
      s.srcChip.mesh.position.copy(s.pos).addScaledVector(s.up, -(pl.size * 0.62 + 0.03)).addScaledVector(s.dir, 0.02);
      s.srcChip.mesh.lookAt(this.head);
      s.srcChip.mesh.visible = p.reveal > 0.5;
    } else s.srcChip.mesh.visible = false;

    // ECS readouts for tests and agents
    const a = s.entity.getVectorView(Spirit, 'anchor');
    a[0] = pl.position[0];
    a[1] = pl.position[1];
    a[2] = pl.position[2];
    // placement error: rendered face centre projected back onto the surface vs the anchor
    const back = this.tmpA.copy(s.pos).addScaledVector(s.dir, -(pl.size / 2) * turnSin);
    s.entity.setValue(Spirit, 'anchorErrorCm', back.distanceTo(this.tmpB.set(...pl.position)) * 100);
    s.entity.setValue(Spirit, 'faceSize', pl.size);
  }

  private dist3(a: Vec3, b: Vec3): number {
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  }

  private lookAtWorld(s: SpiritRT, world: Vector3): void {
    const d = this.tmpB.copy(world).sub(s.pos);
    const z = Math.max(0.05, d.dot(s.dir));
    const x = Math.atan2(d.dot(s.right), z) / 0.75;
    const y = Math.atan2(d.dot(s.up), z) / 0.6;
    s.rig.lookAt(x, y);
  }

  // ------------------------------------------------------------------ test/debug surface

  private exposeDebug(): void {
    const api = {
      mode: () => ({ xr: this.xrActive, emulator: this.emulator, room: this.currentRoomKey(), label: this.modeLabel() }),
      status: () => this.status,
      voiceMode: (): VoiceMode => this.voice.nextMode(),
      targets: () => this.targets.map((t) => ({ id: t.id, label: t.label, center: t.box.center, dims: t.dims })),
      waking: () => (this.waking ? this.waking.target.id : null),
      hover: () => ({ targets: this.hoverTarget.map((t) => t?.label ?? null), faces: this.hoverFace.map((f) => f?.name ?? null), gaze: this.gazeSeen }),
      spirits: () =>
        [...this.spirits.values()].map((s) => ({
          id: s.id,
          name: s.name,
          label: s.label,
          targetId: s.targetId,
          awake: s.awake,
          speaking: s.speaking,
          expression: s.rig.expression,
          mouth: s.rig.mouth,
          params: { ...s.rig.params },
          anchor: s.placement.position,
          size: s.placement.size,
          facePos: v3(s.pos),
          faceDir: v3(s.dir),
          pokes: s.entity.getValue(Spirit, 'pokes'),
          pets: s.entity.getValue(Spirit, 'pets'),
          flicks: s.entity.getValue(Spirit, 'flicks'),
          lines: s.lines,
          voiceMode: s.entity.getValue(Spirit, 'voiceMode'),
          bubble: s.bubble.mesh.visible,
        })),
      /** project a world point to page pixels (for browser e2e clicks) */
      toScreen: (p: Vec3) => {
        const v = new Vector3(...p).project(this.camera);
        const r = this.renderer.domElement.getBoundingClientRect();
        return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
      },
      lipSyncTrace: () => this.voice.trace,
      particles: () => this.particles.live,
    };
    (window as unknown as { __yadori: typeof api }).__yadori = api;
  }
}
