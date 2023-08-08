import p5 from 'p5';
import canvasSketch from 'canvas-sketch';
import { random, math } from 'canvas-sketch-util';
import load from 'load-asset';

import cameraProject from 'camera-project';
import createCamera from 'perspective-camera';
import { mat4, vec3 } from 'gl-matrix';

import {
  prepareBackgroundInputs,
  drawBackground,
  crop,
} from './lib/background';
import { HeightMapGenerator } from './lib/terrain';
import { createOceanHeightMap } from './lib/ocean';
import { calculateHeightAndGradient, isOutOfBounds } from './lib/erode';
import {
  getCellIdForThreshold,
  getCarvingAndDirectionsForId,
} from './lib/marching-squares';
import { fbm3D } from './lib/noise';
import { Grid } from './lib/grid';
import * as Camera from './lib/camera';

const seed = random.getRandomSeed();
random.setSeed(seed);

const settings = {
  dimensions: [3300, 2100],
  units: 'px',
  bleed: 150,
  p5: { p5 },
};

const sketch = async ({ width, height, bleed }) => {
  // Output seed for historical purposes
  console.log(`seed: ${seed}`);

  const svg = await load('./assets/distorted-rect.svg');

  const canvasDimX = width;
  const canvasDimY = height;

  const palettes = {
    blueGreenBrown: {
      paper: '#e5d1c3',
      bottom: '#48666A',
      top: '#5E6A50',
    },
    blueGreenWhite: {
      paper: '#FEFBEA',
      top: '#48666A',
      bottom: '#5E6A50',
    },
    invertedBlueGreenWhite: {
      paper: '#FEFBEA',
      top: '#5E6A50',
      bottom: '#48666A',
    },
    blackWhite: {
      paper: '#FEFBEA',
      bottom: '#363635',
      top: '#363635',
    },
    blackBrown: {
      paper: '#e5d1c3',
      bottom: '#363635',
      top: '#363635',
    },
    greenBrownWhite: {
      paper: '#FFFFFA',
      bottom: '#727D71',
      top: '#C19875',
    },
    invertedGreenBrownWhite: {
      paper: '#FFFFFA',
      top: '#727D71',
      bottom: '#C19875',
    },
  };
  const palette = random.pick(Object.values(palettes));

  const backgroundInputs = prepareBackgroundInputs(canvasDimX, canvasDimY);

  const cellDim = 8;
  const nx = Math.floor(canvasDimX / cellDim);
  const ny = Math.floor(canvasDimY / cellDim);
  const xOffset = bleed + (canvasDimX % cellDim) / 2;
  const yOffset = bleed + (canvasDimY % cellDim) / 2;

  const { camera, projectPoints } = Camera.initialize(width, height, bleed);

  const noiseOptions = {
    numTicks: random.pick([1, 1, 2, 2, 2, 3]),
    dimension: 0.004,
    persistence: 0.45,
  };
  console.log('noise params:', noiseOptions);
  const oceanOptions = {
    waveDirection: random.pick([
      [-0.4, 0.9],
      [-0.2, 0.9],
      [0, 0.9],
      [0.2, 0.9],
      [0.4, 0.9],
    ]),
    oceanHeight: 0.01,
  };
  console.log('ocean params:', oceanOptions);
  const terrainOptions = {
    shouldGenerateRocks: random.chance(0.5),
    shouldRunOceanErosion: random.chance(0.5),
    shouldFlatten: random.chance(0.33),
  };
  console.log('terrain params:', terrainOptions);

  const numCarvings = random.pick([0, 200, 250, 300, 400]);

  // We have 3 different drawing approaches.
  const drawingOptions = [
    //[
    //  {
    //    start: 0.01,
    //    end: 1.0,
    //    steps: Math.floor(40 * ((30 - cellDim) / 30)),
    //    drawStyle: 'topo_lines',
    //  },
    //  { start: 0.01, end: 1.0, steps: numCarvings, drawStyle: 'lino_carve' },
    //],
    //[
    //  {
    //    start: 0.01,
    //    end: 1.0,
    //    steps: numCarvings,
    //    drawStyle: 'horizontal_lines',
    //  },
    //],
    [{ start: 0.01, end: 1.0, steps: 1800, drawStyle: 'downhill_lines' }],
  ];
  const drawingRanges = random.pick(drawingOptions);

  console.time('terrain generated');
  const generator = new HeightMapGenerator(nx, ny);
  const terrainHeightMap = generator.generate(
    { ...noiseOptions },
    terrainOptions,
    oceanOptions
  );
  const terrainGrid = new Grid(terrainHeightMap, cellDim, xOffset, yOffset);
  console.timeEnd('terrain generated');

  console.time('terrain shapes');
  // Create the "paper" background for the terrain.
  const topoFillShapes = processGrid(terrainGrid, [
    { start: 0.01, end: 1.0, steps: 2, drawStyle: 'topo_fill' },
  ]);

  // Create the spray textures
  const sprayShapes = processGrid(terrainGrid, [
    {
      start: 0.0001,
      end: oceanOptions.oceanHeight,
      steps: 8,
      drawStyle: 'topo_marks',
    },
  ]).filter(({ normal }) => {
    return vec3.dot(normal, camera.direction) > 0;
  });

  // Create the actual line drawings
  const terrainShapes = processGrid(terrainGrid, drawingRanges).filter(
    ({ normal }) => {
      return vec3.dot(normal, camera.direction) > 0;
    }
  );
  console.timeEnd('terrain shapes');

  //const endCaps = ((grid) => {
  //  const shapes = [];
  //  // where x === 0 and where x === width, create a shape between [0][y], [0][y+1], and fake 3d points at 0.
  //  const x = 0;
  //  for (let y = 0; y < grid.height - 1; y++) {
  //    const [start, end] = grid.relativesToAbsolute(x, y, [
  //      [0, 0],
  //      [0, 1],
  //    ]);

  //    const points = twoDShapeToThreeD(grid, [start, end]);
  //    shapes.push([
  //      ...points,
  //      [points[1][0], points[1][1], 0],
  //      [points[0][0], points[0][1], 0],
  //    ]);
  //  }

  //  return shapes;
  //})(terrainGrid);
  //console.log(endCaps);

  //const landShadows = topoFillShapes
  //  .filter(({ points }) => {
  //    if (points.length !== 4) {
  //      return false;
  //    }

  //    const flatPoints = projectPoints(points);

  //    const [x1, y1] = flatPoints[0];
  //    const [x2, y2] = flatPoints[1];
  //    const [x3, y3] = flatPoints[2];
  //    const [x4, y4] = flatPoints[3];
  //    const area = Math.abs(
  //      0.5 *
  //        (x1 * y2 +
  //          x2 * y3 +
  //          x3 * y4 +
  //          x4 * y1 -
  //          (x2 * y1 + x3 * y2 + x4 * y3 + x1 * y4))
  //    );

  //    return area < 6;
  //  })
  //  .map((shape) => ({ ...shape, points: projectPoints(shape.points) }));

  console.time('ocean generated');
  const oceanGrid = new Grid(
    createOceanHeightMap(nx, Math.floor(ny * 0.9), oceanOptions, terrainGrid),
    cellDim,
    xOffset,
    yOffset
  );

  const seaShapes = processGrid(oceanGrid, [
    { start: 0.0086, end: oceanGrid.max, steps: 4, drawStyle: 'topo_lines' },
  ]).filter(({ normal }) => {
    return vec3.dot(normal, camera.direction) > 0;
  });
  console.timeEnd('ocean generated');

  // Always draw waves if we don't have rocks, otherwise randomly decide.
  const shouldDrawWaves =
    !terrainOptions.shouldGenerateRocks || random.chance(0.85);

  return (props) => {
    const { p5: p, context, width, height } = props;

    p.push();
    drawBackground(
      context,
      { ...backgroundInputs },
      { width, height },
      palette
    );
    p.pop();

    const coloredLinesPG = p.createGraphics(width, height);
    drawBackground(
      coloredLinesPG.canvas.getContext('2d'),
      { ...backgroundInputs },
      { width, height },
      palette
    );

    if (shouldDrawWaves) {
      seaShapes.forEach(({ points }) => {
        const flatPoints = projectPoints(points);
        drawShape(p, { paper: 'transparent' }, flatPoints);
      });
    }

    // Draw a fake base paper layer over the land.
    topoFillShapes.forEach(({ points }) => {
      drawShape(p, { paper: 'transparent' }, projectPoints(points));
    });

    const topoFills = topoFillShapes.map((shape) => {
      const points = projectPoints(shape.points);
      // NOTE: it's important that we use the max z val for the fills and min for the shapes!
      const zVal = Math.max(...points.map((point) => point[2]));

      return {
        ...shape,
        points,
        zVal,
        type: 'fill',
      };
    });
    const terShapes = terrainShapes.map((shape) => {
      const points = projectPoints(shape.points);
      const zVal = Math.min(...points.map((point) => point[2]));

      return {
        ...shape,
        points,
        zVal,
        type: 'shape',
      };
    });

    const twoDTerrainDrawings = [...topoFills, ...terShapes].sort(
      (shapeA, shapeB) => {
        // If the z ratio is lower, it's closer, so should be later in the array
        const diff = shapeB.zVal - shapeA.zVal;

        if (diff === 0 && shapeA.type !== shapeB.type) {
          return shapeA === 'fill' ? -1 : 1;
        }

        return diff;
      }
    );

    const linesPG = p.createGraphics(width, height);
    twoDTerrainDrawings.forEach(({ points, type }) => {
      if (type === 'fill') {
        drawShape(linesPG, { paper: 'transparent' }, points);
      } else {
        drawShape(linesPG, palette, points);
      }
    });

    //landShadows.forEach(({ points }) => {
    //  drawShape(linesPG, palette, points);
    //});

    // Draw the ocean spray carvings
    sprayShapes.forEach(({ points }) => {
      drawShape(p, { paper: 'transparent' }, projectPoints(points));
    });

    const linesContext = coloredLinesPG.canvas.getContext('2d');
    linesContext.globalCompositeOperation = 'destination-in';
    linesContext.drawImage(linesPG.canvas, 0, 0, width, height);

    context.globalCompositeOperation = 'source-over';
    context.drawImage(coloredLinesPG.canvas, 0, 0, width, height);

    crop(context, svg, { bleed });

    // Draw in the paper to avoid having regular transparency digitally.
    context.globalCompositeOperation = 'destination-atop';
    context.fillStyle = palette.paper;
    context.fillRect(0, 0, width, height);
  };
};

