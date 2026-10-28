const CACHE='glowroute-shell-v1-5-0';
const CORE=['./','./index.html','./styles.css','./app.js','./data.js','./optimizer.mjs','./importer.mjs','./projects.mjs','./catalogs.mjs','./directory.mjs','./tour.mjs','./routing.mjs','./directory/catalog.json','./manifest.webmanifest','./assets/icon.svg','./assets/icon-192.png','./assets/icon-512.png'];
const coreUrls=new Set(CORE.map(path=>new URL(path,self.registration.scope).href));
// One release-consistent shell. Activate only when all required assets are available.
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE.map(path=>new Request(path,{cache:'reload'})))).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('glowroute-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
 const req=event.request,url=new URL(req.url);
 if(req.method!=='GET'||url.origin!==self.location.origin)return;
 if(url.pathname.endsWith('/directory/catalog.json')){
  event.respondWith((async()=>{
   const cache=await caches.open(CACHE);
   try{
    const response=await fetch(req,{cache:'no-store',signal:AbortSignal.timeout(8000)});
    if(!response.ok)throw Error('Directory unavailable');
    await cache.put(req,response.clone());return response;
   }catch{
    const cached=await cache.match(req);if(!cached)return new Response('Directory unavailable',{status:503});
    const headers=new Headers(cached.headers);headers.set('X-GlowRoute-Cached','true');
    return new Response(await cached.arrayBuffer(),{status:200,headers});
   }
  })());return;
 }
 if(req.mode==='navigate'&&url.href.startsWith(self.registration.scope)){
  event.respondWith(caches.open(CACHE).then(cache=>cache.match('./index.html')).then(hit=>hit||fetch(req)));return;
 }
 if(coreUrls.has(url.href))event.respondWith(caches.open(CACHE).then(cache=>cache.match(req)).then(hit=>hit||fetch(req)));
 // Third-party tiles, geocoding, routing and unrelated data always use the network.
});
