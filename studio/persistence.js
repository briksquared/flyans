// Owner checkpoints are durable on disk. Spectators only pull those checkpoints.
export async function connectPersistence(api) {
  const cacheKey='flies-world-v1';
  let epoch=0;
  let token='',busy=false,stopped=false,ownsLease=false;
  let session;
  try{session=sessionStorage.getItem('flies-writer')||crypto.randomUUID();sessionStorage.setItem('flies-writer',session);}catch{session=crypto.randomUUID();}
  const status=document.getElementById('world-save');
  const setStatus=(text,kind)=>{
    if(status)status.textContent=text;
    try{
      let state='idle';
      if(kind)state=kind;
      else if(/another owner|take over/i.test(text||''))state='paused';
      else if(/needs attention|unavailable|failed|error/i.test(text||''))state='error';
      else if(/^Saved/i.test(text||''))state='saved';
      else if(/Saving|saving/i.test(text||''))state='saving';
      window.dispatchEvent(new CustomEvent('flyans-save-status',{detail:{state,message:text}}));
    }catch(_){}
  };
  let initial=null;
  try {
    const response=await fetch('/state',{cache:'no-store'});
    if(!response.ok)throw Error('State server unavailable');
    initial=await response.json();
    if(!api.readOnly){const res=await fetch('/session',{cache:'no-store'});if(!res.ok)throw Error('Save server unavailable');token=(await res.json()).token;}
  } catch(error){setStatus('Disk save unavailable · '+error.message);}
  if(!api.readOnly){
    // The DISK checkpoint is authoritative. Only fall back to the browser cache when the
    // disk save is unavailable — never let a stale localStorage snapshot (e.g. an old
    // pagehide cache) override a good disk save and "revert" the world to an older version.
    if(!initial){try{const cache=JSON.parse(localStorage.getItem(cacheKey));if(cache?.version===1)initial=cache;}catch{}}
  }
  epoch=initial?.worldEpoch||0;
  // CRITICAL: ready() MUST run even if restore throws. If it didn't, worldReady never became true —
  // the world stayed stuck on Era 1 and the loader never cleared (the "stays black, stays first era"
  // bug). Wrapping restore guarantees the world is revealed with whatever built, instead of hanging.
  if(initial){try{await api.restore(initial,true);}catch(error){console.error('World restore failed; revealing partial world:',error);try{setStatus('World restore hit an error · '+(error&&error.message||error));}catch(_){}}}
  try{api.ready();}catch(error){console.error('ready() failed:',error);}
  if(api.readOnly)setStatus(initial?'Spectator · camera controls only':'Spectator · waiting for owner checkpoint');

  function cache(){
    const state=api.capture();state.worldEpoch=epoch;state.savedAt=Date.now()/1000;
    try{localStorage.setItem(cacheKey,JSON.stringify(state));}catch{setStatus('Browser fallback unavailable; checking disk save');}
    return state;
  }
  async function save(){
    if(api.readOnly||busy||stopped)return false;
    if(!token){try{const res=await fetch('/session',{cache:'no-store'});if(res.ok)token=(await res.json()).token;}catch{}}
    if(!token){cache();setStatus('Browser fallback saved · disk server unavailable','error');return false;}
    const state=api.capture();state.worldEpoch=epoch;state.savedAt=Date.now()/1000;
    busy=true;
    try{window.dispatchEvent(new CustomEvent('flyans-saving'));}catch(_){}
    setStatus('Saving…','saving');
    try{
      const res=await fetch('/state',{method:'POST',headers:{'Content-Type':'application/json','X-Flies-Owner':token,'X-Flies-Session':session},body:JSON.stringify(state)});
      // Another tab currently holds the 12s writer lease. Do NOT stop for good —
      // just skip this save and keep trying; the lease expires on its own, so this
      // tab takes over automatically if the other one closes or crashes.
      if(res.status===409){ownsLease=false;setStatus('Another owner tab is saving · this tab will take over if that one closes','paused');return false;}
      if(!res.ok){const detail=await res.json().catch(()=>({}));throw Error(detail.error||('HTTP '+res.status));}
      const receipt=await res.json();ownsLease=true;
      try{localStorage.setItem(cacheKey,JSON.stringify({...state,savedAt:receipt.savedAt}));}catch{}
      const msg='Saved · layout '+(state.layoutRevision||1)+' · '+new Date(receipt.savedAt*1000).toLocaleTimeString();
      setStatus(msg,'saved');
      try{window.dispatchEvent(new CustomEvent('flyans-saved',{detail:{ok:true,message:msg}}));}catch(_){}
      return true;
    }catch(error){setStatus('Save needs attention · '+error.message,'error');try{window.dispatchEvent(new CustomEvent('flyans-saved',{detail:{ok:false,message:String(error.message||error)}}));}catch(_){}return false;}finally{busy=false;}
  }
  let applying=false,lastAppliedAt=null;
  const timer=setInterval(async()=>{
    if(!api.readOnly){await save();return;}
    if(applying)return;applying=true;
    try{const response=await fetch('/state',{cache:'no-store'});if(!response.ok)throw Error();const state=await response.json();if(state){
      // Only rebuild the world when the checkpoint actually changed — otherwise the spectator
      // was re-running the (time-sliced) restore every 2.5s on unchanged data (wasted work/churn).
      if(state.savedAt!==lastAppliedAt){lastAppliedAt=state.savedAt;await api.restore(state,false);}
      const age=Math.round(Date.now()/1000-state.savedAt);setStatus(`Spectator · ${age>15?'owner paused/offline · ':''}checkpoint ${age}s ago`);}}
    catch{setStatus('Spectator · connection interrupted; showing last checkpoint');}finally{applying=false;}
  },api.readOnly?2500:8000);
  addEventListener('pagehide',()=>{if(!api.readOnly&&!stopped)cache();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&!api.readOnly){cache();save();}});
  document.getElementById('save-world').addEventListener('click',save);
  if(!api.readOnly){
    const panel=document.createElement('details');panel.id='world-versions';
    panel.open=true;
    panel.innerHTML=`<summary>Save &amp; load world</summary>
      <p class="quiet">Your live world autosaves to disk while this tab is open and always stays open. Save named versions here and load any of them later — loading backs up the current world first.</p>
      <div class="save-controls"><input id="version-name" maxlength="80" placeholder="Name this version"><button id="version-create">💾 Save version</button></div>
      <div class="save-controls"><select id="version-list" aria-label="Saved versions"></select><button id="version-restore">📂 Load</button><button id="version-refresh" title="Refresh the version list">↻</button></div>
      <button id="version-save-now">Save current now</button>
      <p id="version-preview"></p><p id="version-message" role="status"></p>`;
    document.getElementById('community-panel').prepend(panel);
    const list=panel.querySelector('#version-list'),preview=panel.querySelector('#version-preview'),message=panel.querySelector('#version-message');let versions=[];
    const describe=()=>{const v=versions.find(v=>v.id===list.value);preview.textContent=v?`${new Date(v.createdAt*1000).toLocaleString()} · ${v.flies} flies · ${v.homes} homes · layout ${v.layout}`:'No named versions yet. Create one to preserve this moment.';};
    async function refresh(){try{const res=await fetch('/versions',{cache:'no-store'});if(!res.ok)throw Error('Could not load versions');versions=await res.json();list.replaceChildren(...versions.map(v=>new Option(v.label,v.id)));describe();}catch(e){message.textContent=e.message;}}
    async function write(path,data){const res=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-Flies-Owner':token,'X-Flies-Session':session},body:JSON.stringify(data)});const receipt=await res.json().catch(()=>({}));if(!res.ok)throw Error(receipt.error||('Version operation failed · HTTP '+res.status));return receipt;}
    panel.querySelector('#version-save-now').onclick=async()=>{message.textContent=await save()?'Current world saved to disk.':'Save did not complete. Check the save status.';};
    panel.querySelector('#version-refresh').onclick=refresh;list.onchange=describe;
    panel.querySelector('#version-create').onclick=async()=>{if(busy||stopped){message.textContent='Wait for the current save, or reload this paused owner tab.';return;}busy=true;try{const state=api.capture();state.worldEpoch=epoch;await write('/versions',{state,label:panel.querySelector('#version-name').value.trim()||'Manual snapshot'});await refresh();message.textContent='Named version saved to disk.';}catch(e){message.textContent=e.message;}finally{busy=false;}};
    panel.querySelector('#version-restore').onclick=async()=>{const v=versions.find(v=>v.id===list.value);if(!v||busy||stopped)return;if(!confirm(`Restore “${v.label}” (${v.flies} flies, ${v.homes} homes)? Your current world will be backed up first.\n\nThe page will reload so the restored world loads cleanly.`))return;busy=true;try{message.textContent='Restoring version — reloading the page…';await write('/restore-version',{id:v.id});stopped=true;ownsLease=false;localStorage.removeItem(cacheKey);try{sessionStorage.setItem('flies-restored-version','1');}catch{}location.reload();}catch(e){message.textContent=e.message;}finally{busy=false;}};
    await refresh();await save();
  }
  return {save,stop:()=>clearInterval(timer)};
}