canvasSketch(sketch, settings);

const drawShape = (p, palette, points) => {
  if (palette.paper === 'transparent') {
    p.erase();
  }
  // We have to use a stroke to work when shapes are touching due to anti aliasing on the canvas showing through.
  p.strokeWeight(1);
  p.stroke(palette.paper);
  p.fill(palette.paper);
  p.beginShape();
  points.forEach((point) => {
    p.vertex(point[0], point[1]);
  });
  p.vertex(points[0][0], points[0][1]);
  p.endShape(p.CLOSE);

  if (palette.paper === 'transparent') {
    p.noErase();
  }
};

// Converts our marching squares-based 2d shapes to 3d using the heightmap values.
const twoDShapeToThreeD = (grid, shape) => {
  return shape.map((point) => {
    return [
      point[0],
      point[1],
      calculateHeightAndGradient(
        grid.heightMap,
        math.clamp((point[0] - grid.xOffset) / grid.cellDim, 0, grid.width - 2),
        math.clamp((point[1] - grid.yOffset) / grid.cellDim, 0, grid.height - 2)
      ).height * grid.zScale,
    ];
  });
};

const processGrid = (grid, ranges) => {
  ranges = ranges.map((range) => {
    const delta = (range.end - range.start) / range.steps;
    const thresholds = math
      .linspace(range.steps, true)
      .map((val) => range.start + val * (range.end - range.start));

    return { ...range, delta, thresholds };
  });

  const allShapes = [];

  ranges.forEach(({ start, end, steps, thresholds, delta, drawStyle }) => {
    if (['topo_marks', 'topo_lines', 'topo_fill'].includes(drawStyle)) {
      for (let y = 0; y < grid.height - 1; y++) {
        for (let x = 0; x < grid.width - 1; x++) {
          const shapes = processCell(grid, x, y, thresholds, delta, drawStyle);
          shapes.forEach((shape) => allShapes.push(shape));
        }
      }
    } else if (drawStyle === 'lino_carve') {
      const shapes = createLinoCarvings(grid, { start, end, steps });
      shapes.forEach((shape) => allShapes.push(shape));
    } else if (drawStyle === 'downhill_lines') {
      const shapes = createDownhillLines(grid, { start, end, steps });
      shapes.forEach((shape) => allShapes.push(shape));
    } else if (drawStyle === 'horizontal_lines') {
      const shapes = createHorizontalLines(grid, { start, end, steps });
      shapes.forEach((shape) => allShapes.push(shape));
    }
  });

  // Map to an array of shape objects with 'points' and 'normal' fields.
  return allShapes.map((shape) => {
    // Shouldn't be possible.
    if (shape.length < 3) {
      return [0, 0, 0];
    }

    const normal = [];
    const v1 = [];
    const v2 = [];
    vec3.subtract(v1, shape[1], shape[0]);
    vec3.subtract(v2, shape[shape.length - 1], shape[0]);

    vec3.cross(normal, v1, v2);
    vec3.normalize(normal, normal);

    return {
      points: shape,
      normal,
    };
  });
};

