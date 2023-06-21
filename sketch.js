import p5 from 'p5';
import canvasSketch from 'canvas-sketch';
import convexHull from 'convexhull-js';
import { random, math } from 'canvas-sketch-util';
import load from 'load-asset';

import { distance } from './utils';
import { prepareBackgroundInputs, drawBackground, crop } from './background';
import { HeightMapGenerator } from './terrain';
import { createOceanHeightMap } from './ocean';
import { calculateHeightAndGradient, isOutOfBounds } from './erode';
import {
  getCellIdForThreshold,
  getLinesForId,
  getCarvingAndDirectionsForId,
  getFillPointsForId,
} from './marching-squares';
import { fbm3D } from './noise';

const PHI = (1 + Math.sqrt(5)) / 2;

new p5();

// initialize random utility
//'1231234123';
//'asdbepoia23425';
// '575956'; //random.getRandomSeed();
//'726196';
//'725278';
//'355668';
// '601078';
// '384081';
// '519282'; //
//'144867';'534522';
//'803555';
//'338764';
//'722668'
const seed = random.getRandomSeed();
random.setSeed(seed);

const hullPointsMap = {};
const defaultNumPoints = 10;

const settings = {
  dimensions: [3300, 2100],
  units: 'px',
  bleed: 248,
  p5: true,
};

