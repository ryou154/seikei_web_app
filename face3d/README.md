# 3D face reconstruction workspace

The multiview test inputs are kept locally in `test-data/` and are ignored by Git.
Expected views:

- `front.jpg`
- `left45.jpg`, `right45.jpg`
- `left90.jpg`, `right90.jpg`
- `up.jpg`, `down.jpg`

The reconstruction service will fit these views to a FLAME/DECA-compatible face
mesh, apply the generated After texture, and return a glTF/GLB asset for the
browser viewer.
