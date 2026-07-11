(() => {
  'use strict';

  const STORAGE_KEY = 'cortenLivingPricingSettingsV1';

  const DEFAULT_SETTINGS = {
    version: 1,
    sheet: {
      widthMm: 1200,
      lengthMm: 2400
    },
    pricing: {
      machineRatePerHour: 129,
      piercePrice: 0.42,
      materialWastePercent: 22,
      markupPercent: 0,
      gstPercent: 15,
      priorityMultiplier: 1.2,
      baseCutSpeedMmPerMinute: 3800,
      minimumCutSpeedMmPerMinute: 260,
      pierceTimeSeconds: 3.3,
      quantityDiscount5Percent: 5,
      quantityDiscount10Percent: 10,
      quantityDiscount20Percent: 15
    },
    materials: [
      { id: 'corten', name: 'Corten steel', enabled: true, density: 7850, pricePerKg: 7.9, cutFactor: 1.08, thicknesses: [1.6, 2, 3, 4, 5, 6] },
      { id: 'mild', name: 'Mild steel', enabled: true, density: 7850, pricePerKg: 5.7, cutFactor: 1, thicknesses: [1, 1.6, 2, 3, 4, 5, 6, 8, 10] },
      { id: 'stainless', name: 'Stainless steel', enabled: true, density: 8000, pricePerKg: 14.5, cutFactor: 1.35, thicknesses: [1, 1.5, 2, 3, 4, 5, 6] },
      { id: 'aluminium', name: 'Aluminium', enabled: true, density: 2700, pricePerKg: 12.2, cutFactor: 1.18, thicknesses: [1.6, 2, 3, 4, 5, 6] }
    ]
  };

  const clone = value => JSON.parse(JSON.stringify(value));
  const finite = (value, fallback, minimum = -Infinity) => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) && parsed >= minimum ? parsed : fallback;
  };
  const makeId = value => String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || `material-${Date.now()}`;

  function normalizeMaterial(material, index, usedIds) {
    const fallback = DEFAULT_SETTINGS.materials[index] || DEFAULT_SETTINGS.materials[0];
    let id = makeId(material?.id || material?.name || `material-${index + 1}`);
    const original = id;
    let suffix = 2;
    while (usedIds.has(id)) id = `${original}-${suffix++}`;
    usedIds.add(id);

    const rawThicknesses = Array.isArray(material?.thicknesses) ? material.thicknesses : fallback.thicknesses;
    const thicknesses = [...new Set(rawThicknesses
      .map(value => finite(value, NaN, 0.1))
      .filter(Number.isFinite)
      .map(value => Math.round(value * 100) / 100))]
      .sort((a, b) => a - b);

    return {
      id,
      name: String(material?.name || fallback.name || `Material ${index + 1}`).trim() || `Material ${index + 1}`,
      enabled: material?.enabled !== false,
      density: finite(material?.density, fallback.density, 1),
      pricePerKg: finite(material?.pricePerKg, fallback.pricePerKg, 0),
      cutFactor: finite(material?.cutFactor, fallback.cutFactor, 0.05),
      thicknesses: thicknesses.length ? thicknesses : [3]
    };
  }

  function normalizeSettings(input) {
    const source = input && typeof input === 'object' ? input : {};
    const base = DEFAULT_SETTINGS;
    const usedIds = new Set();
    const rawMaterials = Array.isArray(source.materials) && source.materials.length ? source.materials : base.materials;

    return {
      version: 1,
      sheet: {
        widthMm: finite(source.sheet?.widthMm, base.sheet.widthMm, 1),
        lengthMm: finite(source.sheet?.lengthMm, base.sheet.lengthMm, 1)
      },
      pricing: {
        machineRatePerHour: finite(source.pricing?.machineRatePerHour, Number.isFinite(Number.parseFloat(source.pricing?.machineRatePerMinute)) ? Number.parseFloat(source.pricing.machineRatePerMinute) * 60 : base.pricing.machineRatePerHour, 0),
        piercePrice: finite(source.pricing?.piercePrice, base.pricing.piercePrice, 0),
        materialWastePercent: finite(source.pricing?.materialWastePercent, base.pricing.materialWastePercent, 0),
        markupPercent: finite(source.pricing?.markupPercent, base.pricing.markupPercent, 0),
        gstPercent: finite(source.pricing?.gstPercent, base.pricing.gstPercent, 0),
        priorityMultiplier: finite(source.pricing?.priorityMultiplier, base.pricing.priorityMultiplier, 0.01),
        baseCutSpeedMmPerMinute: finite(source.pricing?.baseCutSpeedMmPerMinute, base.pricing.baseCutSpeedMmPerMinute, 1),
        minimumCutSpeedMmPerMinute: finite(source.pricing?.minimumCutSpeedMmPerMinute, base.pricing.minimumCutSpeedMmPerMinute, 1),
        pierceTimeSeconds: finite(source.pricing?.pierceTimeSeconds, base.pricing.pierceTimeSeconds, 0),
        quantityDiscount5Percent: finite(source.pricing?.quantityDiscount5Percent, base.pricing.quantityDiscount5Percent, 0),
        quantityDiscount10Percent: finite(source.pricing?.quantityDiscount10Percent, base.pricing.quantityDiscount10Percent, 0),
        quantityDiscount20Percent: finite(source.pricing?.quantityDiscount20Percent, base.pricing.quantityDiscount20Percent, 0)
      },
      materials: rawMaterials.map((material, index) => normalizeMaterial(material, index, usedIds))
    };
  }

  function load() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? normalizeSettings(JSON.parse(stored)) : clone(DEFAULT_SETTINGS);
    } catch (error) {
      console.warn('Could not load pricing settings; defaults are being used.', error);
      return clone(DEFAULT_SETTINGS);
    }
  }

  function save(settings) {
    const normalized = normalizeSettings(settings);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  }

  function reset() {
    localStorage.removeItem(STORAGE_KEY);
    return clone(DEFAULT_SETTINGS);
  }

  function quantityMultiplier(quantity, pricing) {
    if (quantity >= 20) return Math.max(0, 1 - pricing.quantityDiscount20Percent / 100);
    if (quantity >= 10) return Math.max(0, 1 - pricing.quantityDiscount10Percent / 100);
    if (quantity >= 5) return Math.max(0, 1 - pricing.quantityDiscount5Percent / 100);
    return 1;
  }

  window.CortenPricingConfig = {
    STORAGE_KEY,
    DEFAULT_SETTINGS: clone(DEFAULT_SETTINGS),
    clone,
    load,
    save,
    reset,
    normalize: normalizeSettings,
    quantityMultiplier,
    makeId
  };
})();
