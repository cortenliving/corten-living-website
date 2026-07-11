(() => {
  'use strict';

  const config = window.CortenPricingConfig;
  const form = document.querySelector('#pricing-form');
  if (!form || !config) return;

  const $ = selector => document.querySelector(selector);
  const materialsList = $('#materials-list');
  const status = $('#save-status');
  let settings = config.load();

  const fields = {
    sheetWidth: $('#sheet-width'),
    sheetLength: $('#sheet-length'),
    machineRate: $('#machine-rate'),
    piercePrice: $('#pierce-price'),
    wastePercent: $('#waste-percent'),
    markupPercent: $('#markup-percent'),
    gstPercent: $('#gst-percent'),
    priorityMultiplier: $('#priority-multiplier'),
    baseCutSpeed: $('#base-cut-speed'),
    minimumCutSpeed: $('#minimum-cut-speed'),
    pierceTime: $('#pierce-time'),
    discount5: $('#discount-5'),
    discount10: $('#discount-10'),
    discount20: $('#discount-20')
  };

  const escapeHTML = value => String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
  const numberValue = (input, fallback = 0) => {
    const value = Number.parseFloat(input?.value);
    return Number.isFinite(value) ? value : fallback;
  };

  function fillGlobalFields() {
    fields.sheetWidth.value = settings.sheet.widthMm;
    fields.sheetLength.value = settings.sheet.lengthMm;
    fields.machineRate.value = settings.pricing.machineRatePerHour;
    fields.piercePrice.value = settings.pricing.piercePrice;
    fields.wastePercent.value = settings.pricing.materialWastePercent;
    fields.markupPercent.value = settings.pricing.markupPercent;
    fields.gstPercent.value = settings.pricing.gstPercent;
    fields.priorityMultiplier.value = settings.pricing.priorityMultiplier;
    fields.baseCutSpeed.value = settings.pricing.baseCutSpeedMmPerMinute;
    fields.minimumCutSpeed.value = settings.pricing.minimumCutSpeedMmPerMinute;
    fields.pierceTime.value = settings.pricing.pierceTimeSeconds;
    fields.discount5.value = settings.pricing.quantityDiscount5Percent;
    fields.discount10.value = settings.pricing.quantityDiscount10Percent;
    fields.discount20.value = settings.pricing.quantityDiscount20Percent;
  }

  function renderMaterials() {
    materialsList.innerHTML = '';
    settings.materials.forEach((material, materialIndex) => {
      const card = document.createElement('article');
      card.className = `material-editor${material.enabled ? '' : ' disabled'}`;
      card.dataset.index = materialIndex;
      card.innerHTML = `
        <div class="material-editor-header">
          <label class="material-toggle"><input class="material-enabled" type="checkbox" ${material.enabled ? 'checked' : ''}> Enabled</label>
          <input class="material-name-input" type="text" value="${escapeHTML(material.name)}" aria-label="Material name" required>
          <button class="remove-material" type="button">Remove material</button>
        </div>
        <div class="material-editor-body">
          <div class="material-fields">
            <label><span>Density <em>kg/m³</em></span><input class="material-density" type="number" min="1" step="1" value="${material.density}" required></label>
            <label><span>Material price <em>$/kg</em></span><input class="material-price" type="number" min="0" step="0.01" value="${material.pricePerKg}" required></label>
            <label><span>Cut factor <em>1.00 = mild steel</em></span><input class="material-cut-factor" type="number" min="0.05" step="0.01" value="${material.cutFactor}" required></label>
          </div>
          <div class="thickness-section">
            <div class="thickness-header"><h3>Available thicknesses</h3><button class="small-add add-thickness" type="button">+ Add thickness</button></div>
            <div class="thickness-list">
              ${material.thicknesses.length ? material.thicknesses.map((value, thicknessIndex) => `
                <div class="thickness-row" data-thickness-index="${thicknessIndex}">
                  <input class="thickness-value" type="number" min="0.1" step="0.1" value="${value}" aria-label="Thickness in millimetres" required>
                  <button class="remove-thickness" type="button" aria-label="Remove ${value} millimetre thickness">×</button>
                </div>`).join('') : '<div class="empty-thickness">Add at least one thickness.</div>'}
            </div>
            <p class="material-id-note">Internal ID: ${escapeHTML(material.id)}</p>
          </div>
        </div>`;
      materialsList.appendChild(card);
    });
  }

  function collectForm() {
    const raw = {
      version: 1,
      sheet: {
        widthMm: numberValue(fields.sheetWidth, 1200),
        lengthMm: numberValue(fields.sheetLength, 2400)
      },
      pricing: {
        machineRatePerHour: numberValue(fields.machineRate, 0),
        piercePrice: numberValue(fields.piercePrice, 0),
        materialWastePercent: numberValue(fields.wastePercent, 0),
        markupPercent: numberValue(fields.markupPercent, 0),
        gstPercent: numberValue(fields.gstPercent, 15),
        priorityMultiplier: numberValue(fields.priorityMultiplier, 1),
        baseCutSpeedMmPerMinute: numberValue(fields.baseCutSpeed, 3800),
        minimumCutSpeedMmPerMinute: numberValue(fields.minimumCutSpeed, 260),
        pierceTimeSeconds: numberValue(fields.pierceTime, 0),
        quantityDiscount5Percent: numberValue(fields.discount5, 0),
        quantityDiscount10Percent: numberValue(fields.discount10, 0),
        quantityDiscount20Percent: numberValue(fields.discount20, 0)
      },
      materials: [...materialsList.querySelectorAll('.material-editor')].map((card, index) => {
        const previous = settings.materials[index] || {};
        const name = card.querySelector('.material-name-input').value.trim();
        return {
          id: previous.id || config.makeId(name),
          name,
          enabled: card.querySelector('.material-enabled').checked,
          density: numberValue(card.querySelector('.material-density'), 7850),
          pricePerKg: numberValue(card.querySelector('.material-price'), 0),
          cutFactor: numberValue(card.querySelector('.material-cut-factor'), 1),
          thicknesses: [...card.querySelectorAll('.thickness-value')].map(input => numberValue(input, NaN)).filter(Number.isFinite)
        };
      })
    };
    settings = config.normalize(raw);
    return settings;
  }

  function refresh() {
    fillGlobalFields();
    renderMaterials();
  }

  function showStatus(message, isError = false) {
    status.textContent = message;
    status.style.color = isError ? '#ffb0a4' : '#b8d8bd';
    window.clearTimeout(showStatus.timer);
    showStatus.timer = window.setTimeout(() => { status.textContent = ''; }, 3500);
  }

  materialsList.addEventListener('change', event => {
    if (event.target.classList.contains('material-enabled')) {
      event.target.closest('.material-editor').classList.toggle('disabled', !event.target.checked);
    }
  });

  materialsList.addEventListener('click', event => {
    const card = event.target.closest('.material-editor');
    if (!card) return;
    const materialIndex = Number(card.dataset.index);

    if (event.target.closest('.remove-material')) {
      collectForm();
      if (settings.materials.length === 1) {
        showStatus('At least one material is required.', true);
        return;
      }
      settings.materials.splice(materialIndex, 1);
      renderMaterials();
      return;
    }

    if (event.target.closest('.add-thickness')) {
      collectForm();
      const material = settings.materials[materialIndex];
      const last = material.thicknesses.at(-1) || 2;
      material.thicknesses.push(Math.round((last + 1) * 10) / 10);
      renderMaterials();
      const newest = materialsList.querySelectorAll('.material-editor')[materialIndex]?.querySelectorAll('.thickness-value');
      newest?.[newest.length - 1]?.focus();
      return;
    }

    const removeThickness = event.target.closest('.remove-thickness');
    if (removeThickness) {
      collectForm();
      const thicknessIndex = Number(removeThickness.closest('.thickness-row').dataset.thicknessIndex);
      const material = settings.materials[materialIndex];
      if (material.thicknesses.length === 1) {
        showStatus('Each material needs at least one thickness.', true);
        return;
      }
      material.thicknesses.splice(thicknessIndex, 1);
      renderMaterials();
    }
  });

  $('#add-material').addEventListener('click', () => {
    collectForm();
    const number = settings.materials.length + 1;
    settings.materials.push({
      id: config.makeId(`new-material-${Date.now()}`),
      name: `New material ${number}`,
      enabled: true,
      density: 7850,
      pricePerKg: 0,
      cutFactor: 1,
      thicknesses: [3]
    });
    renderMaterials();
    materialsList.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const next = collectForm();
    if (!next.materials.some(material => material.enabled)) {
      showStatus('Enable at least one material before saving.', true);
      return;
    }
    settings = config.save(next);
    refresh();
    showStatus('Pricing settings saved ✓');
  });

  $('#reset-settings').addEventListener('click', () => {
    if (!window.confirm('Restore all materials and pricing values to the original defaults?')) return;
    settings = config.reset();
    refresh();
    showStatus('Default settings restored.');
  });

  $('#export-settings').addEventListener('click', () => {
    const current = collectForm();
    const blob = new Blob([JSON.stringify(current, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `corten-living-pricing-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showStatus('Backup downloaded.');
  });

  $('#import-settings').addEventListener('change', async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      settings = config.normalize(imported);
      refresh();
      showStatus('Backup loaded. Save to apply it.');
    } catch (error) {
      showStatus('That backup file could not be read.', true);
    }
  });

  refresh();
})();
