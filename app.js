'use strict';

// ============================================================
// STATE
// ============================================================

const state = {
  charType: 'output',
  series: [],
  activeSeriesId: null,
  approxType: 'spline',
  approxResults: {},
  chart: null
};

const COLORS = [
  '#2563EB', '#DC2626', '#16A34A', '#D97706',
  '#7C3AED', '#0891B2', '#DB2777', '#059669'
];

const CFG = {
  output: {
    xLabel: 'U_CE, В', yLabel: 'I_C, мА',
    xHeader: 'U_CE (В)', yHeader: 'I_C (мА)',
    paramLabel: 'I_B, мкА', hasSeries: true,
    chartTitle: 'Вихідна ВАХ'
  },
  input: {
    xLabel: 'U_BE, В', yLabel: 'I_B, мкА',
    xHeader: 'U_BE (В)', yHeader: 'I_B (мкА)',
    paramLabel: '', hasSeries: false,
    chartTitle: 'Вхідна ВАХ'
  }
};

// ============================================================
// INITIALIZATION
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  loadState();

  if (state.series.length === 0) createInitialSeries();
  if (!state.activeSeriesId && state.series.length > 0) {
    state.activeSeriesId = state.series[0].id;
  }

  refreshUI();
  initChart();

  document.getElementById('inp-x').addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const iy = document.getElementById('inp-y');
      iy.focus(); iy.select();
    }
  });
  document.getElementById('inp-y').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addPoint(); }
  });
});

function createInitialSeries() {
  if (state.charType === 'output') {
    addSeriesData(10); addSeriesData(20); addSeriesData(40);
  } else {
    const id = genId();
    state.series.push({ id, label: 'Вхідна', paramValue: null, points: [] });
    state.activeSeriesId = id;
  }
}

function addSeriesData(paramValue) {
  const id = genId();
  const label = 'I_B = ' + paramValue + ' мкА';
  state.series.push({ id, label, paramValue, points: [] });
  if (!state.activeSeriesId) state.activeSeriesId = id;
}

// ============================================================
// TAB NAVIGATION
// ============================================================

function switchTab(tab, btn) {
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('pane-' + tab).classList.add('active');

  if (btn) {
    btn.classList.add('active');
  } else {
    const found = document.querySelector(`.nav-btn[onclick*="'${tab}'"]`);
    if (found) found.classList.add('active');
  }

  if (tab === 'graph') {
    setTimeout(() => {
      if (!state.chart) initChart();
      else state.chart.resize();
      renderChart();
      renderPointsBelowGraph();
      renderSuggestedIntermediatePoints();
      renderMeasurementPlanCard();
    }, 40);
  }
  if (tab === 'analysis') renderAnalysis();
}

// ============================================================
// CHARACTERISTIC TYPE TOGGLE
// ============================================================

function setCharType(type) {
  if (state.charType === type) return;
  state.charType = type;
  state.series = [];
  state.activeSeriesId = null;
  state.approxResults = {};

  document.getElementById('btn-input').classList.toggle('active', type === 'input');
  document.getElementById('btn-output').classList.toggle('active', type === 'output');

  createInitialSeries();
  refreshUI();

  if (state.chart) {
    const cfg = CFG[state.charType];
    state.chart.options.scales.x.title.text = cfg.xLabel;
    state.chart.options.scales.y.title.text = cfg.yLabel;
    state.chart.data.datasets = [];
    state.chart.update();
  }
  saveState();
}

// ============================================================
// SERIES MANAGEMENT
// ============================================================

function addSeries() {
  const inp = document.getElementById('series-param-input');
  const val = parseFloat(inp.value);
  if (isNaN(val)) { showToast('Введіть значення I_B'); inp.focus(); return; }
  const id = genId();
  state.series.push({ id, label: 'I_B = ' + val + ' мкА', paramValue: val, points: [] });
  state.activeSeriesId = id;
  inp.value = '';
  refreshSeriesChips(); refreshPointsTable();
  saveState(); showToast('Криву додано');
}

function selectSeries(id) {
  state.activeSeriesId = id;
  refreshSeriesChips(); refreshPointsTable();
  renderMeasurementPlanCard();
}

function deleteSeries(id, e) {
  e.stopPropagation();
  if (state.series.length <= 1) { showToast('Неможливо видалити останню криву'); return; }
  state.series = state.series.filter(s => s.id !== id);
  delete state.approxResults[id];
  if (state.activeSeriesId === id) state.activeSeriesId = state.series[0].id;
  refreshSeriesChips(); refreshPointsTable();
  saveState();
}

function getActiveSeries() {
  return state.series.find(s => s.id === state.activeSeriesId) || null;
}

// ============================================================
// POINT MANAGEMENT
// ============================================================

function addPoint() {
  const xRaw = document.getElementById('inp-x').value.trim();
  const yRaw = document.getElementById('inp-y').value.trim();
  if (xRaw === '' || yRaw === '') { showToast('Заповніть обидва поля'); return; }
  const xVal = parseFloat(xRaw);
  const yVal = parseFloat(yRaw);
  if (isNaN(xVal) || isNaN(yVal)) { showToast('Некоректні числа'); return; }

  let series = getActiveSeries();
  if (!series) { showToast('Виберіть або додайте криву'); return; }

  series.points.push({ x: xVal, y: yVal });
  series.points.sort((a, b) => a.x - b.x);
  delete state.approxResults[series.id];

  document.getElementById('inp-x').value = '';
  document.getElementById('inp-y').value = '';
  document.getElementById('inp-x').focus();

  refreshPointsTable();
  saveState();
  showToast('Точку ' + series.points.length + ' додано');
}

function deletePoint(seriesId, idx) {
  const series = state.series.find(s => s.id === seriesId);
  if (!series) return;
  series.points.splice(idx, 1);
  delete state.approxResults[seriesId];
  refreshPointsTable();
  renderPointsBelowGraph();
  saveState();
}

function clearPoints() {
  const series = getActiveSeries();
  if (!series || series.points.length === 0) { showToast('Немає точок для очищення'); return; }
  if (!confirm('Очистити всі точки кривої "' + series.label + '"?')) return;
  series.points = [];
  delete state.approxResults[series.id];
  refreshPointsTable();
  saveState();
}

// ============================================================
// APPROXIMATION
// ============================================================

function runApproximation() {
  const type = document.getElementById('sel-approx').value;
  state.approxType = type;
  let computed = 0;

  state.series.forEach(series => {
    if (series.points.length < 2) return;
    const result = computeApprox(series.points, type);
    if (result) { state.approxResults[series.id] = result; computed++; }
  });

  if (computed === 0) {
    if (type === 'none') {
      state.approxResults = {};
      renderChart();
      renderPointsBelowGraph();
      showToast('Апроксимацію відключено');
    } else {
      showToast('Потрібно мінімум 2 точки для апроксимації');
    }
    return;
  }

  renderChart();
  renderPointsBelowGraph();
  renderSuggestedIntermediatePoints();
  renderMeasurementPlanCard();
  renderAnalysis();
  saveState();
  showToast('Апроксимацію побудовано');
}

