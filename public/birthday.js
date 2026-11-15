/* =====================================================================================================
   TEMA ULANG TAHUN (statis, tanpa AI, tanpa loading)
   Atur semuanya di blok BDAY di bawah ini. Selama beberapa hari sejak hari ulang tahun, aplikasi menampilkan
   banner ucapan + emoji berjatuhan. Warna aplikasi lainnya tidak berubah; hanya banner yang berwarna.
   ===================================================================================================== */
const BDAY = {
  enabled: true,      // false = fitur dimatikan
  name: '',           // nama untuk sapaan (boleh kosong), mis. 'Akbar'
  month: 1, day: 29,  // ULANG TAHUN: tanggal 29, bulan 1 (Januari)
  bornYear: 2005,     // tahun lahir, dipakai untuk umur ("ke-N"); isi null kalau tidak mau
  daysBefore: 0,      // berapa hari SEBELUM hari H banner sudah tampil
  daysAfter: 6,       // berapa hari SETELAH hari H; 0 sebelum + 6 sesudah = 7 hari (29 Jan sampai 4 Feb)

  // TEMA BAWAAN (dipakai setiap tahun)
  theme: {
    tema: 'Perayaan',                                                   // nama tema kecil di baris bawah (boleh kosong)
    headline: 'Selamat ulang tahun, {nama}! 🎂',                         // ucapan utama; {nama} diganti BDAY.name (hilang kalau kosong)
    pesan: 'Semoga hari-harimu menyenangkan dan penuh kejutan baik.',   // kalimat hangat (boleh kosong)
    emojis: ['🎂', '🎉', '🎈', '🎁', '✨', '🥳'],                        // emoji pertama = ikon besar, sisanya hiasan + hujan emoji
    hue: 265,                                                           // warna banner, 0-360 (0 merah, 30 jingga, 60 kuning, 130 hijau, 210 biru, 265 ungu, 330 merah muda)
  },

  // TEMA KHUSUS TAHUN TERTENTU (opsional): kalau ada, dipakai menggantikan tema bawaan di tahun itu.
  themes: {
    // 2027: { tema: 'Peduli Hutan', headline: 'Selamat ulang tahun, {nama}! 🌳', pesan: 'Semoga tahun ini sehat dan udara bersih.', emojis: ['🌳', '🌱', '🔥', '💧', '🎂', '🎉'], hue: 130 },
  },
};

/* ---------------------------------------- logika (tidak perlu diubah) ---------------------------------------- */
(() => {
  let started = false, H = null; // H = { T, esc } handed over by app.js (its functions are not global)
  const T = (...a) => H.T(...a), esc = s => H.esc(s);

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
  function themeOf(year) {
    const t = { ...BDAY.theme, ...(BDAY.themes[year] || {}) };
    const name = (BDAY.name || '').trim();
    t.headline = String(t.headline || 'Selamat ulang tahun! 🎂').replace(', {nama}', name ? ', ' + name : '').replace('{nama}', name).replace(/\s+!/, '!');
    t.emojis = Array.isArray(t.emojis) && t.emojis.length ? t.emojis : ['🎂', '🎉'];
    t.hue = Number.isFinite(Number(t.hue)) ? Number(t.hue) : 265;
    return t;
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
    document.documentElement.style.setProperty('--bh', theme.hue);
    let hidden = false; try { hidden = sessionStorage.getItem('bday-x') === String(win.year); } catch (e) { /* ignore */ }
    const bar = document.getElementById('bday');
    if (bar && !hidden) {
      const age = BDAY.bornYear && win.year > BDAY.bornYear ? win.year - BDAY.bornYear : 0;
      const meta = [win.isDay ? T('Hari ini ulang tahunmu') : T('Hari ke-{a} dari {b}', { a: win.dayNo, b: win.total }), age ? T('ke-{n}', { n: age }) : '', theme.tema].filter(Boolean).join(' · ');
      bar.innerHTML = `<span class="bday-emo" aria-hidden="true">${esc(theme.emojis[0])}</span>
        <div class="bday-tx"><b>${esc(theme.headline)}</b>${theme.pesan ? `<span>${esc(theme.pesan)}</span>` : ''}<small>${esc(meta)}</small></div>
        <span class="bday-row" aria-hidden="true">${theme.emojis.slice(1, 6).map(e => `<i>${esc(e)}</i>`).join('')}</span>
        <button type="button" class="icon-btn sm" id="bdayX" aria-label="${T('Tutup')}" title="${T('Tutup')}"><span class="ms">close</span></button>`;
      bar.hidden = false;
      document.getElementById('bdayX').onclick = () => { bar.hidden = true; try { sessionStorage.setItem('bday-x', String(win.year)); } catch (e) { /* ignore */ } };
    }
    if (!hidden) confetti(theme.emojis);
  }

  // called by app.js once the page is ready
  window.bdayStart = function (helpers) {
    if (started || !BDAY.enabled) return;
    const win = windowOf(today());
    if (!win) return;
    started = true; H = helpers;
    show(themeOf(win.year), win);
  };
})();