// This pattern for drawing with marching squares was repurposed from topographic work done by Kjetil Golid here: https://github.com/kgolid/topographic
const processCell = (grid, x, y, thresholds, delta, drawStyle) => {
  const [v1, v2, v3, v4] = grid.getCellValues(x, y);

  const min = Math.min(0, v1, v2, v3, v4);
  const max = Math.max(v1, v2, v3, v4);

  let relevantThresholds = thresholds.filter(
    (t) => t >= min - delta && t <= max
  );

  const shapes = relevantThresholds
    .map((t) => {
      const id = getCellIdForThreshold([v1, v2, v3, v4], t);

      if (drawStyle === 'topo_lines') {
        return grid.createLines(id, v1, v2, v3, v4, t, x, y);
      } else if (drawStyle === 'topo_marks') {
        return grid.createMarks(id, v1, v2, v3, v4, t, x, y);
      } else if ((drawStyle = 'topo_fill')) {
        return grid.createFills(id, v1, v2, v3, v4, t, x, y);
      }

      return [];
    })
    .flat()
    .filter((shape) => shape && shape.length > 0);

  // Convert to 3D
  return shapes.map((shape) => twoDShapeToThreeD(grid, shape));
};

const createLinoCarvings = (grid, { start, end, steps }) => {
  const shapes = [];

  let numCarvings = 0;
  while (numCarvings < steps) {
    const randPoint = [
      random.rangeFloor(0, grid.width - 1),
      random.rangeFloor(0, grid.height - 1),
    ];

    // For now, let's just check that all 4 corners are within the noise value bounds
    const noiseValues = grid.getCellValues(...randPoint);
    if (!noiseValues.every((val) => val >= start && val <= end)) {
      continue;
    }

    // I think this can cause infinite loops.
    // We want the threshold to be large enough that the adjacent cells will also be split by that threshold.
    if (noiseValues.every((val) => val < start + 0.005)) {
      continue;
    }

    const minValue = Math.min(...noiseValues);
    const maxValue = Math.max(...noiseValues);
    let threshold = random.range(minValue, maxValue);

    const length = 200 * random.range(0.5, 2);
    const baseVariance = grid.cellDim / 2;

    //let startVariance;
    //let endVariance;
    //const varianceRand = random.rangeFloor(0, 2);
    //switch (varianceRand) {
    //  case 0: {
    //    startVariance = baseVariance * 1;
    //    endVariance = baseVariance * 0.4;
    //    break;
    //  }
    //  case 1: {
    //    startVariance = baseVariance * 0.4;
    //    endVariance = baseVariance * 1;
    //    break;
    //  }
    //}

    const shouldBeDotted = random.chance(0.25);
    const chanceToStop = 0.02;

    // Start carving cell-by-cell
    let previousCell = null;
    let currentCell = randPoint;
    const rangePrefix = `linocarve_${random.value()}`;
    for (let i = 0; i < length; i++) {
      // Do nothing if we've reached a boundary
      if (
        currentCell[0] < 0 ||
        currentCell[0] >= grid.width - 1 ||
        currentCell[1] < 0 ||
        currentCell[1] >= grid.height - 1
      ) {
        break;
      }

      const [gridX, gridY] = currentCell;
      const noiseValues = grid.getCellValues(...currentCell);
      const [nw, ne, se, sw] = noiseValues;

      const id = getCellIdForThreshold(noiseValues, threshold);
      const [n, e, s, w] = grid.relativesToAbsolute(gridX, gridY, [
        [math.mapRange(threshold, nw, ne, 0, grid.cellDim), 0],
        [grid.cellDim, math.mapRange(threshold, ne, se, 0, grid.cellDim)],
        [math.mapRange(threshold, sw, se, 0, grid.cellDim), grid.cellDim],
        [0, math.mapRange(threshold, nw, sw, 0, grid.cellDim)],
      ]);

      const point1Variance = baseVariance;
      const point2Variance = baseVariance;
      //const point1Variance = math.mapRange(
      //  i,
      //  0,
      //  length,
      //  startVariance,
      //  endVariance
      //);
      //const point2Variance = math.mapRange(
      //  i + 1,
      //  0,
      //  length,
      //  startVariance,
      //  endVariance
      //);
      //

      // TODO: ideally move this into the marching squares module
      if (id === 0 || id === 15) {
        break;
      }

      // TODO: we could have 2 techniques -- left -> right oriented and right -> left oriented. Currently only have 1 orientation.
      const { points, directions, isOnDarkSide } = getCarvingAndDirectionsForId(
        id,
        n,
        e,
        s,
        w
      );
      const prospectiveCells = directions.map(([xDiff, yDiff]) => [
        currentCell[0] + xDiff,
        currentCell[1] + yDiff,
      ]);

      const shape = twoDShapeToThreeD(
        grid,
        grid.createLineSegment(
          rangePrefix,
          points[0],
          points[1],
          point1Variance,
          point2Variance
        )
      );

      shouldBeDotted
        ? random.chance(0.97) && shapes.push(shape)
        : shapes.push(shape);

      const nx = fbm3D(currentCell[0], currentCell[1], i, {
        scale: 0.002,
        octaves: 8,
        persistence: 0.45,
        amplitude: 2.0,
        turbulence: true,
      });

      if (nx > 0.75 && random.chance(chanceToStop)) {
        break;
      }

      if (isOnDarkSide && random.chance(chanceToStop)) {
        break;
      }

      // Set previous and currentcell
      let nextCell;
      if (previousCell === null) {
        nextCell = random.pick(prospectiveCells);
      } else {
        nextCell = prospectiveCells.find(
          ([x, y]) => !(x === previousCell[0] && y === previousCell[1])
        );
      }

      threshold = minValue;
      previousCell = currentCell;
      currentCell = nextCell;
    }

    numCarvings++;
  }

  return shapes;
};