function computeApprox(rawPoints, type) {
  const points = [...rawPoints].sort((a, b) => a.x - b.x);
  if (points.length < 2 || type === 'none') return null;

  const xMin = points[0].x;
  const xMax = points[points.length - 1].x;
  const numCurve = Math.max(300, points.length * 15);

  let evalFn;

  try {
    if (type === 'spline') {
      evalFn = points.length === 2
        ? x => linearInterp(points, x)
        : (() => { const spl = buildCubicSpline(points); return x => evalCubicSpline(spl, x); })();

    } else if (type === 'poly2' || type === 'poly3' || type === 'poly4') {
      const deg = Math.min(parseInt(type.slice(4)), points.length - 1);
      const coeffs = polynomialFit(points, deg);
      evalFn = x => polyEval(coeffs, x);

    } else if (type === 'exp') {
      const posPoints = points.filter(p => p.y > 0);
      if (posPoints.length < 2) {
        const spl = buildCubicSpline(points);
        evalFn = x => evalCubicSpline(spl, x);
      } else {
        const logPts = posPoints.map(p => ({ x: p.x, y: Math.log(p.y) }));
        const coeffs = polynomialFit(logPts, 1);
        const a = Math.exp(coeffs[0]), b = coeffs[1];
        evalFn = x => a * Math.exp(b * x);
      }
    }
  } catch (err) {
    console.error('Approximation error:', err);
    return null;
  }

  // Build smooth curve with denser sampling in the region where data points cluster.
  // Determine the "dense" region using 10th-90th percentile of X values.
  const p10x = points[Math.max(0, Math.floor(points.length * 0.1))].x;
  const p90x = points[Math.min(points.length - 1, Math.ceil(points.length * 0.9))].x;
  const denseRange = p90x - p10x;
  const totalRange = xMax - xMin;
  // If dense range < 20% of total range, allocate 80% of curve points to the dense region.
  const useDenseSampling = totalRange > 0 && denseRange < totalRange * 0.4;

  const curve = [];
  if (useDenseSampling) {
    const nDense = Math.round(numCurve * 0.75);
    const nSparse = numCurve - nDense;
    // Sparse: xMin to p10x and p90x to xMax
    const nLeft  = Math.round(nSparse * (p10x - xMin) / (totalRange - denseRange + 1e-12));
    const nRight = nSparse - nLeft;
    const addSegment = (x0, x1, n) => {
      for (let i = 0; i <= n; i++) {
        const x = x0 + (x1 - x0) * (i / Math.max(n, 1));
        const y = evalFn(x);
        if (isFinite(y) && !isNaN(y)) curve.push({ x, y });
      }
    };
    if (nLeft > 0)  addSegment(xMin, p10x, nLeft);
    addSegment(p10x, p90x, nDense);
    if (nRight > 0) addSegment(p90x, xMax, nRight);
  } else {
    for (let i = 0; i <= numCurve; i++) {
      const x = xMin + (xMax - xMin) * (i / numCurve);
      const y = evalFn(x);
      if (isFinite(y) && !isNaN(y)) curve.push({ x, y });
    }
  }

  // Residuals and metrics
  const residuals = points.map(p => {
    const predicted = evalFn(p.x);
    return { x: p.x, actual: p.y, predicted, residual: p.y - predicted };
  });

  const n = residuals.length;
  const rmse = Math.sqrt(residuals.reduce((s, r) => s + r.residual ** 2, 0) / n);
  const mae  = residuals.reduce((s, r) => s + Math.abs(r.residual), 0) / n;
  const maxErr = Math.max(...residuals.map(r => Math.abs(r.residual)));

  const yMean = points.reduce((s, p) => s + p.y, 0) / n;
  const ssTot = points.reduce((s, p) => s + (p.y - yMean) ** 2, 0);
  const ssRes = residuals.reduce((s, r) => s + r.residual ** 2, 0);
  const r2 = ssTot > 1e-15 ? Math.max(0, 1 - ssRes / ssTot) : 1;

  // Cross-validation R² (leave-one-out, only for small datasets)
  let cvR2 = null;
  if (n >= 4 && n <= 25 && type !== 'none') {
    cvR2 = computeCrossValidation(points, type);
  }

  const suggestions = computeSuggestions(points, evalFn);

  return { type, curve, residuals, rmse, mae, maxErr, r2, cvR2, suggestions, evalFn };
}

// ============================================================
// MATH: LINEAR INTERPOLATION
// ============================================================

function linearInterp(points, x) {
  if (x <= points[0].x) return points[0].y;
  if (x >= points[points.length - 1].x) return points[points.length - 1].y;
  for (let i = 0; i < points.length - 1; i++) {
    if (x >= points[i].x && x <= points[i + 1].x) {
      const t = (x - points[i].x) / (points[i + 1].x - points[i].x);
      return points[i].y + t * (points[i + 1].y - points[i].y);
    }
  }
  return points[points.length - 1].y;
}

// ============================================================
// MATH: CUBIC SPLINE
// ============================================================

function buildCubicSpline(points) {
  const n = points.length;
  const x = points.map(p => p.x);
  const y = points.map(p => p.y);
  const h = [];
  for (let i = 0; i < n - 1; i++) h[i] = x[i + 1] - x[i];

  const lo = new Array(n).fill(0);
  const di = new Array(n).fill(0);
  const up = new Array(n).fill(0);
  const rh = new Array(n).fill(0);

  di[0] = 1; di[n - 1] = 1;
  for (let i = 1; i < n - 1; i++) {
    lo[i] = h[i - 1];
    di[i] = 2 * (h[i - 1] + h[i]);
    up[i] = h[i];
    rh[i] = 3 * ((y[i + 1] - y[i]) / h[i] - (y[i] - y[i - 1]) / h[i - 1]);
  }

  const M = solveTridiag(lo, di, up, rh);
  return { x, y, h, M };
}

function solveTridiag(a, b, c, d) {
  const n = b.length;
  const w = [...b], g = [...d];
  for (let i = 1; i < n; i++) {
    if (Math.abs(w[i - 1]) < 1e-15) continue;
    const m = a[i] / w[i - 1];
    w[i] -= m * c[i - 1];
    g[i] -= m * g[i - 1];
  }
  const x = new Array(n).fill(0);
  x[n - 1] = w[n - 1] !== 0 ? g[n - 1] / w[n - 1] : 0;
  for (let i = n - 2; i >= 0; i--) {
    x[i] = w[i] !== 0 ? (g[i] - c[i] * x[i + 1]) / w[i] : 0;
  }
  return x;
}

function evalCubicSpline(spline, t) {
  const { x, y, h, M } = spline;
  const n = x.length;
  if (t <= x[0]) return y[0];
  if (t >= x[n - 1]) return y[n - 1];

  let lo = 0, hi = n - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (x[mid] <= t) lo = mid; else hi = mid - 1;
  }
  const i = lo;
  const dx = t - x[i];
  const a = y[i];
  const b = (y[i + 1] - y[i]) / h[i] - h[i] * (2 * M[i] + M[i + 1]) / 3;
  const cc = M[i];
  const dd = (M[i + 1] - M[i]) / (3 * h[i]);
  return a + dx * (b + dx * (cc + dx * dd));
}

// ============================================================
// MATH: POLYNOMIAL REGRESSION
// ============================================================

function polynomialFit(points, degree) {
  const n = points.length, m = degree + 1;
  const A = points.map(p => Array.from({ length: m }, (_, j) => Math.pow(p.x, j)));

  const ATA = Array.from({ length: m }, () => new Array(m).fill(0));
  for (let i = 0; i < m; i++)
    for (let j = 0; j < m; j++)
      for (let k = 0; k < n; k++) ATA[i][j] += A[k][i] * A[k][j];

  const ATy = new Array(m).fill(0);
  for (let i = 0; i < m; i++)
    for (let k = 0; k < n; k++) ATy[i] += A[k][i] * points[k].y;

  return gaussElim(ATA, ATy);
}

function gaussElim(A, b) {
  const n = b.length;
  const aug = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row;
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    if (Math.abs(aug[col][col]) < 1e-14) continue;
    for (let row = col + 1; row < n; row++) {
      const f = aug[row][col] / aug[col][col];
      for (let j = col; j <= n; j++) aug[row][j] -= f * aug[col][j];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = aug[i][n];
    for (let j = i + 1; j < n; j++) x[i] -= aug[i][j] * x[j];
    if (Math.abs(aug[i][i]) > 1e-14) x[i] /= aug[i][i];
  }
  return x;
}

function polyEval(coeffs, x) {
  // Horner's method
  let r = 0;
  for (let i = coeffs.length - 1; i >= 0; i--) r = r * x + coeffs[i];
  return r;
}

// ============================================================
// MATH: CROSS-VALIDATION (leave-one-out)
// ============================================================

function computeCrossValidation(points, type) {
  if (points.length < 4) return null;
  const yMean = points.reduce((s, p) => s + p.y, 0) / points.length;
  const ssTot = points.reduce((s, p) => s + (p.y - yMean) ** 2, 0);
  if (ssTot < 1e-15) return 1;

  let ssErr = 0;
  for (let i = 0; i < points.length; i++) {
    const train = points.filter((_, j) => j !== i);
    if (train.length < 2) continue;
    const res = computeApprox(train, type);
    if (!res || !res.evalFn) continue;
    const pred = res.evalFn(points[i].x);
    if (isFinite(pred)) ssErr += (points[i].y - pred) ** 2;
  }
  return Math.max(0, 1 - ssErr / ssTot);
}

