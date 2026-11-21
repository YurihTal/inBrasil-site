/* Installer and dealer directory (FR-INS-01). Works without a map provider:
   - postal code: matches the 3-character FSA against each listing's service areas, then
     sorts by distance when the listing has coordinates and the FSA has a known centroid;
   - "use my location": sorts by straight-line distance and applies the radius.
   A map view can be added once the geocoding provider is chosen (SRS-IF-06, open issue). */
(() => {
  const root = document.querySelector('[data-directory]');
  if (!root) return;
  const $ = (s) => root.querySelector(s);
  const items = Array.from(root.querySelectorAll('[data-listing]'));
  const t = JSON.parse($('[data-directory-strings]').textContent);
  const fsaCentroids = JSON.parse(($('[data-fsa-centroids]') || { textContent: '{}' }).textContent || '{}');
  let origin = null;

  const km = (a, b) => {
    const R = 6371, rad = (d) => (d * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };

  const run = () => {
    const q = $('[name="where"]').value.trim().toUpperCase().replace(/\s+/g, '');
    const kind = $('[name="kind"]').value;
    const service = $('[name="service"]').value;
    const radius = Number($('[name="radius"]').value) || 0;
    const fsa = /^[A-Z]\d[A-Z]/.test(q) ? q.slice(0, 3) : null;
    let from = origin;
    if (!from && fsa && fsaCentroids[fsa]) from = fsaCentroids[fsa];

    const rows = items.map((el) => {
      const d = el.dataset;
      let ok = true;
      if (kind && !d.kind.split('|').includes(kind)) ok = false;
      if (service && !d.services.split('|').includes(service)) ok = false;
      let dist = null;
      if (from && d.lat && d.lng) dist = km(from, { lat: Number(d.lat), lng: Number(d.lng) });
      if (q && !from) {
        const areas = d.areas.toUpperCase();
        ok = ok && (fsa ? areas.split('|').some((a) => a.replace(/\s/g, '').startsWith(fsa) || fsa.startsWith(a.replace(/\s/g, ''))) : (areas + ' ' + d.city.toUpperCase()).includes(q));
      }
      if (from && radius && dist !== null && dist > radius) ok = false;
      return { el, ok, dist, score: Number(d.score) || 0 };
    });
    rows.sort((a, b) => (a.dist ?? 1e9) - (b.dist ?? 1e9) || b.score - a.score);
    const list = $('[data-listings]');
    let shown = 0;
    rows.forEach((r) => {
      r.el.hidden = !r.ok;
      const distEl = r.el.querySelector('[data-distance]');
      if (distEl) distEl.textContent = r.dist !== null ? t.distance.replace('[km]', Math.round(r.dist)) : '';
      list.appendChild(r.el);
      if (r.ok) shown += 1;
    });
    $('[data-result-count]').textContent = t.count.replace('[count]', shown);
    $('[data-empty]').hidden = shown !== 0;
  };

  root.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); origin = null; run(); });
  root.addEventListener('change', run);
  const geo = $('[data-geolocate]');
  if (geo && 'geolocation' in navigator) {
    geo.hidden = false;
    geo.addEventListener('click', () => {
      geo.disabled = true;
      navigator.geolocation.getCurrentPosition(
        (pos) => { origin = { lat: pos.coords.latitude, lng: pos.coords.longitude }; geo.disabled = false; run(); },
        () => { geo.disabled = false; $('[data-geo-error]').hidden = false; },
        { maximumAge: 600000, timeout: 10000 }
      );
    });
  }
  run();
})();
