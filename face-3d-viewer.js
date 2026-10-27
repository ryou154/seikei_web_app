import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js";

const viewers = new WeakMap();

function mount(container, imageData, analysis) {
  if (!container || !imageData || !analysis?.landmarks?.length) return false;
  const old = viewers.get(container);
  old?.dispose();
  container.replaceChildren();

  const root = document.createElement("div");
  root.className = "three-face-viewer";
  root.tabIndex = 0;
  root.setAttribute("aria-label", "3D顔メッシュ。左右にドラッグして回転できます。");
  const canvas = document.createElement("canvas");
  root.append(canvas);
  const help = document.createElement("p");
  help.className = "face-3d-help";
  help.textContent = "左右にドラッグ／スワイプして顔の凹凸を確認";
  root.append(help);
  container.append(root);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 10);
  camera.position.z = 2.5;
  const group = new THREE.Group();
  scene.add(group);
  group.add(new THREE.HemisphereLight(0xffffff, 0x8b526d, 2));
  const light = new THREE.DirectionalLight(0xffffff, 2.2);
  light.position.set(0.4, 0.8, 2);
  group.add(light);

  const geometry = new THREE.SphereGeometry(1, 64, 40);
  geometry.scale(0.78, 1.08, 0.58);
  geometry.translate(0, 0.02, 0);
  const texture = new THREE.TextureLoader().load(imageData);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: texture, side: THREE.DoubleSide, roughness: 0.72, metalness: 0 }));
  group.add(mesh);

  let dragging = false;
  let lastX = 0;
  root.addEventListener("pointerdown", (event) => { dragging = true; lastX = event.clientX; root.setPointerCapture(event.pointerId); });
  root.addEventListener("pointermove", (event) => { if (!dragging) return; group.rotation.y = Math.max(-Math.PI, Math.min(Math.PI, group.rotation.y + (event.clientX - lastX) * 0.01)); lastX = event.clientX; });
  root.addEventListener("pointerup", () => { dragging = false; });
  root.addEventListener("pointercancel", () => { dragging = false; });

  const resize = () => { const width = root.clientWidth; const height = root.clientHeight; renderer.setSize(width, height, false); camera.aspect = width / Math.max(height, 1); camera.updateProjectionMatrix(); };
  const observer = new ResizeObserver(resize);
  observer.observe(root);
  resize();
  let active = true;
  const animate = () => { if (!active) return; renderer.render(scene, camera); requestAnimationFrame(animate); };
  animate();
  viewers.set(container, { dispose() { active = false; observer.disconnect(); texture.dispose(); geometry.dispose(); mesh.material.dispose(); renderer.dispose(); } });
  return true;
}

window.Face3DViewer = { mount };