// ============================================================
// SUGGESTIONS: WHERE TO MEASURE NEXT
// ============================================================

function computeSuggestions(points, evalFn) {
  if (points.length < 3) return [];
  const suggestions = [];
  const xRange = points[points.length - 1].x - points[0].x;
  const avgSpan = xRange / (points.length - 1);

  const intervals = [];
  for (let i = 0; i < points.length - 1; i++) {
    const xMid = (points[i].x + points[i + 1].x) / 2;
    const dx = (points[i + 1].x - points[i].x) * 0.05 + 1e-8;
    const ym = evalFn(xMid), yp = evalFn(xMid + dx), yn = evalFn(xMid - dx);
    const d1y = (yp - yn) / (2 * dx);
    const d2y = (yp - 2 * ym + yn) / (dx * dx);
    const curvature = Math.abs(d2y) / Math.pow(1 + d1y * d1y, 1.5);
    intervals.push({ x1: points[i].x, x2: points[i + 1].x, xMid, span: points[i + 1].x - points[i].x, curvature });
  }

  const maxCurv = Math.max(...intervals.map(v => v.curvature));
  [...intervals]
    .filter(iv => iv.curvature >= maxCurv * 0.3 && iv.curvature > 1e-6)
    .sort((a, b) => b.curvature - a.curvature)
    .slice(0, 4)
    .forEach(iv => suggestions.push({
      type: 'curvature', xMid: iv.xMid, x1: iv.x1, x2: iv.x2,
      curvature: iv.curvature, priority: iv.curvature > maxCurv * 0.7 ? 'high' : 'normal'
    }));

  intervals.forEach(iv => {
    if (iv.span > 2 * avgSpan && !suggestions.some(s => Math.abs(s.xMid - iv.xMid) < iv.span * 0.4)) {
      suggestions.push({ type: 'gap', xMid: iv.xMid, x1: iv.x1, x2: iv.x2, curvature: 0, priority: 'gap' });
    }
  });

  return suggestions;
}

// ============================================================
// CHART
// ============================================================

function initChart() {
  const canvas = document.getElementById('chart-canvas');
  const cfg = CFG[state.charType];
  if (state.chart) { state.chart.destroy(); state.chart = null; }

  state.chart = new Chart(canvas, {
    type: 'scatter',
    data: { datasets: [] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 250 },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const x = ctx.parsed.x, y = ctx.parsed.y;
              const xf = Math.abs(x) < 0.01 ? x.toExponential(3) : x.toFixed(4);
              const yf = Math.abs(y) < 0.01 ? y.toExponential(3) : y.toFixed(4);
              return `(${xf}, ${yf})`;
            }
          }
        }
      },
      onClick: (event, _elements, chart) => {
        onChartClick(event, chart);
      },
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: cfg.xLabel, font: { size: 12, weight: '500' } },
          grid: { color: '#F1F5F9' },
          ticks: { font: { size: 11 } }
        },
        y: {
          type: 'linear',
          title: { display: true, text: cfg.yLabel, font: { size: 12, weight: '500' } },
          grid: { color: '#F1F5F9' },
          ticks: { font: { size: 11 } }
        }
      }
    }
  });
}

function onChartClick(event, chart) {
  const rect = chart.canvas.getBoundingClientRect();
  const x = event.native ? event.native.clientX - rect.left : 0;
  const y = event.native ? event.native.clientY - rect.top  : 0;

  const dataX = chart.scales.x.getValueForPixel(x);
  const dataY = chart.scales.y.getValueForPixel(y);

  if (dataX === undefined || dataY === undefined) return;

  // Round to 4 significant figures
  const xVal = parseFloat(dataX.toPrecision(4));

  // Try to get expected Y from approximation for the active series
  const series = getActiveSeries();
  let expectedY = null;
  if (series && state.approxResults[series.id]) {
    const approxY = state.approxResults[series.id].evalFn(xVal);
    if (isFinite(approxY)) expectedY = parseFloat(approxY.toPrecision(4));
  }

  // Pre-fill X field
  document.getElementById('inp-x').value = xVal;

  // Switch to data tab so user can enter Y
  switchTab('data', null);

  // Focus Y input
  setTimeout(() => {
    const iy = document.getElementById('inp-y');
    iy.focus(); iy.select();
  }, 80);

  const hint = expectedY !== null
    ? 'X=' + xVal + ' готово. Очікуване Y\u2248' + expectedY
    : 'X=' + xVal + ' готово. Введіть виміряне Y';
  showToast(hint);
}

// Compute a "nice" axis tick step targeting ~10 visible ticks for the given range.
function calcNiceStep(range) {
  if (range <= 0) return 0.1;
  const raw = range / 10;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  if (norm <= 1) return mag;
  if (norm <= 2) return 2 * mag;
  if (norm <= 5) return 5 * mag;
  return 10 * mag;
}

// Update chart axis scales based on actual data bounds.
// Uses the "dense" X range (10th-90th percentile) to determine tick step,
// so a few far-out points don't force coarse ticks on the main data region.
function updateChartScales() {
  if (!state.chart) return;
  const allX = [], allY = [];

  state.series.forEach(s => s.points.forEach(p => {
    allX.push(p.x);
    allY.push(p.y);
  }));

  // Also include approximation curve endpoints for Y scaling
  state.series.forEach(s => {
    const res = state.approxResults[s.id];
    if (res && res.curve.length) {
      res.curve.forEach(p => allY.push(p.y));
    }
  });

  if (allX.length === 0) return;

  allX.sort((a, b) => a - b);
  allY.sort((a, b) => a - b);

  const xMin = allX[0];
  const xMax = allX[allX.length - 1];
  const yMin = allY[0];
  const yMax = allY[allY.length - 1];

  // Use 10th-90th percentile range to derive tick step (avoids outliers inflating step)
  const p10x = allX[Math.max(0, Math.floor(allX.length * 0.1))];
  const p90x = allX[Math.min(allX.length - 1, Math.ceil(allX.length * 0.9))];
  const denseXRange = Math.max(p90x - p10x, (xMax - xMin) * 0.1);

  const p10y = allY[Math.max(0, Math.floor(allY.length * 0.1))];
  const p90y = allY[Math.min(allY.length - 1, Math.ceil(allY.length * 0.9))];
  const denseYRange = Math.max(p90y - p10y, (yMax - yMin) * 0.1);

  const xStep = calcNiceStep(denseXRange);
  const yStep = calcNiceStep(denseYRange);

  // Align min/max to step grid with small padding
  const xPad = xStep * 0.5;
  const yPad = yStep * 0.5;

  state.chart.options.scales.x.min = Math.floor(xMin / xStep) * xStep;
  state.chart.options.scales.x.max = Math.ceil(xMax / xStep) * xStep + xPad;
  state.chart.options.scales.x.ticks.stepSize = xStep;

  const yFloor = Math.floor(yMin / yStep) * yStep;
  state.chart.options.scales.y.min = Math.max(0, yFloor);
  state.chart.options.scales.y.max = Math.ceil(yMax / yStep) * yStep + yPad;
  state.chart.options.scales.y.ticks.stepSize = yStep;
}

function renderChart() {
  if (!state.chart) initChart();
  const datasets = [];
  const cfg = CFG[state.charType];

  state.series.forEach((series, idx) => {
    if (series.points.length === 0) return;
    const color = COLORS[idx % COLORS.length];

    datasets.push({
      type: 'scatter',
      label: series.label + ' (вимірювання)',
      data: series.points.map(p => ({ x: p.x, y: p.y })),
      backgroundColor: color, borderColor: color,
      pointRadius: 5, pointHoverRadius: 7, order: 2
    });

    const approx = state.approxResults[series.id];
    if (approx && approx.curve.length > 0) {
      datasets.push({
        type: 'line',
        label: series.label + ' (апрокс.)',
        data: approx.curve,
        borderColor: color, borderWidth: 2,
        pointRadius: 0, fill: false, tension: 0, order: 1
      });
    }
  });

  state.chart.data.datasets = datasets;
  state.chart.options.scales.x.title.text = cfg.xLabel;
  state.chart.options.scales.y.title.text = cfg.yLabel;

  updateChartScales();
  state.chart.update('none');

  renderLegend();
  updateChartClickHint();
}

