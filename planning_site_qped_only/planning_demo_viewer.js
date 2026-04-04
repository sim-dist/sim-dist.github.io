import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ColladaLoader } from 'three/addons/loaders/ColladaLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import URDFLoader from 'urdf-loader';

const canvas = document.getElementById('viewer-canvas');
const playBtn = document.getElementById('play-btn');
const stepBtn = document.getElementById('step-btn');
const resetBtn = document.getElementById('reset-btn');
const scrubber = document.getElementById('scrubber');
const playbackSpeedEl = document.getElementById('playback-speed');
const statusEl = document.getElementById('status');
const sceneSummaryEl = document.getElementById('scene-summary');
const manifestPathEl = document.getElementById('manifest-path');
const timeDisplayEl = document.getElementById('time-display');
const topicListEl = document.getElementById('topic-list');
const topicsCardEl = document.querySelector('.topics-card');
const topicsToggleBtn = document.getElementById('topics-toggle-btn');
const topicsFadeTopEl = document.querySelector('.topics-fade-top');
const topicsFadeBottomEl = document.querySelector('.topics-fade-bottom');
const currentTopicCountEl = document.getElementById('current-topic-count');
const videoOverlayEl = document.getElementById('video-overlay');
const syncVideoFrameEl = document.getElementById('sync-video-frame');
const experienceOverlayEl = document.getElementById('experience-overlay');
const overlayPlayBtn = document.getElementById('overlay-play-btn');
const dragHintOverlayEl = document.getElementById('drag-hint-overlay');
const cameraDebugEl = document.getElementById('camera-debug');

const TOPIC_LABEL_OVERRIDES = {
  '/tdmpc_best_viz': 'Plan (Finetuned)',
  '/tdmpc_best_no_ft_viz': 'Plan (Pretrained)',
  '/tdmpc_elites_viz/elite_2': 'Samples (Finetuned, Solver Iteration 2/8)',
  '/tdmpc_elites_viz/elite_5': 'Samples (Finetuned, Solver Iteration 5/8)',
  '/tdmpc_elites_viz/elite_7': 'Samples (Finetuned, Solver Iteration 8/8)',
  '/elevation_grid_filled_shifted': 'Height Map',
  '/terrain_grid_map': 'Terrain',
};

const INITIAL_CAMERA_POSITION = new THREE.Vector3(2.796, -0.635, 0.341);
const INITIAL_CAMERA_ROTATION = new THREE.Euler(1.078, 0.679, 0.325, 'XYZ');
const INITIAL_CAMERA_DISTANCE = 0.829;
const MOBILE_INITIAL_CAMERA_POSITION = new THREE.Vector3(2.859, -1.021, 0.502);
const MOBILE_INITIAL_CAMERA_ROTATION = new THREE.Euler(1.078, 0.679, 0.325, 'XYZ');
const MOBILE_INITIAL_CAMERA_DISTANCE = 1.266;

const DEFAULT_MANIFEST_URL = new URLSearchParams(location.search).get('manifest') || 'manifest.json';

const state = {
  manifestUrl: new URL(DEFAULT_MANIFEST_URL, location.href).href,
  manifestBaseUrl: new URL('.', new URL(DEFAULT_MANIFEST_URL, location.href)).href,
  manifest: null,
  duration: 0,
  currentTime: 0,
  playing: false,
  playbackRate: 0.5,
  lastTick: performance.now(),
  camera: null,
  cameraTarget: new THREE.Vector3(),
  cameraPosition: new THREE.Vector3(),
  defaultCameraOffset: new THREE.Vector3(1.02, -1.18, 0.42),
  followTargetOffset: new THREE.Vector3(),
  lastFollowTarget: null,
  sceneBox: new THREE.Box3(),
  contentRoot: null,
  robotRoot: null,
  robotSpec: null,
  robotPoseTrack: null,
  robotJointTrack: null,
  timeline: null,
  timeSamples: null,
  timelineOrigin: 0,
  tracks: [],
  trackNodes: [],
  trackById: new Map(),
  assetCache: new Map(),
  visibleTopicCount: 0,
  videoOverlay: null,
  videoReady: false,
  videoSpriteImage: null,
  videoSpriteReady: false,
  currentVideoFrameIndex: -1,
  dragHintTimer: null,
  hasShownInitialDragHint: false,
  initialized: false,
};

const scene = new THREE.Scene();
scene.background = new THREE.Color('#c9c9c2');
scene.fog = new THREE.Fog('#c9c9c2', 5, 18);
scene.up.set(0, 0, 1);

const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 2000);
camera.up.set(0, 0, 1);
camera.position.set(2.9, -2.7, 1.25);
state.camera = camera;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.22;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.screenSpacePanning = false;
controls.target.set(0, 0, 0);

function isMobileLayout() {
  return window.matchMedia('(max-width: 760px)').matches;
}

function applyPresetCameraPose(robotPosition = null) {
  const initialPosition = isMobileLayout() ? MOBILE_INITIAL_CAMERA_POSITION : INITIAL_CAMERA_POSITION;
  const initialRotation = isMobileLayout() ? MOBILE_INITIAL_CAMERA_ROTATION : INITIAL_CAMERA_ROTATION;
  const initialDistance = isMobileLayout() ? MOBILE_INITIAL_CAMERA_DISTANCE : INITIAL_CAMERA_DISTANCE;
  const rotationMatrix = new THREE.Matrix4().makeRotationFromEuler(initialRotation);
  const forward = new THREE.Vector3(0, 0, -1).applyMatrix4(rotationMatrix).normalize();
  const target = initialPosition.clone().addScaledVector(forward, initialDistance);

  camera.position.copy(initialPosition);
  camera.rotation.copy(initialRotation);
  camera.quaternion.setFromEuler(initialRotation);
  controls.target.copy(target);
  camera.near = 0.01;
  camera.far = 1000;
  camera.updateProjectionMatrix();
  controls.update();
  state.cameraTarget.copy(controls.target);
  state.cameraPosition.copy(camera.position);
  state.defaultCameraOffset.copy(camera.position).sub(controls.target);
  if (robotPosition) {
    state.followTargetOffset.copy(controls.target).sub(robotPosition);
    state.lastFollowTarget = robotPosition.clone().add(state.followTargetOffset);
  } else {
    state.followTargetOffset.set(0, 0, 0);
    state.lastFollowTarget = controls.target.clone();
  }
}

function syncCameraFollowStateFromControls() {
  state.cameraTarget.copy(controls.target);
  state.cameraPosition.copy(camera.position);
  if (!state.robotRoot) {
    state.lastFollowTarget = controls.target.clone();
    return;
  }
  state.followTargetOffset.copy(controls.target).sub(state.robotRoot.position);
  state.lastFollowTarget = state.robotRoot.position.clone().add(state.followTargetOffset);
}

controls.addEventListener('change', () => {
  syncCameraFollowStateFromControls();
});

const ambient = new THREE.HemisphereLight(0xffffff, 0xb9b6ae, 2.4);
const sun = new THREE.DirectionalLight(0xffffff, 1.65);
sun.position.set(5, -3, 9);
scene.add(ambient, sun);

const contentRoot = new THREE.Group();
scene.add(contentRoot);
state.contentRoot = contentRoot;
window.__PLANNING_DEMO_DEBUG__ = { state, scene, camera, controls, THREE };

function setStatus(message, kind = 'info') {
  if (!statusEl) {
    return;
  }
  statusEl.textContent = message;
  statusEl.classList.toggle('error', kind === 'error');
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) {
    return '0.000 s';
  }
  return `${seconds.toFixed(3)} s`;
}

function formatDisplayTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '00.00';
  }
  return seconds.toFixed(2).padStart(5, '0');
}

function formatVec3(vector) {
  return `${vector.x.toFixed(3)}, ${vector.y.toFixed(3)}, ${vector.z.toFixed(3)}`;
}

function updateCameraDebug() {
  if (!cameraDebugEl) {
    return;
  }
  const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'XYZ');
  const distance = camera.position.distanceTo(controls.target);
  cameraDebugEl.innerHTML =
    `<strong>Camera Debug</strong>` +
    `pos: ${formatVec3(camera.position)}\n` +
    `rot: ${euler.x.toFixed(3)}, ${euler.y.toFixed(3)}, ${euler.z.toFixed(3)}\n` +
    `zoom: ${distance.toFixed(3)}`;
}

function syncTopicsCardLayoutMode() {
  if (!topicsCardEl) {
    return;
  }
  if (isMobileLayout()) {
    topicsCardEl.classList.remove('mobile-open');
    if (topicsToggleBtn) {
      topicsToggleBtn.setAttribute('aria-expanded', 'false');
    }
  } else {
    topicsCardEl.classList.remove('mobile-open');
    if (topicsToggleBtn) {
      topicsToggleBtn.setAttribute('aria-expanded', 'true');
    }
  }
  updateTopicsScrollFades();
}