// We'll start from a random x value with the highest y value. Then move downhill until we reach a cell with noise values <= the end value.
// Then we'll start creating shapes are we send the "particle' downnhill.
const createDownhillLines = (grid, { start, end, steps }) => {
  const shapes = [];

  const gravity = 9.8;
  const minHeight = 0.01;
  const baseVariance = grid.cellDim / 2;

  for (let i = 0; i < steps; i++) {
    let dirX = 0;
    let dirY = 0;
    let speed = 1.0;

    let inertia = 0.005;

    let [posX, posY] = [
      random.range(0, grid.width - 1),
      random.range(0, grid.height - 1),
    ];

    if (grid.getValue(Math.floor(posX), Math.floor(posY)) < minHeight) {
      i--;
      continue;
    }

    let noiseValues;
    let numIterations = 0;
    const maxIterations = random.rangeFloor(12, 40);
    do {
      numIterations++;
      //inertia *= initialInertia ** 1.5;
      let [nodeX, nodeY] = [Math.floor(posX), Math.floor(posY)];
      noiseValues = grid.getCellValues(nodeX, nodeY);
      // Check bounds
      if (isOutOfBounds(grid.width, grid.height, nodeX, nodeY)) {
        break;
      }

      const { height, gradientX, gradientY } = calculateHeightAndGradient(
        grid.heightMap,
        posX,
        posY
      );

      // Optionally set starting direction to the direction of the marching squares algo.
      if (dirX === 0 && dirY === 0) {
        dirX = gradientY;
        dirY = -gradientX;
      }

      // We also want inertia to progressively diminish
      dirX = dirX * inertia - gradientX * (1 - inertia);
      dirY = dirY * inertia - gradientY * (1 - inertia);

      // Normalize
      const len = Math.sqrt(dirX * dirX + dirY * dirY);
      if (len !== 0) {
        dirX /= len;
        dirY /= len;
      }

      const startPosX = posX;
      const startPosY = posY;
      posX += dirX;
      posY += dirY;

      // If not moving
      if (dirX == 0 && dirY == 0) {
        break;
      }

      // If moved outside of bounds
      if (isOutOfBounds(grid.width, grid.height, posX, posY)) {
        break;
      }

      const newHeight = calculateHeightAndGradient(
        grid.heightMap,
        posX,
        posY
      ).height;
      const deltaHeight = newHeight - height;

      if (deltaHeight > -0.0000001) {
        break;
      }

      const startPoint = [
        grid.xOffset + startPosX * grid.cellDim,
        grid.yOffset + startPosY * grid.cellDim + height * grid.heightScale,
      ];
      const endPoint = [
        grid.xOffset + posX * grid.cellDim,
        grid.yOffset + posY * grid.cellDim + newHeight * grid.heightScale,
      ];

      // Determine whether we want to create a shape.
      if (
        noiseValues.some((val) => val <= end) &&
        noiseValues.every((val) => val > start)
      ) {
        const shape = twoDShapeToThreeD(
          grid,
          grid.createLineSegment(
            'downhill',
            startPoint,
            endPoint,
            baseVariance,
            baseVariance
          )
        );
        shapes.push(shape);
      }

      speed = Math.sqrt(speed * speed + Math.abs(deltaHeight) * gravity);
    } while (
      noiseValues.every((val) => val > start) &&
      numIterations < maxIterations
    );
  }

  return shapes;
};

