# Uang Bulanan

*Aplikasi pribadi untuk mengatur uang kiriman bulanan sampai transfer berikutnya.*

A small personal budgeting app for a university student who gets money from
their parents every month, sometimes in several transfers. It answers one
question every day: **"How much can I safely spend today?"** (*Aman dipakai hari ini*).

- Interface 100% in Bahasa Indonesia
- Works completely offline after the first visit
- No account, no server, no tracking: all data stays on your own device
- Install it on iPhone (Safari → Share → *Add to Home Screen*) or use it on a Mac
- Free to host on GitHub Pages, and it never expires

## Features

- **Beranda (BER)**: today's numbers (*SISA HARI INI*, *AMAN HARI INI*), days left, the
  next transfer, this period's transfers (*JADWAL UANG MASUK*), money in hand
  (*UANG DI TANGAN*), a cash-flow chart (*ARUS KAS*), today's expenses and every
  budget bucket (*pos*).
- **Uang Masuk Bertahap** (new in 3.0): the monthly money can arrive in 1 to 8 parts,
  e.g. Rp 1.000.000 on the 1st, the 12th and the 22nd. Set it in *Pengaturan* or *MSK*:
  a monthly total, the days and amounts, with *Bagi rata*, quick choices (Sekaligus,
  2×, 3×, 4× mingguan) and *Bagi ulang proporsional*. Saving only works when the parts
  add up to the total exactly (*Belum dialokasikan: Rp X* shows what is missing).
- **Belum masuk? Geser tanggal**: a transfer that did not arrive can be moved to a
  later date in the same period. Until then it counts as not received.
- **Cara hitung**: *Hati-hati* (default, only money that has arrived) or *Total bulan*
  (the whole month, like version 2). See below.
- **Pengeluaran (KLR)**: all expenses of a period in one table, filters, edit, delete,
  swipe left to delete (with undo).
- **Pengeluaran rutin (RTN)**: recurring bills (kos, pulsa, ...) counted automatically,
  with an optional due day.
- **Simulasi (SIM)**: what a purchase would do to today's numbers. Saves nothing.
- **Rencana Cukup (RNC)**: "I have this much money now; make it last until …", with
  obligations, an emergency amount, a daily allowance that adapts every day, a
  timeline, calculators, saving tips and a history.
- **Ringkasan (RGK)**: income (and which transfers arrived), spending and leftover per
  period, per bucket and per wallet, a special income for one period, and
  *Pindahkan sisa ke Tabungan*.
- **Pengaturan (ATR)**: the transfer schedule, *Cara hitung*, buckets, wallets,
  recurring bills, backup export/import, *Pulihkan data sebelum update*, *Hapus semua data*.
- **Terminal look** (new in 3.0): black and amber, monospace numbers, dense tables, a
  live status bar (mode, ONLINE/OFFLINE, clock in WIB), a command line, a ticker with
  the key numbers and function keys. Crisp, quick motion; with "Reduce Motion" on, the
  ticker stands still and nothing blinks or flashes.

## Getting around

- **Function keys**: the bar at the bottom (phone) or the column on the left (Mac).
  F1 BER · F2 KLR · F3 RNC · F4 MSK · F5 LAIN (all screens) · F6 SIM · F7 RGK · F8 ATR.
  On a keyboard, F1–F8 work where the browser allows it.
- **Command line**: type a code and press Enter or GO: BER, KLR, RTN, SIM, RNC, RGK,
  MSK (jadwal uang masuk), ATR, DMP (dompet), POS (pos anggaran), CTT (catat
  pengeluaran), CAD (ekspor cadangan), LAIN. Suggestions appear while typing.
  Press `/` or Cmd/Ctrl+K to jump to it; Esc clears it.
- **Lists**: ↑ ↓ move through rows, Enter opens the selected row. Esc closes a window.

## How the daily number works

A period starts on the earliest transfer day and ends the day before that day next
month (a day that doesn't exist in a short month, e.g. the 31st in April, becomes the
month's last day). A transfer counts as received from its own date (the money arrives
that morning). Each transfer is split over the buckets by their percentages.

**Hati-hati** (default) — only money that has already arrived:

```
horizonEnd    = the day before the next transfer that has not arrived yet
                (or the period's last day if there is none)
daysLeft      = days from today through horizonEnd (today counts)
spendablePool = received money × the spendable buckets' percents
                - recurring bills (spendable buckets) due by horizonEnd
                - expenses this period in spendable buckets (except today's)
amanHariIni   = spendablePool / daysLeft, rounded down     -> today's allowance
sisaHariIni   = amanHariIni - today's expenses             -> the big number
```

Unspent money carries over, so the daily number jumps up on the day new money arrives
(▲ *Uang masuk*).

**Total bulan** — the version 2 formula: the whole period's money and all recurring
bills, spread until the period's last day. Because that money may not all be there
yet, a warning appears when the plan until the next transfer is more than the money
in hand.