function updateTopicsScrollFades() {
  if (!topicListEl || !topicsFadeTopEl || !topicsFadeBottomEl) {
    return;
  }
  if (!isMobileLayout() || !topicsCardEl?.classList.contains('mobile-open')) {
    topicsFadeTopEl.classList.remove('visible');
    topicsFadeBottomEl.classList.remove('visible');
    return;
  }
  const maxScrollTop = Math.max(0, topicListEl.scrollHeight - topicListEl.clientHeight);
  const scrollTop = topicListEl.scrollTop;
  const showTop = scrollTop > 1;
  const showBottom = scrollTop < maxScrollTop - 1;
  topicsFadeTopEl.classList.toggle('visible', showTop);
  topicsFadeBottomEl.classList.toggle('visible', showBottom);
}

if (topicsToggleBtn) {
  topicsToggleBtn.addEventListener('click', () => {
    if (!isMobileLayout() || !topicsCardEl) {
      return;
    }
    const nextOpen = !topicsCardEl.classList.contains('mobile-open');
    topicsCardEl.classList.toggle('mobile-open', nextOpen);
    topicsToggleBtn.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
    requestAnimationFrame(updateTopicsScrollFades);
  });
}

if (topicListEl) {
  topicListEl.addEventListener('scroll', updateTopicsScrollFades, { passive: true });
}

function resolveUrl(url, baseUrl = state.manifestBaseUrl) {
  return new URL(url, baseUrl).href;
}

function getOverlayFrameIndex(overlay, timeSeconds) {
  const duration = Math.max(state.duration, 1e-9);
  const progress = THREE.MathUtils.clamp(timeSeconds / duration, 0, 1);
  const frameCount = Math.max(1, Number(overlay.frameCount || 0));
  return frameCount > 1 ? Math.round(progress * (frameCount - 1)) : 0;
}

function loadOverlaySpriteImage(overlay) {
  if (!overlay || overlay.mode !== 'sprite' || !overlay.spritePath) {
    return Promise.resolve(null);
  }
  if (state.videoSpriteImage) {
    return Promise.resolve(state.videoSpriteImage);
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.loading = 'eager';
    image.onload = () => {
      state.videoSpriteImage = image;
      state.videoSpriteReady = true;
      resolve(image);
    };
    image.onerror = () => {
      reject(new Error(`Failed to load overlay sprite image: ${overlay.spritePath}`));
    };
    image.src = resolveUrl(overlay.spritePath, state.manifestBaseUrl);
  });
}

function updateOverlayFrame(timeSeconds) {
  const overlay = state.videoOverlay;
  const canvasEl = syncVideoFrameEl;
  if (!overlay || !(canvasEl instanceof HTMLCanvasElement)) {
    return;
  }
  const frameIndex = getOverlayFrameIndex(overlay, timeSeconds);
  if (frameIndex === state.currentVideoFrameIndex) {
    return;
  }
  if (overlay.mode !== 'sprite') {
    return;
  }
  const spriteImage = state.videoSpriteImage;
  if (!spriteImage || !state.videoSpriteReady) {
    return;
  }

  const frameWidth = Math.max(1, Number(overlay.frameWidth || spriteImage.naturalWidth));
  const frameHeight = Math.max(1, Number(overlay.frameHeight || spriteImage.naturalHeight));
  const columns = Math.max(1, Number(overlay.columns || 1));
  const column = frameIndex % columns;
  const row = Math.floor(frameIndex / columns);
  const context = canvasEl.getContext('2d');
  if (!context) {
    return;
  }

  if (canvasEl.width !== frameWidth || canvasEl.height !== frameHeight) {
    canvasEl.width = frameWidth;
    canvasEl.height = frameHeight;
  }
  context.clearRect(0, 0, canvasEl.width, canvasEl.height);
  context.drawImage(
    spriteImage,
    column * frameWidth,
    row * frameHeight,
    frameWidth,
    frameHeight,
    0,
    0,
    canvasEl.width,
    canvasEl.height,
  );
  state.currentVideoFrameIndex = frameIndex;
  if (videoOverlayEl) {
    videoOverlayEl.classList.remove('hidden');
  }
  state.videoReady = true;
}

function normalizeManifest(manifest) {
  const topics = Array.isArray(manifest.topics)
    ? manifest.topics
    : Array.isArray(manifest.tracks)
      ? manifest.tracks
      : [];

  const robot = manifest.robot || {};
  const timeline = manifest.timeline || {};
  const robotDescription =
    manifest.robot_description ||
    manifest.robotDescription ||
    robot.description ||
    robot.urdf ||
    robot.descriptionPath ||
    robot.path ||
    null;

  const robotPose =
    manifest.robotPose ||
    robot.pose ||
    robot.odom ||
    robot.transform ||
    manifest.robot_pose ||
    null;
  const robotJoints =
    manifest.robotJoints ||
    robot.joints ||
    robot.joint_positions ||
    manifest.robot_joints ||
    null;
  const title = manifest.title || manifest.name || 'Planning Demo';
  const subtitle = manifest.subtitle || manifest.description || '';
  const durationSeconds =
    Number(manifest.durationSeconds) ||
    Number(manifest.duration_s) ||
    Number(timeline.durationSeconds) ||
    Number(timeline.duration_s) ||
    0;

  return {
    ...manifest,
    title,
    subtitle,
    topics,
    robotDescription,
    robotPose,
    robotJoints,
    durationSeconds,
    timeline,
  };
}

function isTypedArray(value) {
  return ArrayBuffer.isView(value) && !(value instanceof DataView);
}

function product(values) {
  return values.reduce((acc, value) => acc * value, 1);
}

function parseShapeText(shapeText) {
  if (!shapeText || shapeText.trim() === '') {
    return [];
  }
  return shapeText
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => Number(part));
}

function dtypeToCtor(dtype) {
  const normalized = String(dtype).replace(/^<|^>|^\|/, '');
  switch (normalized) {
    case 'f4':
    case 'float32':
      return Float32Array;
    case 'f8':
    case 'float64':
      return Float64Array;
    case 'i1':
    case 'int8':
      return Int8Array;
    case 'u1':
    case 'uint8':
    case 'bool':
      return Uint8Array;
    case 'i2':
    case 'int16':
      return Int16Array;
    case 'u2':
    case 'uint16':
      return Uint16Array;
    case 'i4':
    case 'int32':
      return Int32Array;
    case 'u4':
    case 'uint32':
      return Uint32Array;
    default:
      throw new Error(`Unsupported dtype: ${dtype}`);
  }
}

function bytesPerElement(dtype) {
  return dtypeToCtor(dtype).BYTES_PER_ELEMENT;
}

function parseNpy(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] !== 0x93 || String.fromCharCode(...bytes.slice(1, 6)) !== 'NUMPY') {
    throw new Error('Invalid npy file');
  }
  const major = bytes[6];
  const headerLength = major === 1
    ? new DataView(buffer, 8, 2).getUint16(0, true)
    : new DataView(buffer, 8, 4).getUint32(0, true);
  const headerOffset = major === 1 ? 10 : 12;
  const header = new TextDecoder().decode(bytes.slice(headerOffset, headerOffset + headerLength));
  const descrMatch = header.match(/'descr':\s*'([^']+)'/);
  const shapeMatch = header.match(/'shape':\s*\(([^)]*)\)/);
  const orderMatch = header.match(/'fortran_order':\s*(True|False)/);
  if (!descrMatch || !shapeMatch || !orderMatch) {
    throw new Error('Unsupported npy header');
  }
  const descr = descrMatch[1];
  const shape = parseShapeText(shapeMatch[1]);
  const fortranOrder = orderMatch[1] === 'True';
  const offset = headerOffset + headerLength;
  const ctor = dtypeToCtor(descr);
  const count = shape.length ? product(shape) : 1;
  const bytesPerValue = bytesPerElement(descr);
  if ((buffer.byteLength - offset) < count * bytesPerValue) {
    throw new Error('Truncated npy payload');
  }
  const littleEndian = descr.startsWith('<') || descr.startsWith('|') || !descr.startsWith('>');
  if (!littleEndian && bytesPerValue > 1) {
    throw new Error('Big-endian npy payloads are not supported');
  }
  const data = new ctor(buffer, offset, count);
  return { data, shape, dtype: descr, fortranOrder };
}

function inferBinaryShape(spec, payload) {
  if (Array.isArray(payload?.shape)) {
    return payload.shape.slice();
  }
  if (Array.isArray(spec.shape)) {
    return spec.shape.slice();
  }
  return [];
}

