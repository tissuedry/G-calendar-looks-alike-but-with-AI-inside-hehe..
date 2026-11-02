// Tiny i18n layer. The app is written in Indonesian: the Indonesian text IS the key, and EN maps it to English.
//   T('Hari ini')                      -> "Hari ini" (id) / "Today" (en)
//   T('{n} kegiatan', {n: 3})          -> placeholders are filled in; an English value like "{n} event|{n} events"
//                                         picks the singular form when n === 1
// Static text in index.html is translated by walking the DOM (applyDom), so the HTML stays plain Indonesian.
(function () {
'use strict';

const EN = {
  "Menu utama": "Main menu",
  "Sebelumnya": "Previous",
  "Sebelumnya (K)": "Previous (K)",
  "Berikutnya": "Next",
  "Berikutnya (J)": "Next (J)",
  "Cari": "Search",
  "Cari (/)": "Search (/)",
  "Asisten AI": "AI assistant",
  "Asisten": "Assistant",
  "Kelola kategori": "Manage categories",
  "Keluar": "Sign out",
  "Bahasa": "Language",
  "Navigasi samping": "Side navigation",
  "Navigasi utama": "Main navigation",
  "Halaman": "Pages",
  "Buat": "Create",
  "Buat kegiatan": "Create event",
  "Kalender": "Calendar",
  "Jadwal": "Schedule",
  "Kategori saya": "My categories",
  "Hari ini": "Today",
  "Agenda Saya": "My Agenda",
  "Hari": "Day",
  "3 hari": "3 days",
  "Minggu": "Week",
  "Bulan": "Month",
  "Pintasan:": "Shortcuts:",
  "hari": "day",
  "minggu": "week",
  "bulan": "month",
  "jadwal": "schedule",
  "hari ini": "today",
  "buat": "create",
  "Bulan sebelumnya": "Previous month",
  "Bulan berikutnya": "Next month",
  "Cari judul atau catatan…": "Search titles or notes…",
  "Periode": "Period",
  "Mendatang": "Upcoming",
  "Bulan ini": "This month",
  "Sudah lewat": "Past",
  "Semua": "All",
  "Kategori": "Category",
  "Semua status": "All statuses",
  "Semua kategori": "All categories",
  "Tanpa kategori": "No category",
  "Tidak ada kegiatan yang cocok. Beberapa kategori sedang disembunyikan di panel samping.": "No matching events. Some categories are hidden in the side panel.",
  "Tidak ada kegiatan yang cocok dengan filter ini.": "No events match these filters.",
  "Status": "Status",
  "Direncanakan": "Planned",
  "Selesai": "Done",
  "Ditunda": "Postponed",
  "Dibatalkan": "Cancelled",
  "Waktu per kategori": "Time per category",
  "Minggu ini": "This week",
  "Kelola": "Manage",
  "Belum ditandai": "Not marked yet",
  "7 hari terakhir": "Last 7 days",
  "14 hari ke depan": "Next 14 days",
  "Kepadatan mingguan": "Weekly load",
  "Minggu sebelumnya": "Previous week",
  "Minggu berikutnya": "Next week",
  "Minggu depan": "Next week",
  "Minggu lalu": "Last week",
  "kegiatan": "event|events",
  "jam": "hours",
  "j": "h",
  "{n} kegiatan": "{n} event|{n} events",
  "{n} kegiatan · {h} jam": "{n} event · {h} h|{n} events · {h} h",
  "{n} kegiatan · {r}": "{n} event · {r}|{n} events · {r}",
  "{n} tersisa · {h} jam": "{n} left · {h} h",
  "{h} jam terjadwal": "{h} h scheduled",
  "Bulan {m}": "{m}",
  "Terlaksana bulan ini": "Completed this month",
  "{p}% dari yang sudah lewat": "{p}% of those already past",
  "Belum ada yang lewat": "Nothing has passed yet",
  "Berikutnya: {t}": "Next: {t}",
  "Kosong": "Empty",
  "Selamat pagi": "Good morning",
  "Selamat siang": "Good afternoon",
  "Selamat sore": "Good afternoon",
  "Selamat malam": "Good evening",
  "Sekarang berlangsung <b>{t}</b> sampai {e}.": "<b>{t}</b> is on now, until {e}.",
  "Setelah itu ada {n} kegiatan lagi, berikutnya <b>{t}</b> pukul {s}.": "After that there is {n} more event, next up <b>{t}</b> at {s}.|After that there are {n} more events, next up <b>{t}</b> at {s}.",
  "Hari ini ada {n} kegiatan, yang pertama <b>{t}</b> pukul {s}.": "You have {n} event today, starting with <b>{t}</b> at {s}.|You have {n} events today, starting with <b>{t}</b> at {s}.",
  "Semua kegiatan hari ini sudah selesai. Kerja bagus!": "All of today's events are done. Nice work!",
  "Hari ini kosong. Kegiatan berikutnya: <b>{t}</b>, {d}.": "Nothing today. Next up: <b>{t}</b>, {d}.",
  "Hari ini kosong dan belum ada rencana dalam 14 hari ke depan.": "Nothing today and nothing planned in the next 14 days.",
  "Belum ada kegiatan. Klik <b>Buat</b>, atau minta Asisten AI menambahkannya, misalnya: \"tambah rapat besok jam 10\".": "No events yet. Click <b>Create</b>, or ask the AI assistant to add one, for example: \"add a team meeting tomorrow at 10\".",
  "Berlangsung": "In progress",
  "Tidak ada kegiatan hari ini.": "No events today.",
  "Tambahkan dengan tombol Buat, atau minta Asisten AI.": "Add one with the Create button, or ask the AI assistant.",
  "{p}% dari total": "{p}% of total",
  "Belum ada kegiatan minggu ini.": "No events this week yet.",
  "Belum ada kegiatan bulan ini.": "No events this month yet.",
  "Batal": "Cancel",
  "+{n} lainnya di tampilan Jadwal": "+{n} more in the Schedule view",
  "Semua kegiatan yang lewat sudah ditandai.": "All past events have been marked.",
  "Besok": "Tomorrow",
  "{n} hari lagi": "in {n} days",
  "{n} menit lagi": "in {n} min",
  "{n} jam lagi": "in {n} hour|in {n} hours",
  "Tidak ada kegiatan dalam 14 hari ke depan.": "No events in the next 14 days.",
  "{n} minggu lagi": "in {n} weeks",
  "{n} minggu lalu": "{n} weeks ago",
  "terpadat {d}": "busiest {d}",
  "Jadwal belum bisa dimuat.": "The schedule could not be loaded.",
  "Memuat jadwal…": "Loading schedule…",
  "Coba lagi": "Try again",
  "Tidak bisa memuat jadwal.": "Could not load the schedule.",
  "Server tidak terjangkau. Data disimpan di browser ini saja.": "Server unreachable. Data is saved in this browser only.",
  "Tidak bisa menyimpan di browser ini": "Cannot save in this browser",
  "Gagal ({n})": "Failed ({n})",
  "Ditandai: {s}": "Marked: {s}",
  "Gagal menyimpan. {m}": "Could not save. {m}",
  "Batalkan tanda": "Unmark",
  "Belum ada kegiatan di tanggal ini.": "No events on this date.",
  "Buka tampilan hari": "Open day view",
  "Tambah di tanggal ini": "Add on this date",
  "Bagian dari kegiatan berulang ({n} kegiatan)": "Part of a recurring event ({n} events)",
  "Ubah": "Edit",
  "Hapus": "Delete",
  "Tutup": "Close",
  "Hapus kegiatan ini?": "Delete this event?",
  "Ya, hapus": "Yes, delete",
  "Hapus semua berulang": "Delete all recurring",
  "Tidak": "No",
  "{n} kegiatan dihapus": "{n} events deleted",
  "Dihapus": "Deleted",
  "Gagal menghapus. {m}": "Could not delete. {m}",
  "Tambah kegiatan": "Add event",
  "Ubah kegiatan": "Edit event",
  "Tambahkan judul": "Add title",
  "Judul": "Title",
  "Tanggal": "Date",
  "Mulai": "Start",
  "Jam selesai": "End",
  "Ulangi": "Repeat",
  "Tidak berulang": "Does not repeat",
  "Setiap hari": "Every day",
  "Setiap hari kerja (Sen–Jum)": "Every weekday (Mon–Fri)",
  "Setiap minggu": "Every week",
  "Setiap bulan": "Every month",
  "Berulang sampai": "Repeat until",
  "Catatan": "Notes",
  "Tempat, link meeting, checklist…": "Location, meeting link, checklist…",
  "Simpan": "Save",
  "Menyimpan…": "Saving…",
  "Menyimpan {n}…": "Saving {n}…",
  "Tersimpan": "Saved",
  "{n} kegiatan ditambahkan": "{n} events added",
  "Akan dibuat {n} kegiatan": "Will create {n} event|Will create {n} events",
  "Terlalu banyak ({max}+). Maksimal {max} kegiatan, majukan tanggal akhir.": "Too many ({max}+). At most {max} events, bring the end date forward.",
  "Maksimal {max} kegiatan sekali buat. Majukan tanggal akhir pengulangan.": "At most {max} events can be created at once. Bring the repeat end date forward.",
  "Isi judul kegiatan.": "Enter a title.",
  "Pilih tanggal.": "Pick a date.",
  "Isi jam mulai dan selesai.": "Enter a start and end time.",
  "Isi jam selesai, atau kosongkan jam mulai untuk tugas dengan tenggat saja.": "Enter an end time, or leave the start time empty for a deadline-only task.",
  "Jam boleh dikosongkan. Isi hanya jam mulai untuk kegiatan di jam itu saja, hanya jam selesai untuk tenggat, atau kosongkan keduanya untuk kegiatan seharian.": "Times are optional. Fill in only the start time for something at that time, only the end time for a deadline, or leave both empty for an all-day item.",
  "Aturan pengulangan tidak valid (pilih hari, atau tanggal akhir sebelum tanggal mulai).": "Invalid repeat rule (pick days, or the end date is before the start date).",
  "Kosongkan jam": "Clear times",
  "Tanpa tanggal akhir (terus berulang)": "No end date (keeps repeating)",
  "Tanpa tanggal akhir": "No end date",
  "Terus berulang": "Keeps repeating",
  "tanpa batas akhir": "no end date",
  "Kustom (pilih hari)": "Custom (pick days)",
  "Hari berulang": "Repeat on",
  "Akan tampil {n} kali": "Will appear {n} times",
  "Belum ada tanggal yang cocok": "No matching dates yet",
  "Pilih minimal satu hari.": "Pick at least one day.",
  "Pengulangan maksimal 2 tahun dari tanggal mulai.": "Repeats can run at most 2 years from the start date.",
  "Hanya tanggal ini": "This date only",
  "Kategori baru \"{c}\" akan dibuat.": "A new category \"{c}\" will be created.",
  "Kategori baru": "New category",
  "Usulan": "Proposals",
  "Nama": "Name",
  "{n} kegiatan dipindahkan ke \"Tanpa kategori\"": "{n} events move to \"No category\"",
  "Usulan tanpa judul.": "Proposal has no title.",
  "Usulan tanpa tanggal.": "Proposal has no date.",
  "Usulan berulang tanpa tanggal mulai atau hari. Coba sebutkan harinya, mis. \"tiap Senin\".": "Recurring proposal has no start date or weekdays. Try naming the day, e.g. \"every Monday\".",
  "Tanggal itu bukan bagian dari seri ini.": "That date is not part of this series.",
  "hanya tanggal ini dari seri berulang": "this date only, not the whole series",
  "Seluruh seri": "Whole series",
  "Berulang": "Repeats",
  "seluruh seri berulang": "the whole recurring series",
  "tiap tanggal {n}": "on day {n} of each month",
  "setiap hari": "every day",
  "sampai": "until",
  "Batalkan kegiatan \"{t}\"?": "Cancel the event \"{t}\"?",
  "Tenggat": "Due",
  "Seharian": "All day",
  "Tanpa jam mulai hari ini: {l}.": "No start time today: {l}.",
  "Jam selesai harus setelah jam mulai.": "The end time must be after the start time.",
  "Tanggal akhir pengulangan harus setelah tanggal mulai.": "The repeat end date must be after the start date.",
  "Belum ada kategori. Tambahkan lewat \"Kelola kategori\".": "No categories yet. Add one via \"Manage categories\".",
  "Ubah nama atau warna langsung berlaku ke semua kegiatan di kategori itu.": "Renaming or recolouring a category applies immediately to every event in it.",
  "Nama kategori baru": "New category name",
  "Tambah": "Add",
  "Nama kategori": "Category name",
  "Ganti warna": "Change colour",
  "Ganti warna {c}": "Change colour of {c}",
  "Warna {c}": "Colour {c}",
  "Hapus {c}": "Delete {c}",
  "Hapus kategori": "Delete category",
  "Hapus kategori \"{c}\"?": "Delete category \"{c}\"?",
  "{n} kegiatan di \"{c}\" dipindahkan ke": "{n} event in \"{c}\" will be moved to|{n} events in \"{c}\" will be moved to",
  "Belum ada kategori.": "No categories yet.",
  "Gagal menyimpan kategori": "Could not save the category",
  "Kategori dihapus": "Category deleted",
  "Kategori dihapus, {n} kegiatan dipindahkan": "Category deleted, {n} event moved|Category deleted, {n} events moved",
  "Gagal menghapus kategori. Coba lagi.": "Could not delete the category. Try again.",
  "Nama kategori tidak boleh kosong": "Category name cannot be empty",
  "Nama kategori diubah": "Category renamed",
  "Kategori itu sudah ada": "That category already exists",
  "Kategori ditambahkan": "Category added",
  "Biru": "Blue",
  "Ungu": "Purple",
  "Hijau tua": "Dark green",
  "Jingga": "Orange",
  "Merah muda": "Pink",
  "Kuning": "Yellow",
  "Hijau": "Green",
  "Merah": "Red",
  "Abu-abu": "Grey",
  "Kerja": "Work",
  "Kuliah": "Study",
  "Pribadi": "Personal",
  "Olahraga": "Sports",
  "Keluarga": "Family",
  "Organisasi": "Organisation",
  "Asisten jadwal": "Schedule assistant",
  "Percakapan baru": "New conversation",
  "Tutup asisten": "Close assistant",
  "Geser untuk mengubah lebar": "Drag to resize",
  "Pilih penyedia AI": "Choose AI provider",
  "Model AI": "AI model",
  "Tanya tentang jadwal Anda…": "Ask about your schedule…",
  "Pesan ke asisten": "Message to the assistant",
  "Hentikan": "Stop",
  "Kirim": "Send",
  "Asisten membaca kegiatan sekitar 60 hari ke belakang dan ke depan. Asisten hanya mengusulkan perubahan jadwal; baru berlaku setelah Anda menekan Terapkan. Data jadwal dikirim ke penyedia AI yang Anda pilih di atas. Jika penyedia itu kena limit, jawaban otomatis dialihkan ke penyedia lain.": "The assistant reads events from about 60 days back to 60 days ahead. It only proposes schedule changes; they take effect only after you press Apply. Your schedule data is sent to the AI provider you choose above. If that provider hits its limit, the answer is automatically switched to the other one.",
  "Halo! Saya bisa membaca jadwal Anda, menganalisisnya, dan <b>mengusulkan perubahan</b> yang baru berlaku setelah Anda menekan Terapkan. Coba misalnya:": "Hi! I can read your schedule, analyse it, and <b>propose changes</b> that only take effect after you press Apply. Try for example:",
  "Tambahkan rapat tim besok jam 10 sampai 11": "Add a team meeting tomorrow from 10 to 11",
  "Pindahkan futsal hari Kamis jadi jam 17:00": "Move Thursday's futsal to 17:00",
  "Berapa jam saya olahraga bulan ini?": "How many hours did I work out this month?",
  "Ringkas minggu ini": "Summarize this week",
  "Apa saja yang sudah dan akan saya kerjakan": "What I have done and what is coming up",
  "Buat ringkasan minggu ini: apa yang sudah terlaksana, apa yang tersisa, dan berapa jam per kategori. Tutup dengan 1–2 hal yang perlu saya perhatikan.": "Write a summary of this week: what has been done, what is left, and how many hours per category. End with 1–2 things I should pay attention to.",
  "Evaluasi bulan ini": "Review this month",
  "Tingkat penyelesaian dan pola": "Completion rate and patterns",
  "Evaluasi bulan ini: tingkat penyelesaian kegiatan, kategori yang paling banyak memakan waktu, kegiatan yang sering dibatalkan/ditunda, dan pola yang terlihat. Beri 3 saran konkret.": "Review this month: the completion rate of events, which categories take the most time, which events are often cancelled/postponed, and the patterns you see. Give 3 concrete suggestions.",
  "Cek keseimbangan": "Check balance",
  "Kerja vs pribadi vs istirahat": "Work vs personal vs rest",
  "Apakah jadwal saya 30 hari terakhir dan 14 hari ke depan seimbang antara kerja/studi, kesehatan, keluarga, dan waktu pribadi? Tunjukkan angka jam per kategori dan beri saran penyesuaian.": "Is my schedule for the last 30 days and the next 14 days balanced between work/study, health, family and personal time? Show the hours per category and suggest adjustments.",
  "Hari terlalu padat": "Overloaded days",
  "Deteksi hari overload & bentrok": "Spot overloaded days and clashes",
  "Periksa 14 hari ke depan: hari mana yang terlalu padat (lebih dari 8 jam atau tanpa jeda), dan apakah ada kegiatan yang jamnya bertabrakan. Sarankan apa yang bisa digeser.": "Check the next 14 days: which days are too packed (more than 8 hours or no breaks), and whether any events overlap in time. Suggest what could be moved.",
  "Cari waktu kosong": "Find free time",
  "Slot luang minggu depan": "Free slots next week",
  "Cari slot waktu kosong minimal 2 jam antara jam 08:00–21:00 di minggu depan (Senin–Minggu). Tampilkan per hari.": "Find free time slots of at least 2 hours between 08:00–21:00 next week (Monday–Sunday). Show them per day.",
  "Sedang menganalisis…": "Analysing…",
  "dialihkan otomatis karena {p} tidak tersedia": "switched automatically because {p} was unavailable",
  "API key {n} belum diatur di server": "{n} API key is not set on the server",
  "Asisten sekarang memakai {p}": "The assistant now uses {p}",
  "(Mengusulkan {n} perubahan jadwal.)": "(Proposed {n} schedule change.)|(Proposed {n} schedule changes.)",
  "Tidak ada jawaban dari AI. Coba kirim lagi.": "No answer from the AI. Try sending again.",
  "(Dihentikan)": "(Stopped)",
  "(Koneksi terputus.)": "(Connection lost.)",
  "Terjadi gangguan. Coba kirim lagi.": "Something went wrong. Try sending again.",
  "Terjadi gangguan ({n}).": "Something went wrong ({n}).",
  "API key AI belum diatur di server. Isi GROQ_API_KEY atau GEMINI_API_KEY.": "The AI API key is not set on the server. Set GROQ_API_KEY or GEMINI_API_KEY.",
  "Batas pemakaian gratis tercapai. Coba lagi beberapa saat lagi.": "The free usage limit has been reached. Try again in a little while.",
  "Data jadwal terlalu besar untuk model ini. Coba pertanyaan yang lebih spesifik.": "The schedule data is too large for this model. Try a more specific question.",
  "API key AI ditolak. Periksa kembali key-nya di pengaturan server.": "The AI API key was rejected. Check the key in the server settings.",
  "Sesi berakhir. Silakan masuk lagi.": "Your session has ended. Please sign in again.",
  "Usulan perubahan · {n}": "Proposed changes · {n}",
  "Periksa usulan di bawah, lalu tekan Terapkan.": "Review the proposals below, then press Apply.",
  "Terapkan": "Apply",
  "Tolak": "Reject",
  "Terapkan semua ({n})": "Apply all ({n})",
  "Tolak semua": "Reject all",
  "Menerapkan…": "Applying…",
  "Diterapkan": "Applied",
  "Urungkan": "Undo",
  "Ditolak": "Rejected",
  "(tanpa judul)": "(untitled)",
  "Waktu": "Time",
  "(kosong)": "(empty)",
  "hanya kegiatan ini, bukan seluruh seri berulang": "this event only, not the whole recurring series",
  "{n} lainnya": "{n} more",
  "Kategori \"{c}\" tidak ditemukan.": "Category \"{c}\" was not found.",
  "Bentrok dengan \"{t}\" ({s}–{e}).": "Overlaps with \"{t}\" ({s}–{e}).",
  "Usulan kurang lengkap (judul, tanggal, atau jam).": "The proposal is incomplete (title, date or time).",
  "Kegiatan yang dimaksud tidak ditemukan di jadwal.": "The event in question was not found in the schedule.",
  "Tidak ada yang berubah dari kegiatan ini.": "Nothing changes for this event.",
  "Kegiatan ini sudah tidak ada di jadwal.": "This event is no longer in the schedule.",
  "Gagal menerapkan sebagian perubahan. {m}": "Some changes could not be applied. {m}",
  "{n} perubahan diterapkan": "{n} changes applied",
  "Perubahan diterapkan": "Change applied",
  "Perubahan diurungkan": "Change undone",
  "Gagal mengurungkan. {m}": "Could not undo. {m}",
  "Masuk untuk membuka kalender Anda.": "Sign in to open your calendar.",
  "Kata sandi": "Password",
  "Masuk": "Sign in",
  "Silakan masuk dulu": "Please sign in first",
  "Username atau kata sandi salah": "Wrong username or password",
  "APP_PASSWORD belum diatur di Vercel. Isi APP_USERNAME dan APP_PASSWORD di Environment Variables lalu Redeploy.": "APP_PASSWORD is not set on Vercel. Set APP_USERNAME and APP_PASSWORD in Environment Variables, then Redeploy.",
  "Metode tidak didukung": "Method not allowed",
  "Terjadi kesalahan di server": "Something went wrong on the server",
  "JSON tidak valid": "Invalid JSON",
  "Data terlalu besar": "Data too large",
  "Permintaan tidak valid": "Invalid request",
  "Pesan terakhir harus dari pengguna": "The last message must be from the user",
  "Data kegiatan tidak valid": "Invalid event data",
  "ID kegiatan tidak valid": "Invalid event ID",
  "Tanggal/jam kegiatan tidak valid": "Invalid event date/time",
  "Jam selesai harus setelah jam mulai": "The end time must be after the start time",
  "Judul kegiatan wajib diisi": "The event title is required",
  "Daftar kategori tidak valid": "Invalid category list",
  "Kategori tidak valid": "Invalid category",
  "Daftar kegiatan tidak valid": "Invalid event list",
  "Daftar ID tidak valid": "Invalid ID list",
  "API key AI belum diatur di server (GROQ_API_KEY atau GEMINI_API_KEY).": "The AI API key is not set on the server (GROQ_API_KEY or GEMINI_API_KEY).",
  "Database belum diatur. Isi DATABASE_URL (Supabase) di Environment Variables Vercel.": "The database is not set up. Set DATABASE_URL (Supabase) in the Vercel Environment Variables.",
  "Tabel database belum ada. Jalankan migrasi supabase/migrations/20261102000000_init_agenda.sql di Supabase.": "The database tables do not exist yet. Run the migration supabase/migrations/20261102000000_init_agenda.sql in Supabase.",
  "Tidak bisa terhubung ke database. Periksa DATABASE_URL (pakai Transaction pooler dan password yang benar).": "Cannot connect to the database. Check DATABASE_URL (use the Transaction pooler and the correct password).",
};

// Messages that come from the server (api/*.js, lib/*.js) are Indonesian and sometimes carry a provider name.
const PATTERNS = [
  [/^(.+) menolak permintaan ini\.$/, "$1 rejected this request."],
  [/^(.+) sedang bermasalah \((\d+)\)\.$/, "$1 is having problems ($2)."],
  [/^API key (.+) ditolak\. Periksa kembali key-nya\.$/, "The $1 API key was rejected. Check the key."],
  [/^Batas pemakaian gratis (.+) tercapai\. Coba lagi sebentar lagi\.$/, "The free usage limit of $1 has been reached. Try again shortly."],
  [/^Tidak bisa menghubungi (.+)\.$/, "Could not reach $1."],
];

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
let lang = 'id';
try { const s = localStorage.getItem('agenda-lang'); if (s === 'en' || s === 'id') lang = s; } catch (e) { /* storage blocked */ }

const fill = (s, v) => (v ? s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m)) : s);

