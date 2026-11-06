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

function createFaceGeometry(analysis) {
  const points = analysis.landmarks.map(({ x, y, z = 0 }) => ({ x, y, z }));
  const minX = Math.min(...points.map((p) => p.x)); const maxX = Math.max(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y)); const maxY = Math.max(...points.map((p) => p.y));
  const width = Math.max(maxX - minX, 0.001); const height = Math.max(maxY - minY, 0.001);
  const centerX = (minX + maxX) / 2; const centerY = (minY + maxY) / 2;
  const positions = []; const uvs = [];
  for (const point of points) {
    const nx = (point.x - centerX) / width; const ny = (point.y - centerY) / height;
    const landmarkDepth = clamp(-point.z / width, -0.18, 0.18);
    const headCurve = 0.08 * (1 - clamp(nx * nx * 3 + ny * ny * 2, 0, 1));
    positions.push(nx * 1.55, -ny * 2, clamp(landmarkDepth * 0.7 + headCurve, -0.18, 0.2));
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
  const canvas = document.createElement("canvas"); root.append(canvas);
  const help = document.createElement("p"); help.className = "face-3d-help"; help.textContent = "左右にドラッグ／スワイプして顔の凹凸を確認"; root.append(help); container.append(root);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 10); camera.position.z = 3.2;
  const group = new THREE.Group(); scene.add(group); scene.add(new THREE.HemisphereLight(0xffffff, 0x7d516b, 1.8));
  const light = new THREE.DirectionalLight(0xffffff, 2.4); light.position.set(0.4, 0.8, 2.5); scene.add(light);
  const geometry = createFaceGeometry(analysis); const texture = new THREE.TextureLoader().load(imageData); texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.82, metalness: 0, side: THREE.DoubleSide }); group.add(new THREE.Mesh(geometry, material));
  let dragging = false; let lastX = 0;
  root.addEventListener("pointerdown", (e) => { dragging = true; lastX = e.clientX; root.setPointerCapture(e.pointerId); });
  root.addEventListener("pointermove", (e) => { if (dragging) { group.rotation.y = clamp(group.rotation.y + (e.clientX - lastX) * 0.01, -Math.PI, Math.PI); lastX = e.clientX; } });
  root.addEventListener("pointerup", () => { dragging = false; }); root.addEventListener("pointercancel", () => { dragging = false; });
  const resize = () => { const w = Math.max(root.clientWidth, 1); const h = Math.max(root.clientHeight, 1); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
  const observer = new ResizeObserver(resize); observer.observe(root); resize(); let active = true;
  const animate = () => { if (active) { renderer.render(scene, camera); requestAnimationFrame(animate); } }; animate();
  viewers.set(container, { dispose() { active = false; observer.disconnect(); texture.dispose(); geometry.dispose(); material.dispose(); renderer.dispose(); } }); return true;
}

window.Face3DViewer = { mount };
