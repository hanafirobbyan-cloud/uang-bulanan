# Uang Bulanan

*Aplikasi pribadi untuk mengatur uang kiriman bulanan sampai transfer berikutnya.*

A small personal budgeting app for a university student who gets money from
their parents every month. It answers one question every day:
**"How much can I safely spend today?"** (*Aman dipakai hari ini*).

- Interface 100% in Bahasa Indonesia
- Works completely offline after the first visit
- No account, no server, no tracking: all data stays on your own device
- Install it on iPhone (Safari → Share → *Add to Home Screen*) or use it on a Mac
- Free to host on GitHub Pages, and it never expires

## Features

- **Beranda**: today's safe-to-spend amount, today's allowance, days until the next
  transfer, and a progress bar for every budget bucket (*pos*).
- **Catat Pengeluaran**: quick entry with the number keypad and thousand separators.
- **Pengeluaran**: all expenses of a period, newest first, filter by bucket or wallet, edit and delete.
- **Dompet**: wallet tags (Tunai, Bank, GoPay, Dana, ShopeePay) with spending per wallet.
- **Pengeluaran rutin**: recurring bills (kos, pulsa, ...) counted automatically every period.
- **Simulasi "kalau beli ini"**: see what a purchase would do to today's numbers. Saves nothing.
- **Ringkasan**: income, spending and leftover per period, per bucket and per wallet,
  plus *Pindahkan sisa ke Tabungan* (once per finished period).
- **Pengaturan**: monthly amount, income day, buckets, wallets, backup export/import,
  and *Hapus semua data*.
- **Special income for one period**, e.g. when your parents send extra this month.

## How the daily number works

A period runs from your income day to the day before the next income day
(if a month is too short, e.g. day 31 in April, the last day of that month is used).

```
spendablePool = money of the "bisa dipakai" buckets
                - recurring bills in those buckets
                - expenses in those buckets this period (except today's)
daysLeft      = days from today until the day before the next income day (today counts)
amanHariIni   = spendablePool / daysLeft, rounded down     -> today's allowance
sisaHariIni   = amanHariIni - today's expenses             -> the big number
```

Spend less today and tomorrow's allowance goes up; spend more and it goes down.
Negative numbers are shown in red with *Melebihi anggaran*. Buckets that are not
spendable (Tabungan, Dana Cadangan) never change the daily number.

## Your data

- Data is stored only in the browser on this device (localStorage).
- **iPhone keeps the Home Screen app's data separate from Safari's.** Install the app
  first and do the setup inside the installed app, not in Safari.
- The Mac and the iPhone have separate data too. Use the iPhone as your main device,
  and use *Ekspor cadangan* / *Impor cadangan* to move data.
- Make a backup every month: *Pengaturan → Ekspor cadangan*.

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

## Releasing an update

1. Make the change.
2. Change `APP_VERSION` at the top of `sw.js` **and** in `js/version.js` to the same new
   value (for example `1.0.1`). If you added or renamed files, update `FILES` in `sw.js`.
3. Run the tests: `npm test` (they check step 2 for you).
4. Upload the changed files to GitHub again (*Add file → Upload files*, same names replace
   the old ones) or push with git.
5. The app downloads the new version by itself and shows *"Versi baru tersedia"*.
   Tap *Muat ulang*.

## For developers

Plain HTML, CSS and JavaScript (ES modules). No framework, no packages, no build
step: this folder *is* the website.

```
index.html            page shell (menu, update banner)
manifest.webmanifest  install info (name, icons, colors)
sw.js                 service worker: offline cache + updates
css/app.css           all styles (dark mode, iPhone safe areas)
js/app.js             start-up, screen switching
js/logic.js           ALL money/date math (pure, no DOM) – tested
js/data.js            data shape, defaults, checks, repair, backups – tested
js/format.js          Indonesian money/date text – tested
js/storage.js         the only file that touches localStorage
js/store.js           in-memory data + every change function
js/ui.js, components.js   small UI helpers
js/screens/*.js       one file per screen
tests/                unit tests (node --test)
tools/make-icons.mjs  draws the PNG icons (npm run icons)
```

- Run the tests (Node.js 20 or newer): `npm test`
- Preview on your computer: run `python3 -m http.server 8000` in this folder and open
  <http://localhost:8000/>
- Regenerate the icons: `npm run icons`
