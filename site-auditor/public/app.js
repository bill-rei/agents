const form = document.getElementById('auditor-form');
const submitBtn = document.getElementById('submit-btn');
const outputSection = document.getElementById('output-section');
const outputEl = document.getElementById('output');
const copyBtn = document.getElementById('copy-btn');

const singleFields = document.getElementById('single-fields');
const fullSiteFields = document.getElementById('full-site-fields');
const modeBtns = document.querySelectorAll('.mode-btn');

let currentMode = 'single';
let rawOutput = '';

// Mode toggle
modeBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    modeBtns.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentMode = btn.dataset.mode;

    if (currentMode === 'full') {
      singleFields.classList.add('hidden');
      fullSiteFields.classList.remove('hidden');
      submitBtn.textContent = 'Run Full Site Audit';
    } else {
      singleFields.classList.remove('hidden');
      fullSiteFields.classList.add('hidden');
      submitBtn.textContent = 'Run Audit';
    }
  });
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const filesInput = document.getElementById('referenceFiles');

  const body = {};

  if (currentMode === 'single') {
    body.pageUrl = form.pageUrl.value.trim();
    body.pageContent = form.pageContent.value.trim();
  } else {
    body.domain = form.domain.value.trim();
    body.pageUrls = form.pageUrls.value.trim();
    body.excludeUrls = form.excludeUrls.value.trim();
  }

  body.audienceSegments = form.audienceSegments.value.trim();
  body.notes = form.notes.value.trim();

  // Reference documents
  body.founderLanguageGuide = form.founderLanguageGuide.value.trim();
  body.productManual = form.productManual.value.trim();
  body.messagingFramework = form.messagingFramework.value.trim();
  body.brandSeparationRules = form.brandSeparationRules.value.trim();
  body.strategicGuardrails = form.strategicGuardrails.value.trim();
  body.referenceDocs = form.referenceDocs.value.trim();

  submitBtn.disabled = true;
  outputSection.classList.remove('hidden');
  outputEl.className = 'output-content loading';

  if (currentMode === 'full') {
    const pageCount = body.pageUrls ? body.pageUrls.split('\n').filter((u) => u.trim()).length : 0;
    submitBtn.textContent = 'Auditing...';
    outputEl.textContent = pageCount
      ? `Crawling and auditing ${pageCount} pages. This may take a few minutes...`
      : 'Auto-discovering pages and running audit. This may take a few minutes...';
  } else {
    submitBtn.textContent = 'Auditing...';
    outputEl.textContent = 'Running site audit. This may take a minute...';
  }

  try {
    let res;

    if (filesInput && filesInput.files && filesInput.files.length) {
      const fd = new FormData();
      Object.keys(body).forEach((k) => { if (body[k]) fd.append(k, body[k]); });
      for (const f of filesInput.files) fd.append('files', f, f.name);

      res = await fetch('/api/compile', {
        method: 'POST',
        body: fd,
      });
    } else {
      res = await fetch('/api/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    }

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Request failed');
    }

    rawOutput = data.result;
    outputEl.className = 'output-content';
    outputEl.textContent = rawOutput;
  } catch (err) {
    outputEl.className = 'output-content error';
    outputEl.textContent = 'Error: ' + err.message;
    rawOutput = '';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = currentMode === 'full' ? 'Run Full Site Audit' : 'Run Audit';
  }
});

copyBtn.addEventListener('click', () => {
  if (!rawOutput) return;

  navigator.clipboard.writeText(rawOutput).then(() => {
    const original = copyBtn.textContent;
    copyBtn.textContent = 'Copied';
    setTimeout(() => { copyBtn.textContent = original; }, 1500);
  }).catch(() => {
    const textarea = document.createElement('textarea');
    textarea.value = rawOutput;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    const original = copyBtn.textContent;
    copyBtn.textContent = 'Copied';
    setTimeout(() => { copyBtn.textContent = original; }, 1500);
  });
});