With one transfer on the first day of the period, both ways give exactly the same
numbers as version 2.

**Uang di tangan** = money received this period − expenses so far − recurring bills
that are already due.

## Your data

- Data is stored only in the browser on this device (localStorage).
- **iPhone keeps the Home Screen app's data separate from Safari's.** Install the app
  first and do the setup inside the installed app, not in Safari.
- The Mac and the iPhone have separate data too. Use the iPhone as your main device,
  and use *Ekspor cadangan* / *Impor cadangan* to move data.
- Make a backup every month: *Pengaturan → Ekspor cadangan* (or type CAD).
- Never delete the app from the Home Screen: that erases its data.

## Publish it for free on GitHub Pages

1. **Create a GitHub account**: go to <https://github.com>, click *Sign up*, and follow
   the steps (email, password, username). Confirm your email.
2. **Create a repository**: click the **+** at the top right → *New repository*.
   Name it `uang-bulanan`, choose **Public**, leave everything else as it is, and click
   *Create repository*.
3. **Upload the files**: on the new repository page, click the link
   *uploading an existing file*. In Finder, open this folder (`uang-bulanan`), press
   **⌘A** to select everything inside it, and drag it all into the browser window.
   Wait until every file is listed, then click *Commit changes*.
   (Upload what is *inside* the folder, so that `index.html` is at the top level.)
4. **Turn on GitHub Pages**: in the repository, open *Settings* → *Pages* (left menu).
   Under *Build and deployment*, set *Source* to **Deploy from a branch**, choose
   branch **main** and folder **/ (root)**, then click *Save*.
5. **Find your link**: wait 1–2 minutes and refresh the *Pages* settings page. It shows
   *"Your site is live at https://YOUR-USERNAME.github.io/uang-bulanan/"*.

## Data versions and safe updates

Saved data has a version number (`schemaVersion`, currently 3). When a new app version
changes the data shape, it first stores an untouched copy of the old data (offered as
*Pengaturan → Pulihkan data sebelum update*) and then upgrades it step by step
(`migrate()` in `js/data.js`, tested in `tests/migration.test.js`). Version 3 turns the
one monthly amount into a schedule with a single transfer on the same day, so nothing
changes until you split it. Backup files from versions 1, 2 and 3 all import correctly.
`tests/golden.test.js` compares every number with an untouched copy of the version 2
math (`tests/golden/v2/`).

## Releasing an update

1. Make the change.
2. Change `APP_VERSION` at the top of `sw.js` **and** in `js/version.js` to the same new
   value (for example `3.0.1`). If you added or renamed files (scripts, fonts, icons),
   update `FILES` in `sw.js`.
3. Run the tests: `npm test` (they check step 2 for you, and the color contrast).
4. Upload the changed files to GitHub again (*Add file → Upload files*, same names replace
   the old ones) or push with git.
5. The app downloads the new version by itself and shows *"Versi baru tersedia"*.
   Tap *Muat ulang*.

## For developers

Plain HTML, CSS and JavaScript (ES modules). No framework, no packages, no build
step: this folder *is* the website.

```
index.html            page shell (status bar, command line, ticker, function keys, update banner)
manifest.webmanifest  install info (name, icons, colors)
sw.js                 service worker: offline cache + updates
css/app.css           all styles (the terminal theme, iPhone safe areas)
fonts/                IBM Plex Mono (self-hosted; SIL Open Font License in fonts/OFL.txt)
js/app.js             start-up, screen switching
js/logic.js           ALL money/date math, incl. installments and both modes (pure, no DOM) – tested
js/schedule.js        editing the transfer schedule: checks, Bagi rata, presets – tested
js/planner.js         ALL "Rencana Cukup" math (pure, no DOM) – tested
js/commands.js        command-line codes and function keys – tested
js/data.js            data shape, versions/migration, checks, repair, backups – tested
js/format.js          Indonesian money/date text – tested
js/motion.js          all animations (one place; timings come from css/app.css)
js/terminal.js        status bar, clock, command line, ticker, keyboard
js/income.js          screen parts for transfers (schedule editor, Geser tanggal, …)
js/chart.js           the ARUS KAS chart (inline SVG)
js/storage.js         the only file that touches localStorage
js/store.js           in-memory data + every change function
js/ui.js, components.js   small UI helpers
js/screens/*.js       one file per screen (masuk.js = Jadwal Uang Masuk)
tests/                unit tests (node --test); tests/golden/v2 = version 2 math for comparison
tools/make-icons.mjs  draws the PNG icons (npm run icons)
tools/check-contrast.mjs  checks every text/background color pair (npm run contrast)
```

- Run the tests (Node.js 20 or newer): `npm test`
- Check the colors: `npm run contrast`
- Preview on your computer: run `python3 -m http.server 8000` in this folder and open
  <http://localhost:8000/>
- Regenerate the icons: `npm run icons`
