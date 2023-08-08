import { random } from 'canvas-sketch-util';

import cameraProject from 'camera-project';
import createCamera from 'perspective-camera';
import { mat4 } from 'gl-matrix';

// This function initializes a 3d camera and returns the camera and a helper to project 3d points to 2d points.
export const initialize = (width, height, bleed) => {
  // Setup a 3D perspective camera
  // Define a viewport for the camera & projection
  const cameraVariants = {
    center_high: {
      near: 1,
      far: height * 3,
      translate: [width / 2 + bleed, height + 4000, 1800],
      lookAt: [width / 2 + bleed, height / 2 + bleed, 0],
    },
    center_low: {
      near: 1,
      far: height * 3,
      translate: [width / 2 + bleed, height + 4200, 900],
      lookAt: [width / 2 + bleed, height / 2, 0],
    },
    left_top: {
      near: 0.1,
      far: height + width,
      translate: [-1400, height + 3000, 1800],
      lookAt: [width, -1400, -1100],
      up: [0, 0, -1],
    },
    right_top: {
      near: 0.1,
      far: height + width,
      translate: [width + 2 * bleed + 1400, height + 3000, 1800],
      lookAt: [0, -1400, -1100],
      up: [0, 0, -1],
    },
  };

  // Set up camera using the random variant.
  const camVariant = random.pick(Object.values(cameraVariants));
  const viewport = [0, 0, width, height];
  const camera = createCamera({
    fov: 44 * (Math.PI / 180), //Math.PI / 4.5,
    viewport,
    near: camVariant.near,
    far: camVariant.far,
  });

  camera.translate(camVariant.translate);
  camera.lookAt(camVariant.lookAt);
  if (camVariant.up) {
    camera.up = camVariant.up;
  }
  camera.update();

  // A 3D scene is made up of:
  // - 4x4 Projection Matrix (defines perspective)
  // - 4x4 View Matrix (inverse of camera transformation matrix)
  // - 4x4 Model Matrix (the mesh transformations like rotation, scale, etc)
  const projection = camera.projection;
  const view = camera.view;
  const model = mat4.identity([]);

  // Get a combined (projection * view * model) matrix
  const combined = mat4.identity([]);
  mat4.multiply(combined, view, model);
  mat4.multiply(combined, projection, combined);

  const projectPoints = (points) => {
    return points.map((point) => {
      return cameraProject([], point, viewport, combined);
    });
  };

  return { camera, projectPoints };
};
