import { random } from 'canvas-sketch-util';

/**
 *  This is a slightly-modified Javascript implementation of Sebastian Lague's Unity/C# hydraulic erosion project.
 *  I borrowed an ErosionMap and DepositMap concept from Nat Sarkissian to allow certain areas to be more eroded (in our case, the land close to the ocean). I'm also using a blurring approach similar to Nat's after erosion.
 *
 */
export function erode(
  heightMap,
  erodeMap,
  depositMap,
  { numDrops, minHeight, dropRadius, inertia } = {}
) {
  // Height map is expected to be an array of rows.
  const mapWidth = heightMap[0].length;
  const mapHeight = heightMap.length;

  const maxIterations = 60;
  const initSpeed = 1;
  const initWaterVolume = 1;

  const sedimentCapacityFactor = 4;
  const minSedimentCapacity = 0.01;
  const depositSpeed = 1.0;
  const erodeSpeed = 1.0;
  const gravity = 9.8;
  const evaporateSpeed = 0.01;

  let minHeightAttempts = 0;

  const erosionWeights = initializeErosionWeights(
    mapWidth,
    mapHeight,
    dropRadius
  );

  for (let i = 0; i < numDrops; i++) {
    let posX = random.range(0, mapWidth - 1);
    let posY = random.range(0, mapHeight - 1);
    let dirX = 0;
    let dirY = 0;
    let speed = initSpeed;
    let water = initWaterVolume;
    let sediment = 0;

    // Check that value is at the min height
    if (heightMap[Math.floor(posY)][Math.floor(posX)] < minHeight) {
      // Catch possible infinite loop due to invalid minHeight
      if (minHeightAttempts > numDrops * 2) {
        throw new Error(
          'Breaking out of erosion to avoid an infinite loop. Check that minHeight parameter is valid.'
        );
      }

      minHeightAttempts++;
      continue;
    }

    for (let j = 0; j < maxIterations; j++) {
      const nodeX = Math.floor(posX);
      const nodeY = Math.floor(posY);

      // Check bounds
      if (isOutOfBounds(mapWidth, mapHeight, nodeX, nodeY)) {
        break;
      }

      const cellOffsetX = posX - nodeX;
      const cellOffsetY = posY - nodeY;

      // changed this to use posX/Y which might've broken things...
      const { height, gradientX, gradientY } = calculateHeightAndGradient(
        heightMap,
        posX,
        posY
      );

      dirX = dirX * inertia - gradientX * (1 - inertia);
      dirY = dirY * inertia - gradientY * (1 - inertia);

      // Normalize
      const len = Math.sqrt(dirX * dirX + dirY * dirY);
      if (len !== 0) {
        dirX /= len;
        dirY /= len;
      }

      posX += dirX;
      posY += dirY;

      // if not moving
      if (dirX == 0 && dirY == 0) {
        break;
      }

      // if moved outside of bounds
      if (isOutOfBounds(mapWidth, mapHeight, posX, posY)) {
        break;
      }

      const newHeight = calculateHeightAndGradient(
        heightMap,
        posX,
        posY
      ).height;
      const deltaHeight = newHeight - height;

      const sedimentCapacity = Math.max(
        -deltaHeight * speed * water * sedimentCapacityFactor,
        minSedimentCapacity
      );

      // If carrying more than capacity or flowing uphill --> deposit
      if (sediment > sedimentCapacity || deltaHeight > 0) {
        const amountToDeposit =
          deltaHeight > 0
            ? Math.min(deltaHeight, sediment) // basically try to deposit as much as possible if we're going uphill
            : (sediment - sedimentCapacity) *
              depositSpeed *
              depositMap[nodeY][nodeX];
        sediment -= amountToDeposit;

        // Add sediment to the four corners using bilinear interpolation using the offset of the initial point
        heightMap[nodeY][nodeX] +=
          amountToDeposit * (1 - cellOffsetX) * (1 - cellOffsetY);
        heightMap[nodeY][nodeX + 1] +=
          amountToDeposit * cellOffsetX * (1 - cellOffsetY);
        heightMap[nodeY + 1][nodeX] +=
          amountToDeposit * (1 - cellOffsetX) * cellOffsetY;
        heightMap[nodeY + 1][nodeX + 1] +=
          amountToDeposit * cellOffsetX * cellOffsetY;
      } else {
        // Erode
        const amountToErode =
          Math.min((sedimentCapacity - sediment) * erodeSpeed, -deltaHeight) *
          erodeMap[nodeY][nodeX];

        const cellErosionWeights = erosionWeights[nodeY][nodeX];
        cellErosionWeights.forEach(({ x, y, weight }) => {
          const weighedErodeAmount = amountToErode * weight;
          const deltaSediment =
            heightMap[y][x] < amountToErode
              ? heightMap[y][x]
              : weighedErodeAmount;
          heightMap[y][x] -= deltaSediment;
          sediment += deltaSediment;
        });
      }

      // Why does this have to be absolute value of deltaHeight?
      speed = Math.sqrt(speed * speed + Math.abs(deltaHeight) * gravity);
      water *= 1 - evaporateSpeed;
      if (water < 0.0001) {
        console.log('ran out of water');
        break;
      }
    }
  }
}

