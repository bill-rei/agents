const form = document.getElementById('renderer-form');
const submitBtn = document.getElementById('submit-btn');
const outputSection = document.getElementById('output-section');
const outputEl = document.getElementById('output');
const previewEl = document.getElementById('preview');
const copyBtn = document.getElementById('copy-btn');
const toggleBtn = document.getElementById('toggle-btn');

let rawHtml = '';
let showingPreview = false;

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const constraintsText = form.constraints.value.trim();
  const constraints = constraintsText
    ? constraintsText.split('\n').map((l) => l.trim()).filter(Boolean)
    : [];

  const body = {
    rawCopy: form.rawCopy.value.trim(),
    pageName: form.pageName.value.trim(),
    renderProfile: form.renderProfile.value.trim(),
    constraints,
  };

  submitBtn.disabled = true;
  submitBtn.textContent = 'Rendering...';
  outputSection.classList.remove('hidden');
  outputEl.classList.remove('hidden');
  previewEl.classList.add('hidden');
  outputEl.className = 'output-content loading';
  outputEl.textContent = 'Rendering HTML. This may take a minute...';
  showingPreview = false;
  toggleBtn.classList.remove('active');
  toggleBtn.textContent = 'Preview';

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

    rawHtml = data.content.html;
    outputEl.className = 'output-content';
    outputEl.textContent = rawHtml;
    previewEl.innerHTML = rawHtml;
  } catch (err) {
    outputEl.className = 'output-content error';
    outputEl.textContent = 'Error: ' + err.message;
    rawHtml = '';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Render HTML';
  }
});

toggleBtn.addEventListener('click', () => {
  if (!rawHtml) return;
  showingPreview = !showingPreview;

  if (showingPreview) {
    outputEl.classList.add('hidden');
    previewEl.classList.remove('hidden');
    toggleBtn.classList.add('active');
    toggleBtn.textContent = 'Source';
  } else {
    outputEl.classList.remove('hidden');
    previewEl.classList.add('hidden');
    toggleBtn.classList.remove('active');
    toggleBtn.textContent = 'Preview';
  }
});

copyBtn.addEventListener('click', () => {
  if (!rawHtml) return;

  navigator.clipboard.writeText(rawHtml).then(() => {
    const original = copyBtn.textContent;
    copyBtn.textContent = 'Copied';
    setTimeout(() => { copyBtn.textContent = original; }, 1500);
  }).catch(() => {
    const textarea = document.createElement('textarea');
    textarea.value = rawHtml;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    const original = copyBtn.textContent;
    copyBtn.textContent = 'Copied';
    setTimeout(() => { copyBtn.textContent = original; }, 1500);
  });
});