function updateChartClickHint() {
  const el = document.getElementById('chart-click-hint');
  const hasApprox = state.series.some(s => state.approxResults[s.id]);
  el.textContent = hasApprox
    ? 'Натисніть на графік \u2014 X та очікуване Y заповняться автоматично'
    : 'Натисніть на графік \u2014 X заповниться автоматично';
}

function renderLegend() {
  const el = document.getElementById('chart-legend');
  el.innerHTML = '';
  state.series.forEach((series, idx) => {
    if (series.points.length === 0) return;
    const color = COLORS[idx % COLORS.length];
    const item = document.createElement('div');
    item.className = 'legend-item';
    const dot = document.createElement('span');
    dot.className = 'legend-dot';
    dot.style.background = color;
    const lbl = document.createElement('span');
    lbl.textContent = series.label + ' (' + series.points.length + ' pts)';
    item.appendChild(dot); item.appendChild(lbl);
    el.appendChild(item);
  });
}

// ============================================================
// POINTS BELOW GRAPH
// ============================================================

function renderPointsBelowGraph() {
  const tbody = document.getElementById('graph-pts-tbody');
  const empty = document.getElementById('graph-pts-empty');
  const countEl = document.getElementById('graph-pts-count');
  const cfg = CFG[state.charType];

  // Update column headers
  document.getElementById('gph-th-x').textContent = cfg.xHeader;
  document.getElementById('gph-th-y').textContent = cfg.yHeader;

  let total = 0;
  const rows = [];

  state.series.forEach((series, idx) => {
    const color = COLORS[idx % COLORS.length];
    const approx = state.approxResults[series.id];

    series.points.forEach((p, i) => {
      total++;
      let approxCell = '—';
      let errCell = '';
      let errClass = '';

      if (approx && approx.evalFn) {
        const predicted = approx.evalFn(p.x);
        if (isFinite(predicted)) {
          const err = p.y - predicted;
          const relErr = approx.rmse > 0 ? Math.abs(err) / approx.rmse : 0;
          approxCell = formatNum(predicted);
          errCell = (err >= 0 ? '+' : '') + formatNum(err);
          errClass = relErr < 1 ? 'td-err-ok' : relErr < 2 ? 'td-err-pos' : 'td-err-neg';
        }
      }

      rows.push(
        '<tr>' +
          '<td class="td-series"><span class="series-dot" style="background:' + color + '"></span>' + series.label + '</td>' +
          '<td>' + p.x + '</td>' +
          '<td>' + p.y + '</td>' +
          '<td>' + approxCell + '</td>' +
          '<td class="' + errClass + '">' + errCell + '</td>' +
          '<td><button class="btn-del" onclick="deletePoint(\'' + series.id + '\',' + i + ')">\u00D7</button></td>' +
        '</tr>'
      );
    });
  });

  countEl.textContent = total;
  if (total === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  tbody.innerHTML = rows.join('');
}

// ============================================================
// MEASUREMENT PLAN
// ============================================================

function renderMeasurementPlanCard() {
  const card = document.getElementById('meas-plan-card');
  const series = getActiveSeries();
  const approx = series && state.approxResults[series.id];

  if (!approx || series.points.length < 2) {
    card.style.display = 'none';
    return;
  }

  card.style.display = 'block';

  const n = series.points.length;

  // For input characteristic: max new points = n - 1 (one per Y interval).
  // For output characteristic: use curvature-based plan with larger range.
  const isInput = state.charType === 'input';
  const maxNew = isInput ? n - 1 : Math.min(80, Math.max(n + 4, Math.round(n * 3)) + 20);
  const suggested = isInput ? n - 1 : Math.min(80, Math.max(n + 4, Math.round(n * 3)));

  const slider = document.getElementById('meas-pts-slider');
  const numInp = document.getElementById('meas-pts-num');

  // Only set default once per series change (avoid overwriting user input)
  const cardSeries = card.dataset.series;
  if (cardSeries !== series.id) {
    card.dataset.series = series.id;
    if (isInput) {
      slider.min = 1;
      slider.max = maxNew;
      slider.value = suggested;
      numInp.min = 1;
      numInp.max = maxNew;
      numInp.value = suggested;
      document.getElementById('meas-min-label').textContent = 1;
    } else {
      slider.min = n + 1;
      slider.max = maxNew;
      slider.value = suggested;
      numInp.min = n + 1;
      numInp.max = maxNew;
      numInp.value = suggested;
      document.getElementById('meas-min-label').textContent = n + 1;
    }
    document.getElementById('meas-max-label').textContent = slider.max;
    document.getElementById('meas-pts-display').textContent = suggested;
  }

  // Series info line
  const cfg = CFG[state.charType];
  const approxName = { spline: 'Кубічний сплайн', poly2: 'Поліном 2°', poly3: 'Поліном 3°', poly4: 'Поліном 4°', exp: 'Експоненціальна' };
  document.getElementById('meas-plan-series-info').innerHTML =
    'Крива: <strong>' + series.label + '</strong> &nbsp;&middot;&nbsp; ' +
    'Метод: <strong>' + (approxName[state.approxType] || state.approxType) + '</strong> &nbsp;&middot;&nbsp; ' +
    'Вже є: <strong>' + n + '</strong> точок';

  updateMeasSummary();
}

function onMeasSlider(val) {
  const v = parseInt(val);
  document.getElementById('meas-pts-num').value = v;
  document.getElementById('meas-pts-display').textContent = v;
  updateMeasSummary();
}

function onMeasNum(val) {
  const slider = document.getElementById('meas-pts-slider');
  const v = Math.max(parseInt(slider.min) || 2, Math.min(parseInt(slider.max) || 100, parseInt(val) || 10));
  slider.value = v;
  document.getElementById('meas-pts-num').value = v;
  document.getElementById('meas-pts-display').textContent = v;
  updateMeasSummary();
}

function updateMeasSummary() {
  const series = getActiveSeries();
  if (!series) return;
  const total = parseInt(document.getElementById('meas-pts-slider').value) || 20;
  // For input characteristic the slider represents how many new midpoint Y values to generate.
  const isInput = state.charType === 'input';
  const toAdd = isInput ? total : Math.max(0, total - series.points.length);
  const el = document.getElementById('meas-plan-summary');
  el.innerHTML =
    'Додати нових: <strong>' + toAdd + '</strong> точок &nbsp;&middot;&nbsp; ' +
    'Загалом буде: <strong>' + (series.points.length + toAdd) + '</strong>';
}

function generateMeasurementPlan() {
  const series = getActiveSeries();
  const approx = series && state.approxResults[series.id];
  if (!approx || !approx.evalFn) { showToast('Спочатку побудуйте апроксимацію'); return; }

  const total = parseInt(document.getElementById('meas-pts-slider').value) || 20;
  // For input characteristic the slider value is directly the number of new points to generate.
  const isInput = state.charType === 'input';
  const numNew = isInput ? total : Math.max(0, total - series.points.length);
  if (numNew === 0) { showToast('Вже достатньо точок'); return; }

  // For the input characteristic the Y axis is I_B (мкА).
  // Suggest new points at Y midpoints between consecutive measured Y values
  // and find the corresponding X by inverting the approximation.
  const newPoints = isInput
    ? generateYMidpointPlan(series.points, approx.evalFn, numNew)
    : generateOptimalX(series.points, approx.evalFn, numNew);

  const listEl = document.getElementById('meas-plan-list');

  if (newPoints.length === 0) {
    listEl.innerHTML = '<div class="empty-msg">Не вдалося розмістити нові точки</div>';
    return;
  }

  const cfg = CFG[state.charType];
  const xUnit = cfg.xLabel.split(',')[1]?.trim() || '';
  const yUnit = cfg.yLabel.split(',')[1]?.trim() || '';

  listEl.innerHTML =
    '<div class="meas-list-header">' +
      '<span>' + newPoints.length + ' нових позицій для вимірювань:</span>' +
      '<button class="btn btn-sm" onclick="exportMeasPlan()">CSV</button>' +
    '</div>' +
    newPoints.map((pt, idx) => {
      const yStr = isFinite(pt.expectedY) ? formatNum(pt.expectedY) : '?';
      const gapClass = pt.density === 'high' ? 'meas-row-high' : pt.density === 'low' ? 'meas-row-low' : '';
      return (
        '<div class="meas-plan-row ' + gapClass + '">' +
          '<span class="meas-num">' + (idx + 1) + '</span>' +
          '<div class="meas-vals">' +
            '<span class="meas-x">X = <strong>' + pt.x.toFixed(4) + '</strong>' + (xUnit ? ' ' + xUnit : '') + '</span>' +
            '<span class="meas-y">Y \u2248 ' + yStr + (yUnit ? ' ' + yUnit : '') + '</span>' +
          '</div>' +
          '<button class="btn btn-sm btn-primary" onclick="useMeasX(' + pt.x + ',\'' + series.id + '\')">Виміряти</button>' +
        '</div>'
      );
    }).join('');
}

// Find X where evalFn(X) = targetY using binary search within [xMin, xMax].
// Assumes the function is monotonic over that range.
function invertApprox(evalFn, targetY, xMin, xMax) {
  const yMin = evalFn(xMin);
  const yMax = evalFn(xMax);

  // Check that targetY lies within the function's range
  const lo0 = Math.min(yMin, yMax);
  const hi0 = Math.max(yMin, yMax);
  if (targetY < lo0 - 1e-12 || targetY > hi0 + 1e-12) return null;

  // Determine search direction
  let a = yMin <= yMax ? xMin : xMax;
  let b = yMin <= yMax ? xMax : xMin;

  for (let iter = 0; iter < 80; iter++) {
    const mid = (a + b) / 2;
    const yMid = evalFn(mid);
    if (Math.abs(yMid - targetY) < 1e-12) return mid;
    if (yMid < targetY) a = mid; else b = mid;
  }
  return (a + b) / 2;
}

// Generate new measurement positions by inserting one point between each pair
// of consecutive Y values in the existing data (sorted by Y).
// Returns points sorted by X ascending.
function generateYMidpointPlan(existingPoints, evalFn, numNew) {
  if (!evalFn || existingPoints.length < 2) return [];

  const sortedByY = [...existingPoints].sort((a, b) => a.y - b.y);
  const xValues = existingPoints.map(p => p.x);
  const xMin = Math.min(...xValues);
  const xMax = Math.max(...xValues);

  const candidates = [];

  for (let i = 0; i < sortedByY.length - 1; i++) {
    const yMid = (sortedByY[i].y + sortedByY[i + 1].y) / 2;
    const x = invertApprox(evalFn, yMid, xMin, xMax);
    if (x === null || !isFinite(x)) continue;

    const xRnd = parseFloat(x.toFixed(4));
    // Skip if too close to an existing point
    const tooClose = existingPoints.some(p => Math.abs(p.x - xRnd) < (xMax - xMin) * 0.01);
    if (tooClose) continue;

    candidates.push({ x: xRnd, expectedY: yMid, density: 'normal' });
  }

  // Sort by X and return up to numNew
  candidates.sort((a, b) => a.x - b.x);
  return candidates.slice(0, numNew);
}

function generateOptimalX(existingPoints, evalFn, numNew) {
  if (!evalFn || existingPoints.length < 2 || numNew <= 0) return [];

  const sorted = [...existingPoints].sort((a, b) => a.x - b.x);
  const xMin = sorted[0].x;
  const xMax = sorted[sorted.length - 1].x;
  const xRange = xMax - xMin;
  if (xRange <= 0 || !isFinite(xRange)) return [];

  // Sample curvature at M equally-spaced points
  const M = 600;
  const samples = [];
  let totalW = 0;

  for (let i = 0; i <= M; i++) {
    const x = xMin + xRange * i / M;
    const dx = xRange * 0.002 + 1e-9;

    let curv = 0.05; // baseline so linear regions also get some points
    try {
      const ym = evalFn(x);
      const yp = evalFn(x + dx);
      const yn = evalFn(x - dx);
      if (isFinite(ym) && isFinite(yp) && isFinite(yn)) {
        const d2y = (yp - 2 * ym + yn) / (dx * dx);
        const d1y = (yp - yn) / (2 * dx);
        curv = Math.abs(d2y) / Math.pow(1 + d1y * d1y, 1.5) + 0.05;
      }
    } catch (_) {}

    samples.push({ x, w: curv });
    totalW += curv;
  }

  // Build CDF
  let cumul = 0;
  const cdf = samples.map(s => { cumul += s.w / totalW; return cumul; });

  // Sample numNew positions uniformly in CDF space
  const candidates = [];
  for (let i = 1; i <= numNew + 5; i++) {
    const target = i / (numNew + 6);
    let idx = cdf.findIndex(c => c >= target);
    if (idx < 0) idx = M;
    candidates.push(samples[Math.min(idx, M)].x);
  }

  // Classify curvature level for each candidate
  const maxCurv = Math.max(...samples.map(s => s.w));

  // Filter out positions too close to existing measurements
  const existingX = sorted.map(p => p.x);
  const minGap = xRange / (existingPoints.length * 3 + numNew + 1);

  const result = candidates
    .filter(x => !existingX.some(ex => Math.abs(x - ex) < minGap))
    .slice(0, numNew)
    .map(x => {
      const xRnd = parseFloat(x.toFixed(4));
      const expectedY = evalFn(xRnd);
      // Find curvature at this point to classify density
      const sIdx = Math.round((x - xMin) / xRange * M);
      const localCurv = samples[Math.max(0, Math.min(M, sIdx))]?.w || 0;
      const relCurv = localCurv / maxCurv;
      const density = relCurv > 0.6 ? 'high' : relCurv < 0.15 ? 'low' : 'normal';
      return { x: xRnd, expectedY: isFinite(expectedY) ? expectedY : NaN, density };
    });

  return result;
}

function exportMeasPlan() {
  const series = getActiveSeries();
  const approx = series && state.approxResults[series.id];
  if (!approx) return;

  const cfg = CFG[state.charType];
  const total = parseInt(document.getElementById('meas-pts-slider').value) || 20;
  const numNew = Math.max(0, total - series.points.length);
  const useYMidpoints = state.charType === 'input';
  const pts = useYMidpoints
    ? generateYMidpointPlan(series.points, approx.evalFn, numNew)
    : generateOptimalX(series.points, approx.evalFn, numNew);
  if (!pts.length) return;

  let csv = '# ' + series.label + ' - plan\n' + cfg.xHeader + ',' + cfg.yHeader + ' (expected)\n';
  pts.forEach(pt => { csv += pt.x + ',' + (isFinite(pt.expectedY) ? pt.expectedY : '') + '\n'; });
  downloadBlob('\uFEFF' + csv, 'text/csv;charset=utf-8;', 'meas_plan.csv');
  showToast('План збережено у CSV');
}

function useMeasX(x, seriesId) {
  state.activeSeriesId = seriesId;
  const xVal = parseFloat(x.toFixed(5));
  document.getElementById('inp-x').value = xVal;

  let hint = 'X=' + xVal + ' готово. Введіть виміряне Y.';
  const approx = state.approxResults[seriesId];
  if (approx?.evalFn) {
    const ay = approx.evalFn(xVal);
    if (isFinite(ay)) hint = 'X=' + xVal + '. Очікуване Y\u2248' + parseFloat(ay.toPrecision(4));
  }

  switchTab('data', null);
  refreshSeriesChips();
  setTimeout(() => { const iy = document.getElementById('inp-y'); iy.focus(); iy.select(); }, 80);
  showToast(hint);
}

// ============================================================
// SUGGESTED INTERMEDIATE POINTS
// ============================================================

function computeIBSuggestions() {
  if (state.charType !== 'output') return [];
  const sorted = state.series
    .filter(s => s.paramValue !== null && s.paramValue !== undefined && !isNaN(s.paramValue))
    .sort((a, b) => a.paramValue - b.paramValue);
  if (sorted.length < 2) return [];

  const suggestions = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const ib1 = sorted[i].paramValue;
    const ib2 = sorted[i + 1].paramValue;
    const ibMid = parseFloat(((ib1 + ib2) / 2).toPrecision(6));
    const gap = Math.abs(ib2 - ib1);
    const alreadyExists = state.series.some(
      s => s.paramValue !== null && Math.abs((s.paramValue || 0) - ibMid) < gap * 0.15
    );
    if (!alreadyExists) {
      suggestions.push({ ib1, ib2, ibMid });
    }
  }
  return suggestions;
}

