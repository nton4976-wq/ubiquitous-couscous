const CONFIG = {
  appsScriptUrl: 'https://script.google.com/macros/s/AKfycbwnAz-H_B1jXLaVhRK98X6avBBc25hDtllxAifExBOOIb6yOwKJwvxf6B4V8xo8s0Ktdw/exec',
  googleFormUrl: 'https://docs.google.com/forms/d/e/1FAIpQLSerIsiV_wCqtP2qC_V_cdzvw4bVEaw9zG1bnUphm9-ME9BZBQ/viewform',
  requestTimeoutMs: 20000,
};

const form = document.getElementById('lookupForm');
const statusMessage = document.getElementById('statusMessage');
const checkBtn = document.getElementById('checkBtn');
const resultsSection = document.getElementById('resultsSection');
const resultsBody = document.getElementById('resultsBody');
const resultCountBadge = document.getElementById('resultCountBadge');

const notFoundModal = document.getElementById('notFoundModal');
const closeNotFoundModalBtn = document.getElementById('closeNotFoundModalBtn');
const dismissNotFoundModalBtn = document.getElementById('dismissNotFoundModalBtn');

const claimModal = document.getElementById('claimModal');
const closeClaimModalBtn = document.getElementById('closeClaimModalBtn');
const claimNoBtn = document.getElementById('claimNoBtn');
const claimYesBtn = document.getElementById('claimYesBtn');
const claimModalSubtitle = document.getElementById('claimModalSubtitle');

const showQrBtn = document.getElementById('showQrBtn');
const copyLinkBtn = document.getElementById('copyLinkBtn');
const qrModal = document.getElementById('qrModal');
const closeQrModalBtn = document.getElementById('closeQrModalBtn');
const closeQrBtn = document.getElementById('closeQrBtn');
const qrCanvas = document.getElementById('qrCanvas');
const qrFormLink = document.getElementById('qrFormLink');

let currentMatchedRows = [];
let qrInstance = null;

form.addEventListener('submit', handleLookup);
form.addEventListener('reset', handleReset);

closeNotFoundModalBtn.addEventListener('click', closeNotFoundModal);
dismissNotFoundModalBtn.addEventListener('click', closeNotFoundModal);
closeClaimModalBtn.addEventListener('click', closeClaimModal);
claimNoBtn.addEventListener('click', closeClaimModal);
claimYesBtn.addEventListener('click', handleClaimYes);

showQrBtn.addEventListener('click', openQrModal);
copyLinkBtn.addEventListener('click', copyGoogleFormLink);
closeQrModalBtn.addEventListener('click', closeQrModal);
closeQrBtn.addEventListener('click', closeQrModal);

notFoundModal.addEventListener('click', (event) => {
  if (event.target === notFoundModal) closeNotFoundModal();
});

claimModal.addEventListener('click', (event) => {
  if (event.target === claimModal) closeClaimModal();
});

qrModal.addEventListener('click', (event) => {
  if (event.target === qrModal) closeQrModal();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeNotFoundModal();
    closeClaimModal();
    closeQrModal();
  }
});

async function handleLookup(event) {
  event.preventDefault();
  closeNotFoundModal();
  closeClaimModal();

  const input = getNormalizedInput();

  if (!CONFIG.appsScriptUrl.includes('/exec')) {
    setStatus('Please set your Apps Script Web App URL first in script.js.', 'error');
    return;
  }

  if (!input.firstName || !input.lastName) {
    setStatus('Please enter both First Name and Last Name.', 'error');
    hideResults();
    return;
  }

  try {
    setLookupLoadingState(true);
    setStatus('Searching alumni record...', 'success');

    const response = await jsonpRequest(CONFIG.appsScriptUrl, {
      action: 'lookup',
      firstName: input.firstName,
      lastName: input.lastName,
    });

    if (!response || response.ok !== true) {
      throw new Error(response?.error || 'Unable to read the sheet records.');
    }

    if (!Array.isArray(response.results) || response.results.length === 0) {
      currentMatchedRows = [];
      hideResults();
      setStatus('No record found.', 'error');
      openNotFoundModal();
      return;
    }

    currentMatchedRows = response.results
      .map((record) => Number(record.rowNumber))
      .filter((rowNumber) => Number.isInteger(rowNumber) && rowNumber > 0);

    renderResults(response.results);
    setStatus('Record found.', 'success');
    openClaimModal(response.results.length);
  } catch (error) {
    currentMatchedRows = [];
    hideResults();
    setStatus(error.message || 'Something went wrong while searching.', 'error');
  } finally {
    setLookupLoadingState(false);
  }
}

async function handleClaimYes() {
  if (!currentMatchedRows.length) {
    closeClaimModal();
    setStatus('No matched record is ready to log.', 'error');
    return;
  }

  try {
    setClaimLoadingState(true);
    setStatus('Recording claim in logbook...', 'success');

    const response = await jsonpRequest(CONFIG.appsScriptUrl, {
      action: 'claim',
      rowNumbers: currentMatchedRows.join(','),
    });

    if (!response || response.ok !== true) {
      throw new Error(response?.error || 'Unable to record the claim in logbook.');
    }

    const insertedCount = Number(response.insertedCount || 0);
    closeClaimModal();
    setStatus(
      insertedCount > 0
        ? `Claim recorded successfully in logbook. ${insertedCount} row${insertedCount > 1 ? 's' : ''} added.`
        : 'No new row was added to the logbook.',
      insertedCount > 0 ? 'success' : 'error'
    );
  } catch (error) {
    setStatus(error.message || 'Something went wrong while saving the claim.', 'error');
  } finally {
    setClaimLoadingState(false);
  }
}

