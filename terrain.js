import { random, math } from 'canvas-sketch-util';

import { erode, blurMap } from './erode';
import { fbm3D } from './noise';

function get_offset(x, y, nx, ny) {
  // full height map
  //return map(y / ny, 0, 1, -1, 0.25);
  // crop the top halfish to always be 0
  //return y / ny - 0.75;
  return math.mapRange(y / ny, 0, 1, -4, 0) * 0.5;
}

export class HeightMapGenerator {
  constructor(width, height) {
    this.width = width;
    this.height = height;
  }

  blurredGrid(noiseGrid, { numTicks, dimension, persistence }) {
    let minHeight;
    let maxHeight;

    const contributionRatio = 1 / numTicks;
    for (let tick = 0; tick < numTicks; tick++) {
      for (let y = 0; y < this.height + 1; y++) {
        for (let x = 0; x < this.width + 1; x++) {
          const newVal = math.mapRange(
            constrain(
              fbm3D(x, y, tick, { scale: dimension, persistence, octaves: 8 }) +
                get_offset(x, y, this.width, this.height),
              -1,
              1
            ),
            -1,
            1,
            0,
            1
          );

          noiseGrid[y][x] += newVal * contributionRatio;

          // save max and min height for the first run
          const noiseVal = noiseGrid[y][x];
          if (!maxHeight || noiseVal > maxHeight) {
            maxHeight = noiseVal;
          }

          if (!minHeight || noiseVal < minHeight) {
            minHeight = noiseVal;
          }
        }
      }
    }

    return [minHeight, maxHeight];
  }

