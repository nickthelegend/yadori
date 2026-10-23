/**
 * The "yadori_den": a small living room with five labelled pieces of furniture.
 *
 * One builder, two uses:
 *  - the browser diorama (no headset): rendered directly by the app;
 *  - the IWER synthetic room (emulator): bundled into public/rooms/yadori_den.glts, where
 *    `userData.xrMesh = 'couch'` etc. makes IWER report each volume as a WebXR mesh with
 *    that semantic label, and `userData.xrPlane` makes floor and walls detected planes.
 *
 * Takes the three.js namespace as a parameter so the GLTS bundle can pass the loader's
 * `three` and the app can pass the one re-exported by @iwsdk/core (never a second copy).
 * Layout in metres: the viewer stands at the origin facing -Z.
 */
import type * as THREE_NS from 'three';

type T3 = typeof THREE_NS;

export type DenVariant = 'den' | 'bare';

export interface DenTarget {
  id: string;
  label: string;
  center: [number, number, number];
  quat: [number, number, number, number];
  half: [number, number, number];
}

export interface Den {
  root: THREE_NS.Group;
  targets: DenTarget[];
}

const PALETTE = {
  wall: 0xece4d8,
  wallShade: 0xdcd2c3,
  floor: 0xb68a5e,
  floorDark: 0x9c7349,
  rug: 0x2b4cff, // the brand cobalt, as a rug
  rugBorder: 0xfff8ec,
  couch: 0x7f9c86,
  couchDark: 0x6b8873,
  cushion: 0xe9c46a,
  walnut: 0x6f4a32,
  brass: 0xc9a25a,
  shade: 0xfff3dc,
  pot: 0xc4673f,
  leaf: 0x3f7d4f,
  leafLight: 0x5fa067,
  screen: 0x0d0f14,
  console: 0x3b3029,
  book: [0xd1495b, 0x2b4cff, 0xe9c46a, 0x3f7d4f, 0xfff8ec],
};

