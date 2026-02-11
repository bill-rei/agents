const form = document.getElementById('wma-form');
const submitBtn = document.getElementById('submit-btn');
const outputSection = document.getElementById('output-section');
const outputEl = document.getElementById('output');
const copyBtn = document.getElementById('copy-btn');

let rawOutput = '';

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const filesInput = document.getElementById('referenceFiles');

  const body = {
    pageName: form.pageName.value.trim(),
    strategistTheme: form.strategistTheme.value.trim(),
    strategistPersona: form.strategistPersona.value.trim(),
    strategistScope: form.strategistScope.value.trim(),
    strategistExclusions: form.strategistExclusions.value.trim(),
    siteAuditInput: form.siteAuditInput.value.trim(),
    referenceDocs: form.referenceDocs.value.trim(),
  };

  submitBtn.disabled = true;
  submitBtn.textContent = 'Generating...';
  outputSection.classList.remove('hidden');
  outputEl.className = 'output-content loading';
  outputEl.textContent = 'Generating page messaging architecture. This may take a minute...';

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
    submitBtn.textContent = 'Generate Page Copy';
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
