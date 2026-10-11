// aidos — "Sternenfall": every listed profile as a dot at its displayed Google rating; one click
// (or scrolling into view) moves each dot to the cautious estimate WITH the removed reviews.
// Mounts on every <div class="sfall" data-branch="" data-label="" data-lang="de|en">.
// Data: window.AIDOS_STARS = [[shown, est, open, name, city, branch], ...] (written by pages.mjs).
(function () {
  const S_ALL = window.AIDOS_STARS || [];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MIN_N = 10; // below this a "distribution" is a handful of named businesses, not a pattern
  const T = {
    de: {
      loc: 'de-DE', anon: 'Betrieb ohne Namensnennung', play: 'Zurückrechnen', back: 'Wie Google sie zeigt', share: 'Teilen', copied: 'Link kopiert',
      lbl0: (N, w) => `von ${N} Profilen${w} zeigen bei Google 4,5 Sterne oder mehr.`,
      lbl1: (N, w) => `von ${N} Profilen${w} kämen mit den entfernten Bewertungen noch auf 4,5 Sterne oder mehr – vorsichtig gerechnet.`,
      cap0: 'Jeder Punkt ist ein Profil mit Lösch-Hinweis, so wie Google seine Note anzeigt.',
      cap1: (out, small, N, big) => `<b>${out}</b> rutschen unter die 4,5★-Marke. ${small} von ${N} verlieren weniger als drei Zehntel` + (big ? `, ${big} fast einen ganzen Stern oder mehr.` : '.'),
      thr: '4,5★ und besser →', shown: 'wie Google die Note zeigt', est: 'mit den entfernten Bewertungen (höchstens)', open: 'nach unten offen („über 250")',
      tip: (s) => `angezeigt ${f1(s[0], 'de')}★ → höchstens ${f1(s[1], 'de')}★${s[2] ? ' (nach unten offen)' : ''}`,
      fine: 'Vorsichtigste Schätzung: die kleinste von Google genannte Zahl entfernter Bewertungen, jede mit milden 2★ zurück in den Schnitt gerechnet. Waren Entfernungen berechtigt, etwa bei Fake-Kampagnen, ist die angezeigte Note die zutreffendere. Nur namentlich gelistete Unternehmen und Ketten.',
      aria: 'Verteilung der Noten: angezeigt und mit den entfernten Bewertungen',
    },
    en: {
      loc: 'en-GB', anon: 'Unnamed business', play: 'Add them back in', back: 'As Google shows them', share: 'Share', copied: 'Link copied',
      lbl0: (N, w) => `of ${N} profiles${w} show 4.5 stars or more on Google.`,
      lbl1: (N, w) => `of ${N} profiles${w} would still reach 4.5 stars or more with the removed reviews – on a cautious estimate.`,
      cap0: 'Each dot is a profile with a removal notice, at the rating Google displays.',
      cap1: (out, small, N, big) => `<b>${out}</b> drop below the 4.5★ mark. ${small} of ${N} lose less than three tenths` + (big ? `, ${big} close to a full star or more.` : '.'),
      thr: '4.5★ and better →', shown: 'as Google displays the rating', est: 'with the removed reviews (at most)', open: 'open-ended ("over 250")',
      tip: (s) => `displayed ${f1(s[0], 'en')}★ → at most ${f1(s[1], 'en')}★${s[2] ? ' (open-ended)' : ''}`,
      fine: 'Most cautious estimate: the lowest number of removed reviews Google states, each put back into the average at a mild 2★. If removals were justified, e.g. fake campaigns, the displayed rating is the more accurate one. Named companies and chains only.',
      aria: 'Distribution of ratings: displayed and with the removed reviews',
    },
  };
  const f1 = (n, l) => n.toLocaleString(T[l].loc, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function mount(root) {
    const lang = root.dataset.lang === 'en' ? 'en' : 'de', L = T[lang];
    const S = S_ALL.filter((s) => !root.dataset.branch || s[5] === root.dataset.branch);
    if (S.length < MIN_N) { root.hidden = true; return; }
    const scope = root.dataset.label ? ` (${root.dataset.label})` : '';

    // geometry: 0.1★ columns on a 2.8–5.0 axis, dots stacked upward; dot size follows the selection
    // The drawing is scaled to the container: on a phone a 1000-unit canvas would shrink labels to ~5px,
    // so narrow screens get a narrower canvas (bigger dots, legible ticks) at the same height.
    const W = Math.round(Math.max(540, Math.min(1000, (root.clientWidth || 1000) * 1.25))), H = 470, X0 = 20, X1 = W - 20, BASE = 420, LO = 2.8, HI = 5.0, MAXH = 320;
    const nb = Math.round((HI - LO) * 10) + 1, colW = (X1 - X0) / nb;
    // floor, not round: a 4,47 estimate belongs left of the 4,5★ line, exactly as the counter counts it
    const bin = (v) => Math.max(0, Math.min(nb - 1, Math.floor((Math.max(LO, v) - LO) * 10 + 1e-6)));
    const cnt = (f) => { const c = new Array(nb).fill(0); S.forEach((s) => c[bin(s[f])]++); return Math.max(1, ...c); };
    const maxC = Math.max(cnt(0), cnt(1));
    let PITCH = 0, PER = 1;
    for (let p = 1; p <= 8; p++) { const pitch = Math.min((colW - 4) / p, MAXH / Math.ceil(maxC / p), 18); if (pitch > PITCH) { PITCH = pitch; PER = p; } }
    const R = PITCH * 0.42;
    const slot = (b, k) => [X0 + b * colW + (colW - PER * PITCH) / 2 + (k % PER) * PITCH + PITCH / 2, BASE - 6 - Math.floor(k / PER) * PITCH];
    const layout = (f) => { const fill = new Array(nb).fill(0), pos = []; S.map((s, i) => i).sort((a, b) => S[b][f] - S[a][f]).forEach((i) => { const b = bin(S[i][f]); pos[i] = slot(b, fill[b]++); }); return pos; };
    const A = layout(0), B = layout(1);
    const thrX = X0 + bin(4.5) * colW, tickX = (t) => X0 + bin(t) * colW + colW / 2;

    const top0 = S.filter((s) => s[0] >= 4.5).length, top1 = S.filter((s) => s[1] >= 4.5).length;
    const drops = S.map((s) => s[0] - s[1]), small = drops.filter((d) => d < 0.3).length, big = drops.filter((d) => d >= 0.9).length;

    root.innerHTML =
      `<div class="sfall-num"><span class="n">${top0}</span><span class="of">/ ${S.length}</span></div>` +
      `<p class="sfall-lbl">${L.lbl0(S.length, scope)}</p><p class="sfall-cap">${L.cap0}</p>` +
      `<div class="sfall-chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(L.aria)}">` +
      `<line class="ax" x1="${X0}" x2="${X1}" y1="${BASE}" y2="${BASE}"/>` +
      [3, 3.5, 4, 4.5, 5].map((t) => `<line class="ax" x1="${tickX(t)}" x2="${tickX(t)}" y1="${BASE}" y2="${BASE + 6}"/><text class="tk" x="${tickX(t)}" y="${BASE + 24}" text-anchor="middle">${f1(t, lang)}★</text>`).join('') +
      `<line class="thr" x1="${thrX}" x2="${thrX}" y1="40" y2="${BASE}"/><text class="thrl" x="${thrX + 8}" y="54">${L.thr}</text>` +
      `<g class="g-ghost"></g><g class="g-dots"></g></svg><div class="sfall-tip"></div></div>` +
      `<div class="sfall-foot"><div class="sfall-legend"><span><i style="background:var(--data-blue)"></i>${L.shown}</span><span><i style="background:var(--accent)"></i>${L.est}</span><span><i style="background:#fff;border:2px solid var(--accent)"></i>${L.open}</span></div>` +
      `<div class="sfall-actions"><button type="button" class="sfall-btn primary" data-a="toggle">▶ ${L.play}</button><button type="button" class="sfall-btn" data-a="share">${L.share}</button></div></div>` +
      `<p class="sfall-fine">${L.fine}</p>`;

    const NS = 'http://www.w3.org/2000/svg', chart = root.querySelector('.sfall-chart');
    const mk = (g, cls, p) => { const c = document.createElementNS(NS, 'circle'); c.setAttribute('r', R); if (cls) c.setAttribute('class', cls); c.setAttribute('cx', p[0]); c.setAttribute('cy', p[1]); g.appendChild(c); return c; };
    // the tower as Google shows it stays behind as a pale silhouette, so before and after can be compared
    S.forEach((s, i) => mk(chart.querySelector('.g-ghost'), 'ghost', A[i]));
    const dots = S.map((s, i) => mk(chart.querySelector('.g-dots'), '', A[i]));
    const moves = S.map((s) => s[0] - s[1] >= 0.05);
    const mix = (t) => { const a = [36, 86, 166], b = [179, 30, 38]; return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * t)).join(',')})`; };
    const nEl = root.querySelector('.n'), lbl = root.querySelector('.sfall-lbl'), cap = root.querySelector('.sfall-cap');
    const btn = (a) => root.querySelector(`[data-a="${a}"]`);
    const cur = S.map((s, i) => ({ x: A[i][0], y: A[i][1], t: 0 }));
    function draw(i) {
      const c = cur[i], d = dots[i], open = S[i][2] && c.t > .5;
      d.setAttribute('cx', c.x); d.setAttribute('cy', c.y);
      d.setAttribute('fill', open ? '#fff' : moves[i] ? mix(c.t) : 'var(--data-blue)');
      d.setAttribute('stroke', open ? 'var(--accent)' : 'none'); d.setAttribute('stroke-width', open ? 1.6 : 0);
    }
    S.forEach((s, i) => draw(i));

    let fallen = false, raf;
    function fall(to) {
      cancelAnimationFrame(raf); fallen = to;
      // one button, fixed width: it only changes its label, so the row never reflows
      btn('toggle').disabled = true;
      const from = cur.map((c) => ({ ...c })), t0 = performance.now(), D = reduce ? 0 : 1400;
      const ease = (x) => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
      // bigger drops start later, so the tower visibly crumbles from the top instead of shifting as a block
      const delay = (i) => to ? Math.min(900, drops[i] * 1400) + ((i * 7919) % 250) : 0;
      const frame = (now) => {
        let done = true, top = 0;
        S.forEach((s, i) => {
          const p = D ? Math.min(1, Math.max(0, (now - t0 - delay(i)) / D)) : 1, q = ease(p);
          if (p < 1) done = false;
          const tgt = to ? B[i] : A[i], a = from[i];
          cur[i] = { x: a.x + (tgt[0] - a.x) * q, y: a.y + (tgt[1] - a.y) * q - Math.sin(Math.PI * q) * (moves[i] ? 26 : 0), t: a.t + ((to ? 1 : 0) - a.t) * q };
          draw(i);
          if ((cur[i].t < .5 ? s[0] : s[1]) >= 4.5) top++;
        });
        nEl.textContent = top;
        if (!done) { raf = requestAnimationFrame(frame); return; }
        nEl.classList.toggle('after', to); chart.classList.toggle('fallen', to);
        lbl.textContent = to ? L.lbl1(S.length, scope) : L.lbl0(S.length, scope);
        cap.innerHTML = to ? L.cap1(top0 - top1, small, S.length, big) : L.cap0;
        btn('toggle').disabled = false;
        btn('toggle').textContent = to ? `↺ ${L.back}` : `▶ ${L.play}`;
        btn('toggle').classList.toggle('primary', !to);
      };
      raf = requestAnimationFrame(frame);
    }
    btn('toggle').onclick = () => fall(!fallen);

    // share: native share sheet where there is one, otherwise copy the link (no third-party widgets)
    btn('share').onclick = async () => {
      const url = location.origin + location.pathname + (root.id ? '#' + root.id : '');
      try {
        if (navigator.share) await navigator.share({ title: document.title, url });
        else { await navigator.clipboard.writeText(url); const b = btn('share'), t = b.textContent; b.textContent = L.copied; setTimeout(() => (b.textContent = t), 1600); }
      } catch (e) { /* user cancelled */ }
    };

    // play once when the chart scrolls into view
    new IntersectionObserver((e, o) => { if (e[0].isIntersecting) { o.disconnect(); setTimeout(() => !fallen && fall(true), 900); } }, { threshold: .5 }).observe(chart);

    // hover: nearest dot within 14px, so tiny marks are still easy to hit
    const tip = root.querySelector('.sfall-tip'), svg = chart.querySelector('svg');
    svg.addEventListener('pointermove', (e) => {
      const r = svg.getBoundingClientRect(), k = W / r.width, mx = (e.clientX - r.left) * k, my = (e.clientY - r.top) * k;
      let best = -1, bd = 14 * 14;
      cur.forEach((c, i) => { const dx = c.x - mx, dy = c.y - my, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i; } });
      if (best < 0) { tip.style.opacity = 0; return; }
      const s = S[best], c = cur[best];
      tip.innerHTML = (s[3] ? `<b>${esc(s[3])}</b> · ${esc(s[4])}` : `<b>${L.anon}</b> · ${esc(s[4])}`) + `<br>${L.tip(s)}`;
      tip.style.left = (c.x / k) + 'px'; tip.style.top = (c.y / k) + 'px'; tip.style.opacity = 1;
    });
    svg.addEventListener('pointerleave', () => (tip.style.opacity = 0));
  }
  document.querySelectorAll('.sfall').forEach(mount);
})();
