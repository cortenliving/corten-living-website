(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const currency = new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' });
  const MAX_FILES = 10;
  const STORAGE_KEY = 'cortenLivingInstantQuoteDraftsV2';
  const config = window.CortenPricingConfig;
  if (!config) {
    console.error('Pricing configuration could not be loaded.');
    return;
  }
  let settings = config.load();

  const state = { parts: [], activeIndex: 0 };

  const els = {
    input: $('#dxf-input'), dropZone: $('#drop-zone'), uploadMessage: $('#upload-message'), loadSample: $('#load-sample'),
    partPanel: $('#part-panel'), configPanel: $('#configuration-panel'), tabs: $('#part-tabs'), preview: $('#dxf-preview'),
    previewFilename: $('#preview-filename'), warning: $('#geometry-warning'), clear: $('#clear-parts'), material: $('#material-select'),
    thickness: $('#thickness-select'), leadTime: $('#lead-time-select'), notes: $('#job-notes'),
    summaryPlaceholder: $('#summary-placeholder'), summaryContent: $('#summary-content'), quoteItemList: $('#quote-item-list'), savedList: $('#saved-quote-list'),
    saveQuote: $('#save-quote'), emailQuote: $('#email-quote')
  };

  if (!els.input) return;

  function createPartId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `part-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

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

  function fitsStandardSheet(width, height) {
    const shortSide = Math.min(width, height);
    const longSide = Math.max(width, height);
    const sheetShort = Math.min(settings.sheet.widthMm, settings.sheet.lengthMm);
    const sheetLong = Math.max(settings.sheet.widthMm, settings.sheet.lengthMm);
    return shortSide <= sheetShort && longSide <= sheetLong;
  }

  function sheetSizeLabel() {
    return `${settings.sheet.widthMm} × ${settings.sheet.lengthMm} mm`;
  }

  function refreshSheetErrors() {
    state.parts.forEach(part => { part.sheetError = !fitsStandardSheet(part.width, part.height); });
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
    const sheetError = !fitsStandardSheet(width, height);
    if (entities.some(entity => entity.type === 'SPLINE' || entity.type === 'ELLIPSE')) warnings.push('Splines or ellipses need manual review.');

    return { id: createPartId(), filename, entities, bounds, width, height, cutLength, pierces, warnings, sheetError, quantity: 1 };
  }

  function pointOnCircle(cx, cy, radius, degrees) {
    const angle = degrees * Math.PI / 180;
    return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  }

  function renderPartSvg(svg, part, viewportWidth = 720, viewportHeight = 440, padding = 34) {
    svg.replaceChildren();
    svg.setAttribute('viewBox', `0 0 ${viewportWidth} ${viewportHeight}`);
    const width = Math.max(part.width, 1);
    const height = Math.max(part.height, 1);
    const scale = Math.min((viewportWidth - padding * 2) / width, (viewportHeight - padding * 2) / height);
    const offsetX = (viewportWidth - width * scale) / 2 - part.bounds.minX * scale;
    const offsetY = (viewportHeight - height * scale) / 2 + part.bounds.maxY * scale;
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

  function renderPreview(part) {
    renderPartSvg(els.preview, part, 720, 440, 34);
  }

  function enabledMaterials() {
    return settings.materials.filter(material => material.enabled && material.thicknesses.length);
  }

  function selectedMaterial() {
    return enabledMaterials().find(material => material.id === els.material.value) || enabledMaterials()[0] || null;
  }

  function populateMaterials(preferredMaterialId) {
    const available = enabledMaterials();
    const previous = preferredMaterialId || els.material.value;
    els.material.innerHTML = available.map(material => `<option value="${material.id}">${escapeHTML(material.name)}</option>`).join('');
    if (available.some(material => material.id === previous)) els.material.value = previous;
    if (!available.length) {
      els.material.innerHTML = '<option value="">No materials enabled</option>';
      els.material.disabled = true;
      els.thickness.innerHTML = '<option value="">No thicknesses available</option>';
      els.thickness.disabled = true;
      els.uploadMessage.className = 'upload-message error';
      els.uploadMessage.textContent = 'No materials are enabled. Open Pricing Settings and enable at least one material.';
      return;
    }
    els.material.disabled = false;
    els.thickness.disabled = false;
  }

  function populateThicknesses(preferred = 3) {
    const material = selectedMaterial();
    if (!material) return;
    els.thickness.innerHTML = material.thicknesses.map(value => `<option value="${value}">${value} mm</option>`).join('');
    const closest = material.thicknesses.includes(Number(preferred)) ? Number(preferred) : material.thicknesses[0];
    els.thickness.value = String(closest);
  }

  function currentPart() { return state.parts[state.activeIndex] || null; }

  function normaliseQuantity(value) {
    return Math.max(1, Math.min(999, Math.round(Number.parseFloat(value) || 1)));
  }

  function quoteCalculation(part) {
    if (!part) return null;
    const materialKey = els.material.value;
    const material = selectedMaterial();
    if (!material) return null;
    const thickness = Number.parseFloat(els.thickness.value) || material.thicknesses[0] || 3;
    const pricing = settings.pricing;
    const quantity = normaliseQuantity(part.quantity);
    part.quantity = quantity;
    const areaM2 = Math.max(part.width * part.height / 1_000_000, 0.0001);
    const massKgEach = areaM2 * thickness / 1000 * material.density;
    const materialEach = massKgEach * material.pricePerKg * (1 + pricing.materialWastePercent / 100);
    const speedMmPerMinute = Math.max(pricing.minimumCutSpeedMmPerMinute, pricing.baseCutSpeedMmPerMinute / Math.pow(thickness, 0.72) / material.cutFactor);
    const cuttingMinutesEach = part.cutLength / speedMmPerMinute + part.pierces * (pricing.pierceTimeSeconds / 60);
    const cuttingEach = cuttingMinutesEach * (pricing.machineRatePerHour / 60) + part.pierces * pricing.piercePrice;
    const quantityEfficiency = config.quantityMultiplier(quantity, pricing);
    let subtotal = (materialEach + cuttingEach) * (1 + pricing.markupPercent / 100) * quantity * quantityEfficiency;
    if (els.leadTime.value === 'priority') subtotal *= pricing.priorityMultiplier;
    const gst = subtotal * (pricing.gstPercent / 100);
    const sheetError = Boolean(part.sheetError);
    const needsReview = part.warnings.length > 0 || sheetError;
    return { partId: part.id, materialKey, material, thickness, quantity, areaM2, massKgEach, materialEach, cuttingMinutesEach, subtotal, gst, total: subtotal + gst, needsReview, sheetError };
  }

  function basketCalculation() {
    const items = state.parts.map(part => ({ part, quote: quoteCalculation(part) }));
    const subtotal = items.reduce((sum, item) => sum + item.quote.subtotal, 0);
    const gst = subtotal * (settings.pricing.gstPercent / 100);
    return {
      items,
      subtotal,
      gst,
      total: subtotal + gst,
      totalQuantity: items.reduce((sum, item) => sum + item.quote.quantity, 0),
      needsReview: items.some(item => item.quote.needsReview),
      hasSheetError: items.some(item => item.quote.sheetError)
    };
  }

  function formatDimension(value) { return `${value.toFixed(value >= 100 ? 0 : 1)} mm`; }

  function setActivePart(index, shouldScroll = false) {
    if (index < 0 || index >= state.parts.length) return;
    state.activeIndex = index;
    renderTabs();
    renderActivePart();
    if (shouldScroll) els.partPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function removePart(index) {
    if (index < 0 || index >= state.parts.length) return;
    state.parts.splice(index, 1);
    if (!state.parts.length) {
      resetQuoteWorkspace();
      return;
    }
    if (index < state.activeIndex) state.activeIndex -= 1;
    else if (state.activeIndex >= state.parts.length) state.activeIndex = state.parts.length - 1;
    renderTabs();
    renderActivePart();
  }

  function changePartQuantity(partId, nextValue) {
    const part = state.parts.find(item => item.id === partId);
    if (!part) return;
    part.quantity = normaliseQuantity(nextValue);
    updateSummary();
  }

  function createQuantityControl(part) {
    const control = document.createElement('div');
    control.className = 'item-quantity';
    control.setAttribute('aria-label', `Quantity for ${part.filename}`);

    const minus = document.createElement('button');
    minus.type = 'button'; minus.textContent = '−'; minus.setAttribute('aria-label', 'Decrease quantity');
    const input = document.createElement('input');
    input.type = 'number'; input.min = '1'; input.max = '999'; input.step = '1'; input.value = normaliseQuantity(part.quantity); input.setAttribute('aria-label', 'Quantity');
    const plus = document.createElement('button');
    plus.type = 'button'; plus.textContent = '+'; plus.setAttribute('aria-label', 'Increase quantity');

    [minus, input, plus].forEach(element => element.addEventListener('click', event => event.stopPropagation()));
    minus.addEventListener('click', () => changePartQuantity(part.id, normaliseQuantity(part.quantity) - 1));
    plus.addEventListener('click', () => changePartQuantity(part.id, normaliseQuantity(part.quantity) + 1));
    input.addEventListener('change', () => changePartQuantity(part.id, input.value));
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); changePartQuantity(part.id, input.value); }
    });

    control.append(minus, input, plus);
    return control;
  }

  function renderQuoteItems(basket) {
    els.quoteItemList.replaceChildren();
    basket.items.forEach(({ part, quote }, index) => {
      const item = document.createElement('article');
      item.className = `quote-item-card${index === state.activeIndex ? ' active' : ''}${quote.sheetError ? ' error' : ''}`;
      item.tabIndex = 0;
      item.setAttribute('role', 'button');
      item.setAttribute('aria-label', `Preview ${part.filename}`);
      item.addEventListener('click', () => setActivePart(index, true));
      item.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setActivePart(index, true); }
      });

      const thumb = document.createElement('div'); thumb.className = 'quote-item-thumb';
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('aria-hidden', 'true');
      thumb.appendChild(svg);
      renderPartSvg(svg, part, 150, 100, 12);

      const details = document.createElement('div'); details.className = 'quote-item-details';
      const name = document.createElement('strong'); name.className = 'quote-item-name'; name.textContent = part.filename; name.title = part.filename;
      const size = document.createElement('small');
      size.textContent = quote.sheetError
        ? `${part.width.toFixed(1)} × ${part.height.toFixed(1)} mm · TOO LARGE FOR SHEET`
        : `${part.width.toFixed(1)} × ${part.height.toFixed(1)} mm`;
      if (quote.sheetError) size.classList.add('sheet-error-label');
      const quantityLabel = document.createElement('span'); quantityLabel.className = 'quantity-label'; quantityLabel.textContent = 'Qty';
      const qtyRow = document.createElement('div'); qtyRow.className = 'quantity-row';
      qtyRow.append(quantityLabel, createQuantityControl(part));
      details.append(name, size, qtyRow);

      const priceArea = document.createElement('div'); priceArea.className = 'quote-item-price';
      const remove = document.createElement('button');
      remove.type = 'button'; remove.className = 'quote-item-remove'; remove.textContent = '×'; remove.setAttribute('aria-label', `Remove ${part.filename}`);
      remove.addEventListener('click', event => { event.stopPropagation(); removePart(index); });
      const price = document.createElement('strong');
      const taxLabel = document.createElement('small');
      if (quote.sheetError) {
        price.textContent = 'SHEET ERROR';
        taxLabel.textContent = 'NO PRICE';
        priceArea.classList.add('error');
      } else {
        price.textContent = currency.format(quote.subtotal);
        taxLabel.textContent = 'ex GST';
      }
      priceArea.append(remove, price, taxLabel);

      item.append(thumb, details, priceArea);
      els.quoteItemList.appendChild(item);
    });
  }

  function updateSummary() {
    if (!state.parts.length) {
      els.summaryPlaceholder.hidden = false;
      els.summaryContent.hidden = true;
      return;
    }
    const basket = basketCalculation();
    els.summaryPlaceholder.hidden = true;
    els.summaryContent.hidden = false;
    $('#summary-material').textContent = `${basket.items[0].quote.material.name} · ${basket.items[0].quote.thickness} mm`;
    $('#summary-count').textContent = `${state.parts.length} file${state.parts.length === 1 ? '' : 's'} · ${basket.totalQuantity} item${basket.totalQuantity === 1 ? '' : 's'}`;
    renderQuoteItems(basket);
    $('#summary-subtotal').textContent = basket.hasSheetError ? '—' : currency.format(basket.subtotal);
    $('#summary-gst').textContent = basket.hasSheetError ? '—' : currency.format(basket.gst);
    $('#summary-total').textContent = basket.hasSheetError ? 'Cannot quote' : currency.format(basket.total);
    $('#review-flag').hidden = !basket.needsReview;
    $('#review-flag').textContent = basket.hasSheetError
      ? `One or more parts will not fit the configured ${sheetSizeLabel()} sheet, even when rotated. Remove or resize the highlighted file before an instant price can be calculated.`
      : 'Manual review is required before this price can be confirmed.';
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
    const messages = [...part.warnings];
    if (part.sheetError) messages.unshift(`ERROR: This part is ${part.width.toFixed(1)} × ${part.height.toFixed(1)} mm and will not fit the configured ${sheetSizeLabel()} sheet, even when rotated.`);
    els.warning.hidden = messages.length === 0;
    els.warning.textContent = messages.join(' ');
    els.warning.classList.toggle('error', Boolean(part.sheetError));
    els.partPanel.classList.toggle('sheet-error', Boolean(part.sheetError));
    $('#stat-sheet-fit').textContent = part.sheetError ? 'Too large' : 'Fits';
    $('#stat-sheet-fit').classList.toggle('error-text', Boolean(part.sheetError));
    renderPreview(part);
    updateSummary();
  }

  function renderTabs() {
    els.tabs.innerHTML = '';
    state.parts.forEach((part, index) => {
      const tab = document.createElement('div');
      tab.className = `part-tab-item${index === state.activeIndex ? ' active' : ''}${part.sheetError ? ' error' : ''}`;
      const select = document.createElement('button');
      select.type = 'button'; select.className = 'part-tab'; select.textContent = part.filename; select.title = part.filename;
      select.addEventListener('click', () => setActivePart(index));
      const close = document.createElement('button');
      close.type = 'button'; close.className = 'part-tab-close'; close.textContent = '×'; close.setAttribute('aria-label', `Remove ${part.filename}`);
      close.addEventListener('click', () => removePart(index));
      tab.append(select, close);
      els.tabs.appendChild(tab);
    });
  }

  function showParts() {
    els.partPanel.hidden = false;
    els.configPanel.hidden = false;
    renderTabs();
    renderActivePart();
    setTimeout(() => els.partPanel.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  async function handleFiles(fileList) {
    const remainingSlots = Math.max(0, MAX_FILES - state.parts.length);
    const files = [...fileList].slice(0, remainingSlots);
    if (!remainingSlots) {
      els.uploadMessage.className = 'upload-message error';
      els.uploadMessage.textContent = `A maximum of ${MAX_FILES} drawings can be added to one quote.`;
      return;
    }
    if (!files.length) return;
    els.uploadMessage.className = 'upload-message'; els.uploadMessage.textContent = 'Reading drawing geometry…';
    const parsed = []; const errors = [];
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith('.dxf')) { errors.push(`${file.name}: not a DXF file`); continue; }
      try { parsed.push(parseDXF(await file.text(), file.name)); }
      catch (error) { errors.push(`${file.name}: ${error.message}`); }
    }
    if (parsed.length) {
      const firstNewIndex = state.parts.length;
      state.parts.push(...parsed);
      state.activeIndex = firstNewIndex;
      els.uploadMessage.className = 'upload-message success';
      els.uploadMessage.textContent = `${parsed.length} drawing${parsed.length === 1 ? '' : 's'} added.${errors.length ? ` ${errors.length} file(s) need attention.` : ''}`;
      showParts();
    } else {
      els.uploadMessage.className = 'upload-message error';
      els.uploadMessage.textContent = errors.join(' · ') || 'The selected file could not be read.';
    }
  }

  async function loadSample() {
    try {
      const response = await fetch('sample-bracket.dxf');
      if (!response.ok) throw new Error('Sample file unavailable');
      const part = parseDXF(await response.text(), 'sample-bracket.dxf');
      state.parts.push(part); state.activeIndex = state.parts.length - 1;
      els.uploadMessage.className = 'upload-message success'; els.uploadMessage.textContent = 'Sample bracket added. Change the material, thickness or quantity to test the quote.';
      showParts();
    } catch (error) {
      const builtIn = `0\nSECTION\n2\nENTITIES\n0\nLWPOLYLINE\n90\n4\n70\n1\n10\n0\n20\n0\n10\n180\n20\n0\n10\n180\n20\n100\n10\n0\n20\n100\n0\nCIRCLE\n10\n25\n20\n50\n40\n8\n0\nCIRCLE\n10\n155\n20\n50\n40\n8\n0\nENDSEC\n0\nEOF`;
      state.parts.push(parseDXF(builtIn, 'sample-bracket.dxf')); state.activeIndex = state.parts.length - 1; showParts();
    }
  }

  function quoteSnapshot() {
    if (!state.parts.length) return null;
    const basket = basketCalculation();
    const firstQuote = basket.items[0].quote;
    return {
      id: Date.now(),
      createdAt: new Date().toISOString(),
      materialKey: firstQuote.materialKey,
      materialName: firstQuote.material.name,
      thickness: firstQuote.thickness,
      leadTime: els.leadTime.value,
      notes: els.notes.value.trim(),
      parts: basket.items.map(({ part, quote }) => ({ filename: part.filename, width: part.width, height: part.height, cutLength: part.cutLength, quantity: quote.quantity, subtotal: quote.subtotal, needsReview: quote.needsReview, sheetError: quote.sheetError })),
      totalQuantity: basket.totalQuantity,
      subtotal: basket.subtotal,
      gst: basket.gst,
      total: basket.total,
      needsReview: basket.needsReview,
      hasSheetError: basket.hasSheetError
    };
  }

  function readDrafts() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; } }
  function writeDrafts(drafts) { localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts.slice(0, 12))); renderSavedDrafts(); }

  function renderSavedDrafts() {
    const drafts = readDrafts();
    if (!drafts.length) { els.savedList.innerHTML = '<p class="empty-state">No saved drafts yet.</p>'; return; }
    els.savedList.innerHTML = '';
    drafts.forEach(draft => {
      const item = document.createElement('article'); item.className = 'saved-quote-item';
      const fileCount = draft.parts?.length || 1;
      const title = draft.parts?.[0]?.filename || draft.filename || 'Saved quote';
      const extraFiles = fileCount > 1 ? ` + ${fileCount - 1} more` : '';
      item.innerHTML = `<div><strong>${escapeHTML(title)}${escapeHTML(extraFiles)}</strong><small>${escapeHTML(draft.materialName)} · ${draft.thickness} mm · ${draft.totalQuantity || draft.quantity || 1} items · ${draft.hasSheetError ? 'SHEET ERROR' : currency.format(draft.total)}</small></div><button type="button" class="email">Email</button><button type="button" class="delete">Delete</button>`;
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
    const parts = draft.parts || [{ filename: draft.filename, width: draft.width, height: draft.height, quantity: draft.quantity, subtotal: draft.subtotal }];
    const partLines = parts.map((part, index) => `${index + 1}. ${part.filename}\n   Size: ${Number(part.width).toFixed(1)} x ${Number(part.height).toFixed(1)} mm\n   Quantity: ${part.quantity}\n   Sheet fit: ${part.sheetError ? `ERROR - exceeds ${settings.sheet.widthMm} x ${settings.sheet.lengthMm} mm sheet` : 'Fits standard sheet'}\n   Line price ex GST: ${part.sheetError ? 'Not calculated' : currency.format(part.subtotal)}`).join('\n\n');
    const body = `Corten Living Instant Quote\n\nMaterial: ${draft.materialName}, ${draft.thickness} mm\nLead time: ${draft.leadTime === 'priority' ? 'Priority' : 'Standard'}\n\nParts:\n${partLines}\n\nEstimated subtotal: ${draft.hasSheetError ? 'Not calculated' : currency.format(draft.subtotal)}\nGST: ${draft.hasSheetError ? 'Not calculated' : currency.format(draft.gst)}\nEstimated total: ${draft.hasSheetError ? 'Cannot quote - oversized part' : currency.format(draft.total)}\nManual review: ${draft.needsReview ? 'Required' : 'Not currently flagged'}\n\nNotes: ${draft.notes || 'None'}\n\nPlease confirm manufacturability, final pricing, freight and lead time.`;
    const subjectPart = parts.length === 1 ? parts[0].filename : `${parts.length} DXF files`;
    location.href = `mailto:cortenliving@gmail.com?subject=${encodeURIComponent(`Instant Quote — ${subjectPart}`)}&body=${encodeURIComponent(body)}`;
  }

  function resetQuoteWorkspace() {
    state.parts = [];
    state.activeIndex = 0;
    els.partPanel.hidden = true;
    els.configPanel.hidden = true;
    els.summaryContent.hidden = true;
    els.summaryPlaceholder.hidden = false;
    els.quoteItemList.replaceChildren();
    els.uploadMessage.textContent = '';
    $$('.quote-steps li').forEach((step, index) => step.classList.toggle('active', index === 0));
  }

  els.input.addEventListener('change', event => { handleFiles(event.target.files); event.target.value = ''; });
  ['dragenter', 'dragover'].forEach(type => els.dropZone.addEventListener(type, event => { event.preventDefault(); els.dropZone.classList.add('dragover'); }));
  ['dragleave', 'drop'].forEach(type => els.dropZone.addEventListener(type, event => { event.preventDefault(); els.dropZone.classList.remove('dragover'); }));
  els.dropZone.addEventListener('drop', event => handleFiles(event.dataTransfer.files));
  els.loadSample.addEventListener('click', loadSample);
  els.clear.addEventListener('click', resetQuoteWorkspace);
  els.material.addEventListener('change', () => { populateThicknesses(); updateSummary(); });
  [els.thickness, els.leadTime, els.notes].forEach(input => input.addEventListener('input', updateSummary));

  window.addEventListener('storage', event => {
    if (event.key !== config.STORAGE_KEY) return;
    const materialId = els.material.value;
    const thickness = Number.parseFloat(els.thickness.value) || 3;
    settings = config.load();
    populateMaterials(materialId);
    populateThicknesses(thickness);
    refreshSheetErrors();
    if (state.parts.length) { renderTabs(); renderActivePart(); }
    updateSheetLimitText();
  });
  els.saveQuote.addEventListener('click', saveDraft);
  els.emailQuote.addEventListener('click', () => { const snapshot = quoteSnapshot(); if (snapshot) emailDraft(snapshot); });

  function updateSheetLimitText() {
    const node = document.querySelector('#sheet-limit-text');
    if (node) node.textContent = `maximum sheet ${sheetSizeLabel()}`;
  }

  populateMaterials('corten');
  populateThicknesses(3);
  updateSheetLimitText();
  renderSavedDrafts();
})();