export function buildDen(T: T3, variant: DenVariant = 'den'): Den {
  const root = new T.Group();
  root.name = 'YadoriDen';
  const targets: DenTarget[] = [];
  const mats = new Map<string, THREE_NS.Material>();
  const mat = (key: string, color: number, opts: Partial<THREE_NS.MeshStandardMaterialParameters> = {}) => {
    let m = mats.get(key);
    if (!m) {
      m = new T.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...opts });
      mats.set(key, m);
    }
    return m;
  };
  const hidden = new T.MeshBasicMaterial({ visible: false });

  /** A softly rounded slab: rounded rectangle in XY extruded along Z with a bevel. */
  const slab = (w: number, h: number, d: number, r: number): THREE_NS.BufferGeometry => {
    const rr = Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3);
    const bevel = Math.min(rr * 0.6, d / 2 - 1e-3);
    const sw = w - 2 * bevel;
    const sh = h - 2 * bevel;
    const sr = Math.max(1e-3, rr - bevel);
    const s = new T.Shape();
    const x0 = -sw / 2;
    const y0 = -sh / 2;
    s.moveTo(x0 + sr, y0);
    s.lineTo(x0 + sw - sr, y0);
    s.quadraticCurveTo(x0 + sw, y0, x0 + sw, y0 + sr);
    s.lineTo(x0 + sw, y0 + sh - sr);
    s.quadraticCurveTo(x0 + sw, y0 + sh, x0 + sw - sr, y0 + sh);
    s.lineTo(x0 + sr, y0 + sh);
    s.quadraticCurveTo(x0, y0 + sh, x0, y0 + sh - sr);
    s.lineTo(x0, y0 + sr);
    s.quadraticCurveTo(x0, y0, x0 + sr, y0);
    const g = new T.ExtrudeGeometry(s, {
      depth: Math.max(1e-3, d - 2 * bevel),
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 3,
      curveSegments: 6,
    });
    g.translate(0, 0, -(d - 2 * bevel) / 2);
    g.computeVertexNormals();
    return g;
  };

  const add = (
    parent: THREE_NS.Object3D,
    geo: THREE_NS.BufferGeometry,
    material: THREE_NS.Material,
    pos: [number, number, number],
    rotY = 0,
    name = '',
  ) => {
    const m = new T.Mesh(geo, material);
    m.position.set(pos[0], pos[1], pos[2]);
    m.rotation.y = rotY;
    m.castShadow = true;
    m.receiveShadow = true;
    if (name) m.name = name;
    parent.add(m);
    return m;
  };

  /** Invisible furniture volume reported as a WebXR mesh (and used for picking in the browser). */
  const volume = (id: string, label: string, size: [number, number, number], center: [number, number, number], rotY = 0) => {
    const v = new T.Mesh(new T.BoxGeometry(size[0], size[1], size[2]), hidden);
    v.position.set(center[0], center[1], center[2]);
    v.rotation.y = rotY;
    v.name = `volume:${id}`;
    v.userData.xrMesh = label;
    root.add(v);
    const q = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), rotY);
    targets.push({ id, label, center, quat: [q.x, q.y, q.z, q.w], half: [size[0] / 2, size[1] / 2, size[2] / 2] });
  };

  // ---- room shell (detected planes) -------------------------------------------------
  const W = 5.2;
  const D = 5.4;
  const H = 2.6;
  const Z0 = -3.6; // back wall
  const floor = new T.Mesh(new T.PlaneGeometry(W, D), mat('floor', PALETTE.floor, { roughness: 0.65 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, Z0 + D / 2);
  floor.receiveShadow = true;
  floor.userData.xrPlane = 'floor';
  floor.name = 'floor';
  root.add(floor);
  // floor boards: thin darker strips
  const boardGeo = new T.PlaneGeometry(0.012, D);
  for (let x = -W / 2 + 0.18; x < W / 2; x += 0.18) {
    const b = new T.Mesh(boardGeo, mat('floorDark', PALETTE.floorDark, { roughness: 0.7 }));
    b.rotation.x = -Math.PI / 2;
    b.position.set(x, 0.0008, Z0 + D / 2);
    b.receiveShadow = true;
    root.add(b);
  }
  const wallMat = mat('wall', PALETTE.wall, { roughness: 0.95 });
  const back = new T.Mesh(new T.PlaneGeometry(W, H), wallMat);
  back.position.set(0, H / 2, Z0);
  back.receiveShadow = true;
  back.userData.xrPlane = 'wall';
  back.name = 'wall-back';
  root.add(back);
  const left = new T.Mesh(new T.PlaneGeometry(D, H), wallMat);
  left.rotation.y = Math.PI / 2;
  left.position.set(-W / 2, H / 2, Z0 + D / 2);
  left.receiveShadow = true;
  left.userData.xrPlane = 'wall';
  left.name = 'wall-left';
  root.add(left);
  const right = new T.Mesh(new T.PlaneGeometry(D, H), wallMat);
  right.rotation.y = -Math.PI / 2;
  right.position.set(W / 2, H / 2, Z0 + D / 2);
  right.receiveShadow = true;
  right.userData.xrPlane = 'wall';
  right.name = 'wall-right';
  root.add(right);
  const ceiling = new T.Mesh(new T.PlaneGeometry(W, D), mat('ceiling', 0xf6f1e8, { roughness: 1, emissive: 0xf3ead9, emissiveIntensity: 0.55 }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, H, Z0 + D / 2);
  ceiling.userData.xrPlane = 'ceiling';
  ceiling.name = 'ceiling';
  root.add(ceiling);
  // skirting
  const skirt = mat('skirt', PALETTE.wallShade);
  add(root, new T.BoxGeometry(W, 0.08, 0.02), skirt, [0, 0.04, Z0 + 0.01]);
  // window on the left wall: a bright pane that also lights the room
  const pane = new T.Mesh(
    new T.PlaneGeometry(1.5, 1.2),
    new T.MeshBasicMaterial({ color: 0xfff4de }),
  );
  pane.rotation.y = Math.PI / 2;
  pane.position.set(-W / 2 + 0.005, 1.45, -1.6);
  root.add(pane);
  const frameMat = mat('frame', 0xf7f2ea);
  for (const [w, h, y, z] of [
    [0.06, 1.3, 1.45, -1.6 - 0.78],
    [0.06, 1.3, 1.45, -1.6 + 0.78],
  ] as const) add(root, new T.BoxGeometry(0.05, h, w), frameMat, [-W / 2 + 0.02, y, z]);
  add(root, new T.BoxGeometry(0.05, 0.06, 1.62), frameMat, [-W / 2 + 0.02, 2.08, -1.6]);
  add(root, new T.BoxGeometry(0.12, 0.05, 1.7), frameMat, [-W / 2 + 0.05, 0.83, -1.6]);
  add(root, new T.BoxGeometry(0.05, 1.2, 0.03), frameMat, [-W / 2 + 0.02, 1.45, -1.6]);

  // rug (cobalt with a cream border)
  const rugB = new T.Mesh(new T.PlaneGeometry(2.6, 1.7), mat('rugBorder', PALETTE.rugBorder, { roughness: 1 }));
  rugB.rotation.x = -Math.PI / 2;
  rugB.position.set(0, 0.003, -2.0);
  rugB.receiveShadow = true;
  root.add(rugB);
  const rug = new T.Mesh(new T.PlaneGeometry(2.44, 1.54), mat('rug', PALETTE.rug, { roughness: 1 }));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, 0.004, -2.0);
  rug.receiveShadow = true;
  root.add(rug);

  if (variant === 'bare') {
    // one unlabelled box: the "Tell me what this is" path
    const crate = add(root, slab(0.7, 0.55, 0.5, 0.04), mat('crate', 0xa47148), [0.2, 0.275, -2.4]);
    crate.name = 'crate';
    volume('thing', 'other', [0.7, 0.55, 0.5], [0.2, 0.275, -2.4]);
    addLights(T, root, null);
    return { root, targets };
  }

  // ---- couch (back wall, centre) --------------------------------------------------
  const couch = new T.Group();
  couch.name = 'couch';
  couch.position.set(0, 0, -3.1);
  root.add(couch);
  const cMat = mat('couch', PALETTE.couch, { roughness: 0.92 });
  const cDark = mat('couchDark', PALETTE.couchDark, { roughness: 0.95 });
  add(couch, slab(2.0, 0.22, 0.9, 0.08), cDark, [0, 0.2, 0]); // base
  add(couch, slab(0.84, 0.2, 0.62, 0.08), cMat, [-0.43, 0.41, 0.1]); // seat cushions
  add(couch, slab(0.84, 0.2, 0.62, 0.08), cMat, [0.43, 0.41, 0.1]);
  add(couch, slab(1.86, 0.52, 0.24, 0.1), cMat, [0, 0.6, -0.31]); // back
  add(couch, slab(0.16, 0.5, 0.9, 0.07), cMat, [-0.92, 0.45, 0]); // arms
  add(couch, slab(0.16, 0.5, 0.9, 0.07), cMat, [0.92, 0.45, 0]);
  const pillow = add(couch, slab(0.4, 0.34, 0.12, 0.08), mat('cushion', PALETTE.cushion), [-0.55, 0.66, -0.12]);
  pillow.rotation.z = 0.12;
  const pillow2 = add(couch, slab(0.36, 0.32, 0.12, 0.08), mat('pillowPink', 0xff9db0), [0.6, 0.65, -0.12]);
  pillow2.rotation.z = -0.1;
  const legMat = mat('walnut', PALETTE.walnut, { roughness: 0.55 });
  const legGeo = new T.CylinderGeometry(0.025, 0.018, 0.09, 10);
  for (const [x, z] of [[-0.9, 0.36], [0.9, 0.36], [-0.9, -0.36], [0.9, -0.36]] as const) add(couch, legGeo, legMat, [x, 0.045, z]);
  volume('couch', 'couch', [2.0, 0.86, 0.9], [0, 0.43, -3.1]);

  // ---- floor lamp (left of the couch) ----------------------------------------------
  const lamp = new T.Group();
  lamp.name = 'lamp';
  lamp.position.set(-1.62, 0, -3.15);
  root.add(lamp);
  const brass = mat('brass', PALETTE.brass, { roughness: 0.35, metalness: 0.8 });
  add(lamp, new T.CylinderGeometry(0.17, 0.19, 0.035, 32), brass, [0, 0.018, 0]);
  add(lamp, new T.CylinderGeometry(0.014, 0.014, 1.36, 12), brass, [0, 0.7, 0]);
  const shade = add(
    lamp,
    new T.CylinderGeometry(0.15, 0.21, 0.32, 40, 1, true),
    new T.MeshStandardMaterial({ color: PALETTE.shade, emissive: 0xffd9a0, emissiveIntensity: 0.65, roughness: 1, side: T.DoubleSide }),
    [0, 1.52, 0],
  );
  shade.castShadow = false;
  volume('lamp', 'lamp', [0.44, 1.7, 0.44], [-1.62, 0.85, -3.15]);

  // ---- plant (right of the couch) --------------------------------------------------
  const plant = new T.Group();
  plant.name = 'plant';
  plant.position.set(1.65, 0, -3.05);
  root.add(plant);
  const pot = new T.LatheGeometry(
    [new T.Vector2(0.0, 0), new T.Vector2(0.15, 0), new T.Vector2(0.19, 0.05), new T.Vector2(0.21, 0.38), new T.Vector2(0.23, 0.42), new T.Vector2(0.2, 0.42)],
    32,
  );
  add(plant, pot, mat('pot', PALETTE.pot, { roughness: 0.75 }), [0, 0, 0]);
  add(plant, new T.CylinderGeometry(0.2, 0.2, 0.02, 24), mat('soil', 0x3a2a1e), [0, 0.4, 0]);
  const stem = mat('stem', 0x4b6b3a);
  const leafGeo = new T.SphereGeometry(1, 12, 8);
  leafGeo.scale(0.06, 0.012, 0.16);
  const leafA = mat('leaf', PALETTE.leaf, { roughness: 0.6, side: T.DoubleSide });
  const leafB = mat('leafLight', PALETTE.leafLight, { roughness: 0.6, side: T.DoubleSide });
  let seed = 11;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let s = 0; s < 7; s++) {
    const a = (s / 7) * Math.PI * 2 + rnd() * 0.5;
    const tilt = 0.12 + rnd() * 0.22;
    const len = 0.7 + rnd() * 0.55;
    const stemMesh = add(plant, new T.CylinderGeometry(0.008, 0.012, len, 6), stem, [0, 0.4 + len / 2, 0]);
    stemMesh.rotation.set(Math.cos(a) * tilt, 0, Math.sin(a) * tilt);
    stemMesh.position.set(Math.sin(a) * tilt * len * 0.5, 0.4 + (len / 2) * Math.cos(tilt), -Math.cos(a) * tilt * len * 0.5);
    for (let k = 0; k < 6; k++) {
      const f = 0.35 + (k / 6) * 0.65;
      const leaf = new T.Mesh(leafGeo, k % 2 ? leafA : leafB);
      const ly = 0.4 + len * f * Math.cos(tilt);
      const spread = len * f * tilt;
      const la = a + (k % 2 ? 0.9 : -0.9);
      leaf.position.set(Math.sin(a) * spread + Math.sin(la) * 0.09, ly, -Math.cos(a) * spread - Math.cos(la) * 0.09);
      leaf.rotation.set(-0.5 + rnd() * 0.3, -la, 0.3 * (k % 2 ? 1 : -1));
      leaf.castShadow = true;
      plant.add(leaf);
    }
  }
  volume('plant', 'plant', [0.78, 1.5, 0.78], [1.65, 0.75, -3.05]);

  // ---- coffee table (on the rug) ----------------------------------------------------
  const table = new T.Group();
  table.name = 'table';
  table.position.set(0, 0, -1.85);
  root.add(table);
  add(table, slab(1.1, 0.05, 0.6, 0.06), legMat, [0, 0.42, 0]);
  add(table, slab(0.98, 0.02, 0.48, 0.04), mat('shelf', 0x5b3b27, { roughness: 0.6 }), [0, 0.14, 0]);
  const tLeg = new T.CylinderGeometry(0.022, 0.018, 0.4, 10);
  for (const [x, z] of [[-0.5, 0.24], [0.5, 0.24], [-0.5, -0.24], [0.5, -0.24]] as const) add(table, tLeg, legMat, [x, 0.2, z]);
  // a few books and a mug on top (props, not wakeable in the headset)
  const bookGeo = new T.BoxGeometry(0.22, 0.035, 0.16);
  PALETTE.book.slice(0, 3).forEach((c, i) => {
    const b = add(table, bookGeo, mat(`book${i}`, c), [-0.28, 0.462 + i * 0.036, 0.02]);
    b.rotation.y = (i - 1) * 0.12;
  });
  const mug = new T.LatheGeometry([new T.Vector2(0, 0), new T.Vector2(0.04, 0), new T.Vector2(0.042, 0.09), new T.Vector2(0.038, 0.09), new T.Vector2(0.036, 0.008), new T.Vector2(0, 0.008)], 24);
  add(table, mug, mat('mug', 0xfff8ec, { roughness: 0.4 }), [0.3, 0.445, -0.05]);
  volume('table', 'table', [1.1, 0.45, 0.6], [0, 0.225, -1.85]);

  // ---- screen on a console (right wall, facing into the room) ------------------------
  const tv = new T.Group();
  tv.name = 'screen';
  tv.position.set(2.32, 0, -1.7);
  tv.rotation.y = -Math.PI / 2;
  root.add(tv);
  add(tv, slab(1.5, 0.5, 0.42, 0.04), mat('console', PALETTE.console, { roughness: 0.6 }), [0, 0.3, 0]);
  add(tv, slab(1.2, 0.7, 0.05, 0.02), mat('screenFrame', 0x15171c, { roughness: 0.3 }), [0, 1.0, 0]);
  const glass = new T.Mesh(
    new T.PlaneGeometry(1.14, 0.64),
    new T.MeshStandardMaterial({ color: PALETTE.screen, roughness: 0.15, metalness: 0.2, emissive: 0x101a3a, emissiveIntensity: 0.6 }),
  );
  glass.position.set(0, 1.0, 0.027);
  tv.add(glass);
  add(tv, new T.BoxGeometry(0.3, 0.06, 0.18), mat('stand', 0x15171c), [0, 0.58, 0]);
  volume('screen', 'screen', [1.2, 0.72, 0.06], [2.32, 1.0, -1.7], -Math.PI / 2);

  // wall art above the couch (decor; reported as a structure label so it never wakes)
  const art = new T.Mesh(new T.PlaneGeometry(0.9, 0.6), mat('art', 0xff9db0, { roughness: 1 }));
  art.position.set(0, 1.6, Z0 + 0.01);
  root.add(art);
  const art2 = new T.Mesh(new T.CircleGeometry(0.18, 40), mat('artSun', 0xfff8ec, { roughness: 1 }));
  art2.position.set(0.12, 1.66, Z0 + 0.012);
  root.add(art2);
  const art3 = new T.Mesh(new T.PlaneGeometry(0.9, 0.16), mat('artHill', 0x2b4cff, { roughness: 1 }));
  art3.position.set(0, 1.38, Z0 + 0.013);
  root.add(art3);

  addLights(T, root, shade);
  return { root, targets };
}

function addLights(T: T3, root: THREE_NS.Group, shade: THREE_NS.Object3D | null): void {
  const hemi = new T.HemisphereLight(0xfff6ea, 0x8a6a4a, 1.1);
  root.add(hemi);
  const sun = new T.DirectionalLight(0xfff0d6, 2.2);
  sun.position.set(-3.5, 3.2, -0.8);
  sun.target.position.set(0.4, 0, -2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -3;
  sun.shadow.camera.right = 3;
  sun.shadow.camera.top = 3;
  sun.shadow.camera.bottom = -3;
  sun.shadow.bias = -0.0005;
  root.add(sun);
  root.add(sun.target);
  if (shade) {
    const glow = new T.PointLight(0xffc98a, 2.2, 3.5, 1.6);
    glow.position.set(-1.62, 1.45, -3.1);
    root.add(glow);
  }
}
