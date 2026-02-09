const pdf = require('pdf-parse');
const mammoth = require('mammoth');

module.exports = async function parseDoc(buffer, mimetype, filename) {
  const lower = (filename || '').toLowerCase();

  if (mimetype === 'application/pdf' || lower.endsWith('.pdf')) {
    const data = await pdf(buffer);
    return data.text || '';
  }

  if (
    mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    lower.endsWith('.docx')
  ) {
    const res = await mammoth.extractRawText({ buffer });
    return res && res.value ? res.value : '';
  }

  // Fallback: treat as utf-8 text
  return buffer.toString('utf8');
};
