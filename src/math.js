export function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

export function clampSigned(value) {
  return Math.max(-1, Math.min(1, Number(value) || 0));
}

export function clampInt(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

export function ratioDistance(a, b, c, d) {
  const numerator = distance(a, b);
  const denominator = distance(c, d);
  return denominator > 0 ? numerator / denominator : 0;
}

export function distance(a, b) {
  if (!a || !b) return 0;
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = (a.z || 0) - (b.z || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function averagePoint(points) {
  const count = points.length || 1;
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / count,
    y: points.reduce((sum, point) => sum + point.y, 0) / count
  };
}

export function averageNumber(values) {
  const numbers = values.filter((value) => Number.isFinite(Number(value)));
  if (numbers.length === 0) return null;
  return numbers.reduce((sum, value) => sum + Number(value), 0) / numbers.length;
}

export function averageFeature(features, key, digits) {
  const average = averageNumber(features.map((item) => item[key]));
  return average === null ? null : Number(average.toFixed(digits));
}

export function dayPeriod(hour) {
  if (hour < 5) return "night";
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 22) return "evening";
  return "night";
}

export function localIsoString(date) {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const offset = `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
  const local = new Date(date.getTime() + offsetMinutes * 60_000).toISOString().slice(0, 19);
  return `${local}${offset}`;
}

export function scoreOf(scores, key) {
  return Number(scores?.[key] || 0);
}

export function averageScores(scores, keys) {
  if (!keys.length) return 0;
  return keys.reduce((sum, key) => sum + scoreOf(scores, key), 0) / keys.length;
}

export function boundingBox(points) {
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function numberOrNull(value, digits) {
  return Number.isFinite(Number(value)) ? Number(Number(value).toFixed(digits)) : null;
}

export function formatJson(value) {
  return JSON.stringify(value, null, 2);
}

export function labelFor(key) {
  return key.replace(/[A-Z]/g, (match) => ` ${match.toLowerCase()}`).replace(/^./, (match) => match.toUpperCase());
}

export function titleCase(value) {
  return String(value).replace(/_/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

export function inferStep(min, max) {
  const range = Math.abs(max - min);
  if (range <= 2) return 0.01;
  if (range <= 20) return 0.1;
  return 1;
}

export function radiansToDegrees(value) {
  return value * 180 / Math.PI;
}

export function shortId(value) {
  const text = String(value);
  return text.length > 14 ? `${text.slice(0, 8)}...${text.slice(-4)}` : text;
}

export function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
