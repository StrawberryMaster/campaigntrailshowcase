const CORE_CACHE_NAME = 'cts-core-v1';
const MODS_CACHE_NAME = 'cts-mods-cache-v1';

// base assets
const CORE_STATIC_ASSETS = [
  '/',
  '/index.html',
  '/campaign-trail/',
  '/campaign-trail/index.html',
  '/static/34starcircle-2.png',
  '/static/showcase-fav.png',
  '/static/amusa_main_2016032801.css',
  '/static/css/community.css',
  '/static/images/banners/tct_banner.webp',
  '/static/images/banners/banner_classic.png',
  '/static/images/backgrounds/tct_background.jpg',
  '/static/mods/mods.json',
  '/static/json/election.json',
  '/static/json/candidate.json',
  '/static/json/running_mate.json',
  '/static/json/opponents.json',
  '/static/json/election_list.json',
  '/static/js/lib/raphael.js',
  '/static/js/lib/md5.js',
  '/static/js/lib/gradient.js',
  '/static/js/lib/pako.js',
  '/static/js/indexCode.js',
  '/static/js/customThemeCode.js',
  '/static/js/modLoaderCode.js',
  '/static/js/cheats.js',
  '/static/js/consoleCheats.js',
  '/static/js/achievements.js',
  '/static/js/sea_to_sea.js',
  '/static/js/campaign_trail.js',
  '/static/js/remote.js',
  '/static/js/mobileStyle.js',
  '/static/js/variableChanges.js',
  '/static/js/offlineModManager.js',
  '/static/js/us-map-1.0.1/jquery.usmap.js',
  '/static/js/us-map-1.0.1/jquery.usmap_1844.js',
  '/static/js/us-map-1.0.1/jquery.usmap_1860.js',
  // external libraries also used
  'https://code.jquery.com/jquery-4.0.0.min.js',
  'https://code.jquery.com/ui/1.14.1/jquery-ui.min.js',
  'https://code.jquery.com/ui/1.14.1/themes/base/jquery-ui.css'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CORE_CACHE_NAME).then(async (cache) => {
      // so that missing optional assets or network hitches don't fail the whole install
      const fetchPromises = CORE_STATIC_ASSETS.map(async (url) => {
        try {
          const res = await fetch(url, { cache: 'reload' });
          if (res.ok || res.type === 'opaque') {
            await cache.put(url, res);
          }
        } catch (err) {
          console.warn('[SW] Could not pre-cache during install:', url, err);
        }
      });
      await Promise.allSettled(fetchPromises);
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CORE_CACHE_NAME && key !== MODS_CACHE_NAME) {
            console.log('[SW] Removing legacy cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// fetch strategy
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // ignore analytics et al.
  if (
    url.hostname.includes('google-analytics') ||
    url.hostname.includes('googletagmanager') ||
    url.hostname.includes('herokuapp.com') ||
    url.protocol.startsWith('chrome-extension')
  ) {
    return;
  }

  event.respondWith(
    (async () => {
      // check mod cache first
      const modsCache = await caches.open(MODS_CACHE_NAME);
      const modCachedResponse = await modsCache.match(request);
      if (modCachedResponse) {
        return modCachedResponse;
      }

      // also try matching ignoring search params if applicable
      const modCachedLoose = await modsCache.match(request, { ignoreSearch: false });
      if (modCachedLoose) {
        return modCachedLoose;
      }

      // check core cache
      const coreCache = await caches.open(CORE_CACHE_NAME);
      const coreCachedResponse = await coreCache.match(request);
      if (coreCachedResponse) {
        // fetch update in background
        if (url.origin === self.location.origin) {
          fetch(request).then((networkRes) => {
            if (networkRes && networkRes.ok) {
              coreCache.put(request, networkRes);
            }
          }).catch(() => {/* offline, ignore */});
        }
        return coreCachedResponse;
      }

      // try network
      try {
        const networkResponse = await fetch(request);
        // if it's a core asset of our origin (e.g. questionset html, images), cache it to core
        if (networkResponse && networkResponse.ok && url.origin === self.location.origin) {
          if (
            url.pathname.includes('/static/') ||
            url.pathname.endsWith('.html') ||
            url.pathname.endsWith('.js') ||
            url.pathname.endsWith('.css') ||
            url.pathname.endsWith('.json')
          ) {
            coreCache.put(request, networkResponse.clone());
          }
        }
        return networkResponse;
      } catch (err) {
        // offline fallback
        // if navigation request fails offline, fallback to /campaign-trail/index.html
        if (request.mode === 'navigate') {
          const fallback = await coreCache.match('/campaign-trail/index.html');
          if (fallback) return fallback;
        }

        // return empty 503 or empty image/audio if network failed
        console.warn('[SW] Fetch failed and no cache available:', request.url);
        return new Response('Offline resource not saved.', {
          status: 503,
          statusText: 'Service unavailable (offline)'
        });
      }
    })()
  );
});