  mergedGrid(
    noiseGrid,
    {
      numTicks,
      dimension,
      persistence,
      threshold = 0.0,
      offsetFn = get_offset,
    } = {},
    ranges
  ) {
    let minHeight;
    let maxHeight;

    // NOTE: either numTicks must be 1 or threshold must be 0.0;

    for (let tick = 0; tick < numTicks; tick++) {
      for (let y = ranges.y.start; y < ranges.y.end; y++) {
        for (let x = ranges.x.start; x < ranges.x.end; x++) {
          let newVal = math.mapRange(
            constrain(
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

          //let newVal = //math.mapRange(
          //  fbm3D(x, y, tick, {
          //    scale: noiseDim,
          //    persistence,
          //    octaves: 8,
          //    amp: 1.0,
          //    turbulence: true,
          //    //}),
          //    //-1,
          //    //1,
          //    //0,
          //    //1
          //  }); // + offsetFn(x, y, this.width, this.height),

          if (newVal < threshold) {
            newVal = 0;
          }

          // && newVal > threshold

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

    console.log(minHeight, maxHeight);

    // Normalize
    noiseGrid = noiseGrid.map((row) => {
      return row.map((val) => {
        return math.mapRange(val, minHeight, maxHeight, 0, scale, true);
        //(val - minHeight) / (maxHeight - minHeight)) * scale;
      });
    });

    return noiseGrid;
  }

  join(destination, source) {
    // Will add noise from the source to the destination where squares are empty.
    return destination.map((row, y) => {
      return row.map((val, x) => {
        // if in the "surf" zone
        if (val >= 0.0 && val <= 0.05) {
          return Math.max(val, source[y][x]);
        }

        // if in the land zone
        if (val > 0.05) {
          return val;
        }

        return source[y][x];
      });
    });
  }

  generate(noiseOptions, oceanOptions) {
    //const startThreshold = 0.2;
    //const endThreshold = 0.6;
    //const range = endThreshold - startThreshold;

    // maybe we do the "islands" / rocks first -> we generate a higher scale noise map and use a high threshold to pick islands, but when adding them to the
    // noise map themselves, we put them really low, like 0 - 0.2. Then we apply the land generation on top of that?
    const shouldGenerateRocks = random.chance(0.5);
    console.log('generating rocks', shouldGenerateRocks);

    const rockNoiseOptions = {
      numTicks: 1,
      threshold: 0.85,
      dimension: noiseOptions.dimension * 16,
      persistence: noiseOptions.persistence,
      scale: oceanOptions.oceanHeight + 0.1, // ideally 0.3 when noise persistence is 0.45 and 0.15 when it's 0.35
      //offsetFn: () => 0,
      offsetFn: (x, y, nx, ny) =>
        //-0.04 * (1 - Math.sqrt(Math.pow(ny / 2 - y, 2)) / (ny / 2)) -
        -(random.noise2D(x, y, 0.005) > 0.5 ? 0.0 : 0.5),
    };
    // scale needs to decrease if the dimension goes down...
    // max scale - min scale * dimension / maxNoiseDim ?
    const islandNoiseOptions = {
      numTicks: 1,
      threshold: 0.75,
      dimension: noiseOptions.dimension * 8,
      persistence: noiseOptions.persistence,
      scale: oceanOptions.oceanHeight + 0.1,
      offsetFn: (x, y, nx, ny) =>
        //-0.04 * (1 - Math.sqrt(Math.pow(ny / 2 - y, 2)) / (ny / 2)) -
        -(random.noise2D(x, y, 0.005) > 0.5 ? 0.0 : 0.5),
    };

    const rockRanges = {
      y: {
        start: Math.floor(this.height * 0.01),
        end: Math.ceil(this.height * 0.8),
      },
    };
    const rockGrid = this.createNoiseGrid(rockNoiseOptions, rockRanges);

    const islandRanges = {
      y: {
        start: Math.floor(this.height * 0.01),
        end: Math.ceil(this.height * 0.8),
      },
    };
    const islandGrid = this.createNoiseGrid(islandNoiseOptions, islandRanges);

    const seaNoiseGrid = shouldGenerateRocks
      ? this.join(islandGrid, rockGrid)
      : this.createEmptyGrid();
    //blurMap(seaNoiseGrid, 1, 0.4);

    const landGrid = this.createNoiseGrid(noiseOptions);

    const erodeGrid = Array.from(Array(this.height + 1), (_, yIndex) => {
      return Array.from(Array(this.width + 1), (_, xIndex) => {
        const nois = fbm3D(xIndex, yIndex, 5, {
          scale: 0.02,
          persistence: 0.5,
          octaves: 8,
        });
        //const nois = random.noise2D(xIndex, yIndex, 0.015, 1);
        //return math.mapRange(landGrid[yIndex][xIndex], 0, 1, 0.08, 0.01); // //map(nois, -1, 1, 0.005, 0.01);
        return landGrid[yIndex][xIndex] < oceanOptions.oceanHeight + 0.1
          ? 0.04
          : 0.005;
      });
    });

    //const erodeGrid = Array.from(Array(ny + 1), () => Array(nx + 1).fill(0.075));

    const depositGrid = Array.from(Array(this.height + 1), (_, yIndex) => {
      return Array.from(Array(this.width + 1), (_, xIndex) => {
        const nois = fbm3D(xIndex, yIndex, 0, {
          scale: 0.015,
          persistence: 0.45,
          octaves: 8,
        });
        return 0.5; //nois > 0.3 && get_noise(xIndex, yIndex) <= 0.00000000001
        //? 0.8
        //: 0.01;
      });
    });

    //erode(seaNoiseGrid, erodeGrid, depositGrid, 50000, 0.0001, 2, 0.05);
    blurMap(seaNoiseGrid, 1, 0.8);

    //erode(landGrid, erodeGrid, depositGrid, 100000, 0.25, 0);
    //erode(landGrid, erodeGrid, depositGrid, 50000, 0.25, 1);
    //erode(landGrid, erodeGrid, depositGrid, 100000, 0.1, 8, 0.01);
    //erode(landGrid, erodeGrid, depositGrid, 50000, 0.25, 1);
    //erode(landGrid, erodeGrid, depositGrid, 200000, 0.25, 4);
    //

    //erode(landGrid, erodeGrid, depositGrid, {
    //  numDrops: 100000,
    //  minHeight: 0.1,
    //  dropRadius: 4,
    //  inertia: 0.05,
    //});
    // Higher inertia means the droplets don't meet the ocean at the same point, so they don't end up building out land?, only islands?
    erode(landGrid, erodeGrid, depositGrid, {
      numDrops: 200000,
      minHeight: 0.1,
      dropRadius: 3,
      inertia: 0.15,
    });
    //erode(landGrid, erodeGrid, depositGrid, {
    //  numDrops: 100000,
    //  minHeight: 0.1,
    //  dropRadius: 1,
    //  inertia: 0.02,
    //});
    erodeOcean(landGrid, oceanOptions);
    random.chance(0.2) && flatten(landGrid, 0.3);
    blurMap(landGrid, 1, 0.9);

    //const depositGrid = Array.from(Array(ny + 1), (_, index) =>
    //  index > ny / 2 ? Array(nx + 1).fill(0.001) : Array(nx + 1).fill(0.001)
    //);

    //    index < ny * 0.6 ? Array(nx + 1).fill(0.2) : Array(nx + 1).fill(0.05)

    // we have to set the brush area to 0 so that we only erode a single cell at a time bc that's how the deposition works
    // higher erosion radius leads to really jagged deposits bc they only work on a cell-basis...
    // can't have a high erosion radius with high capacity or it looks wacky
    //erode(landGrid, erodeGrid, depositGrid, 200000, 0.25, 0);

    const terrainGrid = this.join(landGrid, seaNoiseGrid);

    return terrainGrid;
  }
}

const flatten = (heightMap, minHeight) => {
  for (let y = 0; y < heightMap.length; y++) {
    for (let x = 0; x < heightMap[0].length; x++) {
      //const threshold =
      //  minHeight +
      //  fbm3D(x, y, 1235431, {
      //    scale: 0.002,
      //    octaves: 4,
      //    persistence: 0.4,
      //    turbulence: true,
      //  }) *
      //    (1.0 - minHeight);

      const val = heightMap[y][x];
      if (val !== 0 && val > minHeight) {
        // need to make sure it doesn't go below minHeight though...
        const diff = val - minHeight;
        heightMap[y][x] -= diff * 0.9;
      }
    }
  }
};

const erodeOcean = (heightMap, { waveDirection, oceanHeight }) => {
  const waveHeightMin = oceanHeight;
  const waveHeightMax = oceanHeight + 0.1;
  const power = 2;

  // Need to check proximity to the ocean... might want to calculate this up front? but after hydraulic erosion...
  for (let y = 0; y < heightMap.length; y++) {
    for (let x = 0; x < heightMap[0].length; x++) {
      // Add to the threshold if the wave direction is more normal to the land.
      // Would need to calculate normals for every cell if we wanted to do this...
      // But flatter -> more erosion, tangential -> more erosion
      //if (
      //  !isCloseToOcean(heightMap, oceanHeight, x, y) ||
      //  heightMap[y][x] < 0
      //) {
      //  console.log('skipping bc not close to ocean');
      //  continue;
      //}

      const threshold =
        waveHeightMin +
        fbm3D(x, y, 1235431, {
          scale: 0.001,
          octaves: 4,
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
  const radius = 40;
  const width = heightMap[0].length;
  const height = heightMap.length;

  for (let i = -radius; i <= radius; i++) {
    for (let j = -radius; j <= radius; j++) {
      const checkX = x + i;
      const checkY = y + j;

      // bounds checking
      if (checkX < 0 || checkY < 0) {
        continue;
      }

      if (checkX >= width || checkY >= height) {
        break;
      }

      if (heightMap[y][x] <= oceanHeight) {
        return true;
      }
    }
  }

  return false;
};
