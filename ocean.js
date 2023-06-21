import { math } from 'canvas-sketch-util';

import { fbm3D } from './noise';

const NUM_APPROXIMATION_STEPS = 5;
//
export const createOceanHeightMap = (
  width,
  height,
  { waveDirection, oceanHeight },
  terrainGrid
) => {
  const grid = Array.from(Array(height + 1), () => Array(width + 1).fill(0));

  const firstWave = {
    x: waveDirection[0],
    y: waveDirection[1],
    steepness: 0.3,
    wavelength: 15,
  };
  const secondWave = {
    x: 0,
    y: -1.0,
    steepness: 0.3,
    wavelength: 30,
  };
  const thirdWave = {
    x: 1,
    y: 0,
    steepness: 0.5,
    wavelength: 3,
  };
  const fourthWave = {
    x: -1,
    y: 0,
    steepness: 0.4,
    wavelength: 15,
  };

  let minHeight = 100;
  let maxHeight = -100;

  grid.forEach((row, y) => {
    row.forEach((_, x) => {
      if (isNearTerrain(x, y, terrainGrid, oceanHeight, 20)) {
        return;
      }

      const nx = fbm3D(x, y, 1395673, {
        octaves: 6,
        scale: 0.008,
        persistence: 0.4,
        amplitude: 2,
      });

      // Iteratively calculate the z value at given x and y.
      let p = createVector(x, y);
      let offsetX, offsetY, offsetZ;
      for (let i = 0; i < NUM_APPROXIMATION_STEPS; i++) {
        const wave1Offset = gerstnerWave(firstWave, p);
        const wave2Offset = gerstnerWave(secondWave, p).map((val) => val * 0.5);
        const wave3Offset = gerstnerWave(thirdWave, p).map((val) => val * 0.25);
        const wave4Offset = gerstnerWave(fourthWave, p).map((val) => val * 0.2);

        // Need to swap Y and Z axis
        [offsetX, offsetZ, offsetY] = [
          wave1Offset[0] + wave2Offset[0] + wave3Offset[0] + wave4Offset[0],
          wave1Offset[1] + wave2Offset[1] + wave3Offset[1] + wave4Offset[1],
          wave1Offset[2] + wave2Offset[2] + wave3Offset[2] + wave4Offset[2],
        ];
        p = createVector(p.x - offsetX, p.y - offsetY);
      }

      const z = offsetZ + nx;
      if (z > maxHeight) {
        maxHeight = z;
      } else if (z < minHeight) {
        minHeight = z;
      }

      grid[y][x] = z;
    });
  });

  // Normalize to 0 - 0.1 scale
  return grid.map((row) => {
    return row.map((val) => {
      return math.mapRange(val, minHeight, maxHeight, 0, oceanHeight);
    });
  });
};

function gerstnerWave(wave, p) {
  const k = (2 * Math.PI) / wave.wavelength;
  const c = Math.sqrt(9.8 / k);
  const dir = createVector(wave.x, wave.y).normalize();
  const f = k * (dir.dot(createVector(p.x, p.y)) - c * 1372935);
  const a = wave.steepness / k;

  return [dir.x * (a * cos(f)), a * sin(f), dir.y * (a * cos(f))];
}

const isNearTerrain = (x, y, terrainGrid, oceanHeight, radius) => {
  for (let i = -radius; i <= radius; i++) {
    for (let j = -radius; j <= radius; j++) {
      const checkX = x + i;
      const checkY = y + j;

      // bounds checking
      if (checkX < 0 || checkY < 0) {
        continue;
      }

      if (checkX >= terrainGrid.width || checkY >= terrainGrid.height) {
        break;
      }

      if (terrainGrid.getValue(x, y) > oceanHeight) {
        return true;
      }
    }
  }

  return false;
};