function normalizePayloadSpec(spec) {
  if (spec == null) {
    return null;
  }
  if (typeof spec === 'string') {
    return { path: spec };
  }
  if (Array.isArray(spec) || isTypedArray(spec) || typeof spec === 'number' || typeof spec === 'boolean') {
    return { inline: spec };
  }
  return spec;
}

function normalizeReferenceSpec(spec) {
  if (typeof spec === 'string') {
    return spec.trim().startsWith('<') ? { inline: spec } : spec;
  }
  if (spec && typeof spec === 'object' && !Array.isArray(spec)) {
    const description = spec.description;
    if (typeof description === 'string') {
      if (description.trim().startsWith('<')) {
        return { inline: description };
      }
      if (!spec.path && !spec.url && !spec.href && !spec.file) {
        return description;
      }
    }
  }
  return spec;
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

async function fetchBinary(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status} ${response.statusText}`);
  }
  return response.arrayBuffer();
}

function base64ToArrayBuffer(base64) {
  const cleaned = base64.replace(/\s+/g, '');
  const binary = atob(cleaned);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return buffer;
}

async function loadPayload(spec, baseUrl = state.manifestBaseUrl) {
  const normalized = normalizePayloadSpec(spec);
  if (normalized == null) {
    return null;
  }
  if (Object.prototype.hasOwnProperty.call(normalized, 'inline')) {
    const inline = normalized.inline;
    if (typeof inline === 'string' && normalized.encoding === 'base64') {
      return base64ToArrayBuffer(inline);
    }
    return inline;
  }
  if (Object.prototype.hasOwnProperty.call(normalized, 'data')) {
    return normalized.data;
  }
  if (Object.prototype.hasOwnProperty.call(normalized, 'value')) {
    return normalized.value;
  }

  const path = normalized.url || normalized.href || normalized.path || normalized.file;
  if (!path) {
    return null;
  }
  const url = resolveUrl(path, baseUrl);
  if (state.assetCache.has(url)) {
    return state.assetCache.get(url);
  }

  let promise;
  const wantsText =
    normalized.format === 'text' ||
    normalized.type === 'text' ||
    normalized.kind === 'text' ||
    /\.urdf$|\.xml$|\.json$/i.test(path) ||
    normalized.mimeType?.startsWith('text/');

  if (wantsText) {
    promise = fetchText(url).then((text) => {
      if (normalized.format === 'json' || /\.json$/i.test(path)) {
        return JSON.parse(text);
      }
      return text;
    });
  } else if (normalized.format === 'npy' || /\.npy$/i.test(path)) {
    promise = fetchBinary(url).then((buffer) => parseNpy(buffer));
  } else if (normalized.format === 'base64') {
    promise = Promise.resolve(base64ToArrayBuffer(normalized.data || normalized.base64 || ''));
  } else if (normalized.dtype) {
    promise = fetchBinary(url).then((buffer) => {
      const ctor = dtypeToCtor(normalized.dtype);
      const offset = Number(normalized.byteOffset) || 0;
      const count = normalized.count != null ? Number(normalized.count) : undefined;
      const view = count != null ? new ctor(buffer, offset, count) : new ctor(buffer, offset);
      return {
        data: view,
        shape: inferBinaryShape(normalized, { shape: normalized.shape }),
        dtype: normalized.dtype,
      };
    });
  } else {
    promise = fetchBinary(url);
  }

  state.assetCache.set(url, promise);
  return promise;
}

function resolveTimeArray(payload) {
  if (!payload) {
    return null;
  }
  if (Array.isArray(payload)) {
    return payload.map(Number);
  }
  if (isTypedArray(payload)) {
    return Array.from(payload, Number);
  }
  if (payload.data && payload.shape) {
    const data = payload.data;
    if (payload.shape.length === 1) {
      return Array.from(data, Number);
    }
  }
  return null;
}

function getArrayFromPayload(payload) {
  if (!payload) {
    return null;
  }
  if (Array.isArray(payload) || isTypedArray(payload)) {
    return payload;
  }
  if (payload.data) {
    return payload.data;
  }
  return null;
}

function getShapeFromPayload(payload, fallback = []) {
  if (!payload) {
    return fallback.slice();
  }
  if (Array.isArray(payload.shape)) {
    return payload.shape.slice();
  }
  if (Array.isArray(payload)) {
    return [payload.length];
  }
  if (isTypedArray(payload)) {
    return [payload.length];
  }
  if (payload.data && Array.isArray(payload.shape)) {
    return payload.shape.slice();
  }
  return fallback.slice();
}

function reshapeIndex(shape, indices) {
  let stride = 1;
  let offset = 0;
  for (let index = shape.length - 1; index >= 0; index -= 1) {
    offset += indices[index] * stride;
    stride *= shape[index];
  }
  return offset;
}

function sliceAtFrame(arrayLike, shape, frameIndex) {
  if (!arrayLike || !shape.length) {
    return null;
  }
  const data = getArrayFromPayload(arrayLike);
  if (!data) {
    return null;
  }
  if (shape.length === 1) {
    return data[Math.max(0, Math.min(shape[0] - 1, frameIndex))];
  }
  const leading = shape[0];
  const frame = Math.max(0, Math.min(leading - 1, frameIndex));
  const frameSize = product(shape.slice(1));
  const start = frame * frameSize;
  return data.slice ? data.slice(start, start + frameSize) : data.subarray(start, start + frameSize);
}

function clampFrameIndex(timeSeconds, times, duration, frameCount, origin = 0) {
  if (Array.isArray(times) && times.length > 1) {
    let index = times.length - 1;
    for (let i = 0; i < times.length; i += 1) {
      if ((times[i] - origin) > timeSeconds) {
        index = Math.max(0, i - 1);
        break;
      }
    }
    return index;
  }
  if (frameCount > 1 && duration > 0) {
    const normalized = THREE.MathUtils.clamp(timeSeconds / duration, 0, 1);
    return Math.min(frameCount - 1, Math.floor(normalized * (frameCount - 1) + 1e-6));
  }
  return 0;
}

function flattenPoints(points) {
  const flat = [];
  if (!points) {
    return flat;
  }
  if (Array.isArray(points) && points.length > 0 && typeof points[0] === 'number') {
    for (let index = 0; index + 2 < points.length; index += 3) {
      flat.push(new THREE.Vector3(points[index], points[index + 1], points[index + 2]));
    }
    return flat;
  }
  for (const point of points) {
    if (Array.isArray(point) && point.length >= 3) {
      flat.push(new THREE.Vector3(Number(point[0]), Number(point[1]), Number(point[2])));
    } else if (point && typeof point.x === 'number' && typeof point.y === 'number' && typeof point.z === 'number') {
      flat.push(new THREE.Vector3(point.x, point.y, point.z));
    }
  }
  return flat;
}

function pointsToBuffer(points) {
  const flat = flattenPoints(points);
  const buffer = new Float32Array(flat.length * 3);
  flat.forEach((point, index) => {
    buffer[index * 3 + 0] = point.x;
    buffer[index * 3 + 1] = point.y;
    buffer[index * 3 + 2] = point.z;
  });
  return buffer;
}

function parseColor(value, fallback = 0x8af58b) {
  if (value instanceof THREE.Color) {
    return value.clone();
  }
  if (Array.isArray(value)) {
    const [r = 1, g = 1, b = 1] = value;
    const color = new THREE.Color();
    color.setRGB(Number(r), Number(g), Number(b), THREE.SRGBColorSpace);
    return color;
  }
  if (typeof value === 'string') {
    return new THREE.Color(value);
  }
  if (typeof value === 'number') {
    return new THREE.Color(value);
  }
  return new THREE.Color(fallback);
}

function getTrackFrameTimes(track) {
  if (!Array.isArray(track?.frames)) {
    return null;
  }
  return track.frames.map((frame) => Number(frame.time || frame.timestamp || 0));
}

function clampFrameFromFrames(timeSeconds, frames) {
  if (!Array.isArray(frames) || frames.length === 0) {
    return 0;
  }
  let index = frames.length - 1;
  for (let i = 0; i < frames.length; i += 1) {
    const frameTime = Number(frames[i].time || frames[i].timestamp || 0);
    if (frameTime > timeSeconds) {
      index = Math.max(0, i - 1);
      break;
    }
  }
  return index;
}

function computeHeightColor(normalized) {
  const color = new THREE.Color();
  const t = THREE.MathUtils.clamp(normalized, 0, 1);
  if (t < 0.35) {
    color.setRGB(0.12, 0.25 + t * 0.5, 0.18 + t * 0.6);
  } else if (t < 0.7) {
    const x = (t - 0.35) / 0.35;
    color.setRGB(0.14 + x * 0.2, 0.45 + x * 0.3, 0.18);
  } else {
    const x = (t - 0.7) / 0.3;
    color.setRGB(0.34 + x * 0.4, 0.55 + x * 0.35, 0.26 + x * 0.18);
  }
  return color;
}

const TERRAIN_RENDER_STYLES = {
  '/elevation_grid_filled_shifted': {
    startColor: '#000000',
    endColor: '#a0a0a0',
    startAlpha: 0.7,
    endAlpha: 0.7,
    useAlpha: true,
    depthWrite: true,
    renderOrder: 4,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    zOffset: 0.0,
  },
  '/terrain_grid_map': {
    startColor: '#000000',
    endColor: '#ffffff',
    startAlpha: 0,
    endAlpha: 1,
    renderOrder: 1,
    wireframe: true,
    wireframeColor: '#8a8a8a',
    wireframeOpacity: 0.18,
    useAlpha: true,
  },
};

function terrainRenderStyle(track) {
  const style = TERRAIN_RENDER_STYLES[track.id] || {};
  return {
    startColor: parseColor(style.startColor || track.color || 0x5fb0ff),
    endColor: parseColor(style.endColor || '#ffffff'),
    startAlpha: style.startAlpha == null ? (track.opacity == null ? 0.82 : Number(track.opacity)) : Number(style.startAlpha),
    endAlpha: style.endAlpha == null ? 1 : Number(style.endAlpha),
    renderOrder: Number(style.renderOrder || 1),
    polygonOffset: Boolean(style.polygonOffset),
    polygonOffsetFactor: Number(style.polygonOffsetFactor || 0),
    polygonOffsetUnits: Number(style.polygonOffsetUnits || 0),
    zOffset: Number(style.zOffset || 0),
    wireframe: Boolean(style.wireframe),
    wireframeColor: parseColor(style.wireframeColor || '#000000'),
    wireframeOpacity: Number(style.wireframeOpacity == null ? 0.18 : style.wireframeOpacity),
    useAlpha: style.useAlpha !== false,
    depthWrite: style.depthWrite == null ? !((style.useAlpha !== false)) : Boolean(style.depthWrite),
  };
}

function createTerrainMaterial(style) {
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: style.useAlpha,
    opacity: 1,
    side: THREE.FrontSide,
    vertexColors: true,
    polygonOffset: style.polygonOffset,
    polygonOffsetFactor: style.polygonOffsetFactor,
    polygonOffsetUnits: style.polygonOffsetUnits,
  });
  material.depthWrite = style.depthWrite;
  if (style.useAlpha) {
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = `attribute float alpha;\nvarying float vAlpha;\n${shader.vertexShader}`.replace(
        '#include <color_vertex>',
        `#include <color_vertex>\n  vAlpha = alpha;`,
      );
      shader.fragmentShader = `varying float vAlpha;\n${shader.fragmentShader}`.replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        'vec4 diffuseColor = vec4( diffuse, opacity * vAlpha );',
      );
    };
    material.customProgramCacheKey = () => 'terrain-alpha-v1';
  }
  return material;
}

