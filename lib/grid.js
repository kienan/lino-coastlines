import convexHull from 'convex-hull';
import { math, random } from 'canvas-sketch-util';

import { distance } from './utils';
import { fbm3D } from './noise';
import { getLinesForId, getFillPointsForId } from './marching-squares';
import { calculateHeightAndGradient } from './erode';

const hullPointsMap = {};
const defaultNumPoints = 6;

export class Grid {
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

    this.zScale = 800;
    this.heightScale = 0;
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
    let shape = points;
    if (useHulls) {
      const hullPoints = points.map(([x, y]) =>
        fetchOrGenerateHullPoints(x, y, dim / 3, 'fills')
      );
      shape = convexHullWrapper(hullPoints.flat());
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

    return convexHullWrapper([...startPoints, ...endPoints]);
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
      //this.cellDim / 1,
      //this.cellDim / 1.33,
      //this.cellDim / 1.66,
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
      return [
        convexHullWrapper([...generateRandomPoints(...center, variance)]),
      ];
    }

    const useArrows = false;
    if (!useArrows) {
      return [
        convexHullWrapper([...generateRandomPoints(...center, variance * 1.5)]),
      ];
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
      convexHullWrapper([...southPoints, ...centerPoints]),
      convexHullWrapper([...centerPoints, ...northernPoints]),
    ];
  }
}

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
    const randPoint = [
      random.range(x - variance, x + variance),
      random.range(y - variance, y + variance),
    ];

    if (distance(x, y, randPoint[0], randPoint[1]) <= variance) {
      randomPoints.push(randPoint);
    }
  }

  return randomPoints;
}

const convexHullWrapper = (points) => {
  return convexHull(points).map((edge) => points[edge[0]]);
};
