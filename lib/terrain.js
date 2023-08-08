import { random, math } from 'canvas-sketch-util';

import { erode } from './erode';
import { fbm3D } from './noise';

const { lerp } = math;

function getOffset(x, y, nx, ny) {
  // Crop the bottom halfish to always be 0
  return math.mapRange(y / ny, 0, 1, 0, -4) * 0.5;
}

export class HeightMapGenerator {
  constructor(width, height) {
    this.width = width;
    this.height = height;
  }

  mergedGrid(
    noiseGrid,
    {
      numTicks,
      dimension,
      persistence,
      threshold = 0.0,
      offsetFn = getOffset,
    } = {},
    ranges
  ) {
    let minHeight;
    let maxHeight;

    for (let tick = 0; tick < numTicks; tick++) {
      for (let y = ranges.y.start; y < ranges.y.end; y++) {
        for (let x = ranges.x.start; x < ranges.x.end; x++) {
          let newVal = math.mapRange(
            math.clamp(
              fbm3D(x, y, tick, {
                scale: dimension,
                persistence,
                octaves: 8,
                turbulence: false,
              }) + offsetFn(x, y, this.width, this.height),
              -1,
              1
            ),
            -1,
            1,
            0,
            1
          );

          if (newVal < threshold) {
            newVal = 0;
          }

          if (tick === 0 || noiseGrid[y][x] < newVal) {
            noiseGrid[y][x] =
              noiseGrid[y][x] + 1.0 * (newVal - noiseGrid[y][x]);
          }

          if (!maxHeight || noiseGrid[y][x] > maxHeight) {
            maxHeight = noiseGrid[y][x];
          }

          if (!minHeight || noiseGrid[y][x] < minHeight) {
            minHeight = noiseGrid[y][x];
          }
        }
      }
    }

    return [minHeight, maxHeight];
  }

  createEmptyGrid() {
    return Array.from(Array(this.height + 1), () =>
      Array(this.width + 1).fill(0)
    );
  }

  createNoiseGrid(
    { numTicks, dimension, persistence, threshold, scale = 1.0, offsetFn } = {},
    ranges = {}
  ) {
    ranges = {
      x: { start: 0, end: this.width + 1 },
      y: { start: 0, end: this.height + 1 },
      ...ranges,
    };

    // Must have 1 additional x and y row since we're using marching squares.
    let noiseGrid = this.createEmptyGrid();
    const [minHeight, maxHeight] = this.mergedGrid(
      noiseGrid,
      {
        numTicks,
        dimension,
        persistence,
        threshold,
        offsetFn,
      },
      ranges
    );

    // Normalize
    noiseGrid = noiseGrid.map((row) => {
      return row.map((val) => {
        return math.mapRange(val, minHeight, maxHeight, 0, scale, true);
      });
    });

    return noiseGrid;
  }

  join(destination, source, boundaryHeight) {
    // Will add noise from the source to the destination where squares are empty.
    return destination.map((row, y) => {
      return row.map((val, x) => {
        // If in the "surf" zone
        if (val >= 0.0 && val <= boundaryHeight) {
          return Math.max(val, source[y][x]);
        }

        // If in the land zone
        if (val > boundaryHeight) {
          return val;
        }

        return source[y][x];
      });
    });
  }