function createTerrainWireframeMaterial(style) {
  const material = new THREE.MeshBasicMaterial({
    color: style.wireframeColor,
    transparent: style.wireframeOpacity < 1,
    opacity: style.wireframeOpacity,
    side: THREE.FrontSide,
    wireframe: true,
  });
  material.depthWrite = false;
  return material;
}

function applyTerrainGradient(positionArray, colorArray, alphaArray, style) {
  let minSeen = Infinity;
  let maxSeen = -Infinity;
  const vertexCount = Math.floor(positionArray.length / 3);
  for (let index = 0; index < vertexCount; index += 1) {
    const z = Number(positionArray[index * 3 + 2]);
    minSeen = Math.min(minSeen, z);
    maxSeen = Math.max(maxSeen, z);
  }
  const range = Math.max(1e-6, maxSeen - minSeen);
  const scratch = new THREE.Color();
  for (let index = 0; index < vertexCount; index += 1) {
    const z = Number(positionArray[index * 3 + 2]);
    const t = THREE.MathUtils.clamp((z - minSeen) / range, 0, 1);
    scratch.copy(style.startColor).lerp(style.endColor, t);
    colorArray[index * 3 + 0] = scratch.r;
    colorArray[index * 3 + 1] = scratch.g;
    colorArray[index * 3 + 2] = scratch.b;
    alphaArray[index] = THREE.MathUtils.lerp(style.startAlpha, style.endAlpha, t);
  }
}

function applyTerrainZOffset(positionArray, style) {
  if (!style.zOffset) {
    return;
  }
  const vertexCount = Math.floor(positionArray.length / 3);
  for (let index = 0; index < vertexCount; index += 1) {
    positionArray[index * 3 + 2] += style.zOffset;
  }
}

function currentViewportResolution() {
  const width = canvas.clientWidth || window.innerWidth || 1;
  const height = canvas.clientHeight || window.innerHeight || 1;
  return new THREE.Vector2(width, height);
}

function createLineTrack(track, payload, timeSamples) {
  const root = new THREE.Group();
  const color = parseColor(track.color || track.lineColor || 0x7aff8a);
  const opacity =
    track.opacity == null
      ? (Array.isArray(track.color) && track.color.length > 3 ? Number(track.color[3]) : 0.95)
      : Number(track.opacity);
  const material = new LineMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    worldUnits: true,
    linewidth: Math.max(Number(track.width || 0.003), 0.0015),
  });
  material.resolution.copy(currentViewportResolution());
  const geometry = new LineSegmentsGeometry();
  const capacity = Math.max(2, track.capacity || track.maxPoints || 2048);
  const line = new LineSegments2(geometry, material);
  line.frustumCulled = false;
  root.add(line);
  contentRoot.add(root);
  return {
    id: track.id,
    track,
    root,
    line,
    geometry,
    material,
    payload,
    timeSamples,
    capacity,
    userVisible: track.visible !== false && track.enabled !== false,
    dataVisible: true,
    update(frameIndex, timeSeconds) {
      const shape = getShapeFromPayload(payload, []);
      const data = getArrayFromPayload(payload);
      let positions = null;
      let pointCount = 0;

      if (!data) {
        this.dataVisible = false;
        root.visible = this.userVisible && this.dataVisible;
        return;
      }

      if (Array.isArray(track.frames) && track.frames.length > 0 && data) {
        const frame = track.frames[clampFrameFromFrames(timeSeconds, track.frames)];
        const start = Number(frame.vertexOffset || frame.offset || 0) * 3;
        const count = Number(frame.vertexCount || frame.count || 0) * 3;
        positions = data.subarray ? data.subarray(start, start + count) : data.slice(start, start + count);
        pointCount = count / 3;
      } else if (shape.length === 2 && shape[1] === 3) {
        pointCount = Math.min(shape[0], frameIndex + 1);
        positions = data.subarray(0, pointCount * 3);
      } else if (shape.length === 3 && shape[2] === 3) {
        const frame = clampFrameIndex(
          timeSeconds,
          timeSamples,
          state.duration,
          shape[0],
          Array.isArray(timeSamples) && timeSamples.length ? Number(timeSamples[0]) : state.timelineOrigin,
        );
        const frameSize = shape[1] * 3;
        const start = frame * frameSize;
        positions = data.subarray(start, start + frameSize);
        pointCount = shape[1];
      } else if (shape.length === 1 && shape[0] % 3 === 0) {
        positions = data;
        pointCount = shape[0] / 3;
      } else {
        const points = flattenPoints(data);
        positions = pointsToBuffer(points);
        pointCount = positions.length / 3;
      }

      if (!positions || pointCount < 2) {
        this.dataVisible = false;
        root.visible = this.userVisible && this.dataVisible;
        return;
      }

      this.dataVisible = true;
      root.visible = this.userVisible && this.dataVisible;
      if (pointCount > this.capacity) {
        this.capacity = pointCount;
      }
      const nextPositions = positions.subarray ? positions.subarray(0, pointCount * 3) : positions;
      geometry.setPositions(nextPositions);
      geometry.computeBoundingSphere();
    },
  };
}