const createHorizontalLines = (grid, { start, end, steps }) => {
  const shapes = [];

  // Note: could try to expand this to support multiple directions, but only works for horizontal right now.
  const direction = [1, 0];
  const increment = 6;

  // Loop through each row.
  grid.heightMap.forEach((_, yIndex) => {
    if (yIndex % increment !== 0) {
      return;
    }

    let startPos = [0, yIndex];
    let endPos = [startPos[0] + direction[0], startPos[1] + direction[1]];
    while (!isOutOfBounds(grid.width, grid.height, ...endPos)) {
      if (grid.getValue(...startPos) > start) {
        const [startPoint, endPoint] = grid.relativesToAbsolute(
          startPos[0],
          startPos[1],
          [
            [0, 0],
            [grid.cellDim * direction[0], grid.cellDim * direction[1]],
          ]
        );

        const shape = twoDShapeToThreeD(
          grid,
          grid.createLineSegment(
            'horizontal',
            startPoint,
            endPoint,
            grid.cellDim / 3,
            grid.cellDim / 3
          )
        );
        shapes.push(shape);
      }
      startPos = endPos;
      endPos = [startPos[0] + direction[0], startPos[1] + direction[1]];
    }
  });

  // Then put some random lines in...
  for (let i = 0; i < steps / 2; i++) {
    let [posX, posY] = [
      random.range(0, grid.width - 1),
      random.range(0, grid.height - 1),
    ];

    let [dirX, dirY] = direction;
    if (random.chance(0.5)) {
      dirX = dirX * -1;
    }

    const noiseValues = grid.getCellValues(Math.floor(posX), Math.floor(posY));
    if (!noiseValues.every((val) => val >= start && val <= end)) {
      i--;
      continue;
    }

    const length = Math.floor(100 * random.range(0.5, 2));
    for (let j = 0; j < length; j++) {
      const startPosX = posX;
      const startPosY = posY;
      posX += dirX;
      posY += dirY;

      if (isOutOfBounds(grid.width, grid.height, posX, posY)) {
        break;
      }

      const nx = fbm3D(posX, posY, j, {
        scale: 0.002,
        octaves: 8,
        persistence: 0.45,
        amplitude: 2.0,
        turbulence: true,
      });

      if (nx > 0.75) {
        break;
      }

      const startPoint = [
        grid.xOffset + startPosX * grid.cellDim,
        grid.yOffset + startPosY * grid.cellDim,
      ];
      const endPoint = [
        grid.xOffset + posX * grid.cellDim,
        grid.yOffset + posY * grid.cellDim,
      ];

      // Determine whether we want to create a shape...
      const shape = twoDShapeToThreeD(
        grid,
        grid.createLineSegment(
          'random_horizontal',
          startPoint,
          endPoint,
          grid.cellDim / 2,
          grid.cellDim / 2
        )
      );
      shapes.push(shape);
    }
  }

  return shapes;
};
