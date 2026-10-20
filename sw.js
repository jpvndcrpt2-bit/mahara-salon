const CK='mahara-ai-v1';
self.addEventListener('install',e=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||!/\/(models|mp)\//.test(u.pathname))return;
e.respondWith(caches.open(CK).then(async c=>{const hit=await c.match(e.request.url);if(hit)return hit;const r=await fetch(e.request);if(r.ok&&r.status===200)c.put(e.request.url,r.clone());return r}))});