function createHeightfieldTrack(track, payload, timeSamples) {
  if (Array.isArray(track.frames) && track.frames.length > 0) {
    const root = new THREE.Group();
    const style = terrainRenderStyle(track);
    const material = createTerrainMaterial(style);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(0), 3));
    geometry.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(0), 1));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = style.renderOrder;
    root.add(mesh);
    let wireframe = null;
    if (style.wireframe) {
      wireframe = new THREE.Mesh(geometry, createTerrainWireframeMaterial(style));
      wireframe.frustumCulled = false;
      wireframe.renderOrder = style.renderOrder + 1;
      root.add(wireframe);
    }
    contentRoot.add(root);
    return {
      id: track.id,
      track,
      root,
      mesh,
      wireframe,
      geometry,
      material,
      payload,
      style,
      userVisible: track.visible !== false && track.enabled !== false,
      dataVisible: true,
      update(frameIndex, timeSeconds) {
        const data = getArrayFromPayload(payload);
        if (!data) {
          this.dataVisible = false;
          root.visible = this.userVisible && this.dataVisible;
          return;
        }
        const frame = track.frames[clampFrameFromFrames(timeSeconds, track.frames)];
        const start = Number(frame.vertexOffset || frame.offset || 0) * 3;
        const count = Number(frame.vertexCount || frame.count || 0) * 3;
        const positions = data.subarray ? data.subarray(start, start + count) : data.slice(start, start + count);
        if (!positions || count < 9) {
          this.dataVisible = false;
          root.visible = this.userVisible && this.dataVisible;
          return;
        }
        const positionBuffer = new Float32Array(positions);
        const colorBuffer = new Float32Array((count / 3) * 3);
        const alphaBuffer = new Float32Array(count / 3);
        applyTerrainZOffset(positionBuffer, this.style);
        applyTerrainGradient(positionBuffer, colorBuffer, alphaBuffer, this.style);
        geometry.setAttribute('position', new THREE.BufferAttribute(positionBuffer, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colorBuffer, 3));
        geometry.setAttribute('alpha', new THREE.BufferAttribute(alphaBuffer, 1));
        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();
        this.dataVisible = true;
        root.visible = this.userVisible && this.dataVisible;
      },
    };
  }

  const root = new THREE.Group();
  const style = terrainRenderStyle(track);
  const material = createTerrainMaterial(style);

  const data = getArrayFromPayload(payload);
  const shape = getShapeFromPayload(payload, []);
  const rows = shape.length >= 2 ? shape[shape.length - 2] : 0;
  const cols = shape.length >= 2 ? shape[shape.length - 1] : 0;
  const cellSizeX = Number(track.cellSizeX || track.cell_size_x || track.spacingX || track.spacing?.[0] || 0.08);
  const cellSizeY = Number(track.cellSizeY || track.cell_size_y || track.spacingY || track.spacing?.[1] || cellSizeX);
  const width = Number(track.width || track.extentX || track.size?.[0] || (Math.max(cols - 1, 1) * cellSizeX));
  const height = Number(track.height || track.extentY || track.size?.[1] || (Math.max(rows - 1, 1) * cellSizeY));
  const geomRows = Math.max(rows - 1, 1);
  const geomCols = Math.max(cols - 1, 1);
  const geometry = new THREE.PlaneGeometry(width, height, geomCols, geomRows);
  geometry.rotateX(0);
  const positions = geometry.getAttribute('position');
  const colors = new Float32Array(positions.count * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const alphas = new Float32Array(positions.count);
  geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = style.renderOrder;
  let wireframe = null;
  if (style.wireframe) {
    wireframe = new THREE.Mesh(geometry, createTerrainWireframeMaterial(style));
    wireframe.frustumCulled = false;
    wireframe.renderOrder = style.renderOrder + 1;
    root.add(wireframe);
  }
  mesh.position.set(
    Number(track.origin?.[0] || track.position?.[0] || 0),
    Number(track.origin?.[1] || track.position?.[1] || 0),
    Number(track.origin?.[2] || track.position?.[2] || 0),
  );
  if (wireframe) {
    wireframe.position.copy(mesh.position);
  }
  if (track.rotation && Array.isArray(track.rotation) && track.rotation.length === 3) {
    mesh.rotation.set(track.rotation[0], track.rotation[1], track.rotation[2]);
    if (wireframe) {
      wireframe.rotation.set(track.rotation[0], track.rotation[1], track.rotation[2]);
    }
  }
  root.add(mesh);
  contentRoot.add(root);
  return {
    id: track.id,
    track,
    root,
    mesh,
    wireframe,
    geometry,
    material,
    style,
    payload,
    timeSamples,
    rows,
    cols,
    width,
    height,
    userVisible: track.visible !== false && track.enabled !== false,
    dataVisible: true,
    update(frameIndex, timeSeconds) {
      const currentShape = getShapeFromPayload(payload, []);
      const currentData = getArrayFromPayload(payload);
      if (!currentData || currentShape.length < 2) {
        this.dataVisible = false;
        root.visible = this.userVisible && this.dataVisible;
        return;
      }

      const frame = currentShape.length >= 3
        ? clampFrameIndex(
            timeSeconds,
            timeSamples,
            state.duration,
            currentShape[0],
            Array.isArray(timeSamples) && timeSamples.length ? Number(timeSamples[0]) : state.timelineOrigin,
          )
        : 0;
      const frameData = currentShape.length >= 3
        ? sliceAtFrame(payload, currentShape, frame)
        : currentData;
      if (!frameData) {
        this.dataVisible = false;
        root.visible = this.userVisible && this.dataVisible;
        return;
      }

      const frameShape = currentShape.length >= 3 ? currentShape.slice(1) : currentShape.slice();
      const frameRows = frameShape[frameShape.length - 2];
      const frameCols = frameShape[frameShape.length - 1];
      const expected = frameRows * frameCols;
      if (expected <= 0) {
        this.dataVisible = false;
        root.visible = this.userVisible && this.dataVisible;
        return;
      }

      const positionAttr = geometry.getAttribute('position');
      const colorAttr = geometry.getAttribute('color');
      const alphaAttr = geometry.getAttribute('alpha');
      const limit = Math.min(expected, positionAttr.count);
      for (let index = 0; index < limit; index += 1) {
        const value = Number(frameData[index]);
        const z = Number.isFinite(value) ? value : 0;
        positionAttr.array[index * 3 + 2] = z + this.style.zOffset;
      }
      positionAttr.needsUpdate = true;
      applyTerrainGradient(positionAttr.array.subarray(0, limit * 3), colorAttr.array, alphaAttr.array, this.style);
      colorAttr.needsUpdate = true;
      alphaAttr.needsUpdate = true;
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      this.dataVisible = true;
      root.visible = this.userVisible && this.dataVisible;
    },
  };
}

function createRobotTrack(robot, track, payload, timeSamples) {
  const quaternionOrder = String(track.quaternionOrder || track.poseOrder || 'xyzw').toLowerCase();
  const strideFloats = Number(track.strideFloats || 0);
  const poseOffsetFloats = Number(track.poseOffsetFloats || 0);
  const timeOffsetFloats = Number(track.timeOffsetFloats || 0);
  return {
    id: track.id,
    track,
    robot,
    payload,
    timeSamples,
    update(frameIndex, timeSeconds) {
      const shape = getShapeFromPayload(payload, []);
      const data = getArrayFromPayload(payload);
      const targetRobot = this.robot;
      if (!targetRobot || !data) {
        return;
      }

      if (shape.length === 2 && strideFloats >= (poseOffsetFloats + 7)) {
        const localTimes = [];
        for (let row = 0; row < shape[0]; row += 1) {
          localTimes.push(Number(data[row * strideFloats + timeOffsetFloats]));
        }
        const frame = clampFrameIndex(timeSeconds, localTimes, state.duration, shape[0], localTimes[0] || 0);
        const base = frame * strideFloats + poseOffsetFloats;
        const position = [data[base + 0], data[base + 1], data[base + 2]];
        const quaternion =
          quaternionOrder === 'wxyz'
            ? [data[base + 4], data[base + 5], data[base + 6], data[base + 3]]
            : [data[base + 3], data[base + 4], data[base + 5], data[base + 6]];
        targetRobot.position.set(position[0], position[1], position[2]);
        targetRobot.quaternion.set(quaternion[0], quaternion[1], quaternion[2], quaternion[3]);
        targetRobot.updateMatrixWorld(true);
        return;
      }

      if (shape.length >= 2 && shape[shape.length - 1] >= 7) {
        const frame = clampFrameIndex(
          timeSeconds,
          timeSamples,
          state.duration,
          shape[0],
          Array.isArray(timeSamples) && timeSamples.length ? Number(timeSamples[0]) : state.timelineOrigin,
        );
        const frameSize = product(shape.slice(1));
        const offset = frame * frameSize;
        const values = data.subarray(offset, offset + frameSize);
        const position = [values[0], values[1], values[2]];
        const quaternion =
          quaternionOrder === 'wxyz'
            ? [values[4], values[5], values[6], values[3]]
            : [values[3], values[4], values[5], values[6]];
        targetRobot.position.set(position[0], position[1], position[2]);
        targetRobot.quaternion.set(quaternion[0], quaternion[1], quaternion[2], quaternion[3]);
        targetRobot.updateMatrixWorld(true);
      } else if (shape.length === 2 && shape[1] >= 7) {
        const frame = Math.max(0, Math.min(shape[0] - 1, frameIndex));
        const offset = frame * shape[1];
        const values = data.subarray(offset, offset + shape[1]);
        targetRobot.position.set(values[0], values[1], values[2]);
        if (quaternionOrder === 'wxyz') {
          targetRobot.quaternion.set(values[4], values[5], values[6], values[3]);
        } else {
          targetRobot.quaternion.set(values[3], values[4], values[5], values[6]);
        }
        targetRobot.updateMatrixWorld(true);
      }
    },
  };
}

