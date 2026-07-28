(() => {
  const input = document.getElementById('input');
  const output = document.getElementById('output');
  const treeOutput = document.getElementById('treeOutput');
  const status = document.getElementById('status');
  const inputStats = document.getElementById('inputStats');
  const errorBox = document.getElementById('errorBox');
  const indentSelect = document.getElementById('indentSelect');
  const treeToggle = document.getElementById('treeToggle');

  const formatBtn = document.getElementById('formatBtn');
  const minifyBtn = document.getElementById('minifyBtn');
  const validateBtn = document.getElementById('validateBtn');
  const copyBtn = document.getElementById('copyBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const uploadBtn = document.getElementById('uploadBtn');
  const fileInput = document.getElementById('fileInput');
  const clearBtn = document.getElementById('clearBtn');

  let lastParsed;
  let lastParsedOk = false;

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

  function valueSpan(value) {
    if (typeof value === 'string') return `<span class="jstr">${escapeHtml(JSON.stringify(value))}</span>`;
    if (typeof value === 'number') return `<span class="jnum">${value}</span>`;
    if (typeof value === 'boolean') return `<span class="jbool">${value}</span>`;
    if (value === null) return `<span class="jnull">null</span>`;
    return '';
  }

  function buildTreeNode(key, value) {
    const isContainer = value !== null && typeof value === 'object';
    if (!isContainer) {
      const row = document.createElement('div');
      row.className = 'tree-leaf';
      row.innerHTML = (key !== null ? `<span class="jkey">${escapeHtml(JSON.stringify(key))}:</span> ` : '') + valueSpan(value);
      return row;
    }

    const isArray = Array.isArray(value);
    const entries = isArray ? value.map((v, i) => [i, v]) : Object.entries(value);
    const details = document.createElement('details');
    details.open = true;
    details.className = 'tree-node';

    const summary = document.createElement('summary');
    const label = key !== null ? `<span class="jkey">${escapeHtml(JSON.stringify(key))}:</span> ` : '';
    const bracket = isArray ? `[${entries.length}]` : `{${entries.length}}`;
    summary.innerHTML = `${label}<span class="tree-bracket">${bracket}</span>`;
    details.appendChild(summary);

    const children = document.createElement('div');
    children.className = 'tree-children';
    if (entries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'tree-empty';
      empty.textContent = isArray ? '(empty array)' : '(empty object)';
      children.appendChild(empty);
    } else {
      for (const [k, v] of entries) {
        children.appendChild(buildTreeNode(isArray ? null : k, v));
      }
    }
    details.appendChild(children);
    return details;
  }

  function renderTree(data) {
    treeOutput.innerHTML = '';
    treeOutput.appendChild(buildTreeNode(null, data));
  }

  function refreshTreeVisibility() {
    if (treeToggle.checked && lastParsedOk) {
      renderTree(lastParsed);
      output.classList.add('hidden');
      treeOutput.classList.remove('hidden');
    } else {
      output.classList.remove('hidden');
      treeOutput.classList.add('hidden');
    }
  }

  function tryParse() {
    return JSON.parse(input.value);
  }

  function resetOutput() {
    output.textContent = '';
    treeOutput.innerHTML = '';
    status.textContent = '';
    status.className = 'status';
    lastParsedOk = false;
  }

  function format() {
    clearError();
    if (!input.value.trim()) {
      resetOutput();
      return;
    }
    try {
      const data = tryParse();
      lastParsed = data;
      lastParsedOk = true;
      setOutput(JSON.stringify(data, null, getIndent()));
      status.textContent = 'Valid';
      status.className = 'status valid';
      refreshTreeVisibility();
    } catch (err) {
      lastParsedOk = false;
      showError(err);
    }
  }

  function minify() {
    clearError();
    if (!input.value.trim()) {
      resetOutput();
      return;
    }
    try {
      const data = tryParse();
      lastParsed = data;
      lastParsedOk = true;
      setOutput(JSON.stringify(data));
      status.textContent = 'Valid';
      status.className = 'status valid';
      refreshTreeVisibility();
    } catch (err) {
      lastParsedOk = false;
      showError(err);
    }
  }

  function validate() {
    clearError();
    if (!input.value.trim()) {
      status.textContent = '';
      status.className = 'status';
      lastParsedOk = false;
      return;
    }
    try {
      lastParsed = tryParse();
      lastParsedOk = true;
      status.textContent = 'Valid';
      status.className = 'status valid';
      refreshTreeVisibility();
    } catch (err) {
      lastParsedOk = false;
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

  function downloadOutput() {
    const text = output.textContent || input.value;
    if (!text.trim()) return;
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'data.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  function loadFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      input.value = reader.result;
      updateStats();
      format();
    };
    reader.readAsText(file);
  }

  function clearAll() {
    input.value = '';
    clearError();
    resetOutput();
    updateStats();
    refreshTreeVisibility();
    input.focus();
  }

  formatBtn.addEventListener('click', format);
  minifyBtn.addEventListener('click', minify);
  validateBtn.addEventListener('click', validate);
  copyBtn.addEventListener('click', copyOutput);
  downloadBtn.addEventListener('click', downloadOutput);
  uploadBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => loadFile(fileInput.files[0]));
  clearBtn.addEventListener('click', clearAll);
  treeToggle.addEventListener('change', refreshTreeVisibility);
  input.addEventListener('input', updateStats);

  input.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      format();
    }
  });

  ['dragover', 'dragenter'].forEach(evt => {
    input.addEventListener(evt, (e) => {
      e.preventDefault();
      input.classList.add('drag-over');
    });
  });
  ['dragleave', 'dragend'].forEach(evt => {
    input.addEventListener(evt, () => input.classList.remove('drag-over'));
  });
  input.addEventListener('drop', (e) => {
    e.preventDefault();
    input.classList.remove('drag-over');
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) loadFile(file);
  });
})();