function addIBSeriesFromSuggestion(ibMid) {
  const id = genId();
  const label = 'I_B = ' + ibMid + ' мкА';
  const insertIdx = state.series.findIndex(
    s => s.paramValue !== null && s.paramValue > ibMid
  );
  const newSeries = { id, label, paramValue: ibMid, points: [] };
  if (insertIdx === -1) {
    state.series.push(newSeries);
  } else {
    state.series.splice(insertIdx, 0, newSeries);
  }
  state.activeSeriesId = id;
  refreshSeriesChips();
  refreshPointsTable();
  renderSuggestedIntermediatePoints();
  saveState();
  showToast('Криву I_B = ' + ibMid + ' мкА додано');
}

function renderSuggestedIntermediatePoints() {
  const card = document.getElementById('suggested-pts-card');
  const content = document.getElementById('suggested-pts-content');
  const countEl = document.getElementById('suggested-pts-count');
  const cfg = CFG[state.charType];
  const xUnit = cfg.xLabel.split(',')[1]?.trim() || '';

  const ibSuggestions = computeIBSuggestions();

  const xSuggestions = [];
  state.series.forEach(series => {
    const result = state.approxResults[series.id];
    if (!result || !result.suggestions) return;
    result.suggestions.forEach(s => xSuggestions.push({ ...s, seriesLabel: series.label, seriesId: series.id }));
  });

  const totalCount = ibSuggestions.length + xSuggestions.length;

  if (totalCount === 0) {
    card.style.display = 'none';
    return;
  }

  card.style.display = 'block';
  countEl.textContent = totalCount;

  let html = '';

  if (ibSuggestions.length > 0) {
    html += '<div class="suggested-section-label">Нові криві I<sub>B</sub>, мкА</div>';
    html += ibSuggestions.map(s => {
      const fmt = n => parseFloat(n.toPrecision(6)).toString();
      return (
        '<div class="suggested-pt-row">' +
          '<div class="suggested-pt-info">' +
            '<span class="suggested-pt-label">Проміжна крива</span>' +
            '<span class="suggested-pt-meta">' +
              'I<sub>B</sub> = <strong>' + fmt(s.ibMid) + '</strong> мкА' +
              ' &nbsp;&middot;&nbsp; між ' + fmt(s.ib1) + ' і ' + fmt(s.ib2) + ' мкА' +
            '</span>' +
          '</div>' +
          '<button class="btn btn-sm btn-primary" onclick="addIBSeriesFromSuggestion(' + s.ibMid + ')">Додати</button>' +
        '</div>'
      );
    }).join('');
  }

  if (xSuggestions.length > 0) {
    if (ibSuggestions.length > 0) {
      html += '<div class="suggested-section-label">Проміжні точки X на кривих</div>';
    }
    html += xSuggestions.slice(0, 8).map(s => {
      const isHigh = s.priority === 'high';
      const isGap  = s.type === 'gap';
      const typeText = isGap ? 'Великий пропуск' : (isHigh ? 'ВАЖЛИВО: висока кривина' : 'Висока кривина');
      const meta = s.seriesLabel + ' \u00B7 X\u2248' + s.xMid.toFixed(4) + (xUnit ? ' ' + xUnit : '') +
                   ' (від ' + s.x1.toFixed(4) + ' до ' + s.x2.toFixed(4) + ')';
      return (
        '<div class="suggested-pt-row">' +
          '<div class="suggested-pt-info">' +
            '<span class="suggested-pt-label' + (isHigh ? ' high' : '') + '">' + typeText + '</span>' +
            '<span class="suggested-pt-meta">' + meta + '</span>' +
          '</div>' +
          '<button class="btn btn-sm btn-primary" onclick="useSuggestedX(' + s.xMid + ',\'' + s.seriesId + '\')">Виміряти</button>' +
        '</div>'
      );
    }).join('');
  }

  content.innerHTML = html;
}