function t(key, vars) {
  let s = key;
  if (lang === 'en' && has(EN, key)) {
    s = EN[key];
    if (vars && typeof vars.n === 'number' && s.includes('|')) s = s.split('|')[vars.n === 1 ? 0 : 1];
  }
  return fill(s, vars);
}

// Translates a message received from the server.
function tr(msg) {
  if (lang !== 'en' || !msg) return msg;
  if (has(EN, msg)) return EN[msg];
  for (const [re, out] of PATTERNS) if (re.test(msg)) return msg.replace(re, out);
  return msg;
}

/* ---------- static DOM ---------- */
const ATTRS = ['placeholder', 'title', 'aria-label'];
const textOrig = new WeakMap(); // text node -> {core, key}
const attrOrig = new WeakMap(); // element   -> {attr: original value}
const skipped = el => I18N.skip && el.closest(I18N.skip);

function applyDom(root) {
  root = root || document.body;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const p = n.parentElement;
      if (!p || p.tagName === 'SCRIPT' || p.tagName === 'STYLE' || skipped(p)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const n of nodes) {
    const raw = n.nodeValue;
    let o = textOrig.get(n);
    if (!o) {
      const core = raw.trim();
      if (!core) continue;
      const key = n.parentElement.dataset.i18n || core; // data-i18n disambiguates identical Indonesian words
      if (!has(EN, key)) continue;
      o = { core, key };
      textOrig.set(n, o);
    }
    const lead = raw.match(/^\s*/)[0], trail = raw.match(/\s*$/)[0];
    n.nodeValue = lead + (lang === 'en' ? EN[o.key] : o.core) + trail;
  }
  root.querySelectorAll('[placeholder],[title],[aria-label]').forEach(el => {
    if (skipped(el)) return;
    const o = attrOrig.get(el) || {};
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (v === null) continue;
      if (!(a in o)) { if (!has(EN, v)) continue; o[a] = v; }
      el.setAttribute(a, lang === 'en' ? EN[o[a]] : o[a]);
    }
    attrOrig.set(el, o);
  });
}

const I18N = {
  t, tr, applyDom,
  skip: '', // selector of containers the app renders itself (already translated), set by app.js
  get lang() { return lang; },
  get locale() { return lang === 'en' ? 'en-GB' : 'id-ID'; },
  setLang(l) { lang = l === 'en' ? 'en' : 'id'; document.documentElement.lang = lang; },
};
window.I18N = I18N;
document.documentElement.lang = lang;
})();
