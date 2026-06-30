const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const today = new Date();
const storageKey = 'futureflow-local-save';
const iso = (date) => date.toISOString().slice(0, 10);
const addDays = (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const addMonths = (date, months) => new Date(date.getFullYear(), date.getMonth() + months, date.getDate());
const parseDate = (value) => {
  const fallback = iso(today);
  return new Date(`${value || fallback}T00:00:00`);
};

const defaultState = {
  constants: [
    { label: 'Pay', amount: 1250, frequency: 'biweekly', date: iso(addDays(today, 2)) },
    { label: 'Weekly use', amount: -150, frequency: 'weekly', date: iso(addDays(today, 1)) },
    { label: 'Rent', amount: -1150, frequency: 'monthly', date: iso(addDays(today, 10)) },
    { label: 'Electric', amount: -200, frequency: 'monthly', date: iso(addDays(today, 8)) }
  ],
  variables: [
    { label: 'Groceries', amount: -150, date: iso(addDays(today, 3)) },
    { label: 'Refund', amount: 572.64, date: iso(addDays(today, 22)) },
    { label: 'Computer', amount: -600, date: iso(addDays(today, 16)) }
  ]
};

const elements = {
  startingBalance: document.querySelector('#startingBalance'),
  startDate: document.querySelector('#startDate'),
  endDate: document.querySelector('#endDate'),
  constantsList: document.querySelector('#constantsList'),
  variablesList: document.querySelector('#variablesList'),
  projectedBalance: document.querySelector('#projectedBalance'),
  projectionRange: document.querySelector('#projectionRange'),
  maxBalance: document.querySelector('#maxBalance'),
  minBalance: document.querySelector('#minBalance'),
  timelineBody: document.querySelector('#timelineBody'),
  chart: document.querySelector('#balanceChart'),
  chartStartDate: document.querySelector('#chartStartDate'),
  chartEndDate: document.querySelector('#chartEndDate'),
  trendLineToggle: document.querySelector('#trendLineToggle'),
  chartTooltip: document.querySelector('#chartTooltip'),
  saveLocalButton: document.querySelector('#saveLocalButton'),
  saveStatus: document.querySelector('#saveStatus')
};

const chartState = {
  activeIndex: null,
  points: [],
  rows: [],
  startingBalance: 0,
  start: today,
  end: addMonths(today, 30),
  layout: null
};

const savedPlan = loadLocalPlan();
const state = savedPlan?.state || structuredClone(defaultState);

elements.startingBalance.value = savedPlan?.startingBalance ?? elements.startingBalance.value;
elements.startDate.value = savedPlan?.startDate || iso(today);
elements.endDate.value = savedPlan?.endDate || iso(addMonths(today, 30));
elements.chartStartDate.value = savedPlan?.chartStartDate || elements.startDate.value;
elements.chartEndDate.value = savedPlan?.chartEndDate || iso(addMonths(parseDate(elements.chartStartDate.value), 1));
elements.trendLineToggle.checked = savedPlan?.showTrendLine ?? true;
updateSaveStatus(savedPlan ? 'Loaded local save' : 'No local save found');

document.querySelector('#addConstant').addEventListener('click', () => {
  state.constants.push({ label: 'New constant', amount: 0, frequency: 'monthly', intervalMonths: 1, date: elements.startDate.value });
  renderInputs();
  recalculate();
});

document.querySelector('#addVariable').addEventListener('click', () => {
  state.variables.push({ label: 'New variable', amount: 0, date: elements.startDate.value });
  renderInputs();
  recalculate();
});

document.querySelector('#recalculateButton').addEventListener('click', recalculate);
document.querySelectorAll('[data-chart-range]').forEach((button) => {
  button.addEventListener('click', () => setChartRange(button.dataset.chartRange));
});
[elements.chartStartDate, elements.chartEndDate, elements.trendLineToggle].forEach((input) => input.addEventListener('change', recalculate));

elements.saveLocalButton.addEventListener('click', () => {
  saveLocalPlan();
  updateSaveStatus('Saved locally');
});
['input', 'change'].forEach((eventName) => {
  document.querySelector('.control-panel').addEventListener(eventName, recalculate);
});

function renderInputs() {
  renderEntryList('constants', elements.constantsList, document.querySelector('#constantTemplate'));
  renderEntryList('variables', elements.variablesList, document.querySelector('#variableTemplate'));
}

function renderEntryList(type, container, template) {
  container.replaceChildren();
  state[type].forEach((entry, index) => {
    const node = template.content.firstElementChild.cloneNode(true);
    node.querySelector('.entry-label').value = entry.label;
    node.querySelector('.entry-amount').value = entry.amount;
    node.querySelector('.entry-date').value = entry.date;
    const frequency = node.querySelector('.entry-frequency');
    if (frequency) frequency.value = entry.frequency;
    const interval = node.querySelector('.entry-interval');
    if (interval) {
      interval.value = entry.intervalMonths || 1;
      interval.hidden = entry.frequency !== 'custom-months';
    }

    node.addEventListener('input', () => updateEntry(type, index, node));
    node.addEventListener('change', () => updateEntry(type, index, node));
    node.querySelector('.remove-entry').addEventListener('click', () => {
      state[type].splice(index, 1);
      renderInputs();
      recalculate();
    });
    container.appendChild(node);
  });
}

function updateEntry(type, index, node) {
  const entry = state[type][index];
  entry.label = node.querySelector('.entry-label').value;
  entry.amount = Number(node.querySelector('.entry-amount').value || 0);
  entry.date = node.querySelector('.entry-date').value;
  const frequency = node.querySelector('.entry-frequency');
  if (frequency) entry.frequency = frequency.value;
  const interval = node.querySelector('.entry-interval');
  if (interval) {
    entry.intervalMonths = Math.max(1, Number.parseInt(interval.value, 10) || 1);
    interval.hidden = entry.frequency !== 'custom-months';
  }
  recalculate();
}

function buildEvents() {
  const start = parseDate(elements.startDate.value);
  const end = parseDate(elements.endDate.value);
  const events = [];

  state.variables.forEach((item) => {
    const date = parseDate(item.date);
    if (date >= start && date <= end) events.push({ ...item, date });
  });

  state.constants.forEach((item) => {
    let date = parseDate(item.date);
    while (date <= end) {
      if (date >= start) events.push({ ...item, date });
      date = nextDate(date, item);
    }
  });

  return events.sort((a, b) => a.date - b.date || b.amount - a.amount);
}

function nextDate(date, item) {
  if (item.frequency === 'weekly') return addDays(date, 7);
  if (item.frequency === 'biweekly') return addDays(date, 14);
  if (item.frequency === 'semiannual') return addMonths(date, 6);
  if (item.frequency === 'custom-months') return addMonths(date, Math.max(1, Number.parseInt(item.intervalMonths, 10) || 1));
  return addMonths(date, 1);
}

function loadLocalPlan() {
  try {
    const rawSave = localStorage.getItem(storageKey);
    return rawSave ? JSON.parse(rawSave) : null;
  } catch (error) {
    console.warn('Unable to load local FutureFlow save', error);
    return null;
  }
}

function saveLocalPlan() {
  const payload = {
    startingBalance: elements.startingBalance.value,
    startDate: elements.startDate.value,
    endDate: elements.endDate.value,
    chartStartDate: elements.chartStartDate.value,
    chartEndDate: elements.chartEndDate.value,
    showTrendLine: elements.trendLineToggle.checked,
    state,
    savedAt: new Date().toISOString()
  };
  localStorage.setItem(storageKey, JSON.stringify(payload));
}

function updateSaveStatus(message) {
  if (!elements.saveStatus) return;
  elements.saveStatus.textContent = message;
}

function recalculate() {
  const start = parseDate(elements.startDate.value);
  const end = parseDate(elements.endDate.value);
  const events = buildEvents();
  let balance = Number(elements.startingBalance.value || 0);
  const rows = events.map((event, index) => {
    balance += Number(event.amount);
    return { ...event, balance, timelineIndex: index + 1 };
  });
  const balances = [Number(elements.startingBalance.value || 0), ...rows.map((row) => row.balance)];
  elements.projectedBalance.textContent = currency.format(balance);
  elements.projectionRange.textContent = `${dateFormatter.format(start)} through ${dateFormatter.format(end)}`;
  elements.maxBalance.textContent = `Max: ${currency.format(Math.max(...balances))}`;
  elements.minBalance.textContent = `Min: ${currency.format(Math.min(...balances))}`;
  renderTimeline(rows);
  syncChartDates(start, end);
  drawChart(rows, Number(elements.startingBalance.value || 0), start, end);
  saveLocalPlan();
  updateSaveStatus(`Autosaved ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
}

function setChartRange(range) {
  const forecastStart = parseDate(elements.startDate.value);
  const forecastEnd = parseDate(elements.endDate.value);
  elements.chartStartDate.value = iso(forecastStart);
  elements.chartEndDate.value = range === 'all' ? iso(forecastEnd) : iso(addMonths(forecastStart, Number(range)));
  recalculate();
}

function syncChartDates(start, end) {
  if (!elements.chartStartDate.value) elements.chartStartDate.value = iso(start);
  if (!elements.chartEndDate.value) elements.chartEndDate.value = iso(addMonths(start, 1));
  if (parseDate(elements.chartStartDate.value) < start) elements.chartStartDate.value = iso(start);
  if (parseDate(elements.chartEndDate.value) > end) elements.chartEndDate.value = iso(end);
  if (parseDate(elements.chartEndDate.value) <= parseDate(elements.chartStartDate.value)) {
    elements.chartEndDate.value = iso(addDays(parseDate(elements.chartStartDate.value), 1));
  }
}

function renderTimeline(rows) {
  elements.timelineBody.replaceChildren(...rows.map((row, index) => {
    const tr = document.createElement('tr');
    const amountClass = row.amount >= 0 ? 'amount-positive' : 'amount-negative';
    tr.dataset.chartIndex = String(row.timelineIndex);
    tr.innerHTML = `<td>${dateFormatter.format(row.date)}</td><td>${row.label}</td><td class="${amountClass}">${currency.format(row.amount)}</td><td>${currency.format(row.balance)}</td>`;
    return tr;
  }));
}

function drawChart(rows, startingBalance, start, end) {
  const canvas = elements.chart;
  const rect = canvas.getBoundingClientRect();
  const pixelRatio = window.devicePixelRatio || 1;
  canvas.width = Math.max(600, Math.floor(rect.width * pixelRatio));
  canvas.height = Math.floor(320 * pixelRatio);
  const ctx = canvas.getContext('2d');
  ctx.scale(pixelRatio, pixelRatio);
  const width = canvas.width / pixelRatio;
  const height = canvas.height / pixelRatio;
  const pad = 44;
  const chartStart = parseDate(elements.chartStartDate.value);
  const chartEnd = parseDate(elements.chartEndDate.value);
  const seedRows = rows.filter((row) => row.date < chartStart);
  const balanceAtChartStart = seedRows.reduce((total, row) => total + Number(row.amount), startingBalance);
  const visibleRows = rows.filter((row) => row.date >= chartStart && row.date <= chartEnd);
  const points = [{ date: chartStart, balance: balanceAtChartStart, label: 'Graph range start', amount: 0, timelineIndex: 0 }, ...visibleRows];
  const min = Math.min(0, ...points.map((point) => point.balance));
  const max = Math.max(0, ...points.map((point) => point.balance));
  const range = max - min || 1;
  const span = chartEnd - chartStart || 1;
  const x = (date) => pad + ((date - chartStart) / span) * (width - pad * 2);
  const y = (value) => height - pad - ((value - min) / range) * (height - pad * 2);

  chartState.points = points.map((point, index) => ({
    ...point,
    index,
    x: x(point.date),
    y: y(point.balance)
  }));
  chartState.rows = visibleRows;
  chartState.startingBalance = startingBalance;
  chartState.start = chartStart;
  chartState.end = chartEnd;
  chartState.layout = { width, height, pad, min, max };

  paintChart();
  updateActivePoint(chartState.activeIndex, false);
}

function paintChart() {
  const canvas = elements.chart;
  const ctx = canvas.getContext('2d');
  const { width, height, pad, min, max } = chartState.layout;
  const range = max - min || 1;
  const zeroY = height - pad - ((0 - min) / range) * (height - pad * 2);
  const points = chartState.points;
  const activePoint = points[chartState.activeIndex];

  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = '#dbe4f3';
  ctx.fillStyle = '#657189';
  ctx.font = '12px Inter, system-ui, sans-serif';
  ctx.lineWidth = 1;

  drawMonthMarkers(ctx);

  for (let i = 0; i < 5; i += 1) {
    const gridY = pad + (i * (height - pad * 2)) / 4;
    const value = max - ((max - min) * i) / 4;
    ctx.beginPath();
    ctx.moveTo(pad, gridY);
    ctx.lineTo(width - pad, gridY);
    ctx.stroke();
    ctx.fillText(currency.format(value), 8, gridY + 4);
  }

  ctx.strokeStyle = '#ba2d2d';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 5]);
  ctx.beginPath();
  ctx.moveTo(pad, zeroY);
  ctx.lineTo(width - pad, zeroY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#ba2d2d';
  ctx.fillText('$0 / negative line', pad + 8, zeroY - 8);

  ctx.lineWidth = 3;
  points.slice(1).forEach((point, index) => {
    drawBalanceSegment(ctx, points[index], point, zeroY);
  });

  if (elements.trendLineToggle.checked) drawTrendLine(ctx);

  ctx.strokeStyle = '#3563ff';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 5]);
  const baselineY = chartState.points[0].y;
  ctx.beginPath();
  ctx.moveTo(pad, baselineY);
  ctx.lineTo(width - pad, baselineY);
  ctx.stroke();
  ctx.setLineDash([]);

  points.forEach((point, index) => {
    ctx.fillStyle = index === chartState.activeIndex ? '#3563ff' : '#ffffff';
    ctx.strokeStyle = index === chartState.activeIndex ? '#172033' : '#3563ff';
    ctx.lineWidth = index === chartState.activeIndex ? 3 : 2;
    ctx.beginPath();
    ctx.arc(point.x, point.y, index === chartState.activeIndex ? 6 : 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });

  if (activePoint) {
    ctx.strokeStyle = 'rgba(53, 99, 255, 0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(activePoint.x, pad);
    ctx.lineTo(activePoint.x, height - pad);
    ctx.stroke();
  }
}

function drawBalanceSegment(ctx, previous, point, zeroY) {
  const crossesZero = (previous.balance < 0 && point.balance >= 0) || (previous.balance >= 0 && point.balance < 0);

  if (!crossesZero) {
    ctx.strokeStyle = point.balance < 0 || previous.balance < 0 ? '#ba2d2d' : '#172033';
    ctx.beginPath();
    ctx.moveTo(previous.x, previous.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    return;
  }

  const zeroRatio = Math.abs(previous.balance) / (Math.abs(previous.balance) + Math.abs(point.balance));
  const zeroX = previous.x + (point.x - previous.x) * zeroRatio;
  const firstColor = previous.balance < 0 ? '#ba2d2d' : '#172033';
  const secondColor = point.balance < 0 ? '#ba2d2d' : '#172033';

  ctx.strokeStyle = firstColor;
  ctx.beginPath();
  ctx.moveTo(previous.x, previous.y);
  ctx.lineTo(zeroX, zeroY);
  ctx.stroke();

  ctx.strokeStyle = secondColor;
  ctx.beginPath();
  ctx.moveTo(zeroX, zeroY);
  ctx.lineTo(point.x, point.y);
  ctx.stroke();

  ctx.fillStyle = '#ba2d2d';
  ctx.beginPath();
  ctx.arc(zeroX, zeroY, 4, 0, Math.PI * 2);
  ctx.fill();
}

function drawTrendLine(ctx) {
  const points = chartState.points;
  if (points.length < 2) return;

  const firstDate = chartState.start.getTime();
  const data = points.map((point) => ({ x: point.date.getTime() - firstDate, y: point.balance }));
  const count = data.length;
  const sumX = data.reduce((sum, point) => sum + point.x, 0);
  const sumY = data.reduce((sum, point) => sum + point.y, 0);
  const sumXY = data.reduce((sum, point) => sum + point.x * point.y, 0);
  const sumXX = data.reduce((sum, point) => sum + point.x * point.x, 0);
  const denominator = count * sumXX - sumX * sumX;
  if (!denominator) return;

  const slope = (count * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / count;
  const startValue = intercept;
  const endValue = intercept + slope * (chartState.end.getTime() - firstDate);
  const { width, height, pad, min, max } = chartState.layout;
  const range = max - min || 1;
  const y = (value) => height - pad - ((value - min) / range) * (height - pad * 2);

  ctx.save();
  ctx.strokeStyle = '#12805c';
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 6]);
  ctx.beginPath();
  ctx.moveTo(pad, y(startValue));
  ctx.lineTo(width - pad, y(endValue));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#12805c';
  ctx.fillText('Trend', width - pad - 44, y(endValue) - 8);
  ctx.restore();
}

function drawMonthMarkers(ctx) {
  const { width, height, pad } = chartState.layout;
  const start = chartState.start;
  const end = chartState.end;
  const span = end - start || 1;
  const marker = new Date(start.getFullYear(), start.getMonth() + 1, 1);

  ctx.save();
  ctx.strokeStyle = 'rgba(101, 113, 137, 0.22)';
  ctx.fillStyle = '#657189';
  ctx.font = '11px Inter, system-ui, sans-serif';
  ctx.lineWidth = 1;
  while (marker < end) {
    const markerX = pad + ((marker - start) / span) * (width - pad * 2);
    ctx.beginPath();
    ctx.moveTo(markerX, pad);
    ctx.lineTo(markerX, height - pad);
    ctx.stroke();
    ctx.fillText(new Intl.DateTimeFormat('en-US', { month: 'short' }).format(marker), markerX + 4, height - 16);
    marker.setMonth(marker.getMonth() + 1);
  }
  ctx.restore();
}

function nearestPoint(clientX, clientY) {
  const rect = elements.chart.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  return chartState.points.reduce((nearest, point) => {
    const distance = Math.hypot(point.x - x, point.y - y);
    if (!nearest || distance < nearest.distance) return { point, distance };
    return nearest;
  }, null)?.point;
}

function updateActivePoint(index, showTooltip = true) {
  if (!chartState.points.length) return;
  chartState.activeIndex = index == null ? null : Math.max(0, Math.min(index, chartState.points.length - 1));
  paintChart();
  updateTooltip(showTooltip);
  highlightTimelineRow();
}

function updateTooltip(showTooltip) {
  const point = chartState.points[chartState.activeIndex];
  if (!showTooltip || !point) {
    elements.chartTooltip.hidden = true;
    return;
  }

  const change = point.index === 0 ? 'Starting point' : `${point.label}: ${currency.format(point.amount)}`;
  const date = document.createElement('strong');
  const changeLine = document.createElement('span');
  const balance = document.createElement('span');
  date.textContent = dateFormatter.format(point.date);
  changeLine.textContent = change;
  balance.textContent = `Balance: ${currency.format(point.balance)}`;
  elements.chartTooltip.replaceChildren(date, changeLine, balance);
  elements.chartTooltip.style.left = `${point.x}px`;
  elements.chartTooltip.style.top = `${point.y}px`;
  elements.chartTooltip.hidden = false;
}

function highlightTimelineRow() {
  document.querySelectorAll('[data-chart-index]').forEach((row) => {
    const activeTimelineIndex = chartState.points[chartState.activeIndex]?.timelineIndex;
    row.classList.toggle('timeline-row-active', Number(row.dataset.chartIndex) === activeTimelineIndex);
  });
}

function jumpToActiveTimelineRow() {
  const point = chartState.points[chartState.activeIndex];
  const row = document.querySelector(`[data-chart-index="${point?.timelineIndex}"]`);
  if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

elements.chart.addEventListener('pointermove', (event) => {
  const point = nearestPoint(event.clientX, event.clientY);
  updateActivePoint(point?.index);
});

elements.chart.addEventListener('pointerleave', () => updateActivePoint(null, false));

elements.chart.addEventListener('click', jumpToActiveTimelineRow);

elements.chart.addEventListener('keydown', (event) => {
  if (!['ArrowLeft', 'ArrowRight', 'Enter', ' '].includes(event.key)) return;
  event.preventDefault();
  if (event.key === 'Enter' || event.key === ' ') {
    jumpToActiveTimelineRow();
    return;
  }

  const direction = event.key === 'ArrowRight' ? 1 : -1;
  const currentIndex = chartState.activeIndex ?? 0;
  updateActivePoint(currentIndex + direction);
});

window.addEventListener('resize', recalculate);
renderInputs();
recalculate();
