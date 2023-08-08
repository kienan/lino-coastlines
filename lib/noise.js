import { random } from 'canvas-sketch-util';

// Returns a noise value between -1 and 1.
export function fbm3D(
  x,
  y,
  z,
  {
    scale = 0.02,
    persistence = 0.4,
    octaves = 4,
    amplitude = 1,
    lacunarity = 2,
    turbulence = false,
  } = {}
) {
  let frequency = scale;
  let sumAmp = amplitude;

  let result = 0;
  for (let i = 0; i < octaves; i++) {
    let noise = random.noise3D(x * frequency, y * frequency, z);
    if (turbulence) {
      noise = Math.abs(noise);
    }

    result += noise * amplitude;

    frequency *= lacunarity;
    amplitude *= persistence;
    sumAmp += amplitude;
  }

  return result / sumAmp;
}
