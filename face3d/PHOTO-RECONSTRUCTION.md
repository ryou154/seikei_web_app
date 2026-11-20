# Photo-based ear and neck reconstruction

Open `/face-reconstruction.html` after signing in. This is a separate pipeline
from the 468-landmark surface preview and its inferred template ears/neck. The
photo reconstruction pipeline never appends template geometry to a failed scan.
It reconstructs the photographed state, not a predicted surgical outcome. The
reconstructed mesh is not yet registered/deformed against the simulation After.

## Capture

The subject must keep their entire head and neck still; another person moves the
camera around the front and both sides. Include the ears and neck in every
overlapping view. Do not zoom, change camera settings, change expression, or
rotate only the head relative to the neck. The previous webcam head-turn capture
cannot reliably reconstruct a rigid head-and-neck surface and is not reused.

Capture 24–80 JPEG images (30–60 recommended to try), each at least 480px on both
axes and of the same dimensions. Browser capture uses the rear camera when
available, samples serially at roughly one image/second or slower depending on
segmentation speed, and downsizes to at most 1600px. Uploading an existing image
sequence from one camera is also supported. No audio is used.

Google MediaPipe Selfie Multiclass runs locally in the browser. Hair, face skin
and body skin are kept; background/clothing are masked out. The model and WASM
download from Google's/CDN endpoints, but photographs are not sent there. Bad
segmentation, shiny/featureless skin, hair covering ears, movement and poor image
overlap can still prevent successful reconstruction. Actual ear/neck accuracy
must be checked with the user's new stationary-subject photo sequence.

## Engine installation

Windows x64, CPU-only:

```powershell
node scripts/setup-face-reconstruction.js
node scripts/check-face-reconstruction.js
```

The installer downloads official COLMAP 4.2.1 and OpenMVS 2.4.0 release archives,
checks the release SHA-256 digest when provided, and extracts them below the
ignored `.tools/reconstruction/` directory. No system-wide PATH change is made.
Linux hosts can install the same versions and set these environment variables:

```text
COLMAP_EXECUTABLE=/absolute/path/to/colmap
OPENMVS_BIN=/absolute/path/to/openmvs/bin
```

The application invokes executables directly, without a shell, on one job at a
time. Feature extraction/matching use CPU mode and four threads. OpenMVS uses the
CPU-only Windows build and four threads. A GPU is not required by this pipeline.
The worker needs writable private storage, enough RAM, and CPU allocation after
an HTTP response. A request-only/throttled Cloud Run deployment is not sufficient
for a long-lived background worker; no production deployment was performed.

## Data and outputs

Authenticated routes under `/api/face-reconstruction` offer capabilities, job
creation/status, owner-only GLB downloads, and cancellation/deletion. Inputs are
limited to 24–80 distinct JPEGs with matching PNG masks, 64MB decoded in total.
Only the owning authenticated UID can access a job; files are never static assets.

The backend runs COLMAP feature extraction, matching, mapping and undistortion;
OpenMVS imports the camera geometry, densifies it, reconstructs the mesh and
textures it. The textured OBJ is packed into a self-contained GLB. The first
registered camera orients the model for initial display. No inferred ear/neck
parts are added. Background masking reduces irrelevant scene geometry, but does
not guarantee a clean portrait model or a complete reconstruction of unseen skin.

Work files (including photographs and private engine logs) are deleted when a job
ends. Finished GLBs expire after two hours or can be deleted immediately. Startup
and periodic cleanup remove expired folders, including orphaned work after a
restart. Job status is in memory, so active jobs are not resumable across server
restarts. The private root `.face-reconstruction/` is ignored by Git.

To exercise the native engine with public, non-personal photographs:

```powershell
node scripts/check-face-reconstruction.js --sample
```

This uses the official OpenMVS Sceaux Castle dataset (11 photos), bypassing the
portrait UI's 24-photo requirement solely for engine verification. It is not a
human face test and does not demonstrate ear/neck accuracy. Downloads and outputs
stay under `.tools/reconstruction/verification/` and are not committed.

Verified on Windows/CPU on 2026-11-20: native feature extraction, matching,
mapping, undistortion, dense reconstruction, meshing, texturing and GLB packing.
The generated textured GLB was 7,272,204 bytes. Native verification caught and
fixed an OpenMVS interface-format handoff: `TextureMesh` must load the cameras
from `cloud.mvs` and receive `mesh.ply` explicitly through `--mesh-file`, since
`ReconstructMesh` need not produce a new `mesh.mvs` in that archive format.

## Official references and licenses

- [COLMAP CLI](https://colmap.github.io/cli.html), BSD license.
- [OpenMVS](https://github.com/cdcseacave/openMVS), AGPL-3.0 with the project's
  additional notice requirements. The unmodified executables are not vendored
  into Git; the official archive includes its license/notices. Preserve those
  notices and review the license when distributing/deploying the engine.
- [OpenMVS sample](https://github.com/cdcseacave/openMVS_sample).
- [MediaPipe Image Segmenter](https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter).
- [Meshroom capture guidance](https://meshroom-manual.readthedocs.io/en/latest/capturing/capturing.html).
