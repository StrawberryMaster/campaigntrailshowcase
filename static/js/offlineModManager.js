/**
 * This is a offline mod manager of sorts
 * should handle downloading/saving of mods for offline play,
 * URL discovery, asset caching, and IndexedDB registry
 */

const CTS_MODS_CACHE = 'cts-mods-cache-v1';
const OFFLINE_REGISTRY_KEY = 'cts_offline_saved_mods';

// helper to get saved offline mod list from localStorage
function getOfflineModList() {
  try {
    const raw = localStorage.getItem(OFFLINE_REGISTRY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Error reading offline mod registry:', e);
    return [];
  }
}

function setOfflineModList(list) {
  try {
    localStorage.setItem(OFFLINE_REGISTRY_KEY, JSON.stringify(list));
  } catch (e) {
    console.error('Error saving offline mod registry:', e);
  }
}

function isModSavedOffline(modName) {
  const list = getOfflineModList();
  return list.some(item => (typeof item === 'string' ? item === modName : item.name === modName));
}

function addOfflineModToRegistry(modName, meta = {}) {
  const list = getOfflineModList();
  const existingIndex = list.findIndex(item => (typeof item === 'string' ? item === modName : item.name === modName));
  const entry = {
    name: modName,
    savedAt: Date.now(),
    title: meta.title || modName,
    ...meta
  };
  if (existingIndex >= 0) {
    list[existingIndex] = entry;
  } else {
    list.push(entry);
  }
  setOfflineModList(list);
}

function removeOfflineModFromRegistry(modName) {
  const list = getOfflineModList().filter(item => (typeof item === 'string' ? item !== modName : item.name !== modName));
  setOfflineModList(list);
}

// service worker registration
async function registerCTSWorker() {
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      console.log('[SW] Registered successfully with scope:', reg.scope);
    } catch (err) {
      console.warn('[SW] Registration failed:', err);
    }
  }
}

// extract all media URLs (images, audio, video) and asset links from code strings
function extractModUrls(text) {
  if (!text || typeof text !== 'string') return [];
  const urls = new Set();

  // regular expression to match all http/https URLs
  const httpRegex = /https?:\/\/[^\s"'`<>\\)]+/gi;
  let match;
  while ((match = httpRegex.exec(text)) !== null) {
    let url = match[0];
    // clean trailing punctuation or parentheses
    url = url.replace(/[,;.)]+$/, '');
    // exclude API/view tracker endpoints and YouTube watch links that can't be cached via opaque fetch anyway
    if (
      !url.includes('herokuapp.com/api') &&
      !url.includes('googletagmanager') &&
      !url.includes('google-analytics') &&
      !url.includes('youtube.com') &&
      !url.includes('youtu.be')
    ) {
      urls.add(url);
    }
  }

  // relative URLs matching static images/audio/questionsets
  const relativeRegex = /(?:\.\.\/|\/)?static\/[^\s"'`<>\\)]+\.(?:png|jpe?g|webp|gif|svg|mp3|ogg|wav|html|json)/gi;
  while ((match = relativeRegex.exec(text)) !== null) {
    let relUrl = match[0].replace(/[,;.)]+$/, '');
    if (!relUrl.startsWith('/') && !relUrl.startsWith('..')) {
      relUrl = '/' + relUrl;
    }
    urls.add(relUrl);
  }

  return Array.from(urls);
}

// parses Code 1 to determine candidate and running mate pairs,
// then return expected Code 2 filenames, questionset paths, and legacy ending paths
function deriveCode2Filenames(code1, modName) {
  const code2Files = new Set();
  const endingFiles = new Set();
  const questionSetFiles = new Set();

  let details = null;
  if (typeof extractElectionDetails === 'function') {
    details = extractElectionDetails(code1, modName);
  }

  if (!details || !details.election_json || details.election_json.length === 0) {
    return { code2Files: [], endingFiles: [], questionSetFiles: [] };
  }

  const election = details.election_json[0];
  let year = election.fields?.year || modName;
  if (details.temp_election_list && details.temp_election_list.length > 0) {
    const matched = details.temp_election_list.find(f => String(f.id) === String(election.pk));
    if (matched && matched.display_year) {
      year = matched.display_year;
    }
  }
  if (details.code2_id) {
    year = details.code2_id;
  }
  const cands = details.candidate_json || [];
  const runningMates = details.running_mate_json || [];

  // map of candidate PK to candidate object
  const candMap = new Map();
  cands.forEach(c => {
    candMap.set(String(c.pk), c.fields);
  });

  // for each candidate & running mate pairing
  runningMates.forEach(rm => {
    const candId = String(rm.fields?.candidate);
    const runId = String(rm.fields?.running_mate);
    const candObj = candMap.get(candId);
    const runObj = candMap.get(runId);

    if (candObj && runObj) {
      const candLast = candObj.last_name || '';
      const runLast = runObj.last_name || '';
      const theorId = `${year}_${candLast}${runLast}`;

      code2Files.add(`../static/mods/${theorId}.html`);
      endingFiles.add(`../static/mods/${theorId}_ending.html`);

      // derive questionset file name if possible
      if (typeof election_HTML === 'function') {
        try {
          const qs = election_HTML(election.pk, candId, runId);
          if (qs) {
            questionSetFiles.add(`../static/questionset/${qs}`);
          }
        } catch (e) {
          // ignore
        }
      }
    }
  });

  return {
    code2Files: Array.from(code2Files),
    endingFiles: Array.from(endingFiles),
    questionSetFiles: Array.from(questionSetFiles)
  };
}

