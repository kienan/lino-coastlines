// Vector functions taken from @piterpasma
// https://twitter.com/piterpasma/status/1687401193826381824
export const length = (x, y, z = 0) => (x * x + y * y + z * z) ** 0.5; // length
export const normalize = ([x, y, z = 0]) => {
  const m = 1e-99 + (x * x + y * y + z * z) ** 0.5;
  return [x / m, y / m, z / m];
}; // normalize + save length in m
export const dot = ([x, y, z = 0], [a, b, c = 0]) => x * a + y * b + z * c; // dot product
export const addMul = ([x = 0, y = 0, z = 0], [a, b, c = 0], t = 1) => [
  x + a * t,
  y + b * t,
  z + c * t,
]; // addmul
