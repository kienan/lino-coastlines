export const getCellIdForThreshold = ([v1, v2, v3, v4], threshold) => {
  const b1 = v1 > threshold ? 8 : 0;
  const b2 = v2 > threshold ? 4 : 0;
  const b3 = v3 > threshold ? 2 : 0;
  const b4 = v4 > threshold ? 1 : 0;

  return b1 + b2 + b3 + b4;
};

export const getLinesForId = (id, n, e, s, w) => {
  if (id === 0 || id === 15) {
    return [];
  }

  const lines = [];
  if (id === 1 || id === 14) {
    lines.push([s, w]);
  } else if (id === 2 || id === 13) {
    lines.push([e, s]);
  } else if (id === 3 || id === 12) {
    lines.push([e, w]);
  } else if (id === 4 || id === 11) {
    lines.push([n, e]);
  } else if (id === 6 || id === 9) {
    lines.push([n, s]);
  } else if (id === 7 || id === 8) {
    lines.push([w, n]);
  } else if (id === 5 || id == 10) {
    lines.push([e, s]);
    lines.push([w, n]);
  }

  return lines;
};

export const getCarvingAndDirectionsForId = (id, n, e, s, w) => {
  // add default empty square?
  //
  let points = [];
  let directions = [];
  let isOnDarkSide = false;
  if (id === 1) {
    points = [s, w];
    directions = [
      [-1, 0],
      [0, 1],
    ];
  } else if (id === 14) {
    points = [s, w];
    directions = [
      [-1, 0],
      [0, 1],
    ];
    isOnDarkSide = true;
  } else if (id === 2 || id === 13) {
    points = [e, s];
    directions = [
      [1, 0],
      [0, 1],
    ];
    isOnDarkSide = true;
  } else if (id === 3 || id === 12) {
    points = [e, w];
    directions = [
      [-1, 0],
      [1, 0],
    ];
  } else if (id === 4) {
    points = [n, e];
    directions = [
      [0, -1],
      [1, 0],
    ];
    isOnDarkSide = true;
  } else if (id === 11) {
    points = [n, e];
    directions = [
      [0, -1],
      [1, 0],
    ];
  } else if (id === 6 || id === 9) {
    points = [n, s];
    directions = [
      [0, -1],
      [0, 1],
    ];
  } else if (id === 7 || id === 8) {
    points = [w, n];
    directions = [
      [-1, 0],
      [0, -1],
    ];
    isOnDarkSide = true;
  } else if (id === 5) {
    points = [e, s];
    directions = [
      [1, 0],
      [0, 1],
    ];
  } else if (id === 10) {
    points = [n, e];
    directions = [
      [1, 0],
      [0, -1],
    ];
    isOnDarkSide = true;
  }

  return {
    points,
    directions,
    isOnDarkSide,
  };
};

export const getFillPointsForId = (id, n, e, s, w, nw, ne, se, sw) => {
  const points = [];
  if (id === 1) {
    points.push(s);
    points.push(w);
    points.push(sw);
  } else if (id === 2) {
    points.push(e);
    points.push(s);
    points.push(se);
  } else if (id === 3) {
    points.push(e);
    points.push(w);
    points.push(sw);
    points.push(se);
  } else if (id === 4) {
    points.push(n);
    points.push(e);
    points.push(ne);
  } else if (id === 5) {
    points.push(e);
    points.push(s);
    points.push(sw);
    points.push(w);
    points.push(n);
    points.push(ne);
  } else if (id === 6) {
    points.push(n);
    points.push(s);
    points.push(se);
    points.push(ne);
  } else if (id === 7) {
    points.push(w);
    points.push(n);
    points.push(ne);
    points.push(se);
    points.push(sw);
  } else if (id === 15) {
    points.push(nw);
    points.push(ne);
    points.push(se);
    points.push(sw);
  } else if (id === 14) {
    points.push(s);
    points.push(w);
    points.push(nw);
    points.push(ne);
    points.push(se);
  } else if (id === 13) {
    points.push(e);
    points.push(s);
    points.push(sw);
    points.push(nw);
    points.push(ne);
  } else if (id === 12) {
    points.push(e);
    points.push(w);
    points.push(nw);
    points.push(ne);
  } else if (id === 11) {
    points.push(n);
    points.push(e);
    points.push(se);
    points.push(sw);
    points.push(nw);
  } else if (id === 10) {
    points.push(e);
    points.push(se);
    points.push(s);
    points.push(w);
    points.push(nw);
    points.push(n);
  } else if (id === 9) {
    points.push(n);
    points.push(s);
    points.push(sw);
    points.push(nw);
  } else if (id === 8) {
    points.push(w);
    points.push(n);
    points.push(nw);
  }

  return points;
};
