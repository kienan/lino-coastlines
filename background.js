import { random } from 'canvas-sketch-util';

const createNoisyTransparency = (
  noisyImg,
  canvasWidth,
  canvasHeight,
  paperColor
) => {
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = canvasWidth;
  tempCanvas.height = canvasHeight;
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.putImageData(noisyImg, 0, 0);

  tempCtx.fillStyle = tempCtx.createLinearGradient(0, 0, 0, canvasHeight);
  tempCtx.fillStyle.addColorStop(0.0, `${paperColor}08`);
  tempCtx.fillStyle.addColorStop(0.5, `${paperColor}32`);
  tempCtx.fillStyle.addColorStop(1.0, `${paperColor}08`);

  // apply transparency gradient on noise (dim top)
  tempCtx.globalCompositeOperation = 'destination-in';
  tempCtx.fillRect(0, 0, canvasWidth, canvasHeight);

  // apply black of the gradient on noise (darken bottom)
  tempCtx.globalCompositeOperation = 'multiply';
  tempCtx.fillRect(0, 0, canvasWidth, canvasHeight);

  return tempCanvas;
};

export const prepareBackgroundInputs = (canvasWidth, canvasHeight) => {
  const gradientNoise = Uint32Array.from(
    { length: 4 * canvasWidth * canvasHeight },
    () => (random.chance(0.5) ? 0xff000000 : 0)
  );
  const gradientNoiseData = new ImageData(
    new Uint8ClampedArray(gradientNoise.buffer),
    canvasWidth * 2,
    canvasHeight * 2
  );

  const transparencyNoise = Uint32Array.from(
    { length: 4 * canvasWidth * canvasHeight },
    () => (random.chance(0.5) ? 0xff000000 : 0)
  );
  const transparencyNoiseData = new ImageData(
    new Uint8ClampedArray(transparencyNoise.buffer),
    canvasWidth * 2,
    canvasHeight * 2
  );

  const shouldUseSolid = random.chance(0.2);

  return { gradientNoiseData, transparencyNoiseData, shouldUseSolid };
};

export const drawBackground = (
  context,
  { gradientNoiseData, transparencyNoiseData, shouldUseSolid },
  { width, height },
  palette
) => {
  if (shouldUseSolid) {
    context.fillStyle = palette.bottom;
    context.fillRect(0, 0, width, height);
  } else {
    // apply a noisey gradient to the canvas
    context.putImageData(gradientNoiseData, 0, 0);
    context.fillStyle = context.createLinearGradient(0, 0, 0, height);
    context.fillStyle.addColorStop(0.4, 'transparent');
    context.fillStyle.addColorStop(0.6, 'black');
    // apply transparency gradient on noise (dim top)
    context.globalCompositeOperation = 'destination-in';
    context.fillRect(0, 0, width, height);
    // apply black of the gradient on noise (darken bottom)
    context.globalCompositeOperation = 'multiply';
    context.fillRect(0, 0, width, height);
    // color the bottom of the gradient
    context.globalCompositeOperation = 'source-atop';
    context.fillStyle = palette.bottom;
    context.fillRect(0, 0, width, height);
    // color the top of the gradient
    context.globalCompositeOperation = 'destination-over';
    context.fillStyle = palette.top;
    context.fillRect(0, 0, width, height);
  }

  // apply additional noisey blur
  const noisyTransparency = createNoisyTransparency(
    transparencyNoiseData,
    context.canvas.width,
    context.canvas.height,
    palette.paper
  );

  context.globalCompositeOperation = 'source-atop';
  context.drawImage(noisyTransparency, 0, 0, width, height);
};

export const crop = (context, svg, { bleed }) => {
  // Note: svg should be the same width and height as the sketch's width and height settings.
  context.globalCompositeOperation = 'destination-in';
  context.drawImage(svg, bleed, bleed);
};
