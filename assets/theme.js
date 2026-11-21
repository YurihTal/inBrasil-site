/* InBrasil Canada theme — shared behaviour. No dependencies. */
(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  window.themeEsc = esc;
  const store = {
    get(key, fallback = null, area = 'sessionStorage') {
      try { const v = window[area].getItem(key); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
    },
    set(key, value, area = 'sessionStorage') {
      try { window[area].setItem(key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ }
    }
  };
  window.themeStore = store;

  /* Header: scrolled state + mobile nav */
  const header = $('[data-site-header]');
  if (header) {
    const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    const toggle = $('[data-nav-toggle]', header);
    const nav = $('[data-nav]', header);
    if (toggle && nav) {
      toggle.addEventListener('click', () => {
        const open = nav.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', String(open));
        document.body.style.overflow = open ? 'hidden' : '';
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && nav.classList.contains('is-open')) { nav.classList.remove('is-open'); toggle.setAttribute('aria-expanded', 'false'); document.body.style.overflow = ''; toggle.focus(); }
      });
    }
  }

  /* Language selector submits on change */
  $$('[data-localization-form] select').forEach((sel) => sel.addEventListener('change', () => sel.form.submit()));

  /* Units: every [data-mm] value displays in metric or imperial (FR-CAT-05, SRS-D-01). */
  const toImperial = (mm, kind) => {
    if (kind === 'length' && mm >= 1000) {
      const ft = mm / 304.8;
      return `${ft.toFixed(ft >= 10 ? 0 : 1)} ${theme.units.ft}`;
    }
    const inches = mm / 25.4;
    const whole = Math.floor(inches);
    const sixteenths = Math.round((inches - whole) * 16);
    if (sixteenths === 0) return `${whole}″`;
    if (sixteenths === 16) return `${whole + 1}″`;
    let n = sixteenths, d = 16;
    while (n % 2 === 0) { n /= 2; d /= 2; }
    return `${whole ? whole + ' ' : ''}${n}/${d}″`;
  };
  const toMetric = (mm, kind) => {
    if (kind === 'length' && mm >= 1000) return `${(mm / 1000).toLocaleString(theme.locale, { maximumFractionDigits: 2 })} ${theme.units.m}`;
    return `${Number(mm).toLocaleString(theme.locale)} ${theme.units.mm}`;
  };
  const applyUnits = (unit) => {
    $$('[data-mm]').forEach((el) => {
      const parts = String(el.dataset.mm).split('x').map(Number).filter((n) => !Number.isNaN(n));
      const kind = el.dataset.kind || 'dim';
      const fmt = unit === 'imperial' ? (v) => toImperial(v, kind) : (v) => toMetric(v, kind);
      el.textContent = parts.map(fmt).join(' × ');
    });
    $$('[data-unit-toggle] button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.unit === unit)));
    document.documentElement.dataset.units = unit;
  };
  const savedUnit = store.get('units', theme.locale === 'en' ? 'imperial' : 'metric');
  applyUnits(savedUnit);
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-unit-toggle] button');
    if (!btn) return;
    store.set('units', btn.dataset.unit);
    applyUnits(btn.dataset.unit);
  });
  window.themeUnits = { apply: () => applyUnits(store.get('units', 'metric')), toImperial, toMetric };

  /* Tabs (accessible) */
  $$('[data-tabs]').forEach((tabs) => {
    const buttons = $$('[role="tab"]', tabs);
    const select = (btn, focus) => {
      buttons.forEach((b) => {
        const on = b === btn;
        b.setAttribute('aria-selected', String(on));
        b.tabIndex = on ? 0 : -1;
        const panel = document.getElementById(b.getAttribute('aria-controls'));
        if (panel) panel.hidden = !on;
      });
      if (focus) btn.focus();
      btn.dispatchEvent(new CustomEvent('tab:shown', { bubbles: true }));
    };
    buttons.forEach((b, i) => {
      b.addEventListener('click', () => select(b));
      b.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight') select(buttons[(i + 1) % buttons.length], true);
        if (e.key === 'ArrowLeft') select(buttons[(i - 1 + buttons.length) % buttons.length], true);
      });
    });
    const hash = location.hash && buttons.find((b) => '#' + b.dataset.hash === location.hash);
    if (hash) setTimeout(() => select(hash), 0); // after all listeners (e.g. 3D loader) are registered
  });

  /* Product gallery thumbs + zoom */
  $$('[data-gallery]').forEach((gallery) => {
    const main = $('[data-gallery-main] img', gallery);
    gallery.addEventListener('click', (e) => {
      const thumb = e.target.closest('[data-gallery-thumb]');
      if (thumb && main) {
        main.src = thumb.dataset.src;
        main.srcset = thumb.dataset.srcset || '';
        main.alt = thumb.dataset.alt || '';
        $$('[data-gallery-thumb]', gallery).forEach((t) => t.setAttribute('aria-current', String(t === thumb)));
      }
      if (e.target.closest('[data-gallery-main] img')) window.open(main.dataset.zoom || main.src, '_blank', 'noopener');
    });
  });
  const showColourMedia = (colour) => {
    const gallery = $('[data-gallery]');
    if (!gallery) return;
    const key = String(colour).toLowerCase();
    const thumbs = $$('[data-gallery-thumb]', gallery);
    const match = thumbs.find((t) => (t.dataset.alt || '').toLowerCase().includes(key));
    if (match) match.click();
  };

  /* Colour selector: swaps media, variant and model downloads; URL keeps ?colour= (FR-CAT-03) */
  $$('[data-colour-select]').forEach((group) => {
    const form = group.closest('form') || document;
    const variants = JSON.parse(($('[data-variants-json]') || {}).textContent || '[]');
    const update = (colour, push) => {
      showColourMedia(colour);
      $$('[data-colour-name]').forEach((el) => { el.textContent = colour; });
      $$('[data-model-colour]').forEach((el) => { el.hidden = el.dataset.modelColour.toLowerCase() !== colour.toLowerCase() && el.dataset.modelColour !== '*'; });
      const lengthInput = $('[name="length"]:checked', form) || $('[name="length"]', form);
      const len = lengthInput ? lengthInput.value : null;
      const variant = variants.find((v) => v.options.includes(colour) && (!len || v.options.includes(len))) || variants.find((v) => v.options.includes(colour));
      if (variant) {
        const idInput = $('[name="id"]', form);
        if (idInput) idInput.value = variant.id;
        $$('[data-variant-sku]').forEach((el) => { el.textContent = variant.sku || ''; });
      }
      if (push) {
        const url = new URL(location.href);
        url.searchParams.set('colour', colour);
        if (variant) url.searchParams.set('variant', variant.id);
        history.replaceState({}, '', url);
      }
    };
    group.addEventListener('change', (e) => { if (e.target.name === 'colour') update(e.target.value, true); });
    $$('[name="length"]', form).forEach((l) => l.addEventListener('change', () => { const c = $('[name="colour"]:checked', group); if (c) update(c.value, true); }));
    const initial = new URL(location.href).searchParams.get('colour');
    const input = initial && $$('[name="colour"]', group).find((i) => i.value.toLowerCase() === initial.toLowerCase());
    if (input) { input.checked = true; update(input.value, false); } else { const c = $('[name="colour"]:checked', group); if (c) update(c.value, false); }
  });

  /* 3D preview loads only when its panel is opened (FR-DL-01, SRS-P-05) */
  const loadModelViewer = (container) => {
    if (!container || container.dataset.loaded) return;
    const tpl = $('template', container);
    if (!tpl) return;
    container.dataset.loaded = 'true';
    container.appendChild(tpl.content.cloneNode(true));
    const fallback = $('[data-cad-fallback]', container);
    if (!('WebGLRenderingContext' in window)) return; // static image stays (SRS-UI-04)
    if (!(window.Shopify && Shopify.loadFeatures)) {
      // Outside Shopify (static build): load Google's <model-viewer> web component once.
      if (!document.querySelector('script[data-model-viewer]')) {
        const s = document.createElement('script');
        s.type = 'module';
        s.src = 'https://cdn.jsdelivr.net/npm/@google/model-viewer@3.5.0/dist/model-viewer.min.js';
        s.dataset.modelViewer = '';
        document.head.appendChild(s);
      }
      if (fallback) fallback.hidden = true;
      return;
    }
    if (window.Shopify && Shopify.loadFeatures) {
      Shopify.loadFeatures([{ name: 'model-viewer-ui', version: '1.0', onLoad: (err) => {
        if (err) return;
        if (fallback) fallback.hidden = true;
        $$('model-viewer', container).forEach((mv) => { if (window.Shopify.ModelViewerUI) new Shopify.ModelViewerUI(mv); });
      } }]);
    }
  };
  document.addEventListener('tab:shown', (e) => {
    const panel = document.getElementById(e.target.getAttribute('aria-controls'));
    if (panel) $$('[data-cad-viewer]', panel).forEach(loadModelViewer);
  });
  $$('[data-cad-open]').forEach((btn) => btn.addEventListener('click', () => loadModelViewer(document.getElementById(btn.dataset.cadOpen))));

  /* Downloads: licence + optional prompt on first download in a session (FR-DL-03), log event (FR-DL-08) */
  const visitorId = (() => {
    let id = store.get('vid', null, 'localStorage');
    if (!id) { id = Math.random().toString(36).slice(2) + Date.now().toString(36); store.set('vid', id, 'localStorage'); }
    return id;
  })();
  const logDownload = (link) => {
    const detail = { file: link.dataset.file || link.getAttribute('href'), version: link.dataset.version || '', sku: link.dataset.sku || '', visitor: visitorId, time: new Date().toISOString() };
    try {
      if (window.Shopify && Shopify.analytics && Shopify.analytics.publish) Shopify.analytics.publish('file_download', detail);
    } catch (e) { /* analytics unavailable */ }
    document.dispatchEvent(new CustomEvent('theme:download', { detail }));
  };
  const prompt = $('[data-download-prompt]');
  let pendingLink = null;
  document.addEventListener('click', (e) => {
    const link = e.target.closest('[data-download]');
    if (!link) return;
    if (prompt && !store.get('dl_prompted') && typeof prompt.showModal === 'function') {
      e.preventDefault();
      pendingLink = link;
      store.set('dl_prompted', true);
      const fileField = $('[name="contact[File]"]', prompt);
      if (fileField) fileField.value = link.dataset.file || link.href;
      prompt.showModal();
      return;
    }
    logDownload(link);
  });
  if (prompt) {
    const proceed = () => {
      prompt.close();
      if (!pendingLink) return;
      logDownload(pendingLink);
      const a = document.createElement('a');
      a.href = pendingLink.href; a.download = pendingLink.getAttribute('download') || ''; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
      pendingLink = null;
    };
    $$('[data-download-skip]', prompt).forEach((b) => b.addEventListener('click', proceed));
    const form = $('form', prompt);
    if (form) form.addEventListener('submit', (e) => {
      e.preventDefault();
      fetch(form.action, { method: 'POST', body: new FormData(form), headers: { Accept: 'text/html' } }).catch(() => {}).finally(proceed);
    });
  }

  /* Branching forms: [data-branch-source] radios show matching [data-branch] groups (FR-LEAD-01) */
  $$('[data-branching-form]').forEach((form) => {
    const sync = () => {
      const checked = $('[data-branch-source]:checked', form);
      const value = checked ? checked.value : '';
      $$('[data-branch]', form).forEach((group) => {
        const on = group.dataset.branch.split(' ').includes(value);
        group.classList.toggle('is-active', on);
        $$('input, select, textarea', group).forEach((f) => { f.disabled = !on; });
      });
    };
    form.addEventListener('change', (e) => { if (e.target.matches('[data-branch-source]')) sync(); });
    const preset = new URL(location.href).searchParams.get('type');
    if (preset) { const r = $(`[data-branch-source][value="${CSS.escape(preset)}"]`, form); if (r) r.checked = true; }
    sync();
    const estimate = store.get('estimate');
    const estField = $('[name="contact[Estimate]"]', form);
    if (estimate && estField && new URL(location.href).searchParams.get('from') === 'estimator') estField.value = estimate.summary;
  });

  /* Hidden inputs pre-filled from the URL, e.g. ?product=handle */
  $$('[data-param]').forEach((input) => { const v = new URL(location.href).searchParams.get(input.dataset.param); if (v) input.value = v; });

  /* Sample order: cap the number of checked samples (FR-COM-01) */
  $$('[data-sample-form]').forEach((form) => {
    const max = Number(form.dataset.max || 5);
    const counter = $('[data-sample-count]', form);
    const sync = () => {
      const boxes = $$('input[type="checkbox"][data-sample]', form);
      const n = boxes.filter((b) => b.checked).length;
      boxes.forEach((b) => { b.disabled = !b.checked && n >= max; });
      if (counter) counter.textContent = `${n} / ${max}`;
    };
    form.addEventListener('change', sync);
    const preset = new URL(location.href).searchParams.get('colour');
    if (preset) { const b = $$('input[data-sample]', form).find((i) => i.value.toLowerCase().includes(preset.toLowerCase())); if (b) b.checked = true; }
    sync();
  });

  /* Generic client-side filter lists: [data-filter-list] with [data-filter] controls (FR-DL-05) */
  $$('[data-filter-list]').forEach((root) => {
    const items = $$('[data-item]', root);
    const controls = $$('[data-filter]', root);
    const count = $('[data-result-count]', root);
    const empty = $('[data-empty]', root);
    const groups = $$('[data-group]', root);
    const families = $$('[data-family-group]', root);
    // Search also matches the product and family name, since rows inside a product group show only the colour or language
    const hay = new Map(items.map((item) => {
      const group = item.closest('[data-group]');
      const fam = item.closest('[data-family-group]');
      const extra = `${group ? ($('summary', group) || group).textContent : ''} ${fam ? fam.dataset.familyName || '' : ''}`;
      return [item, `${item.textContent} ${extra}`.toLowerCase()];
    }));
    let wasActive = false;
    const run = () => {
      let shown = 0;
      const active = controls.some((c) => c.value.trim());
      items.forEach((item) => {
        const ok = controls.every((c) => {
          const v = c.value.trim().toLowerCase();
          if (!v) return true;
          if (c.dataset.filter === 'q') return hay.get(item).includes(v);
          return (item.dataset[c.dataset.filter] || '').toLowerCase().split('|').includes(v);
        });
        item.hidden = !ok;
        if (ok) shown += 1;
      });
      // Hide product groups and families with nothing left; open matching groups while filtering, close them again when cleared
      groups.forEach((g) => {
        const visible = $$('[data-item]', g).some((i) => !i.hidden);
        g.hidden = !visible;
        if (active) g.open = visible;
        else if (wasActive) g.open = false;
      });
      families.forEach((f) => { f.hidden = !$$('[data-item]', f).some((i) => !i.hidden); });
      wasActive = active;
      if (count) count.textContent = count.dataset.template.replace('[count]', shown);
      if (empty) empty.hidden = shown !== 0;
    };
    controls.forEach((c) => c.addEventListener('input', run));
    run();
  });

  /* Compare up to 4 products (FR-CAT-06) */
  const compareBar = $('[data-compare-bar]');
  if (compareBar) {
    const max = 4;
    const read = () => store.get('compare', [], 'localStorage');
    const render = () => {
      const list = read();
      $$('[data-compare-toggle]').forEach((b) => { b.setAttribute('aria-pressed', String(list.includes(b.dataset.handle))); });
      compareBar.hidden = list.length === 0;
      $('[data-compare-count]', compareBar).textContent = list.length;
      const link = $('a', compareBar);
      link.href = `${link.dataset.base}?items=${encodeURIComponent(list.join(','))}`;
    };
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-compare-toggle]');
      if (b) {
        let list = read();
        list = list.includes(b.dataset.handle) ? list.filter((h) => h !== b.dataset.handle) : list.concat(b.dataset.handle).slice(-max);
        store.set('compare', list, 'localStorage');
        render();
      }
      if (e.target.closest('[data-compare-clear]')) { store.set('compare', [], 'localStorage'); render(); }
    });
    render();
  }
  /* Compare page: fetch each product's spec JSON (product.spec template) and build the table */
  const compareRoot = $('[data-compare-page]');
  if (compareRoot) {
    const handles = (new URL(location.href).searchParams.get('items') || store.get('compare', [], 'localStorage').join(',')).split(',').filter(Boolean).slice(0, 4);
    const table = $('[data-compare-table]', compareRoot);
    const empty = $('[data-empty]', compareRoot);
    const toggle = $('[data-compare-diff]', compareRoot);
    if (!handles.length) { empty.hidden = false; } else {
      const specUrl = (h) => (theme.routes.spec ? theme.routes.spec.replace('[handle]', encodeURIComponent(h)) : `${theme.routes.root.replace(/\/$/, '')}/products/${encodeURIComponent(h)}?view=spec`);
      Promise.all(handles.map((h) => fetch(specUrl(h)).then((r) => r.ok ? r.json() : null).catch(() => null)))
        .then((products) => {
          products = products.filter(Boolean);
          if (!products.length) { empty.hidden = false; return; }
          const labels = [];
          products.forEach((p) => p.specs.forEach((s) => { if (!labels.includes(s.label)) labels.push(s.label); }));
          const head = `<tr><th scope="col"></th>${products.map((p) => `<th scope="col"><a href="${esc(p.url)}">${esc(p.title)}</a></th>`).join('')}</tr>`;
          const rows = labels.map((label) => {
            const vals = products.map((p) => { const s = p.specs.find((x) => x.label === label); return s ? s : { value: '—' }; });
            const same = vals.every((v) => String(v.mm || v.value) === String(vals[0].mm || vals[0].value));
            return `<tr class="${same ? 'same' : ''}"><th scope="row">${esc(label)}</th>${vals.map((v) => v.mm ? `<td><span data-mm="${esc(v.mm)}" data-kind="${esc(v.kind || 'dim')}">${esc(v.value)}</span></td>` : `<td>${esc(v.value)}</td>`).join('')}</tr>`;
          }).join('');
          table.innerHTML = `<thead>${head}</thead><tbody>${rows}</tbody>`;
          table.classList.toggle('show-all', !(toggle && toggle.checked));
          window.themeUnits.apply();
        });
    }
    if (toggle) toggle.addEventListener('change', () => table.classList.toggle('show-all', !toggle.checked));
  }

  /* Copy-to-clipboard buttons */
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-copy]');
    if (!b) return;
    navigator.clipboard && navigator.clipboard.writeText(b.dataset.copy).then(() => { const t = b.textContent; b.textContent = theme.strings.copied; setTimeout(() => { b.textContent = t; }, 1500); });
  });
})();