// Local development only. Persist before reloading; never discard an unsaved recording/input.
export function watchLocalChanges(api){
  if(!['localhost','127.0.0.1'].includes(location.hostname))return;
  const files=['brains.json','maya-city.js','index.html','community.js','community-runtime.js','persistence.js','brain-view.js','observatory.css'];
  let baseline=null,busy=false,pending=null,stable=0;
  const status=document.createElement('span');status.id='local-update-status';status.textContent='Local updates on';document.getElementById('bar').append(status);
  async function poll(){
    if(busy)return;busy=true;
    try{
      const stamps=await Promise.all(files.map(async file=>{const res=await fetch(file,{method:'HEAD',cache:'no-store'});if(!res.ok)throw Error();return res.headers.get('Last-Modified')+':'+res.headers.get('Content-Length');}));
      const revision=JSON.stringify(stamps);
      if(!baseline){baseline=revision;return;}
      if(revision===baseline){pending=null;stable=0;return;}
      if(pending!==revision){pending=revision;stable=1;status.textContent='Local changes detected';return;}
      // Require the files to stay UNCHANGED for several polls (~16s) before reloading. A multi-file /
      // multi-step edit saves in bursts with brief quiet gaps; reloading after one quiet poll used to
      // catch a half-finished edit and black-screen the page. Waiting for real quiet fixes that.
      if(++stable < 4){status.textContent='Update settling…';return;}
      if(api.blocked()){status.textContent='Update ready · waiting for recording or input';return;}
      // Reload to pick up the new code EVEN IF this tab can't save. A tab that isn't the writer-lease
      // owner always fails to save (409) — gating the reload on save success left those tabs frozen on
      // stale code forever (never running new layout/cleanup passes). The authoritative world lives on
      // disk, written by the owner tab, so a non-owner has nothing worth preserving: just reload.
      const saved=await api.save();
      status.textContent=saved?'World saved · updating':'Reloading to latest (another tab owns the save)';
      location.reload();
    }catch{status.textContent='Local update check waiting for server';}finally{busy=false;}
  }
  poll();return setInterval(poll,4000);
}
