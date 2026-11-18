Status
======

I don't maintain Sculptgl anymore (except small/minor fixes).

SculptGL - WebGL sculpting
==========================

This fork
=========

Changes made for sculpting characters on a phone:

- **Phone and tablet layout**: the page fits the screen, the top menu and the
  tool panel slide in as drawers, panel sliders follow the finger, and a quick
  bar gives undo/redo, tool, negative, symmetry, radius, intensity and a
  "turn view" toggle (one finger rotates instead of sculpting).
  Gestures: one finger sculpts (or turns the view off the model), two fingers
  move the view and pinch zooms, double tap focuses on the touched point.
- **GLB / VRM characters**: open a `.glb` or `.vrm`, sculpt it, then
  *Files → Save .glb/.vrm (original model, updated)* writes the new shape into
  a copy of the original file. Skeleton, skin weights, expressions, materials
  and textures are kept; only moved vertices (and their normals) change.
  Dynamic topology, remeshing and decimation change the vertex list, so those
  meshes can only be saved as OBJ/STL/PLY/SGL. Details sculpted after
  subdividing are saved at the original mesh density.
- **Touch pen**: one finger drives a pen whose tip, beside the finger, is
  the point that sculpts (cross on the exact spot, piece name, ring that fills
  while aiming: hold still to start the stroke). The area the brush will
  reach lights up on the model, mirrored with symmetry. A line above the quick
  bar says what the finger should do with the current tool. *Lock piece*
  keeps strokes on one piece (e.g. not the hair while sculpting the neck).
  Settings in Tools → Touch pen.
- **Real textures** of imported characters are shown while sculpting.
- 100 undo steps (was 15) and *Restore original* (undoable).
- **Install as an app**: served over https (e.g. GitHub Pages, see
  `.github/workflows/pages.yml`) it can be added to the home screen and works
  offline after the first visit.
- Starts with an empty scene and an "Open a model" card instead of a sphere.
- Builds with current Node (webpack 5.112).


You can try it [**here**](http://stephaneginier.com/sculptgl).

Additional information can be found on the [website](http://stephaneginier.com/).

Tools
=====

Nodejs needs to be installed [nodejs](http://nodejs.org/).

Then for the browser build :
```
yarn # npm install
yarn dev # npm run dev (npm run release for final build, npm run website should not be used)
// visit app/index.html
```

For standalone :
```
yarn add electron
yarn add electron-packager
yarn standalone
```

Credits
=======

#### Environments

The raw environments are from https://hdrihaven.com/hdris