export function calculateHeightAndGradient(heightMap, posX, posY) {
  const coordX = Math.floor(posX);
  const coordY = Math.floor(posY);

  // Offset inside the cell
  const offsetX = posX - coordX;
  const offsetY = posY - coordY;

  const heightNW = heightMap[coordY][coordX];
  const heightNE = heightMap[coordY][coordX + 1];
  const heightSW = heightMap[coordY + 1][coordX];
  const heightSE = heightMap[coordY + 1][coordX + 1];

  const gradientX =
    (heightNE - heightNW) * (1 - offsetY) + (heightSE - heightSW) * offsetY;
  const gradientY =
    (heightSW - heightNW) * (1 - offsetX) + (heightSE - heightNE) * offsetX;

  const height =
    heightNW * (1 - offsetX) * (1 - offsetY) +
    heightNE * offsetX * (1 - offsetY) +
    heightSW * (1 - offsetX) * offsetY +
    heightSE * offsetX * offsetY;

  return { gradientX, gradientY, height };
}

export const isOutOfBounds = (mapWidth, mapHeight, x, y) => {
  return x < 0 || y < 0 || x > mapWidth - 1 || y > mapHeight - 1;
};

function initializeErosionWeights(width, height, dropRadius) {
  const weights = Array.from(Array(height + 1), () => Array(width + 1).fill(0));

  for (let x = 0; x < width + 1; x++) {
    for (let y = 0; y < height + 1; y++) {
      const erosionWeights = [];
      let erosionWeightSum = 0;

      for (let i = -dropRadius; i <= dropRadius; i++) {
        for (let j = -dropRadius; j <= dropRadius; j++) {
          let cellX = x + i;
          let cellY = y + j;

          // bounds checking
          if (cellX < 0 || cellY < 0) {
            continue;
          }

          if (cellX >= width - 1 || cellY >= height - 1) {
            continue;
          }

          // do nothing if square distance is outside of erosion radius
          const squareDist = i * i + j * j;
          if (squareDist > dropRadius * dropRadius) {
            continue;
          }

          const weight = 1.0 - Math.sqrt(squareDist) / dropRadius;

          erosionWeights.push({
            x: cellX,
            y: cellY,
            weight,
          });
          erosionWeightSum += weight;
        }
      }

      weights[y][x] = erosionWeights.map((entry) => {
        return { ...entry, weight: entry.weight / erosionWeightSum };
      });
    }
  }

  return weights;
}

// In place erosion weight implementation -- slower.
//const erosionWeights = [];
//let erosionWeightSum = 0;
//// not an optimized way to handle weights since they're static per cell given a drop radius.
//for (let m = -dropRadius; m <= dropRadius; m++) {
//  for (let k = -dropRadius; k <= dropRadius; k++) {
//    let coordX = nodeX + m;
//    let coordY = nodeY + k;
//    // bounds checking
//    if (coordX < 0 || coordY < 0) {
//      continue;
//    }
//    if (coordX >= mapWidth - 1 || coordY >= mapHeight - 1) {
//      break;
//    }
//    // do nothing if square distance is outside of erosion radius
//    const squareDist = m * m + k * k;
//    if (squareDist > dropRadius * dropRadius) {
//      continue;
//    }
//    const weight = 1.0 - Math.sqrt(squareDist) / dropRadius;
//    erosionWeights.push({
//      x: coordX,
//      y: coordY,
//      weight,
//    });
//    erosionWeightSum += weight;
//  }
//}

//erosionWeights.forEach(({ x, y, weight }) => {
//  const influence = weight / erosionWeightSum;
//  const amountToErode =
//    Math.min((sedimentCapacity - sediment) * erodeSpeed, -deltaHeight) *
//    erodeMap[y][x] *
//    influence;
//  const deltaSediment =
//    heightMap[y][x] < amountToErode ? heightMap[y][x] : amountToErode;

//  heightMap[y][x] -= deltaSediment;
//  sediment += deltaSediment;
//});
