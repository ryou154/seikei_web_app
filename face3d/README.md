# After face surface prototype

The simulation analyzes its generated After image in the browser and passes its
468 landmarks and original image dimensions to `face-3d-model.js`. After shape
and estimated depth drive the surface, with a small contribution from Before
depth. The After image supplies the texture. Drag or use arrow keys to rotate.
Missing landmarks, module loading failures and unavailable WebGL leave a static
After preview. Replacing a result or locking the app disposes GPU resources.

This is an estimated facial surface, not a complete head reconstruction or a
prediction of a surgical outcome. No additional image-generation API call is
made to rotate the model. `/face-3d-lab.html` provides a standalone sample and
browser-only photo analysis preview, including optional GLB export.

Camera capture continuously samples while the user moves from front to left,
right, up, down and back to front. `continuous-face-scan.js` selects distinct
pose cells instead of requiring a stop at each pose. It requires coverage on
both sides and above/below, with at least 18 selected frames, a cap of 48 and a
two-minute timeout. Centering, face size and roll checks reject unsuitable
frames. Camera mirroring is handled by relative pose signs. Frame sampling is
serial; actual rate depends on browser inference speed.

Captured photographs stay in browser memory during capture. After completion,
only the front photograph and each selected frame's dimensions and landmarks
are retained; side photographs are discarded. A preview of the fused personal
surface appears before the preference step. Replacing the image or locking the
app clears it. No new upload or cloud reconstruction service is used. This
remains landmark-based estimation, not calibrated photogrammetry or a complete
ear/neck reconstruction. The texture still comes from the front/After image.

The model removes pose using a similarity fit, rejects large residuals, and
combines aligned depths with a median to reduce outliers. After depth changes
are applied to this fused base instead of replacing it. The viewer reports how
many additional views were accepted by the fit; a captured view can be excluded.

`withBust(surface)` adds procedural ears and an open-front neck/upper bust,
scaled and positioned using the facial landmarks. No back of the head is added.
These additions are inferred templates, not measurements of the user's ears or
neck. Small cheek texture patches supply their skin color; their appearance is
not reconstructed from side photographs. The viewer and lab include these parts
in framing, rotation and GLB exports. Export metadata marks the inferred parts.

Reference mesh: Google MediaPipe canonical face model, Apache-2.0.
Source: https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/modules/face_geometry/data/canonical_face_model.obj
The original mesh and license are preserved in `reference/`.
Generated data: `face-3d-canonical.js` (468 vertices, 898 triangles).
SHA-256: `8bac80443397e113f41a8b565ea72c59390bc031d9defab289dba7bc0c54e618`.