function useSuggestedX(x, seriesId) {
  state.activeSeriesId = seriesId;
  const xVal = parseFloat(x.toPrecision(5));
  document.getElementById('inp-x').value = xVal;

  const series = state.series.find(s => s.id === seriesId);
  let hint = 'X=' + xVal + ' готово. Введіть виміряне Y.';
  if (series && state.approxResults[seriesId]) {
    const approxY = state.approxResults[seriesId].evalFn(xVal);
    if (isFinite(approxY)) hint = 'X=' + xVal + ' готово. Очікуване Y\u2248' + parseFloat(approxY.toPrecision(4));
  }

  switchTab('data', null);
  setTimeout(() => { const iy = document.getElementById('inp-y'); iy.focus(); iy.select(); }, 80);
  refreshSeriesChips();
  showToast(hint);
}

// ============================================================
// ANALYSIS
// ============================================================

function renderAnalysis() {
  renderMetrics();
  renderSuggestions();
  renderSufficiency();
}

function renderMetrics() {
  const container = document.getElementById('metrics-content');
  const hasResults = state.series.some(s => state.approxResults[s.id]);
  if (!hasResults) {
    container.innerHTML = '<div class="empty-msg">Спочатку побудуйте апроксимацію на вкладці Графік.</div>';
    return;
  }

  const typeNames = {
    spline: 'Кубічний сплайн', poly2: 'Поліном 2°', poly3: 'Поліном 3°',
    poly4: 'Поліном 4°', exp: 'Експоненціальна'
  };

  container.innerHTML = '';
  state.series.forEach(series => {
    const res = state.approxResults[series.id];
    if (!res) return;

    // Fit quality badge
    let fitLabel, fitClass;
    if (res.r2 > 0.9995) { fitLabel = 'Відмінно'; fitClass = 'fit-excellent'; }
    else if (res.r2 > 0.99) { fitLabel = 'Добре'; fitClass = 'fit-good'; }
    else { fitLabel = 'Погано'; fitClass = 'fit-poor'; }

    const rmseClass  = res.rmse  < 0.005 ? 'metric-good' : res.rmse  < 0.05 ? 'metric-warn' : 'metric-bad';
    const r2Class    = res.r2    > 0.9995 ? 'metric-good' : res.r2   > 0.99  ? 'metric-warn' : 'metric-bad';
    const maeClass   = res.mae   < 0.005 ? 'metric-good' : res.mae   < 0.05  ? 'metric-warn' : 'metric-bad';
    const maxErrClass= res.maxErr < 0.01  ? 'metric-good' : res.maxErr < 0.1  ? 'metric-warn' : 'metric-bad';

    let cvRow = '';
    if (res.cvR2 !== null && res.cvR2 !== undefined) {
      const cvClass = res.cvR2 > 0.995 ? 'metric-good' : res.cvR2 > 0.97 ? 'metric-warn' : 'metric-bad';
      const cvDiff  = res.r2 - res.cvR2;
      const overfit = cvDiff > 0.05 ? ' (перенавчання!)' : '';
      cvRow = metric('CV R\u00B2 (LOO)', res.cvR2.toFixed(6) + overfit, cvClass);
    }

    const group = document.createElement('div');
    group.className = 'metric-group';
    group.innerHTML =
      '<div class="metric-group-label">' +
        series.label +
        '<span class="fit-badge ' + fitClass + '">' + fitLabel + '</span>' +
      '</div>' +
      metric('Метод', typeNames[res.type] || res.type, '') +
      metric('R\u00B2', res.r2.toFixed(6), r2Class) +
      cvRow +
      metric('RMSE', formatNum(res.rmse), rmseClass) +
      metric('MAE (ср. похибка)', formatNum(res.mae), maeClass) +
      metric('Max похибка', formatNum(res.maxErr), maxErrClass) +
      metric('Точок', series.points.length, '');
    container.appendChild(group);
  });
}

