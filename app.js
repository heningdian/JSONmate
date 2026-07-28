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

  const searchInput = document.getElementById('searchInput');
  const searchCount = document.getElementById('searchCount');
  const searchPrev = document.getElementById('searchPrev');
  const searchNext = document.getElementById('searchNext');
  const searchResults = document.getElementById('searchResults');

  const schemaInput = document.getElementById('schemaInput');
  const schemaValidateBtn = document.getElementById('schemaValidateBtn');
  const schemaResult = document.getElementById('schemaResult');

  const compareInput = document.getElementById('compareInput');
  const diffBtn = document.getElementById('diffBtn');
  const diffResult = document.getElementById('diffResult');

  let lastParsed;
  let lastParsedOk = false;
  let currentMatches = [];
  let currentIndex = -1;

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

  function buildTreeNode(key, value, path) {
    const isContainer = value !== null && typeof value === 'object';
    if (!isContainer) {
      const row = document.createElement('div');
      row.className = 'tree-leaf';
      row.dataset.path = path;
      row.innerHTML = (key !== null ? `<span class="jkey">${escapeHtml(JSON.stringify(key))}:</span> ` : '') + valueSpan(value);
      return row;
    }

    const isArray = Array.isArray(value);
    const entries = isArray ? value.map((v, i) => [i, v]) : Object.entries(value);
    const details = document.createElement('details');
    details.open = true;
    details.className = 'tree-node';
    details.dataset.path = path;

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
        const childPath = isArray ? `${path}[${k}]` : `${path}.${k}`;
        children.appendChild(buildTreeNode(isArray ? null : k, v, childPath));
      }
    }
    details.appendChild(children);
    return details;
  }

  function renderTree(data) {
    treeOutput.innerHTML = '';
    treeOutput.appendChild(buildTreeNode(null, data, '$'));
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
    runSearch();
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

  // --- JSONPath (subset: $.key, ['key'], [index], [*], .*) ---

  function tokenizePath(pathStr) {
    let s = pathStr.trim();
    if (s.startsWith('$')) s = s.slice(1);
    const tokens = [];
    let i = 0;
    while (i < s.length) {
      if (s[i] === '.') {
        i++;
        if (s[i] === '*') { tokens.push({ type: 'wildcard' }); i++; continue; }
        let j = i;
        while (j < s.length && /[\w$]/.test(s[j])) j++;
        if (j === i) throw new Error(`Invalid path near "${s.slice(i)}"`);
        tokens.push({ type: 'key', value: s.slice(i, j) });
        i = j;
      } else if (s[i] === '[') {
        const close = s.indexOf(']', i);
        if (close === -1) throw new Error('Unterminated "[" in path');
        const inner = s.slice(i + 1, close).trim();
        if (inner === '*') tokens.push({ type: 'wildcard' });
        else if (/^-?\d+$/.test(inner)) tokens.push({ type: 'index', value: Number(inner) });
        else if (/^(['"]).*\1$/.test(inner)) tokens.push({ type: 'key', value: inner.slice(1, -1) });
        else throw new Error(`Invalid bracket expression "[${inner}]"`);
        i = close + 1;
      } else {
        throw new Error(`Unexpected character "${s[i]}" in path`);
      }
    }
    return tokens;
  }

  function evalJsonPath(root, pathStr) {
    const tokens = tokenizePath(pathStr);
    let current = [{ path: '$', value: root }];
    for (const tok of tokens) {
      const next = [];
      for (const { path, value } of current) {
        if (tok.type === 'wildcard') {
          if (Array.isArray(value)) {
            value.forEach((v, i) => next.push({ path: `${path}[${i}]`, value: v }));
          } else if (value !== null && typeof value === 'object') {
            Object.entries(value).forEach(([k, v]) => next.push({ path: `${path}.${k}`, value: v }));
          }
        } else if (tok.type === 'key') {
          if (value !== null && typeof value === 'object' && !Array.isArray(value)
            && Object.prototype.hasOwnProperty.call(value, tok.value)) {
            next.push({ path: `${path}.${tok.value}`, value: value[tok.value] });
          }
        } else if (tok.type === 'index') {
          if (Array.isArray(value)) {
            let idx = tok.value;
            if (idx < 0) idx += value.length;
            if (idx >= 0 && idx < value.length) next.push({ path: `${path}[${idx}]`, value: value[idx] });
          }
        }
      }
      current = next;
    }
    return current;
  }

  // --- Search (plain text highlight, or JSONPath query when the term starts with "$") ---

  function clearMarks(container) {
    container.querySelectorAll('mark.hit').forEach(m => {
      const parent = m.parentNode;
      if (!parent) return;
      parent.replaceChild(document.createTextNode(m.textContent), m);
      parent.normalize();
    });
  }

  function markMatches(container, term) {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let node;
    while ((node = walker.nextNode())) nodes.push(node);
    const marks = [];
    const lowerTerm = term.toLowerCase();
    for (const textNode of nodes) {
      const text = textNode.textContent;
      const lower = text.toLowerCase();
      let found = lower.indexOf(lowerTerm);
      if (found === -1) continue;
      const frag = document.createDocumentFragment();
      let last = 0;
      while (found !== -1) {
        if (found > last) frag.appendChild(document.createTextNode(text.slice(last, found)));
        const mark = document.createElement('mark');
        mark.className = 'hit';
        mark.textContent = text.slice(found, found + term.length);
        frag.appendChild(mark);
        marks.push(mark);
        last = found + term.length;
        found = lower.indexOf(lowerTerm, last);
      }
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      textNode.parentNode.replaceChild(frag, textNode);
    }
    return marks;
  }

  function updateSearchCount() {
    if (currentMatches.length) {
      searchCount.textContent = `${currentIndex + 1}/${currentMatches.length}`;
    } else if (searchInput.value.trim() && !searchInput.value.trim().startsWith('$')) {
      searchCount.textContent = '0/0';
    } else {
      searchCount.textContent = '';
    }
  }

  function focusMatch() {
    currentMatches.forEach(m => m.classList.remove('current'));
    const m = currentMatches[currentIndex];
    if (m) {
      m.classList.add('current');
      m.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    updateSearchCount();
  }

  function nextMatch() {
    if (!currentMatches.length) return;
    currentIndex = (currentIndex + 1) % currentMatches.length;
    focusMatch();
  }

  function prevMatch() {
    if (!currentMatches.length) return;
    currentIndex = (currentIndex - 1 + currentMatches.length) % currentMatches.length;
    focusMatch();
  }

  function jumpToPath(path) {
    if (!treeToggle.checked) {
      treeToggle.checked = true;
      refreshTreeVisibility();
    }
    const nodes = treeOutput.querySelectorAll('[data-path]');
    for (const node of nodes) {
      if (node.dataset.path === path) {
        node.scrollIntoView({ block: 'center', behavior: 'smooth' });
        node.classList.add('match-path');
        setTimeout(() => node.classList.remove('match-path'), 1500);
        break;
      }
    }
  }

  function runJsonPathQuery(pathStr) {
    if (!lastParsedOk) {
      searchResults.classList.remove('hidden');
      searchResults.innerHTML = '<div class="path-error">Format or validate the JSON first.</div>';
      return;
    }
    try {
      const results = evalJsonPath(lastParsed, pathStr);
      searchResults.classList.remove('hidden');
      if (!results.length) {
        searchResults.innerHTML = '<div class="no-match">No matches</div>';
        searchCount.textContent = '0 matches';
        return;
      }
      searchResults.innerHTML = '';
      results.forEach(r => {
        const row = document.createElement('div');
        row.className = 'path-row';
        const preview = (r.value !== null && typeof r.value === 'object')
          ? (Array.isArray(r.value) ? `Array(${r.value.length})` : `Object(${Object.keys(r.value).length})`)
          : JSON.stringify(r.value);
        row.innerHTML = `<span class="path">${escapeHtml(r.path)}</span><span>${escapeHtml(String(preview))}</span>`;
        row.addEventListener('click', () => jumpToPath(r.path));
        searchResults.appendChild(row);
      });
      searchCount.textContent = `${results.length} match${results.length === 1 ? '' : 'es'}`;
    } catch (err) {
      searchResults.classList.remove('hidden');
      searchResults.innerHTML = `<div class="path-error">${escapeHtml(err.message)}</div>`;
      searchCount.textContent = '';
    }
  }

  function runSearch() {
    clearMarks(output);
    clearMarks(treeOutput);
    searchResults.classList.add('hidden');
    searchResults.innerHTML = '';
    currentMatches = [];
    currentIndex = -1;

    const term = searchInput.value.trim();
    if (!term) {
      updateSearchCount();
      return;
    }

    if (term.startsWith('$')) {
      runJsonPathQuery(term);
      return;
    }

    const activeContainer = (treeToggle.checked && lastParsedOk) ? treeOutput : output;
    currentMatches = markMatches(activeContainer, term);
    if (currentMatches.length) {
      currentIndex = 0;
      focusMatch();
    } else {
      updateSearchCount();
    }
  }

  // --- Lightweight JSON Schema validator (draft-07 style subset) ---

  function jsonTypeOf(data) {
    if (data === null) return 'null';
    if (Array.isArray(data)) return 'array';
    return typeof data;
  }

  function matchesType(data, type) {
    switch (type) {
      case 'string': return typeof data === 'string';
      case 'number': return typeof data === 'number';
      case 'integer': return typeof data === 'number' && Number.isInteger(data);
      case 'boolean': return typeof data === 'boolean';
      case 'object': return data !== null && typeof data === 'object' && !Array.isArray(data);
      case 'array': return Array.isArray(data);
      case 'null': return data === null;
      default: return true;
    }
  }

  function deepEqual(a, b) {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (a && b && typeof a === 'object') {
      if (Array.isArray(a) !== Array.isArray(b)) return false;
      const ak = Object.keys(a), bk = Object.keys(b);
      if (ak.length !== bk.length) return false;
      return ak.every(k => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
    }
    return false;
  }

  function validateAgainstSchema(schema, data, path = '$', errors = []) {
    if (schema === true) return errors;
    if (schema === false) {
      errors.push({ path, message: 'no value is allowed here (schema is false)' });
      return errors;
    }
    if (typeof schema !== 'object' || schema === null) return errors;

    if (schema.const !== undefined && !deepEqual(data, schema.const)) {
      errors.push({ path, message: `must equal const ${JSON.stringify(schema.const)}` });
    }
    if (schema.enum && !schema.enum.some(v => deepEqual(v, data))) {
      errors.push({ path, message: `must be one of ${JSON.stringify(schema.enum)}` });
    }
    if (schema.type) {
      const types = Array.isArray(schema.type) ? schema.type : [schema.type];
      if (!types.some(t => matchesType(data, t))) {
        errors.push({ path, message: `must be of type ${types.join(' | ')}, got ${jsonTypeOf(data)}` });
      }
    }

    if (typeof data === 'number') {
      if (schema.minimum !== undefined && data < schema.minimum) errors.push({ path, message: `must be >= ${schema.minimum}` });
      if (schema.maximum !== undefined && data > schema.maximum) errors.push({ path, message: `must be <= ${schema.maximum}` });
      if (schema.exclusiveMinimum !== undefined && data <= schema.exclusiveMinimum) errors.push({ path, message: `must be > ${schema.exclusiveMinimum}` });
      if (schema.exclusiveMaximum !== undefined && data >= schema.exclusiveMaximum) errors.push({ path, message: `must be < ${schema.exclusiveMaximum}` });
      if (schema.multipleOf !== undefined && Math.abs((data / schema.multipleOf) % 1) > 1e-9) errors.push({ path, message: `must be a multiple of ${schema.multipleOf}` });
    }

    if (typeof data === 'string') {
      if (schema.minLength !== undefined && data.length < schema.minLength) errors.push({ path, message: `must have length >= ${schema.minLength}` });
      if (schema.maxLength !== undefined && data.length > schema.maxLength) errors.push({ path, message: `must have length <= ${schema.maxLength}` });
      if (schema.pattern) {
        try {
          if (!new RegExp(schema.pattern).test(data)) errors.push({ path, message: `must match pattern ${schema.pattern}` });
        } catch (e) { /* invalid regex in schema — skip */ }
      }
    }

    if (Array.isArray(data)) {
      if (schema.minItems !== undefined && data.length < schema.minItems) errors.push({ path, message: `must have at least ${schema.minItems} items` });
      if (schema.maxItems !== undefined && data.length > schema.maxItems) errors.push({ path, message: `must have at most ${schema.maxItems} items` });
      if (schema.uniqueItems) {
        const seen = data.map(v => JSON.stringify(v));
        if (new Set(seen).size !== seen.length) errors.push({ path, message: 'items must be unique' });
      }
      if (schema.items) {
        if (Array.isArray(schema.items)) {
          data.forEach((v, i) => { if (schema.items[i] !== undefined) validateAgainstSchema(schema.items[i], v, `${path}[${i}]`, errors); });
        } else {
          data.forEach((v, i) => validateAgainstSchema(schema.items, v, `${path}[${i}]`, errors));
        }
      }
    }

    if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
      if (schema.required) {
        for (const key of schema.required) {
          if (!Object.prototype.hasOwnProperty.call(data, key)) errors.push({ path: `${path}.${key}`, message: 'is required' });
        }
      }
      if (schema.properties) {
        for (const [key, sub] of Object.entries(schema.properties)) {
          if (Object.prototype.hasOwnProperty.call(data, key)) validateAgainstSchema(sub, data[key], `${path}.${key}`, errors);
        }
      }
      const propKeys = schema.properties ? new Set(Object.keys(schema.properties)) : new Set();
      if (schema.additionalProperties === false && schema.properties) {
        for (const key of Object.keys(data)) {
          if (!propKeys.has(key)) errors.push({ path: `${path}.${key}`, message: 'additional property not allowed' });
        }
      } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        for (const [key, v] of Object.entries(data)) {
          if (!propKeys.has(key)) validateAgainstSchema(schema.additionalProperties, v, `${path}.${key}`, errors);
        }
      }
      if (schema.minProperties !== undefined && Object.keys(data).length < schema.minProperties) errors.push({ path, message: `must have at least ${schema.minProperties} properties` });
      if (schema.maxProperties !== undefined && Object.keys(data).length > schema.maxProperties) errors.push({ path, message: `must have at most ${schema.maxProperties} properties` });
    }

    if (schema.allOf) schema.allOf.forEach(s => validateAgainstSchema(s, data, path, errors));
    if (schema.anyOf) {
      const results = schema.anyOf.map(s => { const e = []; validateAgainstSchema(s, data, path, e); return e; });
      if (!results.some(e => e.length === 0)) errors.push({ path, message: 'must match at least one schema in anyOf' });
    }
    if (schema.oneOf) {
      const results = schema.oneOf.map(s => { const e = []; validateAgainstSchema(s, data, path, e); return e; });
      const passing = results.filter(e => e.length === 0).length;
      if (passing !== 1) errors.push({ path, message: `must match exactly one schema in oneOf (matched ${passing})` });
    }
    if (schema.not) {
      const e = [];
      validateAgainstSchema(schema.not, data, path, e);
      if (e.length === 0) errors.push({ path, message: 'must NOT match the schema in "not"' });
    }

    return errors;
  }

  function runSchemaValidation() {
    schemaResult.innerHTML = '';
    if (!lastParsedOk) {
      schemaResult.innerHTML = '<div class="path-error">Format or validate the Input JSON first.</div>';
      return;
    }
    if (!schemaInput.value.trim()) {
      schemaResult.innerHTML = '<div class="path-error">Paste a JSON Schema above.</div>';
      return;
    }
    let schema;
    try {
      schema = JSON.parse(schemaInput.value);
    } catch (err) {
      schemaResult.innerHTML = `<div class="path-error">Invalid schema JSON: ${escapeHtml(err.message)}</div>`;
      return;
    }
    const errors = validateAgainstSchema(schema, lastParsed);
    if (!errors.length) {
      schemaResult.innerHTML = '<div class="ok">✓ Data matches the schema</div>';
    } else {
      const items = errors.map(e => `<li><span class="err-path">${escapeHtml(e.path)}</span> ${escapeHtml(e.message)}</li>`).join('');
      schemaResult.innerHTML = `<div>${errors.length} error${errors.length === 1 ? '' : 's'} found:</div><ul>${items}</ul>`;
    }
  }

  // --- Diff / compare two JSON values ---

  function diffValues(a, b, path = '$', out = []) {
    const ta = jsonTypeOf(a), tb = jsonTypeOf(b);
    if (ta !== tb) {
      out.push({ path, type: 'changed', a, b });
      return out;
    }
    if (ta === 'object') {
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      for (const k of keys) {
        const inA = Object.prototype.hasOwnProperty.call(a, k);
        const inB = Object.prototype.hasOwnProperty.call(b, k);
        const childPath = `${path}.${k}`;
        if (inA && !inB) out.push({ path: childPath, type: 'removed', a: a[k] });
        else if (!inA && inB) out.push({ path: childPath, type: 'added', b: b[k] });
        else diffValues(a[k], b[k], childPath, out);
      }
    } else if (ta === 'array') {
      const len = Math.max(a.length, b.length);
      for (let i = 0; i < len; i++) {
        const childPath = `${path}[${i}]`;
        if (i >= a.length) out.push({ path: childPath, type: 'added', b: b[i] });
        else if (i >= b.length) out.push({ path: childPath, type: 'removed', a: a[i] });
        else diffValues(a[i], b[i], childPath, out);
      }
    } else if (!deepEqual(a, b)) {
      out.push({ path, type: 'changed', a, b });
    }
    return out;
  }

  function runDiff() {
    diffResult.innerHTML = '';
    let a, b;
    try {
      a = JSON.parse(input.value);
    } catch (err) {
      diffResult.innerHTML = `<div class="path-error">Input panel: ${escapeHtml(err.message)}</div>`;
      return;
    }
    try {
      b = JSON.parse(compareInput.value);
    } catch (err) {
      diffResult.innerHTML = `<div class="path-error">Compare panel: ${escapeHtml(err.message)}</div>`;
      return;
    }
    const diffs = diffValues(a, b);
    if (!diffs.length) {
      diffResult.innerHTML = '<div class="ok">✓ No differences — the two JSON values are equivalent</div>';
      return;
    }
    const added = diffs.filter(d => d.type === 'added').length;
    const removed = diffs.filter(d => d.type === 'removed').length;
    const changed = diffs.filter(d => d.type === 'changed').length;
    const summary = document.createElement('div');
    summary.className = 'diff-summary';
    summary.textContent = `${diffs.length} difference${diffs.length === 1 ? '' : 's'}: ${added} added, ${removed} removed, ${changed} changed`;
    diffResult.appendChild(summary);
    diffs.forEach(d => {
      const row = document.createElement('div');
      row.className = `diff-row ${d.type}`;
      let html = `<span class="badge">${d.type}</span><span class="path">${escapeHtml(d.path)}</span>`;
      if (d.type === 'added') html += `<span>${escapeHtml(JSON.stringify(d.b))}</span>`;
      else if (d.type === 'removed') html += `<span>${escapeHtml(JSON.stringify(d.a))}</span>`;
      else html += `<span>${escapeHtml(JSON.stringify(d.a))} &rarr; ${escapeHtml(JSON.stringify(d.b))}</span>`;
      row.innerHTML = html;
      diffResult.appendChild(row);
    });
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

  searchInput.addEventListener('input', runSearch);
  searchNext.addEventListener('click', nextMatch);
  searchPrev.addEventListener('click', prevMatch);
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) prevMatch(); else nextMatch();
    }
  });

  schemaValidateBtn.addEventListener('click', runSchemaValidation);
  diffBtn.addEventListener('click', runDiff);

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