const sketch = async () => {
  // Output seed for historical purposes
  console.log(seed);

  const svg = await load('./distorted-rect.svg');

  const canvasDimX = settings.dimensions[0];
  const canvasDimY = settings.dimensions[1];
  const bleed = settings.bleed;

  const palettes = {
    sandBlue: {
      paper: '#F7C59F',
      // this blue is terrible
      top: '#1A659E', //
      bottom: '#826754',
    },
    deepBlue: {
      paper: '#EBCFB2',
      bottom: '#474B24',
      top: '#4F6D7A',
    },
    blueGreen: {
      paper: '#e5d1c3',
      top: '#48666A',
      bottom: '#5E6A50',
    },
    blueGreenWhite: {
      paper: '#FEFBEA',
      top: '#48666A',
      bottom: '#5E6A50',
    },
    invertedBlueGreen: {
      paper: '#5E6A50',
      top: '#e5d1c3',
      bottom: '#e5d1c3',
    },
    blackWhite: {
      //paper: '#363635',
      //bottom: '#FEFBEA',
      //top: '#FEFBEA',
      paper: '#FEFBEA',
      bottom: '#363635',
      top: '#363635',
    },
    invertedBlackWhite: {
      paper: '#363635',
      bottom: '#FEFBEA',
      top: '#FEFBEA',
    },
    black: {
      paper: '#363635',
      top: '#B6CB9E',
      bottom: '#92B4A7',
    },
  };
  const palette = palettes.blueGreen;
  const backgroundInputs = prepareBackgroundInputs(canvasDimX, canvasDimY);

  const cellDim = 16;

  const nx = Math.floor(canvasDimX / cellDim);
  const ny = Math.floor(canvasDimY / cellDim);
  const xOffset = bleed + (canvasDimX % cellDim) / 2;
  const yOffset = bleed + (canvasDimY % cellDim) / 2;

  // set "light" direction as well
  // set wave direction... ?

  /**
   * Ticks:
    //erode(landGrid, erodeGrid, depositGrid, 100000, 0.1, 2, 0.2);
   *   1 - more irregular
   *   2+ - getting more mountainous and flatter
   */
  const noiseOptions = {
    numTicks: 2,
    dimension: 0.004,
    persistence: 0.55,
  };
  const oceanOptions = {
    waveDirection: [0.2, 0.9],
    oceanHeight: 0.01,
  };

  console.time('terrain generated');
  const generator = new HeightMapGenerator(nx, ny);
  const terrainHeightMap = generator.generate(
    { ...noiseOptions },
    oceanOptions
  );
  const terrainGrid = new Grid(terrainHeightMap, cellDim, xOffset, yOffset);

  console.timeEnd('terrain generated');

  console.time('terrain shapes');
  const sprayShapes = processGrid(terrainGrid, [
    {
      start: 0.02,
      end: 0.05, //oceanOptions.oceanHeight,
      steps: 8,
      drawStyle: 'topo_marks',
    },
  ]);

  const topoFillShapes = processGrid(terrainGrid, [
    //{ start: 0.06, end: 1.0, steps: 1000, drawStyle: 'lino_carve' },
    //{ start: 0.06, end: terrainGrid.max, steps: 300, drawStyle: 'lino_carve' },
    //{ start: 0.08, end: 1.0, steps: 20, drawStyle: 'downhill_lines' },
    //{
    //  start: 0.08,
    //  end: 1.0,
    //  steps: Math.floor(40 * ((30 - cellDim) / 30)),
    //  drawStyle: 'topo_lines',
    //},
    //{ start: 0.08, end: 1.0, steps: 400, drawStyle: 'lino_carve' },
    { start: 0.06, end: 1.0, steps: 2, drawStyle: 'topo_fill' },
    //{ start: 0.08, end: 1.0, steps: 10, drawStyle: 'downhill_lines' },
  ]);

  const terrainShapes = processGrid(terrainGrid, [
    //{ start: 0.06, end: 1.0, steps: 1000, drawStyle: 'lino_carve' },
    //{ start: 0.06, end: terrainGrid.max, steps: 300, drawStyle: 'lino_carve' },
    //{ start: 0.06, end: 1.0, steps: 200, drawStyle: 'downhill_lines' },
    {
      start: 0.06,
      end: 1.0,
      steps: Math.floor(30 * ((30 - cellDim) / 30)),
      drawStyle: 'topo_lines',
    },
    //{ start: 0.08, end: 0.14, steps: 200, drawStyle: 'lino_carve' },
    { start: 0.3, end: 1.0, steps: 200, drawStyle: 'lino_carve' },
    //{ start: 0.36, end: 0.6, steps: 100, drawStyle: 'lino_carve' },
    //{ start: 0.6, end: 0.74, steps: 200, drawStyle: 'lino_carve' },
    //{ start: 0.74, end: 1.0, steps: 200, drawStyle: 'lino_carve' },
    //{ start: 0.08, end: 1.0, steps: 200, drawStyle: 'downhill_lines' },
  ]);

  console.timeEnd('terrain shapes');

  const oceanGrid = new Grid(
    createOceanHeightMap(nx, Math.floor(ny * 0.8), oceanOptions, terrainGrid),
    cellDim,
    xOffset,
    yOffset
  );

  console.log('ocean generated');
  const seaShapes = processGrid(oceanGrid, [
    //{ start: 0.4, end: 0.6, steps: 2, drawStyle: 'topo_marks' },
    //{ start: 0.00001, end: oceanGrid.max, steps: 8, drawStyle: 'topo_marks' },
    { start: 0.0088, end: oceanGrid.max, steps: 2, drawStyle: 'topo_fill' },
  ]);

  console.log('ocean shapes done');

  const shouldDrawSea = true; //true; //random.chance(0.4);

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

    // Draw a fake base paper layer over the land.
    topoFillShapes.forEach((points) =>
      drawShape(p, { paper: 'transparent' }, points)
    );

    // Draw the ocean carvings
    if (shouldDrawSea) {
      seaShapes.forEach((points) =>
        drawShape(p, { paper: 'transparent' }, points)
      );
      sprayShapes.forEach((points) =>
        drawShape(p, { paper: 'transparent' }, points)
      );
    }

    const linesPG = p.createGraphics(width, height);
    terrainShapes.forEach((points) => drawShape(linesPG, palette, points));

    // Draw the ocean carvings
    //seaShapes.forEach((points) => drawShape(linesPG, palette, points));
    //sprayShapes.forEach((points) => drawShape(linesPG, palette, points));

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

class Grid {
  constructor(heightMap, cellDim, xOffset, yOffset) {
    this.heightMap = heightMap;
    this.flattenedHeightMap = heightMap.flat();

    this.cellDim = cellDim;
    this.xOffset = xOffset;
    this.yOffset = yOffset;

    this.width = heightMap[0].length;
    this.height = heightMap.length;

    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    heightMap.forEach((row) => {
      row.forEach((val) => {
        if (val < min) {
          min = val;
        } else if (val > max) {
          max = val;
        }
      });
    });

    this.min = min;
    this.max = max;

    this.heightScale = 50;
    this.distortion = 6;
  }

  getValue(x, y) {
    return this.flattenedHeightMap[y * this.width + x];
  }

  getCellValues(x, y) {
    return [
      this.getValue(x, y),
      this.getValue(x + 1, y),
      this.getValue(x + 1, y + 1),
      this.getValue(x, y + 1),
    ];
  }

  cellRelativeToAbsolute(cellX, cellY, gridX, gridY) {
    const absoluteX = this.xOffset + gridX * this.cellDim + cellX;
    const absoluteY = this.yOffset + gridY * this.cellDim + cellY;

    const yHeight = this.getValue(gridX, gridY) * this.heightScale;

    const offsetX =
      fbm3D(absoluteX, absoluteY, 15789321, {
        scale: 0.003,
        octaves: 4,
        persistence: 0.4,
      }) * this.distortion;
    const offsetY =
      fbm3D(absoluteX, absoluteY, 89321, {
        scale: 0.0015,
        octaves: 4,
        persistence: 0.4,
      }) * this.distortion;

    return [absoluteX + offsetX, absoluteY + offsetY + yHeight];
  }

  relativesToAbsolute(gridX, gridY, points) {
    return points.map(([cellX, cellY]) => {
      return this.cellRelativeToAbsolute(cellX, cellY, gridX, gridY);
    });
  }

  createLines(id, nw, ne, se, sw, threshold, gridX, gridY) {
    const dim = this.cellDim;

    const [n, e, s, w] = this.relativesToAbsolute(gridX, gridY, [
      [math.mapRange(threshold, nw, ne, 0, dim), 0],
      [dim, math.mapRange(threshold, ne, se, 0, dim)],
      [math.mapRange(threshold, sw, se, 0, dim), dim],
      [0, math.mapRange(threshold, nw, sw, 0, dim)],
    ]);

    // generate points in a disc around the given point
    const lines = getLinesForId(id, n, e, s, w);
    return lines.map(([start, end]) => {
      return this.createLineSegment(`topo_line_${threshold}`, start, end);
    });
  }

  createFills(id, v1, v2, v3, v4, threshold, gridX, gridY) {
    const dim = this.cellDim;

    const [n, e, s, w, nw, ne, se, sw] = this.relativesToAbsolute(
      gridX,
      gridY,
      [
        [math.mapRange(threshold, v1, v2, 0, dim), 0],
        [dim, math.mapRange(threshold, v2, v3, 0, dim)],
        [math.mapRange(threshold, v4, v3, 0, dim), dim],
        [0, math.mapRange(threshold, v1, v4, 0, dim)],
        [0, 0],
        [dim, 0],
        [dim, dim],
        [0, dim],
      ]
    );

    const points = getFillPointsForId(id, n, e, s, w, nw, ne, se, sw);

    const useHulls = true; /// random.chance(0.5);
    let shape;
    if (useHulls) {
      const hullPoints = points.map(([x, y]) =>
        fetchOrGenerateHullPoints(x, y, dim / 4, 'fills')
      );
      shape = convexHull(hullPoints.flat());
    }

    return [shape];
  }

  createLineSegment(cacheKey, [x1, y1], [x2, y2], startVariance, endVariance) {
    // Hacky but ...
    const threshold = Number.parseFloat(cacheKey.split('_')[2]);

    startVariance =
      startVariance ?? this.getVarianceForPoint(x1, y1, threshold);
    const startPoints = fetchOrGenerateHullPoints(
      x1,
      y1,
      startVariance,
      cacheKey
    );

    endVariance = endVariance ?? this.getVarianceForPoint(x2, y2, threshold);
    const endPoints = fetchOrGenerateHullPoints(x2, y2, endVariance);

    return convexHull([...startPoints, ...endPoints]);
  }

  getVarianceForPoint(x, y, threshold) {
    // could potentially vary based on the "flatness" of a cell?
    const variances = [
      //this.cellDim / 0.1,
      //this.cellDim / 0.2,
      //this.cellDim / 0.3,
      //this.cellDim / 0.4,
      //this.cellDim / 0.5,
      //this.cellDim / 0.6,
      //this.cellDim / 0.7,
      //this.cellDim / 0.8,
      //this.cellDim / 0.9,
      this.cellDim / 1,
      this.cellDim / 1.33,
      this.cellDim / 1.66,
      this.cellDim / 2,
      this.cellDim / 2.33,
      this.cellDim / 2.66,
      this.cellDim / 3,
      this.cellDim / 3.33,
      this.cellDim / 3.66,
      //this.cellDim / 4,
      //this.cellDim / 4.33,
      //this.cellDim / 4.66,
      //this.cellDim / 5,
    ];

    let varianceIndex;
    varianceIndex = Math.floor(
      math.mapRange(
        fbm3D(x, y, threshold * 1000, {
          scale: 0.001,
          octaves: 4,
          persistence: 0.4,
        }),
        -1,
        1,
        0,
        1
      ) *
        (variances.length - 1)
    );

    return variances[varianceIndex];
  }

  createMarks(id, nw, ne, se, sw, threshold, gridX, gridY) {
    // Potentially skip, return an empty array.
    const nx = random.noise2D(gridX, gridY, 0.5, 0.5);
    if (random.value() - nx < 0.65) {
      return [];
    }

    const dim = this.cellDim;

    // NOTE: need to clamp here since we are kind of improperly using the corners bc some of them could be invalid otherwise.
    const [n, e, s, w, center] = this.relativesToAbsolute(gridX, gridY, [
      [dim / 2, 0], //math.mapRange(threshold, nw, ne, 0, dim, true), 0],
      [dim, dim / 2], // dim, math.mapRange(threshold, ne, se, 0, dim, true)],
      [dim / 2, dim], //math.mapRange(threshold, sw, se, 0, dim, true), dim],
      [0, dim / 2], // 0, math.mapRange(threshold, nw, sw, 0, dim, true)],
      [dim / 2, dim / 2],
    ]);

    // TODO: maybe remove?
    if (id === 0 || id === 15) {
      return [];
    }

    //const drawAnyway = p.random(1) > 0.98;

    // 3 "wave/spray" mark orientations
    // southeasterly cases: 1, 4, 10, 11, 14
    // northeasterly cases: 2, 5, 7, 8, 13
    // west-east case: 3,

    // have some sort of very small chance to draw anyway?

    // draw poly mark?
    // pull out the actual drawing + convex hull
    //
    //
    const variance = this.cellDim / 4;

    if ([nw, ne, se, sw].some((val) => val < 0.004)) {
      return [convexHull([...generateRandomPoints(...center, variance)])];
    }

    const useArrows = false;
    if (!useArrows) {
      return [convexHull([...generateRandomPoints(...center, variance * 1.5)])];
    }

    const thinTop = random.chance(0.4);
    const southPoints = generateRandomPoints(
      ...s,
      thinTop ? variance : variance * 0.6
    );
    const easternPoints = generateRandomPoints(...e, variance);
    const westernPoints = generateRandomPoints(...w, variance);
    const centerPoints = random.chance(1.0) ? easternPoints : westernPoints;
    const northernPoints = generateRandomPoints(
      ...n,
      thinTop ? variance * 0.6 : variance
    );
    return [
      convexHull([...southPoints, ...centerPoints]),
      convexHull([...centerPoints, ...northernPoints]),
    ];
  }
}

function processGrid(grid, ranges) {
  ranges = ranges.map((range) => {
    const delta = (range.end - range.start) / range.steps;
    //let thresholds = math
    //  .linspace(range.steps, true)
    //  .map((val) => {
    //    const nx = random.noise1D(val + 1, 0.5);
    //    return val + nx;
    //  })
    //  .sort();

    //const max = Math.max(...thresholds);
    //const min = Math.min(...thresholds);

    //thresholds = thresholds.map((val) =>
    //  math.mapRange(val, min, max, range.start, range.end)
    //);

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
    }
  });

  return allShapes;
}

