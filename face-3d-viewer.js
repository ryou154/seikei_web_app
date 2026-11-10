import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js";

const viewers = new WeakMap();
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

function buildTriangles(landmarks, connections) {
  const neighbors = Array.from({ length: landmarks.length }, () => new Set());
  for (const connection of connections || []) {
    const a = Array.isArray(connection) ? connection[0] : connection?.start;
    const b = Array.isArray(connection) ? connection[1] : connection?.end;
    if (!Number.isInteger(a) || !Number.isInteger(b) || a === b || !neighbors[a] || !neighbors[b]) continue;
    neighbors[a].add(b); neighbors[b].add(a);
  }
  const triangles = new Set();
  for (let a = 0; a < neighbors.length; a += 1) {
    const list = [...neighbors[a]].sort((x, y) => x - y);
    for (let i = 0; i < list.length; i += 1) for (let j = i + 1; j < list.length; j += 1) {
      const b = list[i]; const c = list[j];
      if (neighbors[b].has(c)) triangles.add([a, b, c].sort((x, y) => x - y).join(","));
    }
  }
  return [...triangles].map((key) => key.split(",").map(Number));
}

function landmarkCenter(points, indices, fallback) {
  const selected = indices.map((index) => points[index]).filter(Boolean);
  if (!selected.length) return fallback;
  return selected.reduce((center, point) => ({
    x: center.x + point.x / selected.length,
    y: center.y + point.y / selected.length
  }), { x: 0, y: 0 });
}

function gaussian(point, center, width, height) {
  const dx = (point.x - center.x) / width;
  const dy = (point.y - center.y) / height;
  return Math.exp(-(dx * dx + dy * dy));
}

function facialDepth(point, normalized, points, width, height) {
  const nose = landmarkCenter(points, [1, 2, 4, 5, 6], { x: 0.5, y: 0.53 });
  const leftEye = landmarkCenter(points, [33, 133, 159, 145], { x: 0.39, y: 0.41 });
  const rightEye = landmarkCenter(points, [263, 362, 386, 374], { x: 0.61, y: 0.41 });
  const mouth = landmarkCenter(points, [61, 291, 13, 14], { x: 0.5, y: 0.68 });
  const forehead = gaussian(point, { x: 0.5, y: 0.29 }, width * 0.27, height * 0.18) * 0.055;
  const cheeks = (gaussian(point, { x: 0.39, y: 0.54 }, width * 0.17, height * 0.2) +
    gaussian(point, { x: 0.61, y: 0.54 }, width * 0.17, height * 0.2)) * 0.045;
  const chin = gaussian(point, { x: 0.5, y: 0.82 }, width * 0.16, height * 0.12) * 0.065;
  const noseBridge = gaussian(point, { x: nose.x, y: nose.y - height * 0.09 }, width * 0.055, height * 0.19) * 0.22;
  const noseTip = gaussian(point, nose, width * 0.075, height * 0.09) * 0.32;
  const noseWings = gaussian(point, { x: nose.x, y: nose.y + height * 0.025 }, width * 0.14, height * 0.06) * 0.08;
  const eyeSocket = (gaussian(point, leftEye, width * 0.105, height * 0.055) +
    gaussian(point, rightEye, width * 0.105, height * 0.055)) * -0.075;
  const mouthVolume = gaussian(point, mouth, width * 0.12, height * 0.06) * 0.11;
  const landmarkDepth = clamp(-Number(point.z || 0) / width, -0.16, 0.16);
  // Keep the cheeks and forehead close to a facial plane; only named facial
  // regions receive strong displacement, avoiding an oval/sphere silhouette.
  return clamp(forehead + cheeks + chin + noseBridge + noseTip + noseWings + eyeSocket + mouthVolume + landmarkDepth * 0.7, -0.2, 0.62);
}

