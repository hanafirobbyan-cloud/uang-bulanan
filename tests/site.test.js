// Checks for the website files themselves, so a future change can't silently
// break offline mode or hosting in a sub-folder (like GitHub Pages /uang-bulanan/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

function listFiles(dir) {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const path = `${dir}/${name}`;
    return statSync(join(ROOT, path)).isDirectory() ? listFiles(path) : [path];
  });
}

const swSource = read('sw.js');
const precached = [...swSource.match(/const FILES = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);

function pngInfo(path) {
  const buffer = readFileSync(join(ROOT, path));
  assert.equal(buffer.toString('hex', 0, 8), '89504e470d0a1a0a', `${path} is not a PNG`);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), colorType: buffer[25] };
}

test('app version is the same in sw.js and js/version.js', () => {
  const swVersion = swSource.match(/const APP_VERSION = '([^']+)'/)[1];
  const appVersion = read('js/version.js').match(/export const APP_VERSION = '([^']+)'/)[1];
  assert.equal(swVersion, appVersion, 'Change APP_VERSION in BOTH sw.js and js/version.js');
});

test('the service worker caches every app file, and only files that exist', () => {
  const appFiles = ['index.html', 'manifest.webmanifest', ...listFiles('css'), ...listFiles('js'), ...listFiles('icons')]
    .filter((f) => !f.endsWith('.DS_Store'))
    .map((f) => `./${f}`);
  for (const file of appFiles) assert.ok(precached.includes(file), `Add '${file}' to FILES in sw.js`);
  for (const file of precached) {
    assert.ok(file.startsWith('./'), `${file} must start with ./`);
    assert.ok(existsSync(join(ROOT, file)), `${file} is listed in sw.js but does not exist`);
  }
});

test('manifest is valid and uses relative paths', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.name, 'Uang Bulanan');
  assert.equal(manifest.short_name, 'Uang');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.ok(manifest.theme_color && manifest.background_color);
  const sizes = new Set();
  for (const icon of manifest.icons) {
    assert.ok(icon.src.startsWith('./'), `${icon.src} must be relative`);
    const info = pngInfo(icon.src);
    assert.equal(`${info.width}x${info.height}`, icon.sizes, `${icon.src} size`);
    sizes.add(`${icon.sizes} ${icon.purpose}`);
  }
  assert.ok(sizes.has('192x192 any'));
  assert.ok(sizes.has('512x512 any'));
  assert.ok(sizes.has('512x512 maskable'));
});

test('iPhone icon is 180×180 without transparency', () => {
  const info = pngInfo('icons/apple-touch-icon.png');
  assert.deepEqual([info.width, info.height], [180, 180]);
  assert.equal(info.colorType, 2, 'must be RGB (no alpha), or iOS shows black corners');
});

test('index.html has the iPhone tags and only relative links', () => {
  const html = read('index.html');
  for (const needle of [
    'name="apple-mobile-web-app-capable"',
    'name="apple-mobile-web-app-title"',
    'name="apple-mobile-web-app-status-bar-style"',
    'viewport-fit=cover',
    'rel="apple-touch-icon"',
    'rel="manifest"',
    'lang="id"',
  ]) {
    assert.ok(html.includes(needle), `index.html is missing ${needle}`);
  }
  for (const [, url] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    assert.ok(url.startsWith('./') || url.startsWith('#'), `index.html: "${url}" must be relative (./...)`);
  }
});

test('no external requests and no absolute paths in app code', () => {
  for (const file of ['index.html', 'sw.js', ...listFiles('css'), ...listFiles('js')]) {
    const source = read(file);
    const withoutSvgNamespace = source.replaceAll('http://www.w3.org/2000/svg', '');
    assert.ok(!/https?:\/\//.test(withoutSvgNamespace), `${file} must not load anything from the internet`);
    assert.ok(!/(?:fetch|register|import)\(\s*['"`]\//.test(source), `${file} uses an absolute path`);
    assert.ok(!/url\(\s*['"]?\//.test(source), `${file} uses an absolute url()`);
  }
});

test('every JavaScript import points to an existing file', () => {
  for (const file of listFiles('js')) {
    const source = read(file);
    for (const [, path] of source.matchAll(/^import[^'"]*['"]([^'"]+)['"]/gm)) {
      assert.ok(path.startsWith('./') || path.startsWith('../'), `${file}: import "${path}" must be relative`);
      const target = resolve(dirname(join(ROOT, file)), path);
      assert.ok(existsSync(target), `${file}: import "${path}" not found (${relative(ROOT, target)})`);
    }
  }
});