function applyJointValues(robot, jointTrack, frameIndex, timeSeconds) {
  if (!robot || !jointTrack) {
    return;
  }
  const data = getArrayFromPayload(jointTrack.payload);
  const shape = getShapeFromPayload(jointTrack.payload, []);
  if (!data || shape.length < 2) {
    return;
  }
  const strideFloats = Number(jointTrack.track.strideFloats || 0);
  const jointOffsetFloats = Number(jointTrack.track.jointOffsetFloats || 0);
  const timeOffsetFloats = Number(jointTrack.track.timeOffsetFloats || 0);
  const frame = shape.length >= 3
    ? clampFrameIndex(
        timeSeconds,
        jointTrack.timeSamples,
        state.duration,
        shape[0],
        Array.isArray(jointTrack.timeSamples) && jointTrack.timeSamples.length
          ? Number(jointTrack.timeSamples[0])
          : state.timelineOrigin,
      )
    : Math.max(0, Math.min(shape[0] - 1, frameIndex));
  let values = null;
  if (shape.length === 2 && strideFloats > 0) {
    const localTimes = [];
    for (let row = 0; row < shape[0]; row += 1) {
      localTimes.push(Number(data[row * strideFloats + timeOffsetFloats]));
    }
    const timeFrame = clampFrameIndex(timeSeconds, localTimes, state.duration, shape[0], localTimes[0] || 0);
    const start = timeFrame * strideFloats + jointOffsetFloats;
    values = data.subarray(start, start + (jointTrack.track.jointNames || []).length);
  } else {
    const frameSize = shape[shape.length - 1];
    const offset = frame * frameSize;
    values = data.subarray(offset, offset + frameSize);
  }
  const names = jointTrack.track.jointNames || jointTrack.track.names || jointTrack.track.order || [];
  const joints = robot.joints || robot.jointMap || {};
  const jointList = Array.isArray(names) && names.length ? names : Object.keys(joints);

  jointList.forEach((name, index) => {
    const joint = joints[name];
    if (!joint) {
      return;
    }
    const value = Number(values[index]);
    if (typeof joint.setJointValue === 'function') {
      joint.setJointValue(value);
    } else if (typeof joint.setAngle === 'function') {
      joint.setAngle(value);
    } else if (typeof joint.setOffset === 'function') {
      joint.setOffset(value);
    } else if (joint.rotation && typeof joint.rotation.z === 'number') {
      joint.rotation.z = value;
    } else if (joint.rotation && typeof joint.rotation.x === 'number') {
      joint.rotation.x = value;
    }
  });
}

function updateVisibleTopicCount() {
  const count = state.trackNodes.filter((node) => node.root.visible !== false).length + (state.robotRoot ? 1 : 0);
  state.visibleTopicCount = count;
  if (currentTopicCountEl) {
    currentTopicCountEl.textContent = String(count);
  }
}

function applyNodeVisibility(node, visible) {
  node.userVisible = visible;
  node.root.visible = node.userVisible && node.dataVisible !== false;
  if (node.visibilityInput) {
    node.visibilityInput.checked = visible;
  }
}

function resetTopicVisibility() {
  for (const node of state.trackNodes) {
    applyNodeVisibility(node, node.defaultUserVisible !== false);
  }
  updateVisibleTopicCount();
}

function buildTopicList(tracks) {
  topicListEl.innerHTML = '';
  for (const node of tracks) {
    const row = document.createElement('label');
    row.className = 'topic';
    const meta = document.createElement('div');
    meta.className = 'meta';
    const strong = document.createElement('strong');
    strong.textContent =
      TOPIC_LABEL_OVERRIDES[node.id] || node.track.label || node.track.title || node.track.name || node.id;
    meta.append(strong);
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = node.userVisible !== false;
    node.visibilityInput = input;
    input.addEventListener('change', () => {
      applyNodeVisibility(node, input.checked);
      updateVisibleTopicCount();
    });
    row.append(meta, input);
    topicListEl.append(row);
  }
}

function computeRobotPackageRoots(robotSpec, baseUrl) {
  const packages = robotSpec?.packages || robotSpec?.packageRoots || robotSpec?.package_roots || {};
  const result = {};
  for (const [name, value] of Object.entries(packages)) {
    result[name] = resolveUrl(value, baseUrl);
  }
  return result;
}

function adjustRobotMaterialColor(color) {
  if (!color) return;
  const hsl = { h: 0, s: 0, l: 0 };
  const SATURATION_SCALE = 1.12;
  const SATURATION_OFFSET = 0.04;
  const CONTRAST = 1.0;
  const BRIGHTNESS = 0.18;

  color.getHSL(hsl);
  hsl.s = THREE.MathUtils.clamp(hsl.s * SATURATION_SCALE + SATURATION_OFFSET, 0, 1);
  hsl.l = THREE.MathUtils.clamp((hsl.l - 0.5) * CONTRAST + BRIGHTNESS, 0, 1);
  color.setHSL(hsl.h, hsl.s, hsl.l);
}

function styleRobotMeshContent(root) {
  if (!root || typeof root.traverse !== 'function') {
    return root;
  }
  root.traverse((node) => {
    if (!node.isMesh) {
      return;
    }
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.forEach((material) => {
      if (!material) {
        return;
      }
      if ('transparent' in material) {
        material.transparent = false;
      }
      if ('opacity' in material) {
        material.opacity = 1.0;
      }
      if ('roughness' in material) {
        material.roughness = 0.92;
      }
      if ('metalness' in material) {
        material.metalness = 0.01;
      }
      if ('color' in material && material.color) {
        adjustRobotMaterialColor(material.color);
      }
      if ('emissive' in material && material.emissive) {
        material.emissive.set(0x000000);
      }
      if ('depthWrite' in material) {
        material.depthWrite = true;
      }
      material.needsUpdate = true;
    });
  });
  return root;
}

