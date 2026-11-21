/* Static-site layer (not used on Shopify). Handles what Shopify would do server-side:
   - forms: POST to SITE.formEndpoint (e.g. a Formspree/Basin/HubSpot endpoint) as JSON-accepting form data;
     if no endpoint is configured yet, explains that and offers an email fallback.
   - search: client-side over search-index.json (products, pages, downloads). */
(() => {
  const SITE = window.SITE || {};
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const t = SITE.strings || {};

  /* Forms */
  document.querySelectorAll('form[data-static-form]').forEach((form) => {
    if (form.closest('[data-download-prompt]')) return; // theme.js handles the download prompt (always downloads)
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const old = form.querySelector('[data-static-status]');
      if (old) old.remove();
      const box = document.createElement('div');
      box.setAttribute('data-static-status', '');
      box.setAttribute('role', 'status');
      box.tabIndex = -1;
      const data = new FormData(form);
      data.append('page', location.pathname.split('/').pop() || 'index.html');
      if (!SITE.formEndpoint) {
        const lines = [];
        data.forEach((v, k) => { if (v && !String(k).startsWith('form_type') && k !== 'utf8') lines.push(`${k.replace(/^contact\[|\]$/g, '')}: ${v}`); });
        box.className = 'notice notice--warn';
        box.innerHTML = `<strong>${esc(t.notConnected)}</strong>` +
          (SITE.email ? ` <a href="mailto:${esc(SITE.email)}?subject=${encodeURIComponent(t.mailSubject || 'Website request')}&body=${encodeURIComponent(lines.join('\n'))}">${esc(t.sendByEmail)}</a>` : '');
        form.prepend(box); box.focus();
        return;
      }
      const btn = form.querySelector('[type="submit"]');
      if (btn) btn.disabled = true;
      try {
        const res = await fetch(SITE.formEndpoint, { method: 'POST', body: data, headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(res.status);
        box.className = 'notice notice--ok';
        box.innerHTML = `<strong>${esc(t.sentTitle)}</strong><br>${esc(t.sentText)}`;
        form.reset();
      } catch (err) {
        box.className = 'notice notice--err';
        box.innerHTML = `<strong>${esc(t.failed)}</strong>${SITE.email ? ` <a href="mailto:${esc(SITE.email)}">${esc(SITE.email)}</a>` : ''}`;
      } finally {
        if (btn) btn.disabled = false;
        form.prepend(box); box.focus();
      }
    });
  });

  /* Search */
  const results = document.querySelector('[data-static-search]');
  if (results) {
    const q = (new URL(location.href).searchParams.get('q') || '').trim();
    const input = document.querySelector('#SearchQ');
    if (input) input.value = q;
    if (!q) return;
    fetch(SITE.searchIndex).then((r) => r.json()).then((items) => {
      const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
      const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      const scored = items.map((it) => {
        const hay = norm(`${it.title} ${it.text}`);
        let score = 0;
        for (const term of terms.map(norm)) {
          if (norm(it.title).includes(term)) score += 3;
          else if (hay.includes(term)) score += 1;
          else if (term.length > 3 && hay.includes(term.slice(0, -1))) score += 0.5; // simple typo/plural tolerance
          else return { it, score: 0 };
        }
        return { it, score };
      }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
      results.innerHTML = `<p class="result-count">${esc((t.results || '[count] results').replace('[count]', scored.length))}</p>` +
        (scored.length ? `<div class="grid grid--3">${scored.slice(0, 60).map(({ it }) => `
          <a class="card card--link" href="${esc(it.url)}"${it.download ? ' download data-download data-file="' + esc(it.url.split('/').pop()) + '"' : ''}>
            <span class="tag">${esc(it.kind)}</span><h3 style="margin-top:8px">${esc(it.title)}</h3><p>${esc(it.text.slice(0, 140))}</p></a>`).join('')}</div>`
          : `<div class="notice notice--info">${esc(t.none)}</div>`);
    });
  }
})();