function createFaceGeometry(analysis) {
  const scanViews = Object.values(analysis.scan?.views || {})
    .filter((view) => Array.isArray(view.landmarks) && view.landmarks.length === analysis.landmarks.length);
  const referenceFaceWidth = Number(analysis.scan?.views?.front?.capture?.faceWidthInFrame) || 0;
  const points = analysis.landmarks.map(({ x, y, z = 0 }, index) => {
    if (!scanViews.length) return { x, y, z };
    const depths = scanViews.map((view) => {
      const value = Number(view.landmarks[index]?.z);
      const frameWidth = Number(view.capture?.faceWidthInFrame) || referenceFaceWidth;
      // Normalize MediaPipe's relative depth by the captured face scale so
      // different camera distances do not distort the reconstructed surface.
      return Number.isFinite(value) && frameWidth > 0 && referenceFaceWidth > 0
        ? value * referenceFaceWidth / frameWidth
        : value;
    }).filter(Number.isFinite);
    const averageDepth = depths.length
      ? depths.reduce((sum, value) => sum + value, 0) / depths.length
      : z;
    return { x, y, z: z * 0.35 + averageDepth * 0.65 };
  });
  const minX = Math.min(...points.map((p) => p.x)); const maxX = Math.max(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y)); const maxY = Math.max(...points.map((p) => p.y));
  const width = Math.max(maxX - minX, 0.001); const height = Math.max(maxY - minY, 0.001);
  const centerX = (minX + maxX) / 2; const centerY = (minY + maxY) / 2;
  const positions = []; const uvs = [];
  for (const point of points) {
    const nx = (point.x - centerX) / width; const ny = (point.y - centerY) / height;
    const depth = facialDepth(point, { x: nx, y: ny }, points, width, height);
    positions.push(nx * 1.55, -ny * 2, depth);
    uvs.push(point.x, 1 - point.y);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(buildTriangles(points, analysis.meshConnections).flat());
  geometry.computeVertexNormals();
  return geometry;
}

function mount(container, imageData, analysis) {
  if (!container || !imageData || !analysis?.landmarks?.length) return false;
  viewers.get(container)?.dispose(); container.replaceChildren();
  const root = document.createElement("div"); root.className = "three-face-viewer"; root.tabIndex = 0;
  root.setAttribute("aria-label", "シミュレーション後の顔3Dモデル。左右にドラッグして回転できます。");
  const fallbackImage = document.createElement("img");
  fallbackImage.className = "three-face-fallback three-face-fallback-layer";
  fallbackImage.src = imageData;
  fallbackImage.alt = "シミュレーション後の予測イメージ";
  root.append(fallbackImage);
  const canvas = document.createElement("canvas"); root.append(canvas);
  const help = document.createElement("p"); help.className = "face-3d-help"; help.textContent = "左右にドラッグ／スワイプして顔の凹凸を確認"; root.append(help); container.append(root);
  const showFallback = () => {
    root.replaceChildren();
    const image = document.createElement("img");
    image.className = "three-face-fallback";
    image.src = imageData;
    image.alt = "シミュレーション後の予測イメージ";
    root.append(image);
  };
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
  } catch (error) {
    console.warn("3D表示を初期化できないため画像表示へ切り替えます", error);
    showFallback();
    return false;
  }
  const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 10); camera.position.z = 3.2;
  const group = new THREE.Group(); scene.add(group); scene.add(new THREE.HemisphereLight(0xffffff, 0x7d516b, 1.8));
  const light = new THREE.DirectionalLight(0xffffff, 2.4); light.position.set(0.4, 0.8, 2.5); scene.add(light);
  const geometry = createFaceGeometry(analysis);
  let textureReady = false;
  const texture = new THREE.TextureLoader().load(
    imageData,
    () => { textureReady = true; fallbackImage.hidden = false; },
    undefined,
    () => { fallbackImage.hidden = false; }
  );
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.82, metalness: 0, side: THREE.DoubleSide }); group.add(new THREE.Mesh(geometry, material));
  let dragging = false; let lastX = 0;
  root.addEventListener("pointerdown", (e) => { dragging = true; lastX = e.clientX; root.setPointerCapture(e.pointerId); });
  root.addEventListener("pointermove", (e) => { if (dragging) { group.rotation.y = clamp(group.rotation.y + (e.clientX - lastX) * 0.01, -Math.PI, Math.PI); lastX = e.clientX; } });
  root.addEventListener("pointerup", () => { dragging = false; }); root.addEventListener("pointercancel", () => { dragging = false; });
  const resize = () => { const w = Math.max(root.clientWidth, 1); const h = Math.max(root.clientHeight, 1); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
  const observer = new ResizeObserver(resize); observer.observe(root); resize(); let active = true;
  const animate = () => {
    if (!active) return;
    try {
      renderer.render(scene, camera);
      if (textureReady && geometry.index?.count >= 3) fallbackImage.hidden = true;
      requestAnimationFrame(animate);
    } catch (error) {
      console.warn("3D描画に失敗したため画像表示へ切り替えます", error);
      active = false;
      showFallback();
    }
  };
  animate();
  viewers.set(container, { dispose() { active = false; observer.disconnect(); texture.dispose(); geometry.dispose(); material.dispose(); renderer.dispose(); } }); return true;
}

window.Face3DViewer = { mount };