function handleReset() {
  setTimeout(() => {
    currentMatchedRows = [];
    setStatus('');
    hideResults();
    closeNotFoundModal();
    closeClaimModal();
    closeQrModal();
  }, 0);
}

function getNormalizedInput() {
  return {
    firstName: normalizeName(document.getElementById('firstName').value),
    lastName: normalizeName(document.getElementById('lastName').value),
  };
}

function setLookupLoadingState(isLoading) {
  checkBtn.disabled = isLoading;
  checkBtn.textContent = isLoading ? 'Searching...' : 'Search Alumni';
}

function setClaimLoadingState(isLoading) {
  claimYesBtn.disabled = isLoading;
  claimNoBtn.disabled = isLoading;
  closeClaimModalBtn.disabled = isLoading;
  claimYesBtn.textContent = isLoading ? 'Saving...' : 'YES';
}

function setStatus(message, type = '') {
  if (!statusMessage) return;
  statusMessage.textContent = message;
  statusMessage.className = `status ${type}`.trim();
}

function renderResults(results) {
  resultsBody.innerHTML = '';

  results.forEach((record) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td data-label="Timestamp" class="cell-medium">${escapeHtml(formatTimestamp(record.timestamp || ''))}</td>
      <td data-label="First Name" class="cell-compact">${renderNullable(record.firstName)}</td>
      <td data-label="Middle Name" class="cell-compact">${renderNullable(record.middleName)}</td>
      <td data-label="Last Name" class="cell-compact">${renderNullable(record.lastName)}</td>
      <td data-label="Degree Program" class="cell-medium">${renderNullable(record.degreeProgram)}</td>
      <td data-label="Campus/College" class="cell-medium">${renderNullable(record.campusCollege)}</td>
    `;
    resultsBody.appendChild(row);
  });

  const count = results.length;
  resultCountBadge.textContent = `${count} ${count === 1 ? 'result' : 'results'}`;
  resultsSection.classList.remove('is-hidden');
  resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderNullable(value) {
  if (!value || String(value).trim() === '') {
    return '<span class="empty-cell">—</span>';
  }
  return escapeHtml(String(value));
}

function hideResults() {
  resultsBody.innerHTML = '';
  resultsSection.classList.add('is-hidden');
  resultCountBadge.textContent = '0 result';
}

function openNotFoundModal() {
  notFoundModal.classList.add('show');
  notFoundModal.setAttribute('aria-hidden', 'false');
  syncBodyModalState();
}

function closeNotFoundModal() {
  notFoundModal.classList.remove('show');
  notFoundModal.setAttribute('aria-hidden', 'true');
  syncBodyModalState();
}

function openClaimModal(resultCount) {
  claimModalSubtitle.textContent = resultCount > 1
    ? `There are ${resultCount} matched records shown below. Choose YES to record all displayed records in the logbook.`
    : 'Choose YES to record this alumni in the logbook sheet.';
  claimModal.classList.add('show');
  claimModal.setAttribute('aria-hidden', 'false');
  syncBodyModalState();
}

function closeClaimModal() {
  claimModal.classList.remove('show');
  claimModal.setAttribute('aria-hidden', 'true');
  syncBodyModalState();
}

function openQrModal() {
  if (!CONFIG.googleFormUrl.includes('docs.google.com/forms')) {
    setStatus('Please set your Google Form URL first in script.js.', 'error');
    return;
  }

  if (typeof QRious === 'undefined') {
    setStatus('QR code library failed to load. Check your internet connection.', 'error');
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
      padding: 14,
    });
  } else {
    qrInstance.value = CONFIG.googleFormUrl;
    qrInstance.size = 320;
  }

  qrFormLink.href = CONFIG.googleFormUrl;
  qrModal.classList.add('show');
  qrModal.setAttribute('aria-hidden', 'false');
  syncBodyModalState();
}

function closeQrModal() {
  qrModal.classList.remove('show');
  qrModal.setAttribute('aria-hidden', 'true');
  syncBodyModalState();
}

async function copyGoogleFormLink() {
  if (!CONFIG.googleFormUrl.includes('docs.google.com/forms')) {
    setStatus('Please set your Google Form URL first in script.js.', 'error');
    return;
  }

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(CONFIG.googleFormUrl);
    } else {
      fallbackCopyText(CONFIG.googleFormUrl);
    }
    setStatus('Google Form link copied.', 'success');
  } catch (error) {
    setStatus('Unable to copy the Google Form link.', 'error');
  }
}

function fallbackCopyText(text) {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.setAttribute('readonly', '');
  textArea.style.position = 'fixed';
  textArea.style.left = '-9999px';
  document.body.appendChild(textArea);
  textArea.select();
  document.execCommand('copy');
  textArea.remove();
}

function syncBodyModalState() {
  const hasOpenModal =
    notFoundModal.classList.contains('show') ||
    claimModal.classList.contains('show') ||
    qrModal.classList.contains('show');

  document.body.classList.toggle('modal-open', hasOpenModal);
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

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
