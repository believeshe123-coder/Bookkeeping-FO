const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const today = new Date();
const iso = (date) => date.toISOString().slice(0, 10);
const addDays = (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const addMonths = (date, months) => new Date(date.getFullYear(), date.getMonth() + months, date.getDate());
const parseDate = (value) => {
  const fallback = iso(today);
  return new Date(`${value || fallback}T00:00:00`);
};

const state = {
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
  chart: document.querySelector('#balanceChart')
};

elements.startDate.value = iso(today);
elements.endDate.value = iso(addMonths(today, 30));

document.querySelector('#addConstant').addEventListener('click', () => {
  state.constants.push({ label: 'New constant', amount: 0, frequency: 'monthly', date: elements.startDate.value });
  renderInputs();
  recalculate();
});

document.querySelector('#addVariable').addEventListener('click', () => {
  state.variables.push({ label: 'New variable', amount: 0, date: elements.startDate.value });
  renderInputs();
  recalculate();
});

document.querySelector('#recalculateButton').addEventListener('click', recalculate);
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
      date = nextDate(date, item.frequency);
    }
  });

  return events.sort((a, b) => a.date - b.date || b.amount - a.amount);
}

function nextDate(date, frequency) {
  if (frequency === 'weekly') return addDays(date, 7);
  if (frequency === 'biweekly') return addDays(date, 14);
  return addMonths(date, 1);
}

function recalculate() {
  const start = parseDate(elements.startDate.value);
  const end = parseDate(elements.endDate.value);
  const events = buildEvents();
  let balance = Number(elements.startingBalance.value || 0);
  const rows = events.map((event) => {
    balance += Number(event.amount);
    return { ...event, balance };
  });
  const balances = [Number(elements.startingBalance.value || 0), ...rows.map((row) => row.balance)];
  elements.projectedBalance.textContent = currency.format(balance);
  elements.projectionRange.textContent = `${dateFormatter.format(start)} through ${dateFormatter.format(end)}`;
  elements.maxBalance.textContent = `Max: ${currency.format(Math.max(...balances))}`;
  elements.minBalance.textContent = `Min: ${currency.format(Math.min(...balances))}`;
  renderTimeline(rows);
  drawChart(rows, Number(elements.startingBalance.value || 0), start, end);
}

function renderTimeline(rows) {
  elements.timelineBody.replaceChildren(...rows.map((row) => {
    const tr = document.createElement('tr');
    const amountClass = row.amount >= 0 ? 'amount-positive' : 'amount-negative';
    tr.innerHTML = `<td>${dateFormatter.format(row.date)}</td><td>${row.label}</td><td class="${amountClass}">${currency.format(row.amount)}</td><td>${currency.format(row.balance)}</td>`;
    return tr;
  }));
}

function drawChart(rows, startingBalance, start, end) {
  const canvas = elements.chart;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(600, Math.floor(rect.width * window.devicePixelRatio));
  canvas.height = Math.floor(240 * window.devicePixelRatio);
  const ctx = canvas.getContext('2d');
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  const width = canvas.width / window.devicePixelRatio;
  const height = canvas.height / window.devicePixelRatio;
  const pad = 34;
  const points = [{ date: start, balance: startingBalance }, ...rows];
  const min = Math.min(...points.map((point) => point.balance));
  const max = Math.max(...points.map((point) => point.balance));
  const range = max - min || 1;
  const span = end - start || 1;
  const x = (date) => pad + ((date - start) / span) * (width - pad * 2);
  const y = (value) => height - pad - ((value - min) / range) * (height - pad * 2);

  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = '#dbe4f3';
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i += 1) {
    const gridY = pad + (i * (height - pad * 2)) / 4;
    ctx.beginPath();
    ctx.moveTo(pad, gridY);
    ctx.lineTo(width - pad, gridY);
    ctx.stroke();
  }

  ctx.strokeStyle = '#172033';
  ctx.lineWidth = 3;
  ctx.beginPath();
  points.forEach((point, index) => {
    const px = x(point.date);
    const py = y(point.balance);
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();

  ctx.strokeStyle = '#3563ff';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.moveTo(pad, y(startingBalance));
  ctx.lineTo(width - pad, y(startingBalance));
  ctx.stroke();
  ctx.setLineDash([]);
}

window.addEventListener('resize', recalculate);
renderInputs();
recalculate();
