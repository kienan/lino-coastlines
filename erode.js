import { random, math } from 'canvas-sketch-util';

const { lerp } = math;

// Author: Nathaniel Sarkissian
// Date: July 8, 2022
// This file, and all other files in this
// project are covered by the license
// described in LICENSE.txt.

// Hydraulic erosion is a relatively well known idea in terrain generation. This
// implementation started with Sebastian Lague's Unity/C# implementation. Other
// than porting it to JavaScript and adapting it to the data structures I had in
// place for this project, I modified somewhat significantly. I removed the
// erosion brush concept. I modified the scale of a few of the parameters such
// as sediment capacity, erosion speed, deposit speed, etc. I added
// functionality to carry the color of the sediment in the rain drops in order
// to cause the terrain to be colored by the erosion effect.

export function erode(
  heightMap,
  erodeMap,
  depositMap,
  { numDrops, minHeight, dropRadius, inertia } = {}
) {
  // Height map is expected to be an array of rows.
  const mapWidth = heightMap[0].length;
  const mapHeight = heightMap.length;

  const length = random.range(0.5, 2);
  const maxIterations = 60; /// * length;
  const initSpeed = 1;
  const initWaterVolume = 1;

  const sedimentCapacityFactor = 8;
  const minSedimentCapacity = 0.01;
  const depositSpeed = 1.0;
  const erodeSpeed = 1.0;
  const gravity = 9.8;
  const evaporateSpeed = 0.01;

  let minHeightAttempts = 0;

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

    const useExtraCoastalErosion = true; //random.chance(0.4);

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

      // if carrying more than capacity or flowing uphill --> deposit
      // what if instead of going uphill, we deposited if our speed got close to 0?
      // changed from vector.mag to len which might not be the same thing?
      //len < 0.001
      //p|| len < 0.01
      // || len < 0.001
      //console.log('height', height);
      //console.log('new height', newHeight);
      //console.log('delta height', deltaHeight);
      if (
        sediment > sedimentCapacity ||
        deltaHeight > 0 //||
      ) {
        //console.log('depositing');
        //console.log(
        //'bc more sediment than can carry',
        //  sediment > sedimentCapacity
        //);
        // when depositing, manybe it should be more spread out the slower/flatter the terrain?

        // can we modify to deposit more when it's flatter?
        //console.log('sediment capacity', sedimentCapacity);
        //console.log('sediment', sediment);
        // We could get a negative deposit amouhnt if we had the third check and didn't update the `deltaHeight > 0` check here...
        // Does highlight how having selective high erosion areas can be really nice/appealing...
        const amountToDeposit =
          deltaHeight > 0
            ? Math.min(deltaHeight, sediment) // basically try to deposit as much as possible if we're going uphill
            : //: // : (sediment - sedimentCapacity) * depositSpeed * 0.001 * depositFactor;
              //deltaHeight > -0.01
              //? sediment * depositSpeed
              (sediment - sedimentCapacity) * depositSpeed; //* depositMap[_nodeY][_nodeX];
        //depositSpeed * (-deltaHeight * 100); /// *
        sediment -= amountToDeposit;
        //console.log('amount to deposit', amountToDeposit);

        // add sediment to the four corners using bilinear interpolation using the offset of the initial point
        heightMap[nodeY][nodeX] +=
          amountToDeposit * (1 - cellOffsetX) * (1 - cellOffsetY);
        heightMap[nodeY][nodeX + 1] +=
          amountToDeposit * cellOffsetX * (1 - cellOffsetY);
        heightMap[nodeY + 1][nodeX] +=
          amountToDeposit * (1 - cellOffsetX) * cellOffsetY;
        heightMap[nodeY + 1][nodeX + 1] +=
          amountToDeposit * cellOffsetX * cellOffsetY;
      } else if (
        useExtraCoastalErosion &&
        deltaHeight > -0.01 &&
        newHeight < 0.1
      ) {
        // Special fake deposit case to more intensely erode land that's close to the ocean height.
        const amountToDeposit =
          (sediment - sedimentCapacity) * depositSpeed * 0.5;
        // This value will be negative, so we subtract here.
        sediment -= amountToDeposit;

        // add sediment to the four corners using bilinear interpolation using the offset of the initial point
        heightMap[nodeY][nodeX] +=
          amountToDeposit * (1 - cellOffsetX) * (1 - cellOffsetY);
        heightMap[nodeY][nodeX + 1] +=
          amountToDeposit * cellOffsetX * (1 - cellOffsetY);
        heightMap[nodeY + 1][nodeX] +=
          amountToDeposit * (1 - cellOffsetX) * cellOffsetY;
        heightMap[nodeY + 1][nodeX + 1] +=
          amountToDeposit * cellOffsetX * cellOffsetY;
      } else {
        // erode
        const erosionWeights = [];
        let erosionWeightSum = 0;
        // not an optimized way to handle weights since they're static per cell given a drop radius.
        for (let m = -dropRadius; m <= dropRadius; m++) {
          for (let k = -dropRadius; k <= dropRadius; k++) {
            let coordX = nodeX + m;
            let coordY = nodeY + k;
            // bounds checking
            if (coordX < 0 || coordY < 0) {
              continue;
            }
            if (coordX >= mapWidth - 1 || coordY >= mapHeight - 1) {
              break;
            }
            // do nothing if square distance is outside of erosion radius
            const squareDist = m * m + k * k;
            if (squareDist > dropRadius * dropRadius) {
              continue;
            }
            const weight = 1.0 - Math.sqrt(squareDist) / dropRadius;
            erosionWeights.push({
              x: coordX,
              y: coordY,
              weight,
            });
            erosionWeightSum += weight;
          }
        }

        erosionWeights.forEach(({ x, y, weight }) => {
          const influence = weight / erosionWeightSum;
          const amountToErode =
            Math.min((sedimentCapacity - sediment) * erodeSpeed, -deltaHeight) *
            erodeMap[y][x] *
            influence;
          const deltaSediment =
            heightMap[y][x] < amountToErode ? heightMap[y][x] : amountToErode;

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

export const isOutOfBounds = (mapWidth, mapHeight, x, y) => {
  return x < 0 || y < 0 || x > mapWidth - 1 || y > mapHeight - 1;
};

// Put this in the top-level erosion function if initializing first.
//const erosionWeights = initializeErosionWeights(mapWidth, mapHeight, dropRadius);
//
// Put this in the erosion section if initializing first
// Not currently using this because we're only using brush widths once.

//const cellErosionWeights = erosionWeights[nodeY][nodeX];

//cellErosionWeights.forEach(({ x, y, weight }) => {
//  const amountToErode =
//    Math.min((sedimentCapacity - sediment) * erodeSpeed, -deltaHeight) *
//    erodeMap[y][x] *
//    weight;
//  const deltaSediment =
//    heightMap[y][x] < amountToErode ? heightMap[y][x] : amountToErode;
//  heightMap[y][x] -= deltaSediment;
//  sediment += deltaSediment;
//});

//function initializeErosionWeights(width, height, dropRadius) {
//  const weights = Array.from(Array(height + 1), () => Array(width + 1).fill(0));
//
//  for (let x = 0; x < width + 1; x++) {
//    for (let y = 0; y < height + 1; y++) {
//      const erosionWeights = [];
//      let erosionWeightSum = 0;
//
//      for (let i = -dropRadius; i <= dropRadius; i++) {
//        for (let j = -dropRadius; j <= dropRadius; j++) {
//          let cellX = x + i;
//          let cellY = y + j;
//
//          // bounds checking
//          if (cellX < 0 || cellY < 0) {
//            continue;
//          }
//
//          if (cellX >= width - 1 || cellY >= height - 1) {
//            continue;
//          }
//
//          // do nothing if square distance is outside of erosion radius
//          const squareDist = i * i + j * j;
//          if (squareDist > dropRadius * dropRadius) {
//            continue;
//          }
//
//          const weight = 1.0 - Math.sqrt(squareDist) / dropRadius;
//
//          erosionWeights.push({
//            x: cellX,
//            y: cellY,
//            weight,
//          });
//          erosionWeightSum += weight;
//        }
//      }
//
//      weights[y][x] = erosionWeights.map((entry) => {
//        return { ...entry, weight: entry.weight / erosionWeightSum };
//      });
//    }
//  }
//
//  return weights;
//}
