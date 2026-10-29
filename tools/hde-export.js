/* Run this complete file in the old application's browser console, on EACH device/profile.
 * Reads only hde-* storage and hde-memories/displays. No network, writes or deletion.
 * The resulting private archive includes photos omitted by ordinary display exports.
 */
(async()=>{
 const keys=['hde-displays','hde-favorites','hde-plan','hde-tours','hde-preferences'];
 const local={};for(const key of keys){const value=localStorage.getItem(key);if(value!==null)local[key]=value;}
 if(!Object.keys(local).length)throw Error('No Explorer data found on this origin/profile. Open the old app in the browser where you used it.');
 let absent=false;
 const db=await new Promise((resolve,reject)=>{
  const r=indexedDB.open('hde-memories');
  r.onupgradeneeded=()=>{absent=true;r.transaction.abort();};
  r.onsuccess=()=>resolve(r.result);
  r.onerror=()=>absent?resolve(null):reject(Error('Could not read memories. Backup incomplete; keep the old browser data.'));
  r.onblocked=()=>reject(Error('Memories database is blocked. Close other old-app tabs and retry.'));
 });
 let memoryKeys=[],values=[],storePresent=false;
 try{
  if(db){
   storePresent=db.objectStoreNames.contains('displays');
   if(!storePresent)throw Error('Unexpected memory database layout. Backup incomplete.');
   await new Promise((resolve,reject)=>{
    const tx=db.transaction('displays','readonly'),store=tx.objectStore('displays'),ks=store.getAllKeys(),vs=store.getAll();
    ks.onsuccess=()=>memoryKeys=ks.result;vs.onsuccess=()=>values=vs.result;
    tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(Error('Memory read failed. Backup incomplete.'));
   });
  }
 }finally{db?.close();}
 if(memoryKeys.length!==values.length)throw Error('Memory count mismatch; keep the old browser data.');
 const archive={kind:'hde-private-archive',version:1,exportedAt:new Date().toISOString(),origin:location.origin,path:location.pathname,localStorage:local,memories:{storePresent,keys:memoryKeys,values}};
 const blob=new Blob([JSON.stringify(archive,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=`holiday-display-explorer-private-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
 const photos=values.reduce((n,v)=>n+(Array.isArray(v?.photos)?v.photos.length:0),0);
 console.info(`Private archive downloaded: ${Object.keys(local).length} storage keys, ${values.length} display memories, ${photos} photos. Verify the downloaded file before retiring anything. Nothing was deleted.`);
 return {storageKeys:Object.keys(local).length,memories:values.length,photos};
})();