function metric(label, value, cls) {
  return '<div class="metric-row">' +
    '<span class="metric-label">' + label + '</span>' +
    '<span class="metric-value ' + cls + '">' + value + '</span>' +
  '</div>';
}

function renderSuggestions() {
  const container = document.getElementById('suggestions-content');
  const cfg = CFG[state.charType];
  const hasSugg = state.series.some(s => state.approxResults[s.id]?.suggestions?.length > 0);

  if (!hasSugg) {
    container.innerHTML = '<div class="empty-msg">Після апроксимації з\'являться рекомендації.</div>';
    return;
  }

  container.innerHTML = '';
  state.series.forEach(series => {
    const result = state.approxResults[series.id];
    if (!result?.suggestions?.length) return;

    const header = document.createElement('div');
    header.className = 'suggestion-group-label';
    header.textContent = series.label;
    container.appendChild(header);

    const xUnit = cfg.xLabel.split(',')[1]?.trim() || '';
    result.suggestions.forEach(s => {
      const item = document.createElement('div');
      item.className = 'suggestion-item' + (s.type === 'gap' ? ' gap' : '');
      const x1 = s.x1.toFixed(4), x2 = s.x2.toFixed(4), xm = s.xMid.toFixed(4);
      item.textContent = s.type === 'gap'
        ? 'Великий інтервал: додайте точку біля ' + xm + (xUnit ? ' ' + xUnit : '') + ' (проміжок ' + x1 + ' \u2013 ' + x2 + ')'
        : (s.priority === 'high' ? 'ВАЖЛИВО: ' : '') + 'Висока кривина: додайте точку біля ' + xm + (xUnit ? ' ' + xUnit : '') + ' (ділянка ' + x1 + ' \u2013 ' + x2 + ')';
      container.appendChild(item);
    });
  });
}

function renderSufficiency() {
  const el = document.getElementById('sufficiency-content');
  let totalPoints = 0, r2Sum = 0, r2Count = 0;
  state.series.forEach(s => {
    totalPoints += s.points.length;
    const r = state.approxResults[s.id];
    if (r) { r2Sum += r.r2; r2Count++; }
  });

  if (r2Count === 0) {
    el.innerHTML = '<div class="empty-msg">Додайте більше точок для оцінки.</div>';
    return;
  }

  const avgR2  = r2Sum / r2Count;
  const minTotal = 8 * state.series.length;
  const r2Ok   = avgR2 > 0.999;
  const ptsOk  = totalPoints >= minTotal;
  const overall = r2Ok && ptsOk;

  el.innerHTML =
    metric('Всього точок',  totalPoints, ptsOk  ? 'metric-good' : 'metric-warn') +
    metric('Середній R\u00B2', avgR2.toFixed(6), r2Ok   ? 'metric-good' : 'metric-warn') +
    metric('Висновок', overall ? 'Достатньо точок' : 'Рекомендується додати точки', overall ? 'metric-good' : 'metric-warn');
}

// ============================================================
// UI REFRESH
// ============================================================

function refreshUI() {
  const cfg = CFG[state.charType];
  document.getElementById('lbl-x').innerHTML = cfg.xLabel.replace('_', '<sub>').replace(',', '</sub>,');
  document.getElementById('lbl-y').innerHTML = cfg.yLabel.replace('_', '<sub>').replace(',', '</sub>,');
  document.getElementById('th-x').textContent = cfg.xHeader;
  document.getElementById('th-y').textContent = cfg.yHeader;
  document.getElementById('series-section').style.display = cfg.hasSeries ? 'block' : 'none';
  if (cfg.hasSeries) document.getElementById('series-param-label').innerHTML = 'I<sub>B</sub>, мкА';
  refreshSeriesChips();
  refreshPointsTable();
}

function refreshSeriesChips() {
  const container = document.getElementById('series-chips');
  container.innerHTML = '';

  state.series.forEach(series => {
    const chip = document.createElement('div');
    chip.className = 'chip' + (series.id === state.activeSeriesId ? ' active' : '');
    chip.onclick = () => selectSeries(series.id);

    const lbl = document.createElement('span');
    lbl.textContent = series.label + ' (' + series.points.length + ')';
    chip.appendChild(lbl);

    if (state.series.length > 1) {
      const del = document.createElement('span');
      del.className = 'chip-del';
      del.textContent = '\u00D7';
      del.onclick = e => deleteSeries(series.id, e);
      chip.appendChild(del);
    }
    container.appendChild(chip);
  });

  const active = getActiveSeries();
  const titleEl = document.getElementById('point-input-title');
  titleEl.textContent = (active && CFG[state.charType].hasSeries)
    ? 'Додати точку \u2014 ' + active.label
    : 'Додати точку';
}

function refreshPointsTable() {
  const tbody = document.getElementById('tbody-points');
  const noMsg = document.getElementById('no-points-msg');
  const series = getActiveSeries();

  if (!series || series.points.length === 0) {
    tbody.innerHTML = '';
    noMsg.style.display = 'block';
    return;
  }
  noMsg.style.display = 'none';
  tbody.innerHTML = series.points.map((p, i) =>
    '<tr>' +
      '<td>' + p.x + '</td>' +
      '<td>' + p.y + '</td>' +
      '<td><button class="btn-del" onclick="deletePoint(\'' + series.id + '\',' + i + ')">\u00D7</button></td>' +
    '</tr>'
  ).join('');
}

// ============================================================
// CSV EXPORT / IMPORT
// ============================================================

function exportCSV() {
  const cfg = CFG[state.charType];
  let csv = '';
  if (state.charType === 'output') {
    state.series.forEach(series => {
      if (!series.points.length) return;
      csv += '# ' + series.label + '\n' + cfg.xHeader + ',' + cfg.yHeader + '\n';
      series.points.forEach(p => { csv += p.x + ',' + p.y + '\n'; });
      csv += '\n';
    });
  } else {
    const s = state.series[0];
    if (s?.points.length) {
      csv += cfg.xHeader + ',' + cfg.yHeader + '\n';
      s.points.forEach(p => { csv += p.x + ',' + p.y + '\n'; });
    }
  }

  if (!csv) { showToast('Немає даних для експорту'); return; }
  downloadBlob('\uFEFF' + csv, 'text/csv;charset=utf-8;', 'vah_' + state.charType + '.csv');
  showToast('CSV збережено');
}

function importCSV(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const lines = e.target.result.replace(/\r\n/g, '\n').split('\n').map(l => l.trim()).filter(l => l);
    const series = getActiveSeries();
    let imported = 0;
    lines.forEach(line => {
      if (line.startsWith('#') || line.includes('U_') || line.includes('I_')) return;
      const parts = line.split(',');
      if (parts.length < 2) return;
      const x = parseFloat(parts[0]), y = parseFloat(parts[1]);
      if (!isNaN(x) && !isNaN(y) && series) { series.points.push({ x, y }); imported++; }
    });
    if (series && imported > 0) {
      series.points.sort((a, b) => a.x - b.x);
      delete state.approxResults[series.id];
    }
    refreshPointsTable(); refreshSeriesChips();
    saveState();
    showToast('Імпортовано ' + imported + ' точок');
  };
  reader.readAsText(file, 'UTF-8');
  event.target.value = '';
}

// ============================================================
// SESSION MANAGEMENT
// ============================================================

const SESSIONS_KEY = 'vah_sessions_v1';

function getSessions() {
  try { return JSON.parse(localStorage.getItem(SESSIONS_KEY) || '[]'); } catch { return []; }
}

