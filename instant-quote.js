(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const currency = new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' });
  const MAX_FILES = 10;
  const STORAGE_KEY = 'cortenLivingInstantQuoteDraftsV1';

  const MATERIALS = {
    corten: { name: 'Corten steel', density: 7850, sheetRate: 7.9, thicknesses: [1.6, 2, 3, 4, 5, 6], cutFactor: 1.08 },
    mild: { name: 'Mild steel', density: 7850, sheetRate: 5.7, thicknesses: [1, 1.6, 2, 3, 4, 5, 6, 8, 10], cutFactor: 1 },
    stainless: { name: 'Stainless steel', density: 8000, sheetRate: 14.5, thicknesses: [1, 1.5, 2, 3, 4, 5, 6], cutFactor: 1.35 },
    aluminium: { name: 'Aluminium', density: 2700, sheetRate: 12.2, thicknesses: [1.6, 2, 3, 4, 5, 6], cutFactor: 1.18 }
  };

  const PRICING = {
    setup: 18,
    minimumSubtotal: 45,
    machineRatePerMinute: 2.15,
    piercePrice: 0.42,
    materialWasteFactor: 1.22,
    gst: 0.15,
    priorityMultiplier: 1.2,
    process: { deburr: 8, engrave: 12 }
  };

  const state = { parts: [], activeIndex: 0 };

  const els = {
    input: $('#dxf-input'), dropZone: $('#drop-zone'), uploadMessage: $('#upload-message'), loadSample: $('#load-sample'),
    partPanel: $('#part-panel'), configPanel: $('#configuration-panel'), tabs: $('#part-tabs'), preview: $('#dxf-preview'),
    previewFilename: $('#preview-filename'), warning: $('#geometry-warning'), clear: $('#clear-parts'), material: $('#material-select'),
    thickness: $('#thickness-select'), quantity: $('#quantity-input'), leadTime: $('#lead-time-select'), notes: $('#job-notes'),
    summaryPlaceholder: $('#summary-placeholder'), summaryContent: $('#summary-content'), savedList: $('#saved-quote-list'),
    saveQuote: $('#save-quote'), emailQuote: $('#email-quote')
  };

  if (!els.input) return;

  function parsePairs(text) {
    const lines = text.replace(/\r/g, '').split('\n');
    const pairs = [];
    for (let i = 0; i + 1 < lines.length; i += 2) {
      const code = Number.parseInt(lines[i].trim(), 10);
      if (!Number.isFinite(code)) continue;
      pairs.push({ code, value: lines[i + 1].trim() });
    }
    return pairs;
  }

  function groupValue(groups, code, fallback = 0) {
    const item = groups.find(group => group.code === code);
    const number = item ? Number.parseFloat(item.value) : fallback;
    return Number.isFinite(number) ? number : fallback;
  }

  function arcLength(radius, start, end) {
    let sweep = end - start;
    while (sweep < 0) sweep += 360;
    while (sweep > 360) sweep -= 360;
    return Math.abs(radius * sweep * Math.PI / 180);
  }

  function bulgeArc(p1, p2, bulge) {
    const chord = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (!chord || !bulge) return null;
    const theta = 4 * Math.atan(bulge);
    const radius = Math.abs(chord / (2 * Math.sin(theta / 2)));
    const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    const chordAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const distance = chord / (2 * Math.tan(theta / 2));
    const center = { x: mid.x - Math.sin(chordAngle) * distance, y: mid.y + Math.cos(chordAngle) * distance };
    let start = Math.atan2(p1.y - center.y, p1.x - center.x) * 180 / Math.PI;
    let end = Math.atan2(p2.y - center.y, p2.x - center.x) * 180 / Math.PI;
    if (bulge < 0) [start, end] = [end, start];
    return { center, radius, start, end, clockwise: bulge < 0, length: Math.abs(radius * theta) };
  }

  function parseDXF(text, filename) {
    const pairs = parsePairs(text);
    const entities = [];
    let inEntities = false;
    let currentPolyline = null;

    for (let i = 0; i < pairs.length; i += 1) {
      const pair = pairs[i];
      if (pair.code === 0 && pair.value === 'SECTION' && pairs[i + 1]?.code === 2 && pairs[i + 1]?.value === 'ENTITIES') {
        inEntities = true; i += 1; continue;
      }
      if (inEntities && pair.code === 0 && pair.value === 'ENDSEC') { inEntities = false; currentPolyline = null; continue; }
      if (!inEntities || pair.code !== 0) continue;

      const type = pair.value.toUpperCase();
      const groups = [];
      let j = i + 1;
      while (j < pairs.length && pairs[j].code !== 0) { groups.push(pairs[j]); j += 1; }

      if (type === 'LINE') {
        entities.push({ type, x1: groupValue(groups, 10), y1: groupValue(groups, 20), x2: groupValue(groups, 11), y2: groupValue(groups, 21) });
      } else if (type === 'CIRCLE') {
        entities.push({ type, cx: groupValue(groups, 10), cy: groupValue(groups, 20), r: Math.abs(groupValue(groups, 40)) });
      } else if (type === 'ARC') {
        entities.push({ type, cx: groupValue(groups, 10), cy: groupValue(groups, 20), r: Math.abs(groupValue(groups, 40)), start: groupValue(groups, 50), end: groupValue(groups, 51) });
      } else if (type === 'LWPOLYLINE') {
        const vertices = [];
        let vertex = null;
        groups.forEach(group => {
          if (group.code === 10) {
            if (vertex) vertices.push(vertex);
            vertex = { x: Number.parseFloat(group.value) || 0, y: 0, bulge: 0 };
          } else if (group.code === 20 && vertex) vertex.y = Number.parseFloat(group.value) || 0;
          else if (group.code === 42 && vertex) vertex.bulge = Number.parseFloat(group.value) || 0;
        });
        if (vertex) vertices.push(vertex);
        entities.push({ type, vertices, closed: (Math.round(groupValue(groups, 70)) & 1) === 1 });
      } else if (type === 'POLYLINE') {
        currentPolyline = { type: 'POLYLINE', vertices: [], closed: (Math.round(groupValue(groups, 70)) & 1) === 1 };
        entities.push(currentPolyline);
      } else if (type === 'VERTEX' && currentPolyline) {
        currentPolyline.vertices.push({ x: groupValue(groups, 10), y: groupValue(groups, 20), bulge: groupValue(groups, 42) });
      } else if (type === 'SEQEND') {
        currentPolyline = null;
      }
      i = j - 1;
    }

    if (!entities.length) throw new Error('No supported 2D geometry was found. Export the drawing as an ASCII DXF containing lines, arcs, circles or polylines.');

    const points = [];
    let cutLength = 0;
    let pierces = 0;
    const warnings = [];

    entities.forEach(entity => {
      if (entity.type === 'LINE') {
        points.push({ x: entity.x1, y: entity.y1 }, { x: entity.x2, y: entity.y2 });
        cutLength += Math.hypot(entity.x2 - entity.x1, entity.y2 - entity.y1); pierces += 1;
      } else if (entity.type === 'CIRCLE') {
        points.push({ x: entity.cx - entity.r, y: entity.cy - entity.r }, { x: entity.cx + entity.r, y: entity.cy + entity.r });
        cutLength += 2 * Math.PI * entity.r; pierces += 1;
      } else if (entity.type === 'ARC') {
        points.push({ x: entity.cx - entity.r, y: entity.cy - entity.r }, { x: entity.cx + entity.r, y: entity.cy + entity.r });
        cutLength += arcLength(entity.r, entity.start, entity.end); pierces += 1;
      } else if (entity.vertices?.length) {
        entity.vertices.forEach(vertex => points.push(vertex));
        const segmentCount = entity.closed ? entity.vertices.length : entity.vertices.length - 1;
        for (let index = 0; index < segmentCount; index += 1) {
          const p1 = entity.vertices[index];
          const p2 = entity.vertices[(index + 1) % entity.vertices.length];
          const bulge = bulgeArc(p1, p2, p1.bulge);
          cutLength += bulge ? bulge.length : Math.hypot(p2.x - p1.x, p2.y - p1.y);
          if (bulge) {
            points.push({ x: bulge.center.x - bulge.radius, y: bulge.center.y - bulge.radius }, { x: bulge.center.x + bulge.radius, y: bulge.center.y + bulge.radius });
          }
        }
        pierces += 1;
      }
    });

    const xs = points.map(point => point.x).filter(Number.isFinite);
    const ys = points.map(point => point.y).filter(Number.isFinite);
    if (!xs.length || !ys.length) throw new Error('The drawing geometry could not be measured.');
    const bounds = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    if (width <= 0 || height <= 0) warnings.push('The drawing has a zero or very small overall dimension. Check the DXF export and drawing units.');
    if (width > 3000 || height > 1500) warnings.push('This part may exceed the standard sheet or machine area and will require manual review.');
    if (entities.some(entity => entity.type === 'SPLINE' || entity.type === 'ELLIPSE')) warnings.push('Splines or ellipses need manual review.');

    return { filename, entities, bounds, width, height, cutLength, pierces, warnings };
  }

  function pointOnCircle(cx, cy, radius, degrees) {
    const angle = degrees * Math.PI / 180;
    return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  }

  function renderPreview(part) {
    const svg = els.preview;
    svg.replaceChildren();
    const padding = 34;
    const width = Math.max(part.width, 1);
    const height = Math.max(part.height, 1);
    const scale = Math.min((720 - padding * 2) / width, (440 - padding * 2) / height);
    const offsetX = (720 - width * scale) / 2 - part.bounds.minX * scale;
    const offsetY = (440 - height * scale) / 2 + part.bounds.maxY * scale;
    const transformPoint = point => ({ x: point.x * scale + offsetX, y: offsetY - point.y * scale });

    const make = (name, attrs, className = 'dxf-entity') => {
      const node = document.createElementNS('http://www.w3.org/2000/svg', name);
      Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
      node.setAttribute('class', className);
      svg.appendChild(node);
    };

    part.entities.forEach(entity => {
      if (entity.type === 'LINE') {
        const p1 = transformPoint({ x: entity.x1, y: entity.y1 }); const p2 = transformPoint({ x: entity.x2, y: entity.y2 });
        make('line', { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
      } else if (entity.type === 'CIRCLE') {
        const c = transformPoint({ x: entity.cx, y: entity.cy });
        make('circle', { cx: c.x, cy: c.y, r: entity.r * scale }, 'dxf-entity dxf-hole');
      } else if (entity.type === 'ARC') {
        const start = transformPoint(pointOnCircle(entity.cx, entity.cy, entity.r, entity.start));
        const end = transformPoint(pointOnCircle(entity.cx, entity.cy, entity.r, entity.end));
        let sweep = entity.end - entity.start; while (sweep < 0) sweep += 360;
        make('path', { d: `M ${start.x} ${start.y} A ${entity.r * scale} ${entity.r * scale} 0 ${sweep > 180 ? 1 : 0} 0 ${end.x} ${end.y}` });
      } else if (entity.vertices?.length) {
        let path = '';
        entity.vertices.forEach((vertex, index) => {
          const point = transformPoint(vertex);
          if (index === 0) path += `M ${point.x} ${point.y}`;
          else {
            const previous = entity.vertices[index - 1];
            const arc = bulgeArc(previous, vertex, previous.bulge);
            if (arc) path += ` A ${arc.radius * scale} ${arc.radius * scale} 0 ${Math.abs(4 * Math.atan(previous.bulge)) > Math.PI ? 1 : 0} ${previous.bulge > 0 ? 0 : 1} ${point.x} ${point.y}`;
            else path += ` L ${point.x} ${point.y}`;
          }
        });
        if (entity.closed) {
          const last = entity.vertices[entity.vertices.length - 1]; const first = entity.vertices[0]; const firstPoint = transformPoint(first); const arc = bulgeArc(last, first, last.bulge);
          if (arc) path += ` A ${arc.radius * scale} ${arc.radius * scale} 0 ${Math.abs(4 * Math.atan(last.bulge)) > Math.PI ? 1 : 0} ${last.bulge > 0 ? 0 : 1} ${firstPoint.x} ${firstPoint.y} Z`;
          else path += ' Z';
        }
        make('path', { d: path });
      }
    });
  }

  function populateThicknesses(preferred = 3) {
    const material = MATERIALS[els.material.value];
    els.thickness.innerHTML = material.thicknesses.map(value => `<option value="${value}" ${value === preferred ? 'selected' : ''}>${value} mm</option>`).join('');
  }

  function currentPart() { return state.parts[state.activeIndex] || null; }

  function quoteCalculation() {
    const part = currentPart();
    if (!part) return null;
    const materialKey = els.material.value;
    const material = MATERIALS[materialKey];
    const thickness = Number.parseFloat(els.thickness.value) || 3;
    const quantity = Math.max(1, Math.min(999, Math.round(Number.parseFloat(els.quantity.value) || 1)));
    const areaM2 = Math.max(part.width * part.height / 1_000_000, 0.0001);
    const massKgEach = areaM2 * thickness / 1000 * material.density;
    const materialEach = massKgEach * material.sheetRate * PRICING.materialWasteFactor;
    const speedMmPerMinute = Math.max(260, 3800 / Math.pow(thickness, 0.72) / material.cutFactor);
    const cuttingMinutesEach = part.cutLength / speedMmPerMinute + part.pierces * 0.055;
    const cuttingEach = cuttingMinutesEach * PRICING.machineRatePerMinute + part.pierces * PRICING.piercePrice;
    const quantityEfficiency = quantity >= 20 ? 0.85 : quantity >= 10 ? 0.9 : quantity >= 5 ? 0.95 : 1;
    let cuttingMaterial = (materialEach + cuttingEach) * quantity * quantityEfficiency;
    if (els.leadTime.value === 'priority') cuttingMaterial *= PRICING.priorityMultiplier;
    const checked = $$('[data-process]:checked').map(input => input.dataset.process);
    const extras = checked.reduce((sum, process) => sum + (PRICING.process[process] || 0), 0);
    const needsReview = checked.includes('fold') || part.warnings.length > 0 || part.width > 3000 || part.height > 1500;
    const setup = PRICING.setup;
    const rawSubtotal = cuttingMaterial + setup + extras;
    const minimumAdjustment = Math.max(0, PRICING.minimumSubtotal - rawSubtotal);
    const subtotal = rawSubtotal + minimumAdjustment;
    const gst = subtotal * PRICING.gst;
    return { materialKey, material, thickness, quantity, areaM2, massKgEach, materialEach, cuttingMinutesEach, cuttingMaterial, setup, extras, minimumAdjustment, subtotal, gst, total: subtotal + gst, checked, needsReview };
  }

  function formatDimension(value) { return `${value.toFixed(value >= 100 ? 0 : 1)} mm`; }

  function updateSummary() {
    const part = currentPart(); const quote = quoteCalculation();
    if (!part || !quote) { els.summaryPlaceholder.hidden = false; els.summaryContent.hidden = true; return; }
    els.summaryPlaceholder.hidden = true; els.summaryContent.hidden = false;
    $('#summary-file').textContent = part.filename;
    $('#summary-size').textContent = `${part.width.toFixed(1)} × ${part.height.toFixed(1)} mm`;
    $('#summary-material').textContent = `${quote.material.name} · ${quote.thickness} mm`;
    $('#summary-quantity').textContent = quote.quantity;
    $('#summary-cutting').textContent = currency.format(quote.cuttingMaterial);
    $('#summary-setup').textContent = currency.format(quote.setup);
    $('#summary-extras').textContent = currency.format(quote.extras);
    $('#minimum-row').hidden = quote.minimumAdjustment <= 0;
    $('#summary-minimum').textContent = currency.format(quote.minimumAdjustment);
    $('#summary-subtotal').textContent = currency.format(quote.subtotal);
    $('#summary-gst').textContent = currency.format(quote.gst);
    $('#summary-total').textContent = currency.format(quote.total);
    $('#review-flag').hidden = !quote.needsReview;
    $$('.quote-steps li').forEach((step, index) => step.classList.toggle('active', index <= 1));
  }

  function renderActivePart() {
    const part = currentPart(); if (!part) return;
    els.previewFilename.textContent = part.filename;
    $('#stat-width').textContent = formatDimension(part.width);
    $('#stat-height').textContent = formatDimension(part.height);
    $('#stat-cut-length').textContent = `${(part.cutLength / 1000).toFixed(2)} m`;
    $('#stat-pierces').textContent = part.pierces;
    $('#stat-entities').textContent = part.entities.length;
    els.warning.hidden = part.warnings.length === 0;
    els.warning.textContent = part.warnings.join(' ');
    renderPreview(part); updateSummary();
  }

  function renderTabs() {
    els.tabs.innerHTML = '';
    state.parts.forEach((part, index) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = `part-tab${index === state.activeIndex ? ' active' : ''}`;
      button.textContent = part.filename; button.title = part.filename;
      button.addEventListener('click', () => { state.activeIndex = index; renderTabs(); renderActivePart(); });
      els.tabs.appendChild(button);
    });
  }

  function showParts() {
    els.partPanel.hidden = false; els.configPanel.hidden = false; renderTabs(); renderActivePart();
    setTimeout(() => els.partPanel.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  async function handleFiles(fileList) {
    const files = [...fileList].slice(0, MAX_FILES);
    if (!files.length) return;
    els.uploadMessage.className = 'upload-message'; els.uploadMessage.textContent = 'Reading drawing geometry…';
    const parsed = []; const errors = [];
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith('.dxf')) { errors.push(`${file.name}: not a DXF file`); continue; }
      try { parsed.push(parseDXF(await file.text(), file.name)); }
      catch (error) { errors.push(`${file.name}: ${error.message}`); }
    }
    if (parsed.length) {
      state.parts.push(...parsed); state.activeIndex = state.parts.length - parsed.length;
      els.uploadMessage.className = 'upload-message success'; els.uploadMessage.textContent = `${parsed.length} drawing${parsed.length === 1 ? '' : 's'} read successfully.${errors.length ? ` ${errors.length} file(s) need attention.` : ''}`;
      showParts();
    } else { els.uploadMessage.className = 'upload-message error'; els.uploadMessage.textContent = errors.join(' · ') || 'The selected file could not be read.'; }
  }

  async function loadSample() {
    try {
      const response = await fetch('assets/samples/sample-bracket.dxf');
      if (!response.ok) throw new Error('Sample file unavailable');
      const part = parseDXF(await response.text(), 'sample-bracket.dxf');
      state.parts = [part]; state.activeIndex = 0;
      els.uploadMessage.className = 'upload-message success'; els.uploadMessage.textContent = 'Sample bracket loaded. Change the options to test the quote.';
      showParts();
    } catch (error) {
      const builtIn = `0\nSECTION\n2\nENTITIES\n0\nLWPOLYLINE\n90\n4\n70\n1\n10\n0\n20\n0\n10\n180\n20\n0\n10\n180\n20\n100\n10\n0\n20\n100\n0\nCIRCLE\n10\n25\n20\n50\n40\n8\n0\nCIRCLE\n10\n155\n20\n50\n40\n8\n0\nENDSEC\n0\nEOF`;
      state.parts = [parseDXF(builtIn, 'sample-bracket.dxf')]; state.activeIndex = 0; showParts();
    }
  }

  function quoteSnapshot() {
    const part = currentPart(); const quote = quoteCalculation(); if (!part || !quote) return null;
    return { id: Date.now(), createdAt: new Date().toISOString(), filename: part.filename, width: part.width, height: part.height, cutLength: part.cutLength, materialKey: quote.materialKey, materialName: quote.material.name, thickness: quote.thickness, quantity: quote.quantity, extras: quote.checked, notes: els.notes.value.trim(), subtotal: quote.subtotal, gst: quote.gst, total: quote.total, needsReview: quote.needsReview };
  }

  function readDrafts() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; } }
  function writeDrafts(drafts) { localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts.slice(0, 12))); renderSavedDrafts(); }

  function renderSavedDrafts() {
    const drafts = readDrafts();
    if (!drafts.length) { els.savedList.innerHTML = '<p class="empty-state">No saved drafts yet.</p>'; return; }
    els.savedList.innerHTML = '';
    drafts.forEach(draft => {
      const item = document.createElement('article'); item.className = 'saved-quote-item';
      item.innerHTML = `<div><strong>${escapeHTML(draft.filename)}</strong><small>${draft.materialName} · ${draft.thickness} mm · Qty ${draft.quantity} · ${currency.format(draft.total)}</small></div><button type="button" class="email">Email</button><button type="button" class="delete">Delete</button>`;
      item.querySelector('.email').addEventListener('click', () => emailDraft(draft));
      item.querySelector('.delete').addEventListener('click', () => writeDrafts(readDrafts().filter(saved => saved.id !== draft.id)));
      els.savedList.appendChild(item);
    });
  }

  function escapeHTML(value) { return String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]); }

  function saveDraft() {
    const snapshot = quoteSnapshot(); if (!snapshot) return;
    writeDrafts([snapshot, ...readDrafts()]);
    els.saveQuote.textContent = 'Draft Saved ✓';
    setTimeout(() => { els.saveQuote.textContent = 'Save Quote Draft'; }, 1800);
  }

  function emailDraft(draft) {
    const extras = draft.extras.length ? draft.extras.join(', ') : 'None';
    const body = `Corten Living Instant Quote\n\nDrawing: ${draft.filename}\nSize: ${draft.width.toFixed(1)} x ${draft.height.toFixed(1)} mm\nMaterial: ${draft.materialName}, ${draft.thickness} mm\nQuantity: ${draft.quantity}\nExtras: ${extras}\nEstimated subtotal: ${currency.format(draft.subtotal)}\nGST: ${currency.format(draft.gst)}\nEstimated total: ${currency.format(draft.total)}\nManual review: ${draft.needsReview ? 'Required' : 'Not currently flagged'}\n\nNotes: ${draft.notes || 'None'}\n\nPlease confirm manufacturability, final pricing, freight and lead time.`;
    location.href = `mailto:cortenliving@gmail.com?subject=${encodeURIComponent(`Instant Quote — ${draft.filename}`)}&body=${encodeURIComponent(body)}`;
  }

  els.input.addEventListener('change', event => { handleFiles(event.target.files); event.target.value = ''; });
  ['dragenter', 'dragover'].forEach(type => els.dropZone.addEventListener(type, event => { event.preventDefault(); els.dropZone.classList.add('dragover'); }));
  ['dragleave', 'drop'].forEach(type => els.dropZone.addEventListener(type, event => { event.preventDefault(); els.dropZone.classList.remove('dragover'); }));
  els.dropZone.addEventListener('drop', event => handleFiles(event.dataTransfer.files));
  els.loadSample.addEventListener('click', loadSample);
  els.clear.addEventListener('click', () => { state.parts = []; state.activeIndex = 0; els.partPanel.hidden = true; els.configPanel.hidden = true; els.summaryContent.hidden = true; els.summaryPlaceholder.hidden = false; els.uploadMessage.textContent = ''; $$('.quote-steps li').forEach((step, index) => step.classList.toggle('active', index === 0)); });
  els.material.addEventListener('change', () => { populateThicknesses(); updateSummary(); });
  [els.thickness, els.quantity, els.leadTime, els.notes].forEach(input => input.addEventListener('input', updateSummary));
  $$('[data-process]').forEach(input => input.addEventListener('change', updateSummary));
  els.saveQuote.addEventListener('click', saveDraft);
  els.emailQuote.addEventListener('click', () => { const snapshot = quoteSnapshot(); if (snapshot) emailDraft(snapshot); });

  populateThicknesses(3); renderSavedDrafts();
})();