async function loadRobotModel(robotSpec, baseUrl) {
  const rawDescription =
    typeof robotSpec === 'string'
      ? robotSpec
      : robotSpec?.description || robotSpec?.urdf || robotSpec?.xml || robotSpec?.path || robotSpec;
  const text =
    typeof rawDescription === 'string' && rawDescription.trim().startsWith('<')
      ? rawDescription
      : await loadPayload(rawDescription, baseUrl);
  if (typeof text !== 'string') {
    throw new Error('Robot description must resolve to XML text');
  }

  const manager = new THREE.LoadingManager();
  const packageRoots = computeRobotPackageRoots(state.manifest.robot || {}, baseUrl);
  manager.setURLModifier((url) => {
    if (url.startsWith('package://')) {
      const remainder = url.slice('package://'.length);
      const slash = remainder.indexOf('/');
      if (slash > 0) {
        const packageName = remainder.slice(0, slash);
        const packagePath = remainder.slice(slash + 1);
        if (packageRoots[packageName]) {
          return resolveUrl(packagePath, packageRoots[packageName]);
        }
      }
    }
    if (url.startsWith('file://')) {
      return url.replace(/^file:\/\//, '');
    }
    return resolveUrl(url, baseUrl);
  });

  const colladaLoader = new ColladaLoader(manager);
  const gltfLoader = new GLTFLoader(manager);
  const stlLoader = new STLLoader(manager);
  const urdfLoader = new URDFLoader(manager);
  let pendingResolve = null;
  let pendingReject = null;
  const assetsReady = new Promise((resolve, reject) => {
    pendingResolve = resolve;
    pendingReject = reject;
  });
  let sawAssetRequest = false;
  let robot = null;

  manager.onStart = () => {
    sawAssetRequest = true;
  };
  manager.onError = (url) => {
    if (pendingReject) {
      pendingReject(new Error(`Failed to load robot asset: ${url}`));
      pendingReject = null;
      pendingResolve = null;
    }
  };
  manager.onLoad = () => {
    if (pendingResolve) {
      pendingResolve(robot);
      pendingResolve = null;
      pendingReject = null;
    }
  };
  urdfLoader.packages = packageRoots;
  urdfLoader.workingPath = baseUrl;
  urdfLoader.parseVisual = true;
  urdfLoader.parseCollision = false;
  urdfLoader.loadMeshCb = (path, meshManager, done) => {
    const lower = path.toLowerCase();
    if (lower.endsWith('.dae')) {
      fetchText(path)
        .then((daeText) => {
          const result = colladaLoader.parse(daeText, path);
          done(styleRobotMeshContent(result.scene || result));
        })
        .catch((error) => {
          console.warn('Failed to load DAE mesh', path, error);
          done(new THREE.Group());
        });
      return;
    }

    if (lower.endsWith('.glb') || lower.endsWith('.gltf')) {
      gltfLoader.load(
        path,
        (gltf) => done(styleRobotMeshContent(gltf.scene || gltf.scenes?.[0] || new THREE.Group())),
        undefined,
        (error) => {
          console.warn('Failed to load GLTF mesh', path, error);
          done(new THREE.Group());
        },
      );
      return;
    }

    if (lower.endsWith('.stl')) {
      fetchBinary(path)
        .then((buffer) => {
          const geometry = stlLoader.parse(buffer);
          geometry.computeVertexNormals();
          const mesh = new THREE.Mesh(
            geometry,
            new THREE.MeshStandardMaterial({
              color: 0x8fa4b8,
              metalness: 0.05,
              roughness: 0.9,
            }),
          );
          done(mesh);
        })
        .catch((error) => {
          console.warn('Failed to load STL mesh', path, error);
          done(new THREE.Group());
        });
      return;
    }

    if (typeof URDFLoader.defaultMeshLoader === 'function') {
      URDFLoader.defaultMeshLoader(path, meshManager, done);
      return;
    }
    done(new THREE.Group());
  };

  robot = urdfLoader.parse(text);
  styleRobotMeshContent(robot);
  if (!sawAssetRequest && pendingResolve) {
    pendingResolve(robot);
    pendingResolve = null;
    pendingReject = null;
  }
  await assetsReady;
  return robot;
}

function fitCameraToBox(box) {
  if (!box || box.isEmpty()) {
    applyPresetCameraPose();
    return;
  }

  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 1e-3);
  const baseDistance = maxDim / (2 * Math.tan((camera.fov * Math.PI) / 360));
  const distance = Math.max(baseDistance * 1.05, maxDim * 1.85, 1.6);
  controls.target.copy(center);
  controls.target.z += Math.max(0.12, size.z * 0.2);
  camera.position.set(
    controls.target.x + distance * 0.92,
    controls.target.y - distance * 1.08,
    controls.target.z + distance * 0.34,
  );
  camera.near = Math.max(0.01, distance / 100);
  camera.far = Math.max(1000, distance * 20);
  camera.updateProjectionMatrix();
  controls.update();
  state.followTargetOffset.set(0, 0, 0);
  state.cameraTarget.copy(controls.target);
  state.cameraPosition.copy(camera.position);
  state.defaultCameraOffset.copy(camera.position).sub(controls.target);
  state.lastFollowTarget = controls.target.clone();
}

function resetCamera() {
  setPlaying(false);
  resetTopicVisibility();
  updateSceneForTime(0);
  if (state.robotRoot) {
    applyPresetCameraPose(state.robotRoot.position.clone());
  } else {
    applyPresetCameraPose();
  }
  if (topicsCardEl && isMobileLayout()) {
    topicsCardEl.classList.remove('mobile-open');
    if (topicsToggleBtn) {
      topicsToggleBtn.setAttribute('aria-expanded', 'false');
    }
  }
  if (topicListEl) {
    topicListEl.scrollTop = 0;
  }
  updateTopicsScrollFades();
}

function setInitialRobotCamera(trackSpec, payload) {
  const data = getArrayFromPayload(payload);
  const shape = getShapeFromPayload(payload, []);
  const strideFloats = Number(trackSpec?.strideFloats || 0);
  const poseOffsetFloats = Number(trackSpec?.poseOffsetFloats || 0);
  if (!data || shape.length !== 2 || strideFloats < poseOffsetFloats + 3) {
    return false;
  }

  const base = poseOffsetFloats;
  const robotPosition = new THREE.Vector3(data[base + 0], data[base + 1], data[base + 2]);
  applyPresetCameraPose(robotPosition);
  return true;
}

function updateCameraFollowTarget() {
  if (!state.robotRoot) {
    return;
  }
  const nextTarget = state.robotRoot.position.clone().add(state.followTargetOffset);
  if (!state.lastFollowTarget) {
    controls.target.copy(nextTarget);
    state.lastFollowTarget = nextTarget.clone();
    return;
  }
  const delta = nextTarget.clone().sub(state.lastFollowTarget);
  if (delta.lengthSq() > 0) {
    controls.target.add(delta);
    camera.position.add(delta);
    state.lastFollowTarget.copy(nextTarget);
  } else {
    state.lastFollowTarget.copy(nextTarget);
  }
  state.cameraTarget.copy(controls.target);
  state.cameraPosition.copy(camera.position);
}

function updateTimelineUI(timeSeconds) {
  const duration = Math.max(0, state.duration);
  scrubber.value = duration > 0 ? String(THREE.MathUtils.clamp(timeSeconds / duration, 0, 1)) : '0';
  timeDisplayEl.innerHTML = `<small>Time (sec)</small>${formatDisplayTime(timeSeconds)}/${formatDisplayTime(duration)}`;
}

function setExperienceOverlayState(mode) {
  if (!experienceOverlayEl) {
    return;
  }
  if (mode === 'hidden') {
    experienceOverlayEl.classList.add('hidden');
    return;
  }
  experienceOverlayEl.classList.remove('hidden');
  experienceOverlayEl.dataset.state = mode;
}

function showDragHintOverlay() {
  if (!dragHintOverlayEl) {
    return;
  }
  if (state.dragHintTimer) {
    window.clearTimeout(state.dragHintTimer);
    state.dragHintTimer = null;
  }
  dragHintOverlayEl.classList.remove('active');
  void dragHintOverlayEl.offsetWidth;
  dragHintOverlayEl.classList.add('active');
  state.dragHintTimer = window.setTimeout(() => {
    dragHintOverlayEl.classList.remove('active');
    state.dragHintTimer = null;
  }, 2900);
}

