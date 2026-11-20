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

Reference mesh: Google MediaPipe canonical face model, Apache-2.0.
Source: https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/modules/face_geometry/data/canonical_face_model.obj
The original mesh and license are preserved in `reference/`.
Generated data: `face-3d-canonical.js` (468 vertices, 898 triangles).
SHA-256: `8bac80443397e113f41a8b565ea72c59390bc031d9defab289dba7bc0c54e618`.
