const CONFIG = {
 appsScriptUrl: 'https://script.google.com/macros/s/AKfycbxXD3h22F5A8iBWEeWNLEZMnbzAtVPK8C3uKDXsHNxW9h3Lgu6WSobPagaPk3VUYQJp6A/exec',
  googleFormUrl: 'https://docs.google.com/forms/d/e/1FAIpQLSdIcr7-lC4Lm5zkYiRm_56rlV3vDbx5izsxV-dSuQc1einRRg/viewform',
  requestTimeoutMs: 20000,
  minimumRequiredFields: 2,
};


const form = document.getElementById('lookupForm');
const statusMessage = document.getElementById('statusMessage');
const checkBtn = document.getElementById('checkBtn');
const resultsSection = document.getElementById('resultsSection');
const resultsBody = document.getElementById('resultsBody');
const resultCountBadge = document.getElementById('resultCountBadge');

const notFoundModal = document.getElementById('notFoundModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const dismissModalBtn = document.getElementById('dismissModalBtn');
const answerFormBtn = document.getElementById('answerFormBtn');

const showQrBtn = document.getElementById('showQrBtn');
const qrModal = document.getElementById('qrModal');
const closeQrModalBtn = document.getElementById('closeQrModalBtn');
const closeQrBtn = document.getElementById('closeQrBtn');
const qrCanvas = document.getElementById('qrCanvas');

let qrInstance = null;

form.addEventListener('submit', handleLookup);
form.addEventListener('reset', handleReset);

closeModalBtn.addEventListener('click', closeNoRecordModal);
dismissModalBtn.addEventListener('click', closeNoRecordModal);
answerFormBtn.addEventListener('click', () => {
  window.location.href = CONFIG.googleFormUrl;
});

notFoundModal.addEventListener('click', (event) => {
  if (event.target === notFoundModal) closeNoRecordModal();
});

showQrBtn.addEventListener('click', openQrModal);
closeQrModalBtn.addEventListener('click', closeQrModal);
closeQrBtn.addEventListener('click', closeQrModal);

qrModal.addEventListener('click', (event) => {
  if (event.target === qrModal) closeQrModal();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeNoRecordModal();
    closeQrModal();
  }
});

async function handleLookup(event) {
  event.preventDefault();
  closeNoRecordModal();

  const input = getNormalizedInput();

  if (!CONFIG.appsScriptUrl.includes('/exec')) {
    setStatus('Please set your Apps Script Web App URL first in script.js.', 'error');
    return;
  }

  if (!CONFIG.googleFormUrl.includes('docs.google.com/forms')) {
    setStatus('Please set your Google Form URL first in script.js.', 'error');
    return;
  }

  if (!hasMinimumSearchFields(input)) {
    setStatus('Enter any 2 of these 3 fields: First Name, Last Name, Birthdate.', 'error');
    hideResults();
    return;
  }

  try {
    setLoadingState(true);
    setStatus('Checking Google Sheets records...', 'success');

    const response = await lookupRecord(input);

    if (!response || response.ok !== true) {
      throw new Error(response?.error || 'Unable to read the sheet records.');
    }

    if (!Array.isArray(response.results) || response.results.length === 0) {
      hideResults();
      setStatus('No record found.', 'error');
      openNoRecordModal();
      return;
    }

    renderResults(response.results);
    setStatus('Record found.', 'success');
  } catch (error) {
    hideResults();
    setStatus(error.message || 'Something went wrong while checking the record.', 'error');
  } finally {
    setLoadingState(false);
  }
}

function handleReset() {
  setTimeout(() => {
    setStatus('');
    hideResults();
    closeNoRecordModal();
    closeQrModal();
  }, 0);
}

function getNormalizedInput() {
  return {
    lastName: normalizeName(document.getElementById('lastName').value),
    firstName: normalizeName(document.getElementById('firstName').value),
    birthdate: normalizeDate(document.getElementById('birthdate').value),
  };
}

function hasMinimumSearchFields(input) {
  return countFilledFields(input) >= CONFIG.minimumRequiredFields;
}

function countFilledFields(input) {
  return Object.values(input).filter(Boolean).length;
}

function setLoadingState(isLoading) {
  checkBtn.disabled = isLoading;
  checkBtn.textContent = isLoading ? 'Checking...' : 'Check Record';
}

function setStatus(message, type = '') {
  statusMessage.textContent = message;
  statusMessage.className = `status ${type}`.trim();
}