function saveSession(name) {
  const sessions = getSessions();
  sessions.push({
    id: genId(),
    name,
    savedAt: new Date().toISOString(),
    data: {
      charType: state.charType,
      series: state.series.map(s => ({ id: s.id, label: s.label, paramValue: s.paramValue, points: s.points })),
      activeSeriesId: state.activeSeriesId,
      approxType: state.approxType
    }
  });
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

function deleteSessionById(id) {
  const sessions = getSessions().filter(s => s.id !== id);
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

function applySession(data) {
  state.charType = data.charType || 'output';
  state.series = (data.series || []).map(s => ({
    id: s.id || genId(), label: s.label || 'Крива', paramValue: s.paramValue,
    points: Array.isArray(s.points) ? s.points : []
  }));
  state.activeSeriesId = data.activeSeriesId || (state.series[0]?.id || null);
  state.approxType = data.approxType || 'spline';
  state.approxResults = {};

  document.getElementById('btn-input').classList.toggle('active', state.charType === 'input');
  document.getElementById('btn-output').classList.toggle('active', state.charType === 'output');
  document.getElementById('sel-approx').value = state.approxType;

  refreshUI();
  if (state.chart) {
    const cfg = CFG[state.charType];
    state.chart.options.scales.x.title.text = cfg.xLabel;
    state.chart.options.scales.y.title.text = cfg.yLabel;
    state.chart.data.datasets = [];
    state.chart.update();
  }
  saveState();
}

function renderSessionsList(mode) {
  // mode: 'save' | 'load'
  const sessions = getSessions().slice().reverse();
  if (sessions.length === 0) return '<div class="empty-msg">Немає збережених сесій</div>';

  return sessions.map(s => {
    const pts = s.data.series.reduce((n, ser) => n + (ser.points?.length || 0), 0);
    const dateStr = formatDate(s.savedAt);
    const loadBtn = mode === 'load'
      ? '<button class="btn btn-sm btn-primary" onclick="confirmLoadSession(\'' + s.id + '\')">Відкрити</button>'
      : '';
    return (
      '<div class="session-row">' +
        '<div class="session-info">' +
          '<div class="session-name">' + s.name + '</div>' +
          '<div class="session-meta">' + dateStr + ' \u00B7 ' + pts + ' точок</div>' +
        '</div>' +
        '<div class="session-actions">' +
          loadBtn +
          '<button class="btn btn-sm" onclick="confirmDeleteSession(\'' + s.id + '\')">\u00D7</button>' +
        '</div>' +
      '</div>'
    );
  }).join('');
}

function openSaveSession() {
  openModal('Зберегти сесію', () => {
    const totalPts = state.series.reduce((n, s) => n + s.points.length, 0);
    const defaultName = new Date().toLocaleDateString('uk-UA') + ' (' + totalPts + ' pts)';
    return (
      '<div class="field" style="margin-bottom:12px">' +
        '<label>Назва сесії</label>' +
        '<input type="text" id="session-name-inp" placeholder="' + defaultName + '" maxlength="60" style="margin-top:4px">' +
      '</div>' +
      '<button class="btn btn-primary btn-full" style="margin-top:0" onclick="confirmSaveSession()">Зберегти</button>' +
      '<div style="margin-top:20px">' +
        '<div class="card-title">Раніше збережені</div>' +
        '<div id="sessions-list-inner">' + renderSessionsList('save') + '</div>' +
      '</div>'
    );
  });
  setTimeout(() => {
    const inp = document.getElementById('session-name-inp');
    if (inp) { inp.focus(); inp.select(); }
  }, 150);
}

function confirmSaveSession() {
  const inp = document.getElementById('session-name-inp');
  const name = inp?.value?.trim() || new Date().toLocaleDateString('uk-UA');
  saveSession(name);
  closeModal();
  showToast('Сесію "' + name + '" збережено');
}

function openLoadSessions() {
  const sessions = getSessions();
  if (sessions.length === 0) { showToast('Немає збережених сесій'); return; }
  openModal('Завантажити сесію', () =>
    '<div id="sessions-list-inner">' + renderSessionsList('load') + '</div>' +
    '<div class="modal-actions">' +
      '<button class="btn btn-sm" onclick="exportSessions()">Експорт JSON</button>' +
      '<label class="btn btn-sm" for="import-sessions-inp">Імпорт JSON</label>' +
      '<input type="file" id="import-sessions-inp" accept=".json" hidden onchange="importSessions(event)">' +
    '</div>'
  );
}

function confirmLoadSession(id) {
  const session = getSessions().find(s => s.id === id);
  if (!session) return;
  if (!confirm('Завантажити сесію "' + session.name + '"? Поточні дані буде замінено.')) return;
  applySession(session.data);
  closeModal();
  showToast('Сесію "' + session.name + '" завантажено');
}

function confirmDeleteSession(id) {
  const session = getSessions().find(s => s.id === id);
  if (!session) return;
  if (!confirm('Видалити сесію "' + session.name + '"?')) return;
  deleteSessionById(id);
  // Re-render list inside open modal
  const inner = document.getElementById('sessions-list-inner');
  if (inner) inner.innerHTML = renderSessionsList(document.getElementById('modal-title')?.textContent?.includes('Завантажити') ? 'load' : 'save');
  showToast('Сесію видалено');
}

function exportSessions() {
  const sessions = getSessions();
  if (!sessions.length) { showToast('Немає сесій для експорту'); return; }
  downloadBlob(JSON.stringify(sessions, null, 2), 'application/json', 'vah_sessions.json');
  showToast('Сесії збережено у файл');
}

function importSessions(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const imported = JSON.parse(e.target.result);
      if (!Array.isArray(imported)) throw new Error('bad format');
      const existing = getSessions();
      const existingIds = new Set(existing.map(s => s.id));
      let added = 0;
      imported.forEach(s => {
        if (s.id && s.name && s.data && !existingIds.has(s.id)) {
          existing.push(s); added++;
        }
      });
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(existing));
      const inner = document.getElementById('sessions-list-inner');
      if (inner) inner.innerHTML = renderSessionsList('load');
      showToast('Імпортовано ' + added + ' сесій');
    } catch { showToast('Помилка читання файлу'); }
  };
  reader.readAsText(file, 'UTF-8');
  event.target.value = '';
}

// ============================================================
// MODAL SYSTEM
// ============================================================

function openModal(title, bodyFn) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = typeof bodyFn === 'function' ? bodyFn() : bodyFn;
  const overlay = document.getElementById('modal-overlay');
  overlay.style.display = 'flex';
  overlay.classList.add('open');
}

function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  overlay.style.display = 'none';
  overlay.classList.remove('open');
}

function closeModalOverlay(e) {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
}

// ============================================================
// PERSISTENCE (current session)
// ============================================================

function saveState() {
  try {
    localStorage.setItem('vah_assistant_v1', JSON.stringify({
      charType: state.charType,
      series: state.series.map(s => ({ id: s.id, label: s.label, paramValue: s.paramValue, points: s.points })),
      activeSeriesId: state.activeSeriesId,
      approxType: state.approxType
    }));
  } catch (_) {}
}

function loadState() {
  try {
    const raw = localStorage.getItem('vah_assistant_v1');
    if (!raw) return;
    const data = JSON.parse(raw);
    state.charType = data.charType || 'output';
    state.series = (data.series || []).map(s => ({
      id: s.id || genId(), label: s.label || 'Крива', paramValue: s.paramValue,
      points: Array.isArray(s.points) ? s.points : []
    }));
    state.activeSeriesId = data.activeSeriesId || null;
    state.approxType = data.approxType || 'spline';
    document.getElementById('btn-input').classList.toggle('active', state.charType === 'input');
    document.getElementById('btn-output').classList.toggle('active', state.charType === 'output');
    document.getElementById('sel-approx').value = state.approxType;
  } catch (_) {}
}

// ============================================================
// UTILITIES
// ============================================================

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function formatNum(n) {
  if (!isFinite(n) || isNaN(n)) return '?';
  if (Math.abs(n) < 0.001 || Math.abs(n) > 9999) return n.toExponential(3);
  return n.toPrecision(4);
}

function formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('uk-UA') + ' ' + d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

function downloadBlob(content, mimeType, filename) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

let _toastTimer = null;
function showToast(msg) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  if (_toastTimer) clearTimeout(_toastTimer);
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  _toastTimer = setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 2600);
}
