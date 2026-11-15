/* =====================================================================================================
   TEMA ULANG TAHUN
   Atur ulang tahun kamu di blok BDAY di bawah ini (cukup edit angkanya).
   Cara kerja: selama 7 hari sejak hari ulang tahun, kalender memakai tema dari AI (warna, emoji, ucapan).
   Temanya dibuat AI SEKALI per tahun lalu disimpan di server, jadi setiap kali dibuka selama 7 hari itu tampilannya sama.
   ===================================================================================================== */
const BDAY = {
  enabled: true,      // false = fitur dimatikan
  name: '',           // nama untuk sapaan (boleh kosong), mis. 'Akbar'
  month: 1, day: 15,  // ULANG TAHUN: tanggal 29, bulan 1 (Januari)
  bornYear: 2005,     // tahun lahir, dipakai untuk umur ("ulang tahun ke-N"); isi null kalau tidak mau
  daysBefore: 0,      // berapa hari SEBELUM hari H tema sudah tampil
  daysAfter: 6,       // berapa hari SETELAH hari H; 0 sebelum + 6 sesudah = 7 hari (29 Jan sampai 4 Feb)
  // Tema khusus per tahun (opsional). Kosong = AI memilih sendiri. Contoh: 2027: 'karhutla'
  // Kalau kamu ubah teks di sini, tema tahun itu otomatis dibuat ulang oleh AI.
  hints: {
    // 2027: 'karhutla',
  },
};

/* ---------------------------------------- logika (tidak perlu diubah) ---------------------------------------- */
(() => {
  let started = false;
  const FALLBACK = { headline: 'Selamat ulang tahun! 🎂', pesan: 'Semoga hari-harimu menyenangkan dan penuh kejutan baik.', emojis: ['🎂', '🎉', '🎈', '🎁', '✨', '🥳'], hue: 330, tema: 'Perayaan', tren: '', fallback: true };

  // for testing: open the app with ?bday=2027-01-29 to pretend today is that date
  function today() {
    const q = new URLSearchParams(location.search).get('bday');
    if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) { const [y, m, d] = q.split('-').map(Number); return new Date(y, m - 1, d); }
    const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }
  function windowOf(t) {
    for (const y of [t.getFullYear(), t.getFullYear() - 1]) {
      const day = new Date(y, BDAY.month - 1, BDAY.day);
      const a = new Date(y, BDAY.month - 1, BDAY.day - BDAY.daysBefore), z = new Date(y, BDAY.month - 1, BDAY.day + BDAY.daysAfter);
      if (t >= a && t <= z) return { year: y, dayNo: Math.round((t - a) / 864e5) + 1, total: Math.round((z - a) / 864e5) + 1, isDay: +t === +day };
    }
    return null;
  }
  async function getTheme(year) {
    const key = 'bday-theme-' + year, hint = BDAY.hints[year] || '', regen = /[?&]bdayregen\b/.test(location.search);
    if (!regen) { try { const c = JSON.parse(localStorage.getItem(key) || 'null'); if (c && c.headline && (c.hint || '') === hint) return c; } catch (e) { /* no cache */ } }
    const age = BDAY.bornYear ? year - BDAY.bornYear : null;
    const d = await api('theme', { method: 'POST', body: { year, hint, name: BDAY.name, age, regen } });
    try { localStorage.setItem(key, JSON.stringify(d.theme)); } catch (e) { /* storage blocked */ }
    return d.theme;
  }
  function confetti(emojis) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const box = document.createElement('div'); box.className = 'bday-fx'; box.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 22; i++) {
      const s = document.createElement('span');
      s.textContent = emojis[i % emojis.length];
      s.style.cssText = `left:${Math.round(Math.random() * 96)}%;font-size:${16 + Math.round(Math.random() * 16)}px;animation-delay:${(Math.random() * 3).toFixed(2)}s;animation-duration:${(5 + Math.random() * 4).toFixed(2)}s`;
      box.append(s);
    }
    document.body.append(box);
    setTimeout(() => box.remove(), 12000);
  }
  function show(theme, win) {
    const root = document.documentElement;
    root.dataset.bday = '1';
    root.style.setProperty('--bh', theme.hue);
    let hidden = false; try { hidden = sessionStorage.getItem('bday-x') === win.year; } catch (e) { /* ignore */ }
    const bar = document.getElementById('bday');
    if (bar && !hidden) {
      const age = BDAY.bornYear && win.year > BDAY.bornYear ? win.year - BDAY.bornYear : 0;
      const meta = [win.isDay ? T('Hari ini ulang tahunmu') : T('Hari ke-{a} dari {b}', { a: win.dayNo, b: win.total }), age ? T('ke-{n}', { n: age }) : '', theme.tema].filter(Boolean).join(' · ');
      bar.innerHTML = `<span class="bday-emo" aria-hidden="true">${esc(theme.emojis[0])}</span>
        <div class="bday-tx"><b>${esc(theme.headline)}</b>${theme.pesan ? `<span>${esc(theme.pesan)}</span>` : ''}<small>${esc(meta)}${theme.tren ? ' · ' + esc(theme.tren) : ''}</small></div>
        <span class="bday-row" aria-hidden="true">${theme.emojis.slice(1, 6).map(e => `<i>${esc(e)}</i>`).join('')}</span>
        <button type="button" class="icon-btn sm" id="bdayX" aria-label="${T('Tutup')}" title="${T('Tutup')}"><span class="ms">close</span></button>`;
      bar.hidden = false;
      document.getElementById('bdayX').onclick = () => { bar.hidden = true; try { sessionStorage.setItem('bday-x', String(win.year)); } catch (e) { /* ignore */ } };
    }
    if (!hidden) confetti(theme.emojis);
  }

  // called by app.js once the schedule is loaded (the theme request needs the login session)
  window.bdayStart = async function () {
    if (started || !BDAY.enabled) return;
    const win = windowOf(today());
    if (!win) return;
    started = true;
    let theme;
    try { theme = await getTheme(win.year); }
    catch (e) { theme = FALLBACK; console.warn('[bday] tema AI gagal, pakai tema bawaan:', e.message); } // not cached: tried again on the next open
    show(theme, win);
  };
})();