function renderResults(results) {
  resultsBody.innerHTML = '';

  results.forEach((record) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td data-label="Timestamp">${escapeHtml(formatTimestamp(record.timestamp || ''))}</td>
      <td data-label="Last Name">${renderNullable(record.lastName)}</td>
      <td data-label="First Name">${renderNullable(record.firstName)}</td>
      <td data-label="Middle Name">${renderNullable(record.middleName)}</td>
      <td data-label="Birthdate">${renderNullable(formatBirthdate(record.birthdate))}</td>
      <td data-label="Email Address">${renderNullable(record.email)}</td>
    `;
    resultsBody.appendChild(row);
  });

  const count = results.length;
  resultCountBadge.textContent = `${count} ${count === 1 ? 'result' : 'results'}`;
  resultsSection.classList.remove('is-hidden');
  resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderNullable(value) {
  if (!value || String(value).trim() === '') return '<span class="empty-cell">—</span>';
  return escapeHtml(String(value));
}

function hideResults() {
  resultsBody.innerHTML = '';
  resultsSection.classList.add('is-hidden');
  resultCountBadge.textContent = '0 result';
}

function openNoRecordModal() {
  notFoundModal.classList.add('show');
  notFoundModal.setAttribute('aria-hidden', 'false');
  syncBodyModalState();
}

function closeNoRecordModal() {
  notFoundModal.classList.remove('show');
  notFoundModal.setAttribute('aria-hidden', 'true');
  syncBodyModalState();
}

function openQrModal() {
  if (!CONFIG.googleFormUrl.includes('docs.google.com/forms')) {
    setStatus('Please set your Google Form URL first in script.js.', 'error');
    return;
  }

  if (typeof QRious === 'undefined') {
    setStatus('QR library failed to load. Check your internet connection.', 'error');
    return;
  }

  if (!qrInstance) {
    qrInstance = new QRious({
      element: qrCanvas,
      value: CONFIG.googleFormUrl,
      size: 320,
      level: 'H',
      background: 'white',
      foreground: 'black',
      padding: 16,
    });
  } else {
    qrInstance.value = CONFIG.googleFormUrl;
    qrInstance.size = 320;
  }

  qrModal.classList.add('show');
  qrModal.setAttribute('aria-hidden', 'false');
  syncBodyModalState();
}

function closeQrModal() {
  qrModal.classList.remove('show');
  qrModal.setAttribute('aria-hidden', 'true');
  syncBodyModalState();
}

function syncBodyModalState() {
  const hasOpenModal =
    notFoundModal.classList.contains('show') ||
    qrModal.classList.contains('show');

  document.body.classList.toggle('modal-open', hasOpenModal);
}

function lookupRecord(input) {
  return jsonpRequest(CONFIG.appsScriptUrl, {
    action: 'lookup',
    lastName: input.lastName,
    firstName: input.firstName,
    birthdate: input.birthdate,
  });
}

function jsonpRequest(baseUrl, params) {
  return new Promise((resolve, reject) => {
    const callbackName = `lookupCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement('script');
    let timeoutId;

    const cleanup = () => {
      if (window[callbackName]) delete window[callbackName];
      script.remove();
      clearTimeout(timeoutId);
    };

    timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error('Request timed out while contacting Apps Script.'));
    }, CONFIG.requestTimeoutMs);

    window[callbackName] = (payload) => {
      cleanup();
      resolve(payload);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error('Unable to connect to Apps Script. Check your deployed URL and access settings.'));
    };

    const query = new URLSearchParams({
      ...params,
      callback: callbackName,
      _: Date.now().toString(),
    });

    script.src = `${baseUrl}?${query.toString()}`;
    document.body.appendChild(script);
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '')
    .replace(/[.,]/g, '');
}

function normalizeDate(value) {
  if (!value) return '';

  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';

  const yyyy = parsed.getFullYear();
  const mm = String(parsed.getMonth() + 1).padStart(2, '0');
  const dd = String(parsed.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatBirthdate(value) {
  if (!value) return '—';

  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    const [year, month, day] = String(value).split('-').map(Number);
    const parsed = new Date(year, month - 1, day);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    }
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value || '—';

  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatTimestamp(value) {
  if (!value) return '—';

  const raw = String(value).trim();
  let parsed = new Date(raw);

  if (Number.isNaN(parsed.getTime()) && raw.includes(' ')) {
    parsed = new Date(raw.replace(' ', 'T'));
  }

  if (Number.isNaN(parsed.getTime())) return raw;

  const datePart = parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const timePart = parsed
    .toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
    .replace(/\s/g, '')
    .toLowerCase();

  return `${datePart}- ${timePart}`;
}
