(() => {
  const input = document.getElementById('input');
  const output = document.getElementById('output');
  const status = document.getElementById('status');
  const inputStats = document.getElementById('inputStats');
  const errorBox = document.getElementById('errorBox');
  const indentSelect = document.getElementById('indentSelect');

  const formatBtn = document.getElementById('formatBtn');
  const minifyBtn = document.getElementById('minifyBtn');
  const validateBtn = document.getElementById('validateBtn');
  const copyBtn = document.getElementById('copyBtn');
  const clearBtn = document.getElementById('clearBtn');

  function getIndent() {
    const v = indentSelect.value;
    return v === 'tab' ? '\t' : Number(v);
  }

  function lineColFromIndex(text, index) {
    const lines = text.slice(0, index).split('\n');
    return { line: lines.length, col: lines[lines.length - 1].length + 1 };
  }

  function parsePositionFromError(message) {
    const m = message.match(/position (\d+)/i);
    return m ? Number(m[1]) : null;
  }

  function showError(err) {
    let detail = err.message;
    const pos = parsePositionFromError(err.message);
    if (pos !== null && !/line \d+/i.test(err.message)) {
      const { line, col } = lineColFromIndex(input.value, pos);
      detail += ` (line ${line}, column ${col})`;
    }
    errorBox.textContent = detail;
    errorBox.classList.remove('hidden');
    status.textContent = 'Invalid';
    status.className = 'status invalid';
    output.textContent = '';
  }

  function clearError() {
    errorBox.classList.add('hidden');
    errorBox.textContent = '';
  }

  function escapeHtml(str) {
    return str.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  }

  function highlight(json) {
    const pattern = /("(\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false)\b|\bnull\b|-?\d+(\.\d+)?([eE][+-]?\d+)?)/g;
    return escapeHtml(json).replace(pattern, match => {
      let cls = 'jnum';
      if (/^"/.test(match)) {
        cls = /:$/.test(match) ? 'jkey' : 'jstr';
      } else if (/true|false/.test(match)) {
        cls = 'jbool';
      } else if (/null/.test(match)) {
        cls = 'jnull';
      }
      return `<span class="${cls}">${match}</span>`;
    });
  }

  function updateStats() {
    const text = input.value;
    const bytes = new Blob([text]).size;
    inputStats.textContent = text ? `${text.length} chars · ${bytes} bytes` : '';
  }

  function setOutput(text) {
    output.innerHTML = highlight(text);
  }

  function tryParse() {
    return JSON.parse(input.value);
  }

  function format() {
    clearError();
    if (!input.value.trim()) {
      output.textContent = '';
      status.textContent = '';
      status.className = 'status';
      return;
    }
    try {
      const data = tryParse();
      setOutput(JSON.stringify(data, null, getIndent()));
      status.textContent = 'Valid';
      status.className = 'status valid';
    } catch (err) {
      showError(err);
    }
  }

  function minify() {
    clearError();
    if (!input.value.trim()) {
      output.textContent = '';
      status.textContent = '';
      status.className = 'status';
      return;
    }
    try {
      const data = tryParse();
      setOutput(JSON.stringify(data));
      status.textContent = 'Valid';
      status.className = 'status valid';
    } catch (err) {
      showError(err);
    }
  }

  function validate() {
    clearError();
    if (!input.value.trim()) {
      status.textContent = '';
      status.className = 'status';
      return;
    }
    try {
      tryParse();
      status.textContent = 'Valid';
      status.className = 'status valid';
    } catch (err) {
      showError(err);
    }
  }

  function copyOutput() {
    const text = output.textContent;
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      const original = copyBtn.textContent;
      copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = original; }, 1200);
    });
  }

  function clearAll() {
    input.value = '';
    output.textContent = '';
    status.textContent = '';
    status.className = 'status';
    clearError();
    updateStats();
    input.focus();
  }

  formatBtn.addEventListener('click', format);
  minifyBtn.addEventListener('click', minify);
  validateBtn.addEventListener('click', validate);
  copyBtn.addEventListener('click', copyOutput);
  clearBtn.addEventListener('click', clearAll);
  input.addEventListener('input', updateStats);

  input.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      format();
    }
  });
})();