  generate(
    noiseOptions,
    { shouldGenerateRocks, shouldRunOceanErosion, shouldFlatten } = {},
    oceanOptions
  ) {
    let seaNoiseGrid = this.createEmptyGrid();
    if (shouldGenerateRocks) {
      const rockNoiseOptions = {
        numTicks: 1,
        threshold: 0.85,
        dimension: noiseOptions.dimension * 16,
        persistence: noiseOptions.persistence,
        scale: oceanOptions.oceanHeight + 0.05,
        offsetFn: (x, y, nx, ny) =>
          -(random.noise2D(x, y, 0.005) > 0.5 ? 0.0 : 0.5),
      };
      const rockRanges = {
        y: {
          start: Math.floor(this.height * 0.01),
          end: Math.ceil(this.height * 0.8),
        },
      };
      const rockGrid = this.createNoiseGrid(rockNoiseOptions, rockRanges);

      const islandNoiseOptions = {
        numTicks: 1,
        threshold: 0.75,
        dimension: noiseOptions.dimension * 8,
        persistence: noiseOptions.persistence,
        scale: oceanOptions.oceanHeight + 0.05,
        offsetFn: (x, y, nx, ny) =>
          -(random.noise2D(x, y, 0.005) > 0.5 ? 0.0 : 0.5),
      };
      const islandRanges = {
        y: {
          start: Math.floor(this.height * 0.01),
          end: Math.ceil(this.height * 0.8),
        },
      };
      const islandGrid = this.createNoiseGrid(islandNoiseOptions, islandRanges);

      seaNoiseGrid = this.join(islandGrid, rockGrid, oceanOptions.oceanHeight);

      // Blurring helps to make the islands less pointy here.
      blurMap(seaNoiseGrid, 1, 0.8);
    }

    const landGrid = this.createNoiseGrid(noiseOptions);

    const erodeGrid = Array.from(Array(this.height + 1), (_, yIndex) => {
      return Array.from(Array(this.width + 1), (_, xIndex) => {
        const val = landGrid[yIndex][xIndex];
        return val < oceanOptions.oceanHeight + 0.2 ? 0.05 : 0.4;
      });
    });
    const depositGrid = Array.from(Array(this.height + 1), () => {
      return Array.from(Array(this.width + 1), () => {
        return 0.6;
      });
    });

    erode(landGrid, erodeGrid, depositGrid, {
      numDrops: 50000,
      minHeight: oceanOptions.oceanHeight,
      dropRadius: 3,
      inertia: 0.08,
    });

    shouldRunOceanErosion && erodeOcean(landGrid, oceanOptions);
    shouldFlatten && flatten(landGrid, random.pick([0.2, 0.26, 0.33]));

    blurMap(landGrid, 1, 0.6);

    const terrainGrid = this.join(
      landGrid,
      seaNoiseGrid,
      oceanOptions.oceanHeight
    );

    return terrainGrid;
  }
}

const flatten = (heightMap, minHeight) => {
  for (let y = 0; y < heightMap.length; y++) {
    for (let x = 0; x < heightMap[0].length; x++) {
      const val = heightMap[y][x];
      if (val !== 0 && val > minHeight) {
        // Need to make sure it doesn't go below minHeight
        const diff = val - minHeight;
        heightMap[y][x] -= diff * 0.8;
      }
    }
  }
};

const erodeOcean = (heightMap, { waveDirection, oceanHeight }) => {
  const waveHeightMin = oceanHeight;
  const waveHeightMax = oceanHeight + 0.2;
  const power = 3;

  // TODO: Use the wave direction...
  // Add to the threshold if the wave direction is more normal to the land.
  // Would need to calculate normals for every cell if we wanted to do this...
  // But flatter -> more erosion, tangential -> more erosion

  for (let y = 0; y < heightMap.length; y++) {
    for (let x = 0; x < heightMap[0].length; x++) {
      if (!isCloseToOcean(heightMap, oceanHeight, x, y)) {
        continue;
      }

      const threshold =
        waveHeightMin +
        fbm3D(x, y, 1235431, {
          scale: 0.006,
          octaves: 6,
          persistence: 0.4,
          turbulence: true,
        }) *
          (waveHeightMax - waveHeightMin);

      const val = heightMap[y][x];
      if (val !== 0 && val < threshold) {
        heightMap[y][x] *= (heightMap[y][x] / threshold) ** power;
      }
    }
  }
};

const isCloseToOcean = (heightMap, oceanHeight, x, y) => {
  const radius = 10;
  const width = heightMap[0].length;
  const height = heightMap.length;

  for (let i = -radius; i <= radius; i++) {
    for (let j = -radius; j <= radius; j++) {
      const checkX = x + i;
      const checkY = y + j;

      // Bounds checking
      if (checkX < 0 || checkY < 0) {
        continue;
      }

      if (checkX >= width || checkY >= height) {
        break;
      }

      if (heightMap[checkY][checkX] <= oceanHeight) {
        return true;
      }
    }
  }

  return false;
};

// While I'ved refactored this function quite a bit,
// the idea to blur after erosion is taken from Nat Sarkissian
export function blurMap(map, it, strength) {
  for (let k = 0; k < it; k++) {
    for (let j = 0; j < map.length; j++) {
      for (let i = 0; i < map[0].length; i++) {
        let sum = 0;
        let count = 0;

        // Grab all surrounding values where possible
        for (let x = -1; x <= 1; x++) {
          for (let y = -1; y <= 1; y++) {
            const xIndex = i + x;
            const yIndex = j + y;

            if (
              xIndex < 0 ||
              yIndex < 0 ||
              xIndex > map[0].length - 1 ||
              yIndex > map.length - 1
            ) {
              continue;
            }

            sum += map[yIndex][xIndex];
            count++;
          }
        }

        map[j][i] = lerp(map[j][i], sum / count, strength);
      }
    }
  }
}
