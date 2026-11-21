/* Project estimator (FR-EST-01..06). Pure client-side; product data and price ranges are injected by sections/estimator.liquid. */
(() => {
  const root = document.querySelector('[data-estimator]');
  if (!root) return;
  const $ = (s) => root.querySelector(s);
  const $$ = (s) => Array.from(root.querySelectorAll(s));
  const cfg = JSON.parse(root.querySelector('[data-estimator-config]').textContent);
  const t = cfg.strings;
  const esc = window.themeEsc || ((v) => String(v));
  const fmtNum = (n, d = 0) => Number(n).toLocaleString(cfg.locale, { maximumFractionDigits: d, minimumFractionDigits: d });
  const fmtMoney = (n) => Number(n).toLocaleString(cfg.locale, { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });
  const FT = 0.3048;

  const state = () => {
    const data = new FormData(root.querySelector('form'));
    const get = (k) => data.get(k);
    const num = (k) => { const v = parseFloat(String(get(k) || '').replace(',', '.')); return Number.isFinite(v) && v > 0 ? v : 0; };
    const unit = get('unit') || 'm';
    const toM = (v) => (unit === 'ft' ? v * FT : v);
    return { get, num, unit, toM, type: get('type') || 'deck' };
  };

  const productsFor = (type) => cfg.products.filter((p) => p.type === type);

  const fillProducts = () => {
    const type = state().type;
    const select = $('[name="product"]');
    const current = select.value;
    const list = productsFor(type);
    select.innerHTML = list.map((p) => `<option value="${esc(p.handle)}">${esc(p.title)}</option>`).join('') || `<option value="">${esc(t.no_products)}</option>`;
    if (list.some((p) => p.handle === current)) select.value = current;
    fillOptions();
  };

  const fillOptions = () => {
    const p = cfg.products.find((x) => x.handle === $('[name="product"]').value);
    const colour = $('[name="colour"]');
    const length = $('[name="board_length"]');
    colour.innerHTML = (p ? p.colours : []).map((c) => `<option>${esc(c)}</option>`).join('');
    length.innerHTML = (p ? p.lengths_mm : []).map((mm) => `<option value="${mm}">${fmtNum(mm / 1000, 2)} m / ${fmtNum(mm / 304.8, 0)} ft</option>`).join('');
    const span = $('[data-max-span]');
    if (span) span.textContent = p && p.max_span_mm ? `${t.max_span}: ${fmtNum(p.max_span_mm)} mm` : t.span_unknown;
  };

  const showFields = (type) => {
    $$('[data-for]').forEach((el) => {
      const on = el.dataset.for.split(' ').includes(type);
      el.hidden = !on;
      el.querySelectorAll('input, select').forEach((f) => { f.disabled = !on; });
    });
    $$('[data-shape]').forEach((el) => { el.hidden = el.dataset.shape !== (state().get('shape') || 'rect'); });
  };

  const range = (min, max, qty) => (min && max ? `${fmtMoney(min * qty)} – ${fmtMoney(max * qty)}` : null);

  const calculate = () => {
    const s = state();
    const type = s.type;
    showFields(type);
    const errors = [];
    const lines = [];
    const notes = [];
    let area = 0;
    let materials = null;
    let install = null;
    const product = cfg.products.find((x) => x.handle === s.get('product'));
    const waste = (cfg.waste_pct || 10) / 100;

    if (type === 'deck' || type === 'cladding') {
      let perimeter = 0;
      if (type === 'deck' && s.get('shape') === 'l') {
        const a = s.toM(s.num('a_len')); const b = s.toM(s.num('a_wid'));
        const c = s.toM(s.num('b_len')); const d = s.toM(s.num('b_wid'));
        area = a * b + c * d;
        perimeter = 2 * (Math.max(a, c) + b + d);
      } else {
        const len = s.toM(s.num(type === 'deck' ? 'length' : 'wall_length'));
        const wid = s.toM(s.num(type === 'deck' ? 'width' : 'wall_height'));
        area = len * wid;
        perimeter = 2 * (len + wid);
        if (type === 'cladding') area = Math.max(0, area - (s.unit === 'ft' ? s.num('openings') * FT * FT : s.num('openings')));
      }
      if (!area) errors.push(t.need_dimensions);
      if (!product) errors.push(t.no_products);
      if (!errors.length) {
        const boardLen = (parseFloat(s.get('board_length')) || product.lengths_mm[0] || 3000) / 1000;
        const coverage = ((product.width_mm || 150) + (product.gap_mm || 5)) / 1000;
        let extra = waste;
        if (type === 'deck' && s.get('orientation') === 'diagonal') extra += 0.05;
        const perBoard = coverage * boardLen;
        const rawBoards = area / perBoard;
        const boards = Math.ceil(rawBoards * (1 + extra));
        lines.push([type === 'deck' ? t.boards : t.panels, `${fmtNum(boards)} × ${fmtNum(boardLen, 2)} m`]);
        const formula = `${fmtNum(area, 2)} m² ÷ (${fmtNum(coverage, 3)} m × ${fmtNum(boardLen, 2)} m) = ${fmtNum(rawBoards, 1)} → × ${fmtNum(1 + extra, 2)} = ${fmtNum(rawBoards * (1 + extra), 1)} → ${fmtNum(boards)}`;
        notes.push(formula);
        const trims = Math.ceil(perimeter / 3);
        lines.push([t.edge_trims, `${fmtNum(trims)} × 3 m`]);

        if (type === 'deck') {
          const spacing = s.num('joist_spacing') / 1000;
          if (product.max_span_mm && spacing * 1000 > product.max_span_mm) errors.push(t.span_error.replace('[max]', fmtNum(product.max_span_mm)));
          if (s.get('frame') === 'yes') {
            const frameBoards = Math.ceil((perimeter / boardLen) * (1 + waste));
            lines.push([t.frame_boards, `${fmtNum(frameBoards)} × ${fmtNum(boardLen, 2)} m`]);
          }
          const steps = Math.round(s.num('steps'));
          if (steps) {
            const stairWidth = s.toM(s.num('stair_width')) || 1.2;
            const perTread = Math.ceil(stairWidth / boardLen) * 2;
            lines.push([t.stair_boards, fmtNum(steps * perTread)]);
            lines.push([t.risers, `${fmtNum(steps * Math.ceil(stairWidth / 3))} × 3 m`]);
          }
          if (s.get('substructure') === 'ours' && spacing) {
            const joistMetres = area / spacing + perimeter;
            lines.push([t.joists, `${fmtNum(Math.ceil((joistMetres * (1 + waste)) / 3))} × 3 m`]);
          }
          if (spacing) {
            const clips = Math.ceil((area / (coverage * spacing)) * (1 + waste));
            lines.push([t.clips, `${fmtNum(clips)} (${fmtNum(Math.ceil(clips / 250))} × 250)`]);
          }
          materials = range(cfg.prices.deck_min, cfg.prices.deck_max, area);
          install = range(cfg.prices.install_min, cfg.prices.install_max, area);
        } else {
          materials = range(cfg.prices.clad_min, cfg.prices.clad_max, area);
        }
      }
    } else if (type === 'fence') {
      const run = s.toM(s.num('run'));
      if (!run) errors.push(t.need_dimensions);
      if (!errors.length) {
        const kits = Math.ceil(run / (cfg.fence_kit_m || 1.92));
        const ends = Math.max(2, Math.round(s.num('ends')) || 2);
        lines.push([t.fence_kits, fmtNum(kits)]);
        lines.push([t.closing_kits, fmtNum(ends)]);
        area = run * 1.8;
        materials = range(cfg.prices.fence_min, cfg.prices.fence_max, kits);
        notes.push(`${fmtNum(run, 2)} m ÷ ${fmtNum(cfg.fence_kit_m || 1.92, 2)} m = ${fmtNum(kits)}`);
      }
    } else {
      lines.push([t.quote_only, '']);
    }

    const out = $('[data-est-output]');
    const err = $('[data-est-errors]');
    err.hidden = !errors.length;
    err.innerHTML = errors.map((e) => `<p>${esc(e)}</p>`).join('');
    if (errors.length) { out.hidden = true; return null; }
    out.hidden = false;
    $('[data-est-area]').textContent = area ? `${fmtNum(area, 1)} m² (${fmtNum(area / (FT * FT), 0)} ft²)` : '—';
    $('[data-est-lines]').innerHTML = lines.map(([k, v]) => `<li><span>${esc(k)}</span><b>${esc(v)}</b></li>`).join('');
    $('[data-est-materials]').textContent = materials || t.price_on_quote;
    $('[data-est-install]').textContent = install || t.price_on_quote;
    $('[data-est-formula]').textContent = notes.join('\n');
    const impact = $('[data-est-impact]');
    if (cfg.diversion && cfg.diversion.kg_per_m2 && area && type !== 'fence') {
      impact.hidden = false;
      impact.querySelector('span').textContent = t.impact.replace('[kg]', fmtNum(area * cfg.diversion.kg_per_m2));
    } else impact.hidden = true;

    const summary = [
      `${t.project}: ${$('[name="type"]:checked').parentElement.textContent.trim()}`,
      product ? `${t.product}: ${product.title} — ${s.get('colour') || ''}` : '',
      area ? `${t.area}: ${fmtNum(area, 1)} m²` : '',
      ...lines.map(([k, v]) => `${k}: ${v}`),
      `${t.materials}: ${materials || t.price_on_quote}`,
      type === 'deck' ? `${t.installation}: ${install || t.price_on_quote}` : '',
      t.disclaimer
    ].filter(Boolean).join('\n');
    const result = { summary, colour: s.get('colour'), type, created: new Date().toISOString() };
    window.themeStore.set('estimate', result);
    $('[data-est-email]').href = `mailto:?subject=${encodeURIComponent(t.email_subject)}&body=${encodeURIComponent(summary)}`;
    $('[data-est-samples]').href = `${cfg.samples_url}?colour=${encodeURIComponent(s.get('colour') || '')}`;
    return result;
  };

  root.addEventListener('change', (e) => {
    if (e.target.name === 'type') fillProducts();
    if (e.target.name === 'product') fillOptions();
    calculate();
  });
  root.addEventListener('input', () => calculate());
  root.querySelector('form').addEventListener('submit', (e) => e.preventDefault());

  $('[data-est-save]').addEventListener('click', () => {
    const r = calculate();
    if (!r) return;
    const saved = window.themeStore.get('saved_estimates', [], 'localStorage');
    saved.unshift(r);
    window.themeStore.set('saved_estimates', saved.slice(0, 10), 'localStorage');
    const msg = $('[data-est-saved]');
    msg.hidden = false;
    setTimeout(() => { msg.hidden = true; }, 2500);
  });
  $('[data-est-quote]').addEventListener('click', (e) => {
    if (!calculate()) e.preventDefault();
  });

  const preferred = window.themeStore.get('units', 'metric');
  const unitSel = $('[name="unit"]');
  if (unitSel) unitSel.value = preferred === 'imperial' ? 'ft' : 'm';
  const presetType = new URL(location.href).searchParams.get('type');
  const typeInput = presetType && root.querySelector(`[name="type"][value="${CSS.escape(presetType)}"]`);
  if (typeInput) typeInput.checked = true;
  fillProducts();
  calculate();
})();