function setPlaying(playing) {
  const wasPlaying = state.playing;
  state.playing = playing;
  if (playBtn) {
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  stepBtn.textContent = playing ? 'Pause' : 'Play';
  if (playing) {
    setExperienceOverlayState('hidden');
    if (!wasPlaying && !state.hasShownInitialDragHint) {
      showDragHintOverlay();
      state.hasShownInitialDragHint = true;
    }
  }
  updateOverlayFrame(state.currentTime);
}

function setPlaybackRate(rate) {
  const numericRate = Number(rate);
  if (!Number.isFinite(numericRate) || numericRate <= 0) {
    return;
  }
  state.playbackRate = numericRate;
  if (playbackSpeedEl && Number(playbackSpeedEl.value) !== numericRate) {
    playbackSpeedEl.value = String(numericRate);
  }
}

function updateSceneForTime(timeSeconds) {
  const duration = Math.max(0, state.duration);
  const clampedTime = duration > 0 ? THREE.MathUtils.clamp(timeSeconds, 0, duration) : Math.max(0, timeSeconds);
  state.currentTime = clampedTime;
  const frameIndex = clampFrameIndex(
    clampedTime,
    state.timeSamples,
    duration,
    state.timeSamples?.length || 0,
    Array.isArray(state.timeSamples) && state.timeSamples.length ? Number(state.timeSamples[0]) : state.timelineOrigin,
  );

  if (state.robotRoot && state.robotPoseTrack) {
    state.robotPoseTrack.update(frameIndex, clampedTime);
  }
  if (state.robotRoot && state.robotJointTrack) {
    applyJointValues(state.robotRoot, state.robotJointTrack, frameIndex, clampedTime);
  }

  if (state.robotRoot) {
    updateCameraFollowTarget();
  }

  for (const node of state.trackNodes) {
    node.update(frameIndex, clampedTime);
  }

  updateOverlayFrame(clampedTime);
  updateTimelineUI(clampedTime);
  updateVisibleTopicCount();
  updateCameraDebug();
}

function updateSceneBounds(initialFocusOnly = false) {
  const box = new THREE.Box3();
  let hasBox = false;

  if (state.robotRoot) {
    box.expandByObject(state.robotRoot);
    hasBox = true;
  }

  for (const node of state.trackNodes) {
    if (initialFocusOnly) {
      const kind = String(node.track?.kind || node.track?.type || '').toLowerCase();
      if (kind !== 'terrainmesh' && kind !== 'terrain' && kind !== 'elevation' && kind !== 'grid') {
        continue;
      }
    }
    if (node.root && node.root.visible !== false) {
      box.expandByObject(node.root);
      hasBox = true;
    }
  }

  if (hasBox) {
    state.sceneBox.copy(box);
  }
}

async function loadManifestAndAssets() {
  if (manifestPathEl) {
    manifestPathEl.textContent = DEFAULT_MANIFEST_URL;
  }
  setStatus(`Loading ${DEFAULT_MANIFEST_URL}...`);
  const manifestResponse = await fetch(state.manifestUrl);
  if (!manifestResponse.ok) {
    throw new Error(`Failed to load manifest: ${manifestResponse.status} ${manifestResponse.statusText}`);
  }
  const manifest = normalizeManifest(await manifestResponse.json());
  state.manifest = manifest;
  state.videoOverlay = manifest.videoOverlay || null;
  document.title = `${manifest.title} - Planning Demo Viewer`;
  if (sceneSummaryEl) {
    sceneSummaryEl.textContent = manifest.subtitle || `${manifest.topics.length} topics`;
  }

  const baseUrl = state.manifestBaseUrl;
  const assetPromises = new Map();
  const queueAsset = (key, spec) => {
    if (spec != null) {
      assetPromises.set(key, loadPayload(spec, baseUrl));
    }
  };

  queueAsset('robotDescription', normalizeReferenceSpec(manifest.robotDescription));
  queueAsset('timelineTimes', manifest.timeline?.times);
  queueAsset('robotPose', manifest.robotPose);
  queueAsset('robotJoints', manifest.robotJoints);

  manifest.topics.forEach((topic, index) => {
    queueAsset(`topic:${index}`, topic?.payload || topic?.path || topic?.file || topic?.url || topic?.data || topic?.inline);
    queueAsset(`topic-time:${index}`, topic?.times || topic?.time || topic?.timestamps || null);
  });

  const resolvedAssets = new Map();
  await Promise.all(
    Array.from(assetPromises.entries()).map(async ([key, promise]) => {
      resolvedAssets.set(key, await promise);
    }),
  );

  state.timeSamples = resolveTimeArray(resolvedAssets.get('timelineTimes')) || null;
  state.timelineOrigin = state.timeSamples?.length ? Number(state.timeSamples[0]) : 0;
  state.duration =
    manifest.durationSeconds ||
    (state.timeSamples?.length
      ? Math.max(0, Number(state.timeSamples[state.timeSamples.length - 1]) - state.timelineOrigin)
      : 0);

  const robotSpec = manifest.robot || {};
  if (manifest.robotDescription) {
    robotSpec.description = resolvedAssets.get('robotDescription');
  }
  if (manifest.robotPose) {
    robotSpec.pose = resolvedAssets.get('robotPose');
  }
  if (manifest.robotJoints) {
    robotSpec.joints = resolvedAssets.get('robotJoints');
  }
  state.robotSpec = robotSpec;
  state.robotPoseTrack = manifest.robotPose
    ? createRobotTrack(null, { id: 'robot-pose', ...manifest.robotPose }, resolvedAssets.get('robotPose'), state.timeSamples)
    : null;
  state.robotJointTrack = manifest.robotJoints
    ? {
        track: { ...manifest.robotJoints, id: 'robot-joints' },
        payload: resolvedAssets.get('robotJoints'),
        timeSamples: state.timeSamples,
      }
    : null;

  state.tracks = [];
  state.trackNodes = [];
  state.trackById.clear();
  contentRoot.clear();

  if (manifest.robotDescription) {
    setStatus('Loading GO2 robot model...');
    const robot = await loadRobotModel(robotSpec, baseUrl);
    state.robotRoot = robot;
    contentRoot.add(robot);
    if (state.robotPoseTrack) {
      state.robotPoseTrack.robot = robot;
    }
    updateSceneBounds();
  }

  if (state.videoOverlay && syncVideoFrameEl && videoOverlayEl && state.videoOverlay.mode === 'sprite') {
    state.videoSpriteImage = null;
    state.videoSpriteReady = false;
    state.currentVideoFrameIndex = -1;
    await loadOverlaySpriteImage(state.videoOverlay);
    updateOverlayFrame(state.currentTime);
  } else if (videoOverlayEl) {
    videoOverlayEl.classList.add('hidden');
  }

  for (let index = 0; index < manifest.topics.length; index += 1) {
    const topic = manifest.topics[index] || {};
    const payload = resolvedAssets.get(`topic:${index}`);
    const kind = String(topic.kind || topic.type || topic.display || '').toLowerCase();
    const id = topic.id || topic.name || topic.topic || `topic-${index}`;
    const trackTimes = resolveTimeArray(resolvedAssets.get(`topic-time:${index}`)) || state.timeSamples;
    const common = {
      id,
      track: topic,
      payload,
      timeSamples: trackTimes || state.timeSamples,
    };
    let node = null;
    if (kind === 'heightfield' || kind === 'terrain' || kind === 'terrainmesh' || kind === 'elevation' || kind === 'grid') {
      node = createHeightfieldTrack(common.track, payload, common.timeSamples);
    } else if (kind === 'robot' || kind === 'pose') {
      node = createRobotTrack(state.robotRoot, common.track, payload, common.timeSamples);
    } else {
      node = createLineTrack(common.track, payload, common.timeSamples);
    }

    node.id = id;
    node.update = node.update.bind(node);
    if (topic.visible === false || topic.enabled === false) {
      node.userVisible = false;
      node.root.visible = false;
    }
    node.defaultUserVisible = node.userVisible !== false;
    state.trackNodes.push(node);
    state.trackById.set(id, node);
  }

  if (state.robotRoot && state.robotPoseTrack) {
    state.robotPoseTrack.robot = state.robotRoot;
  }

  buildTopicList(state.trackNodes);
  updateSceneForTime(0);
  if (!setInitialRobotCamera(manifest.robotPose, resolvedAssets.get('robotPose'))) {
    updateSceneBounds(true);
    fitCameraToBox(state.sceneBox);
  }
  setPlaying(false);
  setStatus('Mouse: left drag rotates, right drag pans, wheel zooms. Space toggles play.');
  state.initialized = true;
  setExperienceOverlayState('ready');
}

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, (now - state.lastTick) / 1000);
  state.lastTick = now;
  if (state.playing && state.duration > 0) {
    const nextTime = state.currentTime + dt * state.playbackRate;
    if (nextTime >= state.duration) {
      updateSceneForTime(nextTime % state.duration);
    } else {
      updateSceneForTime(nextTime);
    }
  }
  controls.update();
  updateCameraDebug();
  renderer.render(scene, camera);
}

function resize() {
  const width = canvas.clientWidth || window.innerWidth;
  const height = canvas.clientHeight || window.innerHeight;
  syncTopicsCardLayoutMode();
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(height, 1);
  camera.updateProjectionMatrix();
  for (const node of state.trackNodes) {
    if (node.material && 'resolution' in node.material && node.material.resolution) {
      node.material.resolution.set(width, height);
    }
  }
  updateCameraDebug();
}

if (playBtn) {
  playBtn.addEventListener('click', () => {
    setPlaying(!state.playing);
  });
}

stepBtn.addEventListener('click', () => {
  setPlaying(!state.playing);
});

if (overlayPlayBtn) {
  overlayPlayBtn.addEventListener('click', () => {
    setPlaying(true);
  });
}

resetBtn.addEventListener('click', () => {
  resetCamera();
});

scrubber.addEventListener('input', () => {
  const normalized = Number(scrubber.value);
  const timeSeconds = state.duration > 0 ? normalized * state.duration : 0;
  updateSceneForTime(timeSeconds);
});

if (playbackSpeedEl) {
  setPlaybackRate(playbackSpeedEl.value);
  playbackSpeedEl.addEventListener('change', () => {
    setPlaybackRate(playbackSpeedEl.value);
  });
}

window.addEventListener('resize', resize);
window.addEventListener('keydown', (event) => {
  if (event.code === 'Space') {
    event.preventDefault();
    setPlaying(!state.playing);
  } else if (event.code === 'Home') {
    event.preventDefault();
    resetCamera();
  }
});

async function main() {
  resize();
  requestAnimationFrame(animate);
  try {
    await loadManifestAndAssets();
  } catch (error) {
    console.error(error);
    setStatus(error?.message || String(error), 'error');
    setExperienceOverlayState('hidden');
    if (sceneSummaryEl) {
      sceneSummaryEl.textContent = 'Failed to load viewer data';
    }
    if (playBtn) {
      playBtn.disabled = true;
    }
    stepBtn.disabled = true;
    resetBtn.disabled = true;
    scrubber.disabled = true;
    if (playbackSpeedEl) {
      playbackSpeedEl.disabled = true;
    }
  }
}

main();
