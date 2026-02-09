const form = document.getElementById('campaign-form');
const submitBtn = document.getElementById('submit-btn');
const outputSection = document.getElementById('output-section');
const outputEl = document.getElementById('output');
const copyBtn = document.getElementById('copy-btn');

let rawOutput = '';

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const body = {
    campaignTitle: form.campaignTitle.value.trim(),
    campaignTheme: form.campaignTheme.value.trim(),
    primaryPersona: form.primaryPersona.value.trim(),
    useCase: form.useCase.value.trim(),
    releaseContext: form.releaseContext.value.trim(),
    notes: form.notes.value.trim(),
    referenceDocs: form.referenceDocs.value.trim(),
  };

  submitBtn.disabled = true;
  submitBtn.textContent = 'Compiling...';
  outputSection.classList.remove('hidden');
  outputEl.className = 'output-content loading';
  outputEl.textContent = 'Compiling campaign draft. This may take a minute...';

  try {
    const res = await fetch('/api/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

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
    submitBtn.textContent = 'Compile Campaign';
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
