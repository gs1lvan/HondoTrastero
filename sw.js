/* HondoTrastero: service worker minimo para instalacion PWA en Android.
 * No almacena en cache sesiones, fotos ni datos de Supabase.
 * Requiere conexion a Internet, igual que la web original.
 */
'use strict';
self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (new URL(event.request.url).origin !== self.location.origin) return;
  // Fetch handler sin cache: no se muestran inventarios obsoletos.
  event.respondWith(fetch(event.request));
});
