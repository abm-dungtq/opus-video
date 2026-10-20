// Starting scene for a lemo-opuscar three.js style (lemo.mjs add copied the engine next to this
// file: MIT, see LICENSE-lemo-opuscar and CREDITS). This file is the project's own: replace the
// sample object with the brief's subject. Read the style guide named in CREDITS first, and do not
// copy the demo film's story, scenes or signature; the subject is the user's.
// Rules: window.lemoRender(t, win) is a pure function of t; time everything as a fraction of a shot
// (at(f)) so a resized shot stretches the motion; keep all Vietnamese text in the DOM layer.
// This module loads after the timeline script, so it paints the last time the bridge asked for.
import * as THREE from 'three';
import { makeStudio } from './studio.js';
import { makePost } from './post.js';

const root = document.getElementById('root');
const W = Number(root.dataset.width), H = Number(root.dataset.height);
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const ss = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// pixel ratio 2 with SSAA 2 is delivery quality; drop ssaa to 1 for quick drafts
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(2);
renderer.setSize(W, H);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.domElement.id = 'gl';
document.getElementById('bg').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(28, W / H, 1, 3000);
const post = makePost(renderer, scene, camera, W, H, { ssaa: 2, ao: false });
post.bloom.strength = .2; post.bloom.threshold = 1.1; post.bloom.radius = .4;
const studio = makeStudio(renderer, scene);

// sample subject: a glass vase (lathe profile, units mm, base on the floor)
const prof = [[0, 0], [16, 0], [19, 2], [20, 10], [18, 30], [12, 52], [8, 66], [9, 74], [11, 78], [10.4, 79], [7.4, 75], [6.6, 66], [10.6, 52], [16.6, 30], [18.4, 10], [15, 3], [0, 3]];
const vase = new THREE.Mesh(new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 160), new THREE.MeshPhysicalMaterial({
  color: '#ffffff', metalness: 0, roughness: .015, transmission: 1, thickness: 4, ior: 1.52, dispersion: 4,
  attenuationColor: new THREE.Color('#e9f4f2'), attenuationDistance: 120, specularIntensity: 1, envMapIntensity: 1.25,
}));
vase.position.set(0, studio.FLOOR.y, 0);
scene.add(vase);
const focusAt = new THREE.Vector3(0, 15, 0);

// win = { <scene id>: [start, end] } from window.TIMING, in WINDOWS order
window.lemoRender = (t, win) => {
  const shots = Object.values(win), [a0, a1] = shots[0], at = (f) => a0 + (a1 - a0) * f;
  const end = shots[shots.length - 1][1];
  const k = ss(seg(t, 0, end)), az = lerp(-.5, .3, k), r = lerp(360, 310, k);
  camera.position.set(Math.sin(az) * r, lerp(30, 20, k), Math.cos(az) * r);
  camera.lookAt(0, 30, 0); // above the vase centre, so the object sits low and the title band stays clear
  // one light sweep across the glass in the first shot
  const s = seg(t, at(.3), at(.8));
  const sweep = s > 0 && s < 1 ? { x: lerp(-1, 1, s), I: 8 * Math.sin(s * Math.PI), tilt: -.3, az: az + Math.PI } : { I: 0 };
  const lift = ss(seg(t, 0, at(.2)));
  studio.updateEnv({ left: lift, right: lift, top: lift, back: lift, sweep });
  scene.backgroundIntensity = .55 * lift; studio.U.uBgI.value = .55 * lift;
  studio.U.uTime.value = t * .6;
  post.dof.focus = camera.position.distanceTo(focusAt); post.dof.aper = 3.2; post.dof.maxCoc = 14;
  scene.updateMatrixWorld(); camera.updateMatrixWorld();
  studio.reflect(camera);
  post.composer.render();
};

if (window.__lemoWin) window.lemoRender(window.__lemoT || 0, window.__lemoWin);
