export interface TreemapItem {
  key: string;
  value: number;
}

/** Position and size as percentages of the container, ready for CSS. */
export interface TreemapRect {
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Scaled extends TreemapItem {
  area: number;
}

/**
 * Squarified treemap (Bruls, Huizing & van Wijk). Returns rectangles in a
 * 0-100 coordinate space on both axes, so the caller can position them with
 * percentages and stay resolution independent.
 */
export function squarify(items: TreemapItem[], gap = 0): TreemapRect[] {
  const positive = items.filter((item) => item.value > 0);
  const total = positive.reduce((sum, item) => sum + item.value, 0);
  if (total === 0) return [];

  const queue: Scaled[] = positive
    .map((item) => ({ ...item, area: (item.value / total) * 10000 }))
    .sort((a, b) => b.area - a.area);

  const box: Box = { x: 0, y: 0, width: 100, height: 100 };
  const out: TreemapRect[] = [];
  let row: Scaled[] = [];

  while (queue.length > 0) {
    const side = Math.min(box.width, box.height);
    const next = queue[0];
    if (row.length === 0 || worst(row, side) >= worst([...row, next], side)) {
      row.push(queue.shift() as Scaled);
    } else {
      layoutRow(row, box, out);
      row = [];
    }
  }
  if (row.length > 0) layoutRow(row, box, out);

  return gap > 0 ? out.map((rect) => inset(rect, gap)) : out;
}

/** Aspect-ratio cost of laying `row` along a side of length `side`. */
function worst(row: Scaled[], side: number): number {
  const sum = row.reduce((total, item) => total + item.area, 0);
  if (sum === 0 || side === 0) return Infinity;
  const max = Math.max(...row.map((item) => item.area));
  const min = Math.min(...row.map((item) => item.area));
  return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
}

/** Place a completed row against the short edge and shrink the free box. */
function layoutRow(row: Scaled[], box: Box, out: TreemapRect[]): void {
  const sum = row.reduce((total, item) => total + item.area, 0);
  const vertical = box.width >= box.height;
  const side = vertical ? box.height : box.width;
  const thickness = sum / side;

  let offset = vertical ? box.y : box.x;
  for (const item of row) {
    const length = item.area / thickness;
    out.push(
      vertical
        ? { key: item.key, x: box.x, y: offset, width: thickness, height: length }
        : { key: item.key, x: offset, y: box.y, width: length, height: thickness },
    );
    offset += length;
  }

  if (vertical) {
    box.x += thickness;
    box.width -= thickness;
  } else {
    box.y += thickness;
    box.height -= thickness;
  }
}

/** Shrink a rectangle to leave a visible surface gap between neighbours. */
function inset(rect: TreemapRect, gap: number): TreemapRect {
  return {
    key: rect.key,
    x: rect.x + gap / 2,
    y: rect.y + gap / 2,
    width: Math.max(rect.width - gap, 0),
    height: Math.max(rect.height - gap, 0),
  };
}
