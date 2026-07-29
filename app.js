// Privacy invariant: this app must never make network requests (fetch, XHR, WebSocket,
// beacons, form submissions, etc.) or persist file contents outside the DOM/memory of the
// current page. All parsing/conversion happens client-side only. Do not add analytics,
// telemetry, or any call that could send user-opened file data off the device.
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

  const exportFormat = document.getElementById('exportFormat');
  const exportConvertBtn = document.getElementById('exportConvertBtn');
  const exportResult = document.getElementById('exportResult');

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

  // --- CSV / TSV <-> JSON ---

  function parseDelimitedRows(text, delim) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else {
          field += c;
        }
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === delim) {
        row.push(field); field = '';
      } else if (c === '\r') {
        // skip
      } else if (c === '\n') {
        row.push(field); rows.push(row); row = []; field = '';
      } else {
        field += c;
      }
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows.filter(r => !(r.length === 1 && r[0] === ''));
  }

  function delimitedRowsToJson(rows) {
    if (!rows.length) return [];
    const headers = rows[0];
    return rows.slice(1).map(r => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = r[i] !== undefined ? r[i] : ''; });
      return obj;
    });
  }

  function csvToJson(text) { return delimitedRowsToJson(parseDelimitedRows(text, ',')); }
  function tsvToJson(text) { return delimitedRowsToJson(parseDelimitedRows(text, '\t')); }

  function delimEscapeField(v, delim) {
    const s = v === null || v === undefined ? '' : String(v);
    return new RegExp(`["${delim}\\n\\r]`).test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function jsonToDelimited(data, delim, label) {
    const arr = Array.isArray(data) ? data : [data];
    if (!arr.length) return '';
    const headerSet = new Set();
    arr.forEach(row => {
      if (row !== null && typeof row === 'object' && !Array.isArray(row)) Object.keys(row).forEach(k => headerSet.add(k));
    });
    const headers = [...headerSet];
    if (!headers.length) throw new Error(`JSON must be an array of objects to convert to ${label}`);
    const lines = [headers.map(h => delimEscapeField(h, delim)).join(delim)];
    arr.forEach(row => {
      lines.push(headers.map(h => {
        const v = row && typeof row === 'object' ? row[h] : undefined;
        return delimEscapeField(v !== null && typeof v === 'object' ? JSON.stringify(v) : v, delim);
      }).join(delim));
    });
    return lines.join('\r\n');
  }

  function jsonToCsv(data) { return jsonToDelimited(data, ',', 'CSV'); }
  function jsonToTsv(data) { return jsonToDelimited(data, '\t', 'TSV'); }

  // --- XML <-> JSON (via native DOMParser / XMLSerializer) ---

  function xmlToJson(text) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    const errorNode = doc.querySelector('parsererror');
    if (errorNode) throw new Error('Invalid XML: ' + errorNode.textContent.trim().split('\n')[0]);
    return { [doc.documentElement.tagName]: xmlNodeToJson(doc.documentElement) };
  }

  function xmlNodeToJson(node) {
    const obj = {};
    for (const attr of node.attributes || []) obj['@' + attr.name] = attr.value;
    const children = [...node.children];
    if (children.length === 0) {
      const text = node.textContent.trim();
      if (Object.keys(obj).length === 0) return text;
      if (text) obj['#text'] = text;
      return obj;
    }
    for (const child of children) {
      const value = xmlNodeToJson(child);
      if (obj[child.tagName] !== undefined) {
        if (!Array.isArray(obj[child.tagName])) obj[child.tagName] = [obj[child.tagName]];
        obj[child.tagName].push(value);
      } else {
        obj[child.tagName] = value;
      }
    }
    return obj;
  }

  function sanitizeXmlTag(name) {
    const s = String(name).replace(/[^a-zA-Z0-9_.-]/g, '_');
    return /^[a-zA-Z_]/.test(s) ? s : '_' + s;
  }

  function buildXmlNode(doc, el, value) {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) {
      value.forEach(item => {
        const child = doc.createElement('item');
        buildXmlNode(doc, child, item);
        el.appendChild(child);
      });
    } else if (typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        if (k.startsWith('@')) { el.setAttribute(k.slice(1), v); continue; }
        if (Array.isArray(v)) {
          v.forEach(item => {
            const child = doc.createElement(sanitizeXmlTag(k));
            buildXmlNode(doc, child, item);
            el.appendChild(child);
          });
        } else {
          const child = doc.createElement(sanitizeXmlTag(k));
          buildXmlNode(doc, child, v);
          el.appendChild(child);
        }
      }
    } else {
      el.textContent = String(value);
    }
  }

  function jsonToXml(data) {
    const doc = document.implementation.createDocument(null, null, null);
    const singleKey = (data !== null && typeof data === 'object' && !Array.isArray(data) && Object.keys(data).length === 1)
      ? Object.keys(data)[0] : null;
    const rootKey = singleKey || 'root';
    const rootValue = singleKey ? data[singleKey] : data;
    const root = doc.createElement(sanitizeXmlTag(rootKey));
    buildXmlNode(doc, root, rootValue);
    doc.appendChild(root);
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(doc);
  }

  // --- YAML <-> JSON (practical subset: nested maps/sequences, scalars, comments, flow [] {}) ---

  function stripYamlComment(line) {
    let inS = false, inD = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === "'" && !inD) inS = !inS;
      else if (c === '"' && !inS) inD = !inD;
      else if (c === '#' && !inS && !inD && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
    }
    return line;
  }

  function unquoteYamlScalar(s) {
    if (s.startsWith('"') && s.endsWith('"')) return JSON.parse(s);
    if (s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1).replace(/''/g, "'");
    return s;
  }

  function parseYamlScalar(raw) {
    const v = raw.trim();
    if (v === '') return null;
    if ((v.startsWith('[') && v.endsWith(']')) || (v.startsWith('{') && v.endsWith('}'))) {
      try { return JSON.parse(v); } catch (e) { /* fall through to string */ }
    }
    if (v.startsWith('"') && v.endsWith('"')) return JSON.parse(v);
    if (v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1).replace(/''/g, "'");
    if (/^(null|~)$/i.test(v)) return null;
    if (/^true$/i.test(v)) return true;
    if (/^false$/i.test(v)) return false;
    if (/^-?\d+$/.test(v)) return parseInt(v, 10);
    if (/^-?\d+\.\d+([eE][+-]?\d+)?$/.test(v)) return parseFloat(v);
    return v;
  }

  function parseYaml(text) {
    const lines = [];
    for (const raw of text.split(/\r?\n/)) {
      const line = stripYamlComment(raw.replace(/\t/g, '  '));
      const trimmed = line.trim();
      if (trimmed === '' || trimmed === '---' || trimmed === '...') continue;
      lines.push({ indent: line.match(/^ */)[0].length, text: trimmed });
    }
    if (!lines.length) return null;
    let pos = 0;
    const peek = () => (pos < lines.length ? lines[pos] : null);

    function parseNode(indent) {
      const first = peek();
      if (!first || first.indent < indent) return null;
      if (first.text === '-' || first.text.startsWith('- ')) return parseSeq(first.indent);
      return parseMap(first.indent);
    }

    function applyMapLine(obj, content, indent) {
      const m = content.match(/^("[^"]*"|'[^']*'|[^:]+?):\s*(.*)$/);
      if (!m) return;
      const key = unquoteYamlScalar(m[1].trim());
      const rest = m[2];
      obj[key] = rest === '' ? (parseNode(indent + 1) ?? '') : parseYamlScalar(rest);
    }

    function parseMap(indent) {
      const obj = {};
      while (peek() && peek().indent === indent && peek().text !== '-' && !peek().text.startsWith('- ')) {
        const line = lines[pos]; pos++;
        applyMapLine(obj, line.text, indent);
      }
      return obj;
    }

    function parseSeq(indent) {
      const arr = [];
      while (peek() && peek().indent === indent && (peek().text === '-' || peek().text.startsWith('- '))) {
        const line = lines[pos]; pos++;
        const rest = line.text === '-' ? '' : line.text.slice(2).trim();
        if (rest === '') {
          arr.push(parseNode(indent + 1));
        } else if (/^("[^"]*"|'[^']*'|[^:]+?):\s*(.*)$/.test(rest)) {
          const mapIndent = indent + 2;
          const obj = {};
          applyMapLine(obj, rest, mapIndent);
          Object.assign(obj, parseMap(mapIndent));
          arr.push(obj);
        } else {
          arr.push(parseYamlScalar(rest));
        }
      }
      return arr;
    }

    return parseNode(lines[0].indent);
  }

  function yamlScalar(v) {
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'boolean' || typeof v === 'number') return String(v);
    const s = String(v);
    if (s === '') return "''";
    if (/^\s|\s$/.test(s) || /[:#[\]{}&*!|>'"%@`,]/.test(s) || /^(true|false|null|~|-?\d+(\.\d+)?)$/i.test(s)) {
      return JSON.stringify(s);
    }
    return s;
  }

  function jsonToYaml(data, indent = 0) {
    const pad = '  '.repeat(indent);
    if (data === null || data === undefined) return 'null';
    if (typeof data !== 'object') return yamlScalar(data);
    if (Array.isArray(data)) {
      if (!data.length) return '[]';
      return data.map(item => {
        if (item !== null && typeof item === 'object' && Object.keys(item).length) {
          const nested = jsonToYaml(item, indent + 1).split('\n');
          return pad + '- ' + nested[0].trim() + (nested.length > 1 ? '\n' + nested.slice(1).join('\n') : '');
        }
        return pad + '- ' + (item !== null && typeof item === 'object' ? (Array.isArray(item) ? '[]' : '{}') : yamlScalar(item));
      }).join('\n');
    }
    const keys = Object.keys(data);
    if (!keys.length) return '{}';
    return keys.map(k => {
      const v = data[k];
      const label = /^[\w.-]+$/.test(k) ? k : JSON.stringify(k);
      if (v !== null && typeof v === 'object' && Object.keys(v).length) {
        return pad + label + ':\n' + jsonToYaml(v, indent + 1);
      }
      if (v !== null && typeof v === 'object') return pad + label + ': ' + (Array.isArray(v) ? '[]' : '{}');
      return pad + label + ': ' + yamlScalar(v);
    }).join('\n');
  }

  // --- INI <-> JSON ---

  function iniParseValue(v) {
    if (v === 'true') return true;
    if (v === 'false') return false;
    if (/^-?\d+$/.test(v)) return parseInt(v, 10);
    if (/^-?\d+\.\d+$/.test(v)) return parseFloat(v);
    return v;
  }

  function iniToJson(text) {
    const result = {};
    let current = result;
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith(';') || line.startsWith('#')) continue;
      const sectionMatch = line.match(/^\[(.+)\]$/);
      if (sectionMatch) {
        const name = sectionMatch[1].trim();
        result[name] = result[name] || {};
        current = result[name];
        continue;
      }
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (/^".*"$/.test(value)) value = value.slice(1, -1);
      current[key] = iniParseValue(value);
    }
    return result;
  }

  function iniFormatValue(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }

  function jsonToIni(data) {
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      throw new Error('JSON must be an object to convert to INI');
    }
    const rootLines = [];
    const sections = [];
    for (const [k, v] of Object.entries(data)) {
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) sections.push(k);
      else rootLines.push(`${k}=${iniFormatValue(v)}`);
    }
    const out = [...rootLines];
    for (const s of sections) {
      out.push('', `[${s}]`);
      for (const [k, v] of Object.entries(data[s])) out.push(`${k}=${iniFormatValue(v)}`);
    }
    return out.join('\n');
  }

  // --- Plain text <-> JSON ---

  function txtToJson(text) {
    return text;
  }

  function jsonToTxt(data) {
    return typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  }

  // --- DOCX -> JSON (import-only: unzip word/document.xml with DecompressionStream, extract paragraph text) ---

  async function extractZipEntryText(buffer, entryName) {
    const view = new DataView(buffer);
    const decoder = new TextDecoder();
    let offset = 0;
    while (offset + 30 <= buffer.byteLength) {
      const sig = view.getUint32(offset, true);
      if (sig !== 0x04034b50) break;
      const method = view.getUint16(offset + 8, true);
      const compSize = view.getUint32(offset + 18, true);
      const nameLen = view.getUint16(offset + 26, true);
      const extraLen = view.getUint16(offset + 28, true);
      const nameStart = offset + 30;
      const name = decoder.decode(new Uint8Array(buffer, nameStart, nameLen));
      const dataStart = nameStart + nameLen + extraLen;
      if (name === entryName) {
        const compData = buffer.slice(dataStart, dataStart + compSize);
        if (method === 0) return decoder.decode(compData);
        if (method === 8) {
          const stream = new Blob([compData]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
          return decoder.decode(await new Response(stream).arrayBuffer());
        }
        throw new Error('Unsupported compression method in .docx entry: ' + method);
      }
      offset = dataStart + compSize;
    }
    return null;
  }

  async function docxToParagraphs(buffer) {
    const xml = await extractZipEntryText(buffer, 'word/document.xml');
    if (!xml) throw new Error('Could not find word/document.xml inside the .docx file');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    return [...doc.getElementsByTagName('w:p')].map(p =>
      [...p.getElementsByTagName('w:t')].map(t => t.textContent).join('')
    );
  }

  // --- LOG -> JSON (array of lines) ---

  function logToJson(text) {
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    if (lines.length && lines[lines.length - 1] === '') lines.pop();
    return lines;
  }

  // --- Markdown -> JSON (block list: headings, paragraphs, lists, code, blockquotes, hr) ---

  function markdownToJson(text) {
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    const blocks = [];
    let paraBuf = [];
    const flushPara = () => {
      if (paraBuf.length) { blocks.push({ type: 'paragraph', text: paraBuf.join(' ').trim() }); paraBuf = []; }
    };
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const heading = line.match(/^(#{1,6})\s+(.*)$/);
      if (heading) { flushPara(); blocks.push({ type: 'heading', level: heading[1].length, text: heading[2].trim() }); i++; continue; }
      if (/^```/.test(line)) {
        flushPara();
        const lang = line.slice(3).trim();
        const codeLines = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) { codeLines.push(lines[i]); i++; }
        i++;
        blocks.push({ type: 'code', lang: lang || null, text: codeLines.join('\n') });
        continue;
      }
      if (/^>\s?/.test(line)) {
        flushPara();
        const quoteLines = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) { quoteLines.push(lines[i].replace(/^>\s?/, '')); i++; }
        blocks.push({ type: 'blockquote', text: quoteLines.join('\n') });
        continue;
      }
      if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
        flushPara();
        const ordered = /^\s*\d+\.\s+/.test(line);
        const items = [];
        while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\s*([-*+]|\d+\.)\s+/, '').trim());
          i++;
        }
        blocks.push({ type: 'list', ordered, items });
        continue;
      }
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { flushPara(); blocks.push({ type: 'hr' }); i++; continue; }
      if (line.trim() === '') { flushPara(); i++; continue; }
      paraBuf.push(line.trim());
      i++;
    }
    flushPara();
    return blocks;
  }

  // --- JSON -> Markdown ---
  // If the JSON is a block array shaped like markdownToJson's output, render it back to
  // real markdown syntax (round-trips). Otherwise render arbitrary JSON as a nested list.

  const MARKDOWN_BLOCK_TYPES = ['heading', 'paragraph', 'list', 'code', 'blockquote', 'hr'];

  function isMarkdownBlockArray(data) {
    return Array.isArray(data) && data.length > 0 &&
      data.every(b => b !== null && typeof b === 'object' && MARKDOWN_BLOCK_TYPES.includes(b.type));
  }

  function markdownBlocksToText(blocks) {
    return blocks.map(b => {
      switch (b.type) {
        case 'heading': return '#'.repeat(Math.min(Math.max(Number(b.level) || 1, 1), 6)) + ' ' + (b.text || '');
        case 'paragraph': return b.text || '';
        case 'blockquote': return String(b.text || '').split('\n').map(l => '> ' + l).join('\n');
        case 'code': return '```' + (b.lang || '') + '\n' + (b.text || '') + '\n```';
        case 'list': {
          const items = Array.isArray(b.items) ? b.items : [];
          return items.map((item, i) => (b.ordered ? `${i + 1}.` : '-') + ' ' + item).join('\n');
        }
        case 'hr': return '---';
        default: return '';
      }
    }).join('\n\n');
  }

  function markdownInline(v) {
    if (v === null || v === undefined) return '*null*';
    if (typeof v === 'object') return Array.isArray(v) ? (v.length ? '(...)' : '*(empty array)*') : (Object.keys(v).length ? '(...)' : '*(empty object)*');
    return String(v).replace(/([*_`[\]\\])/g, '\\$1');
  }

  function genericJsonToMarkdown(data, depth = 0) {
    const indent = '  '.repeat(depth);
    if (Array.isArray(data)) {
      if (!data.length) return indent + '- *(empty array)*';
      return data.map(item => {
        if (item !== null && typeof item === 'object' && Object.keys(item).length) {
          return indent + '- \n' + genericJsonToMarkdown(item, depth + 1);
        }
        return indent + '- ' + markdownInline(item);
      }).join('\n');
    }
    const keys = Object.keys(data);
    if (!keys.length) return indent + '- *(empty object)*';
    return keys.map(k => {
      const v = data[k];
      if (v !== null && typeof v === 'object' && Object.keys(v).length) {
        return indent + `- **${k}**:\n` + genericJsonToMarkdown(v, depth + 1);
      }
      return indent + `- **${k}**: ${markdownInline(v)}`;
    }).join('\n');
  }

  function jsonToMarkdown(data) {
    if (isMarkdownBlockArray(data)) return markdownBlocksToText(data);
    if (data !== null && typeof data === 'object') return genericJsonToMarkdown(data);
    return markdownInline(data);
  }

  // --- HTML -> JSON (via native DOMParser, tag/attributes/children tree) ---

  function htmlNodeToJson(node) {
    const el = { tag: node.tagName.toLowerCase() };
    if (node.attributes && node.attributes.length) {
      el.attributes = {};
      for (const attr of node.attributes) el.attributes[attr.name] = attr.value;
    }
    const children = [];
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        const t = child.textContent.replace(/\s+/g, ' ').trim();
        if (t) children.push(t);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        children.push(htmlNodeToJson(child));
      }
    }
    if (children.length) el.children = children;
    return el;
  }

  function htmlToJson(text) {
    const doc = new DOMParser().parseFromString(text, 'text/html');
    return htmlNodeToJson(doc.body || doc.documentElement);
  }

  // --- JSON -> HTML ---
  // If the JSON is a {tag, attributes, children} node shaped like htmlToJson's output,
  // render it back to real markup (round-trips). Otherwise render arbitrary JSON as a nested <ul>.

  const HTML_VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

  function isHtmlNodeShape(data) {
    return data !== null && typeof data === 'object' && !Array.isArray(data) && typeof data.tag === 'string';
  }

  function htmlNodeFromJson(node) {
    if (typeof node === 'string') return escapeHtml(node);
    if (!isHtmlNodeShape(node)) return escapeHtml(JSON.stringify(node));
    const tag = sanitizeXmlTag(node.tag);
    const attrs = node.attributes && typeof node.attributes === 'object'
      ? Object.entries(node.attributes).map(([k, v]) => ` ${sanitizeXmlTag(k)}="${escapeHtml(String(v))}"`).join('')
      : '';
    if (HTML_VOID_TAGS.has(tag)) return `<${tag}${attrs}>`;
    const children = Array.isArray(node.children) ? node.children.map(htmlNodeFromJson).join('') : '';
    return `<${tag}${attrs}>${children}</${tag}>`;
  }

  function genericJsonToHtmlFragment(data) {
    if (data === null || data === undefined) return '<em>null</em>';
    if (typeof data !== 'object') return escapeHtml(String(data));
    if (Array.isArray(data)) {
      if (!data.length) return '<em>(empty array)</em>';
      return '<ul>' + data.map(item => `<li>${genericJsonToHtmlFragment(item)}</li>`).join('') + '</ul>';
    }
    const keys = Object.keys(data);
    if (!keys.length) return '<em>(empty object)</em>';
    return '<ul>' + keys.map(k => `<li><strong>${escapeHtml(k)}</strong>: ${genericJsonToHtmlFragment(data[k])}</li>`).join('') + '</ul>';
  }

  function jsonToHtml(data) {
    if (isHtmlNodeShape(data) && data.tag === 'html') {
      return '<!DOCTYPE html>\n' + htmlNodeFromJson(data) + '\n';
    }
    if (isHtmlNodeShape(data) && data.tag === 'body') {
      return `<!DOCTYPE html>\n<html>\n<head>\n<meta charset="UTF-8">\n<title>Exported JSON</title>\n</head>\n${htmlNodeFromJson(data)}\n</html>\n`;
    }
    const body = isHtmlNodeShape(data) ? htmlNodeFromJson(data) : genericJsonToHtmlFragment(data);
    return `<!DOCTYPE html>\n<html>\n<head>\n<meta charset="UTF-8">\n<title>Exported JSON</title>\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
  }

  // --- SRT -> JSON (subtitle cues) ---

  function srtToJson(text) {
    const blocks = text.replace(/\r\n/g, '\n').split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
    return blocks.map(block => {
      const lines = block.split('\n');
      let idx = 0;
      let index = null;
      if (/^\d+$/.test(lines[0].trim())) { index = parseInt(lines[0].trim(), 10); idx = 1; }
      const timeMatch = lines[idx] && lines[idx].match(/(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/);
      const start = timeMatch ? timeMatch[1].replace('.', ',') : null;
      const end = timeMatch ? timeMatch[2].replace('.', ',') : null;
      const textLines = lines.slice(timeMatch ? idx + 1 : idx);
      const cue = { start, end, text: textLines.join('\n') };
      if (index !== null) cue.index = index;
      return cue;
    });
  }

  // --- VTT -> JSON (WebVTT cues) ---

  function vttToJson(text) {
    const timeRe = /(\d{2}:\d{2}:\d{2}\.\d{3}|\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3}|\d{2}:\d{2}\.\d{3})/;
    const normalized = text.replace(/\r\n/g, '\n').replace(/^WEBVTT.*\n/, '');
    const blocks = normalized.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
    const cues = [];
    for (const block of blocks) {
      const lines = block.split('\n');
      if (lines[0].startsWith('NOTE')) continue;
      let idx = 0;
      let id = null;
      let timeMatch = lines[0].match(timeRe);
      if (!timeMatch) {
        id = lines[0].trim();
        idx = 1;
        timeMatch = lines[1] && lines[1].match(timeRe);
      }
      if (!timeMatch) continue;
      const textLines = lines.slice(idx + 1);
      const cue = { start: timeMatch[1], end: timeMatch[2], text: textLines.join('\n') };
      if (id) cue.id = id;
      cues.push(cue);
    }
    return cues;
  }

  // --- RTF -> JSON (best-effort control-word stripping tokenizer, skips font/color/style tables) ---

  function rtfToJson(text) {
    const skipDestinations = new Set([
      'fonttbl', 'colortbl', 'stylesheet', 'info', 'generator', 'pict', 'object',
      'xmlnstbl', 'listtable', 'listoverridetable', 'rsidtbl', 'themedata',
      'colorschememapping', 'datastore', 'panose', 'latentstyles'
    ]);
    let i = 0;
    const n = text.length;
    let depth = 0;
    let skipDepth = null;
    const out = [];
    const isAlpha = c => /[a-zA-Z]/.test(c);
    while (i < n) {
      const c = text[i];
      if (c === '{') { depth++; i++; continue; }
      if (c === '}') {
        if (skipDepth !== null && depth === skipDepth) skipDepth = null;
        depth--; i++;
        continue;
      }
      if (c === '\\') {
        i++;
        if (i >= n) break;
        const c2 = text[i];
        if (c2 === "'") {
          const hex = text.substr(i + 1, 2);
          i += 3;
          if (skipDepth === null) out.push(String.fromCharCode(parseInt(hex, 16)));
          continue;
        }
        if (c2 === '\\' || c2 === '{' || c2 === '}') {
          i++;
          if (skipDepth === null) out.push(c2);
          continue;
        }
        if (isAlpha(c2)) {
          let word = '';
          while (i < n && isAlpha(text[i])) { word += text[i]; i++; }
          while (i < n && /[-\d]/.test(text[i])) i++;
          if (i < n && text[i] === ' ') i++;
          if (skipDestinations.has(word)) {
            skipDepth = depth;
          } else if (skipDepth === null) {
            if (word === 'par' || word === 'line') out.push('\n');
            else if (word === 'tab') out.push('\t');
          }
          continue;
        }
        i++;
        continue;
      }
      if (skipDepth === null) out.push(c);
      i++;
    }
    const paragraphs = out.join('').split('\n').map(l => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean);
    return { paragraphs };
  }

  // --- PDF -> JSON (best-effort text extraction: inflate FlateDecode content streams, read Tj/TJ operators) ---

  function unescapePdfString(s) {
    let out = '';
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '\\') {
        const next = s[i + 1];
        if (next === 'n') { out += '\n'; i++; }
        else if (next === 'r') { out += '\r'; i++; }
        else if (next === 't') { out += '\t'; i++; }
        else if (next === '(' || next === ')' || next === '\\') { out += next; i++; }
        else if (/[0-7]/.test(next)) {
          const oct = (s.substr(i + 1, 3).match(/^[0-7]{1,3}/) || [''])[0];
          out += String.fromCharCode(parseInt(oct, 8));
          i += oct.length;
        } else {
          i++;
        }
      } else {
        out += c;
      }
    }
    return out;
  }

  function extractPdfText(content, out) {
    const re = /\(((?:\\.|[^\\()])*)\)\s*Tj|\[((?:\\.|[^\[\]])*)\]\s*TJ|(?:-?\d*\.?\d+\s+){2}Td|T\*|(?:-?\d*\.?\d+\s+){5}-?\d*\.?\d+\s+Tm/g;
    let m;
    let line = '';
    const flush = () => { if (line.trim()) out.push(line.trim()); line = ''; };
    while ((m = re.exec(content))) {
      if (m[1] !== undefined) {
        line += unescapePdfString(m[1]);
      } else if (m[2] !== undefined) {
        const inner = /\(((?:\\.|[^\\()])*)\)/g;
        let im;
        while ((im = inner.exec(m[2]))) line += unescapePdfString(im[1]);
      } else {
        flush();
      }
    }
    flush();
  }

  async function pdfToJson(buffer) {
    const bytes = new Uint8Array(buffer);
    const latin1 = new TextDecoder('latin1');
    const raw = latin1.decode(bytes);

    const streams = [];
    const re = /(<<(?:[^<>]|<<[^<>]*>>)*>>)\s*stream\r?\n/g;
    let match;
    while ((match = re.exec(raw))) {
      const dict = match[1];
      const dataStart = match.index + match[0].length;
      const endIdx = raw.indexOf('endstream', dataStart);
      if (endIdx === -1) continue;
      let dataEnd = endIdx;
      if (raw[dataEnd - 1] === '\n') dataEnd--;
      if (raw[dataEnd - 1] === '\r') dataEnd--;
      streams.push({ dict, bytes: bytes.slice(dataStart, dataEnd) });
      re.lastIndex = endIdx + 'endstream'.length;
    }

    const textRuns = [];
    for (const { dict, bytes: sBytes } of streams) {
      let contentBytes = sBytes;
      if (/\/FlateDecode/.test(dict)) {
        try {
          const stream = new Blob([sBytes]).stream().pipeThrough(new DecompressionStream('deflate'));
          contentBytes = new Uint8Array(await new Response(stream).arrayBuffer());
        } catch (e) {
          continue;
        }
      } else if (/\/Filter/.test(dict)) {
        continue;
      }
      const content = latin1.decode(contentBytes);
      if (!/\bTj\b|\bTJ\b/.test(content)) continue;
      extractPdfText(content, textRuns);
    }

    if (!textRuns.length) {
      throw new Error('No extractable text found (the PDF may be scanned/image-based, encrypted, or use an unsupported filter)');
    }
    return { text: textRuns.join('\n').replace(/\n{3,}/g, '\n\n').trim() };
  }

  const BINARY_FORMATS = { docx: docxParagraphsWrapper, pdf: pdfToJson };
  const TEXT_FORMATS = {
    csv: csvToJson,
    tsv: tsvToJson,
    xml: xmlToJson,
    yaml: parseYaml,
    yml: parseYaml,
    ini: iniToJson,
    conf: iniToJson,
    txt: txtToJson,
    log: logToJson,
    md: markdownToJson,
    markdown: markdownToJson,
    html: htmlToJson,
    htm: htmlToJson,
    srt: srtToJson,
    vtt: vttToJson,
    rtf: rtfToJson
  };

  async function docxParagraphsWrapper(buffer) {
    return { paragraphs: await docxToParagraphs(buffer) };
  }

  function loadFile(file) {
    if (!file) return;
    clearError();
    const ext = file.name.split('.').pop().toLowerCase();

    if (BINARY_FORMATS[ext]) {
      const reader = new FileReader();
      reader.onerror = () => showError(new Error('Could not read file'));
      reader.onload = async () => {
        try {
          const data = await BINARY_FORMATS[ext](reader.result);
          input.value = JSON.stringify(data, null, 2);
          updateStats();
          format();
        } catch (err) {
          showError(err);
        }
      };
      reader.readAsArrayBuffer(file);
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => showError(new Error('Could not read file'));
    reader.onload = () => {
      const text = reader.result;
      const converter = TEXT_FORMATS[ext];
      if (ext === 'json' || !converter) {
        input.value = text;
        updateStats();
        format();
        return;
      }
      try {
        input.value = JSON.stringify(converter(text), null, 2);
        updateStats();
        format();
      } catch (err) {
        showError(err);
      }
    };
    reader.readAsText(file);
  }

  function runExport() {
    exportResult.innerHTML = '';
    let data;
    try {
      data = JSON.parse(input.value);
    } catch (err) {
      exportResult.innerHTML = `<div class="path-error">Input is not valid JSON: ${escapeHtml(err.message)}</div>`;
      return;
    }
    const fmt = exportFormat.value;
    const fileMeta = {
      csv: ['text/csv', 'csv'],
      tsv: ['text/tab-separated-values', 'tsv'],
      xml: ['application/xml', 'xml'],
      yaml: ['text/yaml', 'yaml'],
      ini: ['text/plain', 'ini'],
      txt: ['text/plain', 'txt'],
      html: ['text/html', 'html'],
      md: ['text/markdown', 'md']
    }[fmt];
    let text;
    try {
      switch (fmt) {
        case 'csv': text = jsonToCsv(data); break;
        case 'tsv': text = jsonToTsv(data); break;
        case 'xml': text = jsonToXml(data); break;
        case 'yaml': text = jsonToYaml(data); break;
        case 'ini': text = jsonToIni(data); break;
        case 'txt': text = jsonToTxt(data); break;
        case 'html': text = jsonToHtml(data); break;
        case 'md': text = jsonToMarkdown(data); break;
      }
    } catch (err) {
      exportResult.innerHTML = `<div class="path-error">${escapeHtml(err.message)}</div>`;
      return;
    }
    const [mime, extName] = fileMeta;
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `data.${extName}`;
    a.click();
    URL.revokeObjectURL(url);
    exportResult.innerHTML = `<div class="ok">✓ Downloaded data.${extName}</div>`;
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
  exportConvertBtn.addEventListener('click', runExport);

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
