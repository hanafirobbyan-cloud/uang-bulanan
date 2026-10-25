// -----------------------------------------------------------------------------
// storage.js — the ONLY file that talks to the browser's storage.
//
// Right now it uses localStorage. If you ever want to switch to another kind
// of storage (for example IndexedDB), only this file needs to change.
//
// All our keys start with PREFIX. Several apps can share one website address
// (e.g. everything on yourname.github.io), so we never touch keys without it.
// -----------------------------------------------------------------------------

const PREFIX = 'uang-bulanan:';

/** Can we use localStorage at all? (It can be blocked, e.g. in some private-browsing modes.) */
export function isAvailable() {
  try {
    const key = `${PREFIX}__test__`;
    localStorage.setItem(key, '1');
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read a saved value.
 * Returns { value } (value is null if nothing is saved yet),
 * or { error, raw } if the saved text exists but is broken.
 */
export function read(key) {
  let raw;
  try {
    raw = localStorage.getItem(PREFIX + key);
  } catch (error) {
    return { error, raw: null };
  }
  if (raw === null) return { value: null };
  try {
    return { value: JSON.parse(raw) };
  } catch (error) {
    return { error, raw };
  }
}

/** Save a value. Returns true if it worked, false if not (e.g. storage is full). */
export function write(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Save plain text as-is (used to keep a copy of broken data). */
export function writeText(key, text) {
  try {
    localStorage.setItem(PREFIX + key, text);
    return true;
  } catch {
    return false;
  }
}

/** True if a browser "storage" event (from another tab) is about our saved `key`. null means "everything was cleared". */
export function isEventFor(eventKey, key) {
  return eventKey === null || eventKey === PREFIX + key;
}

/** Delete every key that belongs to this app (and nothing else). */
export function removeAll() {
  try {
    const ours = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(PREFIX)) ours.push(key);
    }
    ours.forEach((key) => localStorage.removeItem(key));
    return true;
  } catch {
    return false;
  }
}

/**
 * Ask the browser to keep our data even when the device is low on space.
 * Safe to call every time; returns true if storage is (now) persistent.
 */
export async function requestPersistence() {
  try {
    if (!navigator.storage || !navigator.storage.persist) return false;
    if (navigator.storage.persisted && (await navigator.storage.persisted())) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/** Is storage marked as persistent? Returns true, false, or null if unknown. */
export async function isPersisted() {
  try {
    if (!navigator.storage || !navigator.storage.persisted) return null;
    return await navigator.storage.persisted();
  } catch {
    return null;
  }
}