/**
 * downloads and caches a mod and its referenced assets for offline play
 * @param {string} modName
 * @param {function} onProgress - optional callback: ({ step, total, current, message }) => void
 */
async function saveModForOffline(modName, onProgress = () => {}) {
  if (!('caches' in window)) {
    throw new Error('Cache API not supported in this browser.');
  }

  const cache = await caches.open(CTS_MODS_CACHE);
  const safeFileName = modName.replace(/:/g, " -");
  const initUrl = `../static/mods/${safeFileName}_init.html`;

  onProgress({ step: 'init', message: `Fetching Code 1 for ${modName}...`, percent: 10 });

  // fetch code 1
  let code1Text = '';
  try {
    const res = await fetch(initUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const clone = res.clone();
    await cache.put(initUrl, clone);
    // also cache normalized URL if accessed via absolute path
    const absUrl = new URL(initUrl, window.location.href).href;
    await cache.put(absUrl, res.clone());
    code1Text = await res.text();
  } catch (err) {
    console.error(`Failed to fetch mod init file ${initUrl}:`, err);
    throw new Error(`Could not download Code 1 file: ${err.message}`);
  }

  // discover code 2 and questionset files
  onProgress({ step: 'code2', message: 'Discovering candidate pairings & Code 2 files...', percent: 25 });
  const { code2Files, endingFiles, questionSetFiles } = deriveCode2Filenames(code1Text, modName);

  const allCodeFiles = [...code2Files, ...endingFiles, ...questionSetFiles];
  const allTextsToParse = [code1Text];

  let fetchedCodeCount = 0;
  for (const fileUrl of allCodeFiles) {
    try {
      const res = await fetch(fileUrl);
      if (res.ok) {
        await cache.put(fileUrl, res.clone());
        const absUrl = new URL(fileUrl, window.location.href).href;
        await cache.put(absUrl, res.clone());
        const txt = await res.text();
        allTextsToParse.push(txt);
        fetchedCodeCount++;
      }
    } catch (e) {
      // ending files or non-existent alternative pairings are normal to 404
      console.info(`Optional file ${fileUrl} skipped or not found.`);
    }
  }

  // extract and cache all media/asset URLs
  onProgress({ step: 'assets', message: 'Parsing asset URLs (images, sounds, themes)...', percent: 50 });
  const assetUrls = new Set();
  for (const txt of allTextsToParse) {
    const extracted = extractModUrls(txt);
    extracted.forEach(u => assetUrls.add(u));
  }

  const assetList = Array.from(assetUrls);
  const totalAssets = assetList.length;
  let cachedAssets = 0;

  for (let i = 0; i < totalAssets; i++) {
    const assetUrl = assetList[i];
    try {
      // first check if already in mod cache
      const cached = await cache.match(assetUrl);
      if (!cached) {
        // use no-cors for external domains to permit opaque asset caching
        const fetchOptions = assetUrl.startsWith('http') && !assetUrl.startsWith(window.location.origin)
          ? { mode: 'no-cors' }
          : {};
        const assetRes = await fetch(assetUrl, fetchOptions);
        if (assetRes.ok || assetRes.type === 'opaque') {
          await cache.put(assetUrl, assetRes);
        }
      }
      cachedAssets++;
    } catch (e) {
      console.warn(`[OfflineModManager] Could not cache asset: ${assetUrl}`, e);
    }

    const currentPercent = 50 + Math.floor((cachedAssets / (totalAssets || 1)) * 45);
    onProgress({
      step: 'assets',
      message: `Downloading assets (${cachedAssets}/${totalAssets})...`,
      percent: currentPercent,
      current: cachedAssets,
      total: totalAssets
    });
  }

  // register mod in offline saved list
  addOfflineModToRegistry(modName, {
    assetCount: cachedAssets,
    codeFilesCount: fetchedCodeCount + 1
  });

  onProgress({ step: 'done', message: `Mod "${modName}" successfully saved for offline play!`, percent: 100 });
  return true;
}

/**
 * remove an offline-saved mod from cache and registry
 * @param {string} modName
 */
async function deleteOfflineMod(modName) {
  if (!('caches' in window)) return false;

  const cache = await caches.open(CTS_MODS_CACHE);
  const safeFileName = modName.replace(/:/g, " -");
  const initUrl = `../static/mods/${safeFileName}_init.html`;

  // fetch or retrieve code 1 to find out what files were associated
  try {
    let code1Res = await cache.match(initUrl);
    if (!code1Res) {
      const absUrl = new URL(initUrl, window.location.href).href;
      code1Res = await cache.match(absUrl);
    }
    if (code1Res) {
      const code1Text = await code1Res.text();
      const { code2Files, endingFiles, questionSetFiles } = deriveCode2Filenames(code1Text, modName);
      const allFiles = [initUrl, ...code2Files, ...endingFiles, ...questionSetFiles];

      for (const f of allFiles) {
        await cache.delete(f);
        await cache.delete(new URL(f, window.location.href).href);
      }
    }
    await cache.delete(initUrl);
  } catch (e) {
    console.warn(`Error cleaning up cache entries for ${modName}:`, e);
  }

  removeOfflineModFromRegistry(modName);
  return true;
}

// start SW registration when script loads
registerCTSWorker();

// for usage across CTS
window.isModSavedOffline = isModSavedOffline;
window.saveModForOffline = saveModForOffline;
window.deleteOfflineMod = deleteOfflineMod;
window.getOfflineModList = getOfflineModList;