const createDownhillLines = (grid, { start, end, steps }) => {
  // We'll start from a random x value with the highest y value. Then move downhill until we reach a cell with noise values <= the end value.
  // Then we'll start creating shapes are we send the "particle' downnhill.
  const minHeight = 0.8;
  const gravity = 40;

  const shapes = [];

  //const thresholds = math
  //  .linspace(steps, true)
  //  .map((val) => math.mapRange(val, 0, 1, 0, grid.width - 1))
  //  .map((val) => val + random.noise1D(val, 0.02, 10.0));
  //const possibleStartingPositions = thresholds.map((val) => [
  //  val,
  //  grid.height - 2,
  //]);

  for (let i = 0; i < steps; i++) {
    let dirX = 0;
    let dirY = 0;
    let speed = 1.0;

    let inertia = 0.04;
    //const initialInertia = inertia;

    let [posX, posY] = [
      random.range(0, grid.width - 1),
      random.range(0, grid.height - 1),
    ];

    //if (grid.getValue(Math.floor(posX), Math.floor(posY)) < minHeight) {
    //  continue;
    //}

    //possibleStartingPositions[
    //  random.rangeFloor(0, possibleStartingPositions.length - 1)
    //];

    let noiseValues;
    let numIterations = 0;
    do {
      numIterations++;
      //inertia *= initialInertia ** 1.5;
      let [nodeX, nodeY] = [Math.floor(posX), Math.floor(posY)];
      noiseValues = grid.getCellValues(nodeX, nodeY);
      // Check bounds
      if (isOutOfBounds(grid.width, grid.height, nodeX, nodeY)) {
        break;
      }

      // changed this to use posX/Y which might've broken things...
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

      // if not moving
      if (dirX == 0 && dirY == 0) {
        break;
      }

      // if moved outside of bounds
      if (isOutOfBounds(grid.width, grid.height, posX, posY)) {
        break;
      }
      const newHeight = calculateHeightAndGradient(
        grid.heightMap,
        posX,
        posY
      ).height;
      const deltaHeight = newHeight - height;

      if (deltaHeight > -0.0001) {
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

      //if (numIterations % 20 === 0) {
      //  possibleStartingPositions.push([posX, posY]);
      //}

      // Determine whether we want to create a shape...
      if (
        noiseValues.some((val) => val <= end) &&
        noiseValues.every((val) => val > start)
      ) {
        const shape = grid.createLineSegment(
          'downhill',
          startPoint,
          endPoint,
          grid.cellDim / 2,
          grid.cellDim / 2
        );
        shapes.push(shape);
      }

      speed = Math.sqrt(speed * speed + Math.abs(deltaHeight) * gravity);
    } while (noiseValues.every((val) => val > start) && numIterations < 100);
  }

  return shapes;
};

function fetchOrGenerateHullPoints(x, y, variance, cachePrefix = 'default') {
  const key = `${cachePrefix}_${x}_${y}`;
  if (hullPointsMap[key] !== undefined) {
    return hullPointsMap[key].points;
  }

  const randomPoints = generateRandomPoints(x, y, variance);

  hullPointsMap[key] = {
    points: randomPoints,
  };

  return randomPoints;
}

function generateRandomPoints(x, y, variance) {
  const numPoints = Math.floor(defaultNumPoints * variance);

  const randomPoints = [];
  while (randomPoints.length < numPoints) {
    const randPoint = {
      x: random.range(x - variance, x + variance),
      y: random.range(y - variance, y + variance),
    };

    if (distance(x, y, randPoint.x, randPoint.y) <= variance) {
      randomPoints.push(randPoint);
    }
  }

  return randomPoints;
}

function drawShape(p, palette, points) {
  if (palette.paper === 'transparent') {
    p.erase();
  }
  p.noStroke();
  p.fill(palette.paper);
  p.beginShape();
  points.forEach((point) => {
    p.vertex(point.x, point.y);
  });
  p.endShape(p.CLOSE);

  if (palette.paper === 'transparent') {
    p.noErase();
  }
}

// This will go through the grid only once, and we'll pass in a list of ranges to operate on.
function processCell(grid, x, y, thresholds, delta, drawStyle) {
  const [v1, v2, v3, v4] = grid.getCellValues(x, y);

  // Some optimization
  // can we remove -1 from the min wthout bugs?
  const min = Math.min(0, v1, v2, v3, v4);
  const max = Math.max(v1, v2, v3, v4);

  //if (max === 0) {
  //  return [];
  //}

  let relevantThresholds = thresholds.filter(
    (t) => t >= min - delta && t <= max
  );
  //relevantThresholds =
  //  relevantThresholds.length > 2
  //    ? [relevantThresholds.shift(), relevantThresholds.pop()]
  //    : relevantThresholds;

  //const shapes = [];
  // We only care about max 2 thresholds...
  const shapes = relevantThresholds.map((t) => {
    const id = getCellIdForThreshold([v1, v2, v3, v4], t);

    if (drawStyle === 'topo_lines') {
      return grid.createLines(id, v1, v2, v3, v4, t, x, y);
    } else if (drawStyle === 'topo_marks') {
      return grid.createMarks(id, v1, v2, v3, v4, t, x, y);
    } else if ((drawStyle = 'topo_fill')) {
      return grid.createFills(id, v1, v2, v3, v4, t, x, y);
    }

    return [];
  });

  return shapes.flat().filter((shape) => shape.length > 0);
}

const createLinoCarvings = (grid, { start, end, steps }) => {
  // so we have the boundary between start and end...
  // we'll use steps as the number of carvings to make...
  // we'll vary length of carving and thickness
  // we'll still work a cell at a time...
  // we can have some randomness that we actually switch tracks to a different cell maybe?
  // or we can do the full random approach
  //
  /**
   * Maybe we could also use different styles here? Like one approach starts thick then goes thin, other thin then thick, other constant?
   */

  // If we keep track of thresholds in an ordered manner, we can potentially move a line toward a threshold?
  // Eh, idk that seems pretty hard to have a target threshold that we move towards? idk.o
  // we'd probably only want to start trying to join with other lines after a certain number of carvings? or maybe just based on "closeness"
  // like if we have used a threshold before that's within some percentage or some range, we try to get to a square where it fits?
  // So almost 2 cases when starting a carving
  //  1. There isn't anything close, so we carve out a new path
  //  2. We detect a close line (based on the threhsold), so project the line maybe partially normally and partially towards?
  //  We know a threshold that's lower is downhill, and one that's higher is uphill.
  //
  //const usedThresholds = new Set();

  const shapes = [];

  let numCarvings = 0;
  while (numCarvings < steps) {
    const randPoint = [
      random.rangeFloor(0, grid.width - 1),
      random.rangeFloor(0, grid.height - 1),
    ];

    // for now, lets just check that all 4 corners are within the bounds
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

    const cellDim = grid.cellDim;

    const length = 200 * random.range(0.5, 2);

    const baseVariance = grid.cellDim / 2;

    let startVariance;
    let endVariance;
    const varianceRand = random.rangeFloor(0, 2);
    switch (varianceRand) {
      case 0: {
        startVariance = baseVariance * 1;
        endVariance = baseVariance * 0.4;
        break;
      }
      case 1: {
        startVariance = baseVariance * 0.4;
        endVariance = baseVariance * 1;
        break;
      }
    }

    // Start carving cell-by-cell
    let previousCell = null;
    let currentCell = randPoint;
    const rangePrefix = `linocarve_${random.value()}`;
    const shouldBeDotted = random.chance(0.25);
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
        [math.mapRange(threshold, nw, ne, 0, cellDim), 0],
        [cellDim, math.mapRange(threshold, ne, se, 0, cellDim)],
        [math.mapRange(threshold, sw, se, 0, cellDim), cellDim],
        [0, math.mapRange(threshold, nw, sw, 0, cellDim)],
      ]);

      const chanceToStop = 0.1;
      //math.mapRange(
      //  noiseValues[0],
      //  grid.min,
      //  grid.max,
      //  0.6,
      //  0.01
      //);

      const point1Variance = baseVariance;
      // math.mapRange(
      //   i,
      //   0,
      //   length,
      //   startVariance,
      //   endVariance
      // );
      const point2Variance = baseVariance;
      //math.mapRange(
      //  i + 1,
      //  0,
      //  length,
      //  startVariance,
      //  endVariance
      //);

      // Shouldn't reach this ever...
      if (id === 0 || id === 15) {
        break;
      }

      // we can have 2 techniques -- left -> right oriented and right -> left oriented
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

      const shape = grid.createLineSegment(
        rangePrefix,
        points[0],
        points[1],
        point1Variance,
        point2Variance
      );

      shouldBeDotted //|| isOnDarkSide
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

      // set previous and currentcell
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

//
//
//      if (drawStyle === 'topo_lines') {
//        // We could try doing an inverse of the relevant thresholds? If there are no thresholds relevant, we do draw?
//        // Modify thresholds
//        const buffer = delta / 4;
//        const newThresholds = [];
//        for (let i = 0; i < thresholds.length - 1; i++) {
//          if (thresholds[i + 1] - thresholds[i] < buffer * 2) {
//            continue;
//          }
//
//          const start = thresholds[i] + buffer;
//          const end = thresholds[i + 1] - buffer;
//          newThresholds.push(
//            ...math
//              .linspace(50, true)
//              .map((val) => math.mapRange(val, 0, 1, start, end))
//          );
//        }
//
//        console.log(newThresholds);
//        thresholds = newThresholds;
//      }
