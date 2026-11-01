import * as THREE from 'three';
import {ACTIONS,housingPlan,parseLocalCommand,turnToward,normalizeBuildQueue,chooseExpansion,chooseCareAction,summarizeWellbeing} from './community.js?v=1.8.0';

// Unique id with a fallback: crypto.randomUUID throws outside a secure context (e.g. a plain-http LAN IP),
// which would break every batch/research id there. localhost is secure, but guard anyway.
const _uid=()=> (typeof crypto!=='undefined'&&crypto.randomUUID) ? crypto.randomUUID() : 'id-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);

export function createCommunity(api) {
  const savedKey='flies-community-v1';
  let saved={version:1,skills:{},history:[],homes:[],ui:0};
  try {const value=JSON.parse(localStorage.getItem(savedKey));if(value?.version===1)saved={...saved,...value};}catch{}
  const history=Array.isArray(saved.history)?saved.history.slice(-40):[];
  const skills=saved.skills||{};
  // Learning economy: learn[role][jobId] = proficiency 0..1. Every ACTION is a
  // teachable job, so this scales to as many jobs as the warehouse ever holds.
  const learn=saved.learn||{};
  const wellbeing=saved.wellbeing||{};
  const ALL_JOBS=ACTIONS.map(a=>a.id);
  const mastery=(role,job)=>(learn[role]&&learn[role][job])||0;
  let clock=0,nextCare=2,nextSave=5,lastHousing='',nextEffect=0,batch=null,maintenance=true,uiPass=0,nextTeach=4,allHands=false;
  // Rites & weather: automatic weather the owner can bias, a daily worship gathering, and
  // equinox / eclipse ceremonies. weatherAuto rolls the dice on rainChance; holdRite()
  // gathers a big group to worship (and equinox/eclipse rites tie to the sky).
  let weatherAuto=true,rainChance=0.06,nextWeather=90,nextRite=70,riteDay=0,eclipseUntil=0;
  // NOTE: 'temple-build' is deliberately NOT here — the temples are a fixed set (the ring). Flies
  // building endless pyramids (often on the sacred roads) was the problem. They build homes,
  // workshops, gardens, stages, recreation and maintain; temples only via an explicit command.
  const buildJobs=['house-build','workshop-build','garden-build','stage-build','recreation-build','repair-home','furnish','clean'];
  // Once the city is big, all-night crews switch from raw construction to maintaining,
  // furnishing, training/teaching and devotion — so it keeps progressing overnight
  // without endlessly growing the scene into a crash.
  const sustainJobs=['repair-home','furnish','clean','teach-neighbor','teach-building','circuit-study','worship','star-study','make-art','exercise','social-hour','explore','harmony','rehearse'];
  const NIGHT_HOME_CAP=1400; // fewer HOUSES now that each one holds two flies (was 2400)
  let PER_HOME=1;            // flies per home — ONE per household (was 4). Lowering it sheds the surplus
                             // (flies leave to settle elsewhere — nothing is harmed); raising it repopulates
                             // the existing homes. Adjust live with the command "N per home" / "N per household".
  const POP_CAP=6000;        // raised so the colony grows to fill homes 4-deep (perf governor handles the load)
  // All-hands-on-deck: everyone works, nonstop, top speed, until the owner stands it down.
  function setAllHands(on){
    allHands=on;
    if(on){
      // Dispatch EVERY fly to construction right now via the proven build-everywhere path,
      // then keep them there: fast pace, all workers, queue kept full by step().
      buildEverywhere();
      maintenance=true;wholeLife=true;config.workers=Math.max(config.workers,80);config.pace=1;api.resume();nextRoutine=clock;nextCare=clock;nextNightRefill=clock;
      for(const [k,c] of Object.entries({home:24,workshop:10,garden:10,stage:5,recreation:5}))ensureQueued(k,c);}
    paintPlanner();
    const b=document.getElementById('all-hands');if(b){b.classList.toggle('on',on);b.textContent=on?'🐝 All hands: ON (working nonstop)':'🐝 All hands on deck';}
    report('All hands',on?`Every fly to work — nonstop, top speed, for the good of the colony (${api.crew().length} flies).`:'All hands stood down. Flies return to a balanced life.');
    return allHands;
  }
  // Train hard workers, bee-style: every work assignment raises a fly's work ethic.
  // High-ethic flies deplete slower (work longer before needing rest) and, in the normal
  // balanced routine, choose work over leisure more often — dedication for the colony.
  function workEthic(body){const w=body.g.userData;w.ethic=Math.min(1,(w.ethic||0)+0.008);}
  let wholeLife=saved.wholeLife!==false,nextRoutine=1,routineCycle=0,nextExpansion=20,needsElapsed=0,nextAstro=30,nextHousing=0,nextNightRefill=0,nextShrine=60;
  // Default "life" priority = everyday autonomy (furnish/clean/teach/art) without endless sprawl.
  // busyFrac ~30% keeps the city visibly alive; capped later for perf.
  const config={priority:'life',pace:12,levels:4,workers:6,panelWidth:310,textSize:11,liveColony:true,busyFrac:0.3};
  let nextSocial=8, nextDayBeat=12, nextWeatherReact=0, nextFestPulse=55, nextVisit=18, nextLake=28, nextApprentice=22, lastBeatLabel='', lastWeather='';
  let lightBrightness=0.75;
  const research={studies:0,trials:0,improvements:0,pending:[],records:[],methods:{},tested:{}};
  const queue=[];let researchCycle=0;let cycle=0,syncing=false;
  function enqueueBuild(kind,count){const row=queue.find(j=>j.kind===kind);if(row)row.count=Math.min(100,row.count+count);else queue.push({kind,count:Math.min(100,count)});}
  function ensureQueued(kind,count){const row=queue.find(j=>j.kind===kind);if(!row)queue.push({kind,count});else row.count=Math.max(row.count,count);}
  let nextDesign=4;
  const design={enabled:true,ui:[],environment:[],audits:0,repairs:0,lastAudit:'Awaiting inspection'};
  const panel=document.getElementById('community-panel');
  const routinePanel=document.createElement('details');routinePanel.id='whole-life-planner';routinePanel.open=true;
  routinePanel.innerHTML='<summary>Self-directed daily life</summary><label><input id="whole-life-auto" type="checkbox" checked> Run work, education, meals, sleep and mindfulness automatically</label><p id="routine-status" role="status"></p><p id="desire-status" role="status"></p><p>Needs are tracked per fly. Hungry or tired residents leave work before receiving another assignment.</p>';
  panel.querySelector('#planner-controls').after(routinePanel);
  routinePanel.querySelector('#whole-life-auto').onchange=e=>{wholeLife=e.target.checked;paintRoutine();};
  const teamPanel=document.createElement('details');teamPanel.id='design-teams';teamPanel.open=true;
  teamPanel.innerHTML='<summary>UI & environment teams</summary><label><input id="design-enabled" type="checkbox" checked> Run dedicated maintenance and research</label><p id="design-roster"></p><p id="design-audit" role="status"></p><button id="design-inspect" type="button">Inspect UI now</button><p>Local checks and measured building trials. These flies do not rewrite source code or research the web.</p>';
  panel.querySelector('header').after(teamPanel);
  teamPanel.querySelector('#design-enabled').onchange=e=>{design.enabled=e.target.checked;};
  teamPanel.querySelector('#design-inspect').onclick=()=>guiWork('UI team');
  function assignDesignTeams(){
    const crew=api.crew(),valid=ids=>ids.filter(id=>crew.some(b=>b.g.userData.role===id));
    design.ui=valid(design.ui);design.environment=valid(design.environment);
    for(const [kind,roles] of [['ui',api.uiCrew()],['environment',api.environmentCrew()]]){
      for(const body of [...roles,...crew]){if(design[kind].length>=2)break;const id=body.g.userData.role;if(!design.ui.includes(id)&&!design.environment.includes(id))design[kind].push(id);}
    }
    const describe=ids=>ids.map(id=>{const b=crew.find(b=>b.g.userData.role===id);return b?`${b.g.userData.name}: ${b.ritual?.action.label||'available'}`:id;}).join(' · ');
    teamPanel.querySelector('#design-roster').textContent=`UI — ${describe(design.ui)}. Environment — ${describe(design.environment)}.`;
    teamPanel.querySelector('#design-audit').textContent=`${design.audits} UI inspections · ${design.repairs} repairs. ${design.lastAudit}`;
  }

  const feed=document.getElementById('work-feed');
  function report(who,message){
    history.push({who,message,time:new Date().toISOString()});if(history.length>40)history.shift();
    api.note('community',`${who}: ${message}`);paintFeed();
  }
  function paintFeed(){feed.replaceChildren();for(const item of history.slice(-5).reverse()){
    const row=document.createElement('li');row.textContent=`${item.who} · ${item.message}`;feed.append(row);
  }}
  function save(){
    try{localStorage.setItem(savedKey,JSON.stringify({version:1,skills,learn,wellbeing,wholeLife,history,homes:api.homes().filter(s=>s.residentialNew).map(s=>({key:s.key,x:s.x,z:s.z,r:s.r,h:s.h})),ui:uiPass}));document.getElementById('save-state').textContent='Progress saved in this browser';}
    catch{document.getElementById('save-state').textContent='Browser storage unavailable; progress is session-only';}
  }
  const categories=[...new Set(ACTIONS.map(a=>a.category))];let category='Temple';
  const tabs=document.getElementById('action-tabs'),list=document.getElementById('action-list'),search=document.getElementById('action-search');
  function paintActions(){
    list.replaceChildren();const query=search.value.trim().toLowerCase();
    for(const action of ACTIONS.filter(a=>query?`${a.label} ${a.category}`.toLowerCase().includes(query):a.category===category)){
      const button=document.createElement('button');button.textContent=action.label;button.dataset.action=action.id;
      button.title=['build','furnish','repair','plant','clean','gui','survey'].includes(action.effect)?'Changes or inspects the community':'Simulated activity; records practice and participation';
      button.addEventListener('click',()=>issue(action.id));list.append(button);
    }
    for(const button of tabs.children){button.classList.toggle('on',button.textContent===category&&!query);button.setAttribute('aria-pressed',String(button.classList.contains('on')));}
  }
  for(const name of categories){const b=document.createElement('button');b.textContent=name;b.addEventListener('click',()=>{category=name;search.value='';paintActions();});tabs.append(b);}
  search.addEventListener('input',paintActions);paintActions();paintFeed();
  document.getElementById('actions-toggle').addEventListener('click',()=>{panel.hidden=!panel.hidden;});
  document.getElementById('actions-close').addEventListener('click',()=>{panel.hidden=true;});
  document.getElementById('auto-care').addEventListener('change',e=>{maintenance=e.target.checked;paintPlanner();});
  const commandResult=document.getElementById('command-result');
  function applyDisplay(){
    document.getElementById('lab').style.width=Math.min(config.panelWidth,innerWidth-40)+'px';
    document.documentElement.style.setProperty('--reading-size',config.textSize+'px');
    document.getElementById('display-width').value=config.panelWidth;document.getElementById('display-size').value=config.textSize;api.fit();
  }
  document.getElementById('display-width').addEventListener('input',e=>{config.panelWidth=+e.target.value;applyDisplay();});
  document.getElementById('display-size').addEventListener('change',e=>{config.textSize=+e.target.value;applyDisplay();});
  function paintPlanner(){
    document.getElementById('auto-care').checked=maintenance;
    document.getElementById('planner-priority').value=config.priority;
    document.getElementById('planner-pace').value=config.pace;
    document.getElementById('hive-levels').value=config.levels;
    document.getElementById('planner-workers').value=config.workers;
    document.getElementById('planner-status').textContent=`${maintenance?'Automatic work on':'Automatic work off'} · ${queue.reduce((n,j)=>n+j.count,0)} buildings queued · ${config.priority}`;
  }
  function needs(body){
    const role=body.g.userData.role;
    if(!wellbeing[role]){let h=0;for(const c of role)h=(h*33+c.charCodeAt(0))>>>0;const n=(h%37)/100;wellbeing[role]={energy:.58+n,satiety:.62+n*.7,calm:.6+n*.8,lastRoutine:0};}
    return wellbeing[role];
  }
  function paintRoutine(){
    routinePanel.querySelector('#whole-life-auto').checked=wholeLife;
    const crew=api.crew(),active=crew.filter(b=>b.ritual),ids=active.map(b=>b.ritual.action.id);
    const count=set=>ids.filter(id=>set.has(id)).length;
    const training=new Set(['teach-neighbor','teach-building','teach-music','teach-circuits','circuit-study','panel-design','cnc-machine','laser-cut','3d-print','electronics-maker','hobby-maker','textile-maker']);
    const health=summarizeWellbeing(crew.map(needs)),pct=value=>Math.round(value*100)+'%';
    routinePanel.querySelector('#routine-status').textContent=`${wholeLife?'Self-directed schedule on':'Self-directed schedule paused'} · ${count(new Set(['house-build','workshop-build','garden-build','stage-build','recreation-build','temple-build','repair-home','furnish','clean']))} building/maintaining · ${count(training)} training · ${count(new Set(['nap']))} sleeping · ${count(new Set(['feast']))} eating · ${count(new Set(['meditate']))} mindful · wellbeing: ${pct(health.energy)} energy, ${pct(health.satiety)} fed, ${pct(health.calm)} calm, ${health.critical} need care`;
    desiredExpansion();
  }
  const trainingJobs=['teach-neighbor','teach-building','teach-music','teach-circuits','circuit-study','panel-design','cnc-machine','laser-cut','3d-print','electronics-maker','hobby-maker','textile-maker'];
  const steadyWork=['repair-home','furnish','clean','gui-audit','electronics-maker','hobby-maker','textile-maker'];
  const leisureJobs=['play-games','make-art','exercise','social-hour','explore','groom','stretch','read','dance','jam','welcome','feast','compose','listen-take','council'];
  const socialPulseJobs=['social-hour','explore','dance','jam','play-games','exercise','welcome','feast','assemble','festival'];
  // Temple devotion the flies perform on their OWN, rotating across every temple:
  // main forecourt (worship/chant/sacrifice/offering), the lake, the Earth/astronomy
  // temple (star-study/sky-chart), the West temple, and the elder alien ruins.
  const devotionJobs=['worship','chant','offering','bug-sacrifice','water-worship','star-study','sky-chart','astronomy','astrology','west-rite','procession','vigil','heal','moon-rite'];
  // Only PRIESTS leave their work to worship on their own — a stable ~1-in-8 clergy (plus anyone who
  // carries a priestly title). Everyone else just keeps working; worship no longer pulls the whole colony.
  // (Rites the OWNER explicitly calls still gather everyone — see the forced path in holdRite/issue.)
  function isPriest(body){ const u=body&&body.g&&body.g.userData; if(!u)return false;
    if(u.priest!=null)return u.priest;
    if(u.title&&/priest|shaman|elder|starwatcher|chronicler|voice of|high /i.test(u.title))return (u.priest=true);
    const s=String(u.role||u.name||''); let h=0; for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))>>>0;
    return (u.priest=((h%8)===0)); }
  function desiredExpansion(){
    const next=chooseExpansion(api.communityCounts(),api.crew().length);
    routinePanel.querySelector('#desire-status').textContent=`Community choice: next ${next.kind} · ${next.count}/${next.goal} baseline spaces. Open land is allowed; water, mountains, plazas and occupied lots are protected.`;return next.kind;
  }
  function updateNeeds(dt){
    for(const body of api.crew()){
      const n=needs(body),id=body.ritual?.action.id;
      const drain=1-0.55*(body.g.userData.ethic||0); // trained hard workers deplete slower
      n.energy=Math.max(0,Math.min(1,n.energy+((id==='nap'||id==='heal'||(!body.ritual&&body.mode==='sleep')) ? .045 : -.0015*drain)*dt));
      n.satiety=Math.max(0,Math.min(1,n.satiety+((id==='feast'||id==='heal'||(!body.ritual&&body.mode==='eat')) ? .05 : -.0012*drain)*dt));
      n.calm=Math.max(0,Math.min(1,n.calm+((id==='meditate'||id==='heal'||id==='moon-rite'||leisureJobs.includes(id)||(!body.ritual&&body.mode==='rest')) ? .04 : -.0008*drain)*dt));
    }
  }
  function skyIsNight(){
    if(typeof api.isNight==='function')return !!api.isNight();
    const hr=api.hour?api.hour():15;
    return hr<6.5||hr>=19.5;
  }
  /** Small spontaneous gatherings so idle pockets of the city keep meeting up on their own. */
  function pulseSocialLife(){
    if(config.liveColony===false||!api.ready()||allHands)return;
    if(skyIsNight())return; // night is for roosting, not street parties
    const free=api.crew().filter(b=>!b.ritual&&(!b.ordered||b.ordered==='grounds')&&b.mode!=='sleep');
    if(free.length<3)return;
    const size=Math.min(free.length,3+((Math.random()*6)|0));
    // Prefer a spatial cluster so they look like neighbors meeting, not a teleport lottery.
    const seed=free[(Math.random()*free.length)|0];
    free.sort((a,b)=>Math.hypot(a.x-seed.x,a.z-seed.z)-Math.hypot(b.x-seed.x,b.z-seed.z));
    const group=free.slice(0,size);
    const id=socialPulseJobs[(Math.random()*socialPulseJobs.length)|0];
    issue(id,group,true);
    if(batch){batch.automatic=true;batch.routine=true;}
    for(const body of group){if(body.ritual)body.ritual.dwell=Math.min(body.ritual.dwell||12,14);}
  }
  /** Hour-of-day script: wake / market rush / craft afternoon / evening music / roost. */
  function pulseDayBeat(){
    if(config.liveColony===false||!api.ready()||allHands)return;
    const hr=api.hour?api.hour():15;
    const night=skyIsNight();
    let pool, size, label=null, land=null;
    if(night){ pool=['nap','meditate','read','heal','vigil']; size=8; label='Twilight roost'; }
    else if(hr<10){ pool=['stretch','groom','plant','exercise','clean','welcome']; size=6; label='Morning stretch'; }
    else if(hr<14){ pool=['feast','social-hour','explore','welcome','play-games','council']; size=10; label='Market hour'; land='market'; }
    else if(hr<17){ pool=['teach-neighbor','circuit-study','hobby-maker','make-art','harmony','textile-maker']; size=7; label='Afternoon craft'; }
    else { pool=['rehearse','dance','jam','feast','perform','soundcheck']; size=8; label='Evening gathering'; }
    const free=api.crew().filter(b=>!b.ritual&&(!b.ordered||b.ordered==='grounds')&&(night||b.mode!=='sleep'));
    if(free.length<2)return;
    const n=Math.min(free.length,size);
    const seed=free[(Math.random()*free.length)|0];
    free.sort((a,b)=>Math.hypot(a.x-seed.x,a.z-seed.z)-Math.hypot(b.x-seed.x,b.z-seed.z));
    const group=free.slice(0,n);
    const id=pool[(Math.random()*pool.length)|0];
    issue(id,group,true);
    if(batch){batch.automatic=true;batch.routine=true;}
    const spot=land&&api.landmark?api.landmark(land):null;
    for(let i=0;i<group.length;i++){
      const body=group[i]; if(!body.ritual)continue;
      body.ritual.dwell=night?18:Math.min(body.ritual.dwell||14,16);
      if(spot){
        const a=i*2.39996, r=4+Math.sqrt(i)*1.1;
        body.ritual.target={x:spot.x+Math.cos(a)*r,z:spot.z+Math.sin(a)*r,y:spot.y||0};
      }
    }
    if(label&&label!==lastBeatLabel){ lastBeatLabel=label; report('Day',label+' — the colony keeps its own hours.'); }
  }
  /** Pair visits: a fly walks to a neighbor's home for a short welcome/social. */
  function pulseNeighborVisit(){
    if(config.liveColony===false||!api.ready()||allHands||skyIsNight()||rainingNow())return;
    const free=api.crew().filter(b=>!b.ritual&&(!b.ordered||b.ordered==='grounds')&&b.mode!=='sleep'&&b.home);
    if(free.length<2)return;
    const host=free[(Math.random()*free.length)|0];
    const guests=free.filter(b=>b!==host).sort((a,b)=>Math.hypot(a.x-host.x,a.z-host.z)-Math.hypot(b.x-host.x,b.z-host.z)).slice(0,1+((Math.random()*2)|0));
    if(!guests.length)return;
    const group=[host,...guests];
    issue('welcome',group,true);
    if(batch){batch.automatic=true;batch.routine=true;}
    const home=api.destination(host.home||'lounge');
    for(let i=0;i<group.length;i++){
      const body=group[i]; if(!body.ritual||!home)continue;
      const a=i*2.39996,r=1.2+Math.sqrt(i)*0.6;
      body.ritual.target={x:home.x+Math.cos(a)*r,z:home.z+Math.sin(a)*r,y:home.y||0};
      body.ritual.dwell=10;
    }
  }
  /** Lake outing — explore/stretch by the water when the weather is fair. */
  function pulseLakeOuting(){
    if(config.liveColony===false||!api.ready()||allHands||skyIsNight()||rainingNow())return;
    const free=api.crew().filter(b=>!b.ritual&&(!b.ordered||b.ordered==='grounds')&&b.mode!=='sleep');
    if(free.length<3)return;
    const n=Math.min(free.length,4+((Math.random()*5)|0));
    free.sort(()=>Math.random()-0.5);
    const group=free.slice(0,n);
    const id=['explore','stretch','meditate','read','groom'][(Math.random()*5)|0];
    issue(id,group,true);
    if(batch){batch.automatic=true;batch.routine=true;}
    const spot=api.landmark?api.landmark('lake'):null;
    for(let i=0;i<group.length;i++){
      const body=group[i]; if(!body.ritual)continue;
      body.ritual.dwell=14;
      if(spot){
        const a=i*2.39996,r=8+Math.sqrt(i)*2.2;
        body.ritual.target={x:spot.x+Math.cos(a)*r,z:spot.z+Math.sin(a)*r,y:0};
      }
    }
    if(Math.random()<0.35)report('Outing','Flies gather by the lake.');
  }
  /** Apprenticeship: a skilled teacher pulls nearby learners into a lesson. */
  function pulseApprentice(){
    if(config.liveColony===false||!api.ready()||allHands||skyIsNight())return;
    const free=api.crew().filter(b=>!b.ritual&&(!b.ordered||b.ordered==='grounds')&&b.mode!=='sleep');
    if(free.length<3)return;
    let teacher=null,best=0;
    for(const b of free){
      const role=b.g.userData.role; let s=0;
      for(const j of ALL_JOBS)s+=mastery(role,j);
      if(s>best){best=s;teacher=b;}
    }
    if(!teacher)return;
    const learners=free.filter(b=>b!==teacher).sort((a,b)=>Math.hypot(a.x-teacher.x,a.z-teacher.z)-Math.hypot(b.x-teacher.x,b.z-teacher.z)).slice(0,2+((Math.random()*3)|0));
    if(!learners.length)return;
    const id=['teach-neighbor','teach-building','teach-music','teach-circuits','circuit-study'][(Math.random()*5)|0];
    issue(id,[teacher,...learners],true);
    if(batch){batch.automatic=true;batch.routine=true;}
    for(const body of [teacher,...learners]){if(body.ritual)body.ritual.dwell=16;}
  }
  function rainingNow(){
    if(typeof api.weather==='function'){ const w=String(api.weather()||''); return w==='rain'||w==='storm'; }
    return false;
  }
  /** React when weather flips — shelter in rain, stretch when skies clear. */
  function pulseWeatherReact(){
    if(config.liveColony===false||!api.ready()||allHands)return;
    const rain=rainingNow();
    const key=rain?'rain':'clear';
    if(key===lastWeather)return;
    lastWeather=key;
    const free=api.crew().filter(b=>!b.ritual&&(!b.ordered||b.ordered==='grounds')&&b.mode!=='sleep');
    if(free.length<4)return;
    const n=Math.min(free.length,rain?14:10);
    free.sort(()=>Math.random()-0.5);
    const group=free.slice(0,n);
    const id=rain
      ? (['nap','clean','furnish','read','meditate','heal'][(Math.random()*6)|0])
      : (['stretch','explore','plant','groom','exercise','welcome'][(Math.random()*6)|0]);
    issue(id,group,true);
    if(batch){batch.automatic=true;batch.routine=true;}
    for(const body of group){if(body.ritual)body.ritual.dwell=rain?12:10;}
    report('Weather',rain?'Rain — flies duck indoors.':'Skies clear — flies stretch their wings.');
  }
  /** Occasional spontaneous celebration so the city feels festive without owner commands. */
  function pulseFestivalLife(){
    if(config.liveColony===false||!api.ready()||allHands||skyIsNight()||rainingNow())return;
    if(Math.random()>0.42)return;
    const free=api.crew().filter(b=>!b.ritual&&(!b.ordered||b.ordered==='grounds')&&b.mode!=='sleep');
    if(free.length<6)return;
    const n=Math.min(free.length,8+((Math.random()*10)|0));
    const seed=free[(Math.random()*free.length)|0];
    free.sort((a,b)=>Math.hypot(a.x-seed.x,a.z-seed.z)-Math.hypot(b.x-seed.x,b.z-seed.z));
    const group=free.slice(0,n);
    const id=['dance','festival','feast','jam','perform','assemble','social-hour'][(Math.random()*7)|0];
    issue(id,group,true);
    if(batch){batch.automatic=true;batch.routine=true;}
    for(const body of group){if(body.ritual)body.ritual.dwell=Math.min(body.ritual.dwell||20,22);}
    report('Festival','A spontaneous gathering breaks out in the colony.');
  }
  function scheduleWholeLife(){
    if(!wholeLife||!api.ready())return;
    const crew=api.crew(),lifeBias=config.liveColony!==false&&(config.priority==='life'||config.priority==='balanced');
    const target=allHands?crew.length:Math.ceil(crew.length*(lifeBias?0.9:0.86));
    // A previous "build everywhere" order may occupy nearly the whole colony.
    // Gradually rotate only automatic construction crews into the balanced
    // schedule; direct user-assigned jobs are never preempted here. (Never in all-hands.)
    if(!allHands){
      const activeNow=crew.filter(b=>b.ritual),trainingNow=activeNow.filter(b=>trainingJobs.includes(b.ritual.action.id)).length;
      if(activeNow.length>=target&&trainingNow<target*.2){
        const rotate=activeNow.filter(b=>b.ritual.batch?.automatic&&!b.ritual.batch?.routine&&(b.ritual.batch?.total||0)>24&&['house-build','workshop-build','garden-build','stage-build','recreation-build','temple-build'].includes(b.ritual.action.id)).slice(0,24);
        for(const body of rotate)cancel(body);
      }
    }
    const slotCap=allHands?96:(lifeBias?64:40);
    const active=crew.filter(b=>b.ritual).length,slots=Math.min(slotCap,Math.max(0,target-active));if(!slots){paintRoutine();return;}
    const available=crew.filter(b=>!b.ritual&&(!b.ordered||b.ordered==='grounds')).sort((a,b)=>needs(a).lastRoutine-needs(b).lastRoutine).slice(0,slots);
    const groups=new Map();
    available.forEach((body,index)=>{
      const n=needs(body);let id;
      if(allHands){const grown=api.homes().length>=NIGHT_HOME_CAP;const pool=grown?sustainJobs:buildJobs;id=pool[(routineCycle+index)%pool.length];workEthic(body);} // nonstop work; caps growth then maintains/trains
      else{id=chooseCareAction(n);
      if(!id){
        const rhythmOn=(typeof window==='undefined')||window.FLY_FEAT?.dayRhythm!==false;   // user-toggleable daily rhythm
        const night=rhythmOn&&skyIsNight();   // clock OR dark sky presets (hour is clamped for sun math)
        const priest=isPriest(body);
        if(night){ id=(priest&&index%4===0)?devotionJobs[(routineCycle+index)%devotionJobs.length]:'nap'; } // night: everyone sleeps; only a priest keeps a moonlit vigil
        else if(rainingNow()&&index%3!==0){ // rain: most flies stay indoors; a few still tend grounds
          id=['nap','clean','furnish','read','meditate','hobby-maker','textile-maker','circuit-study'][(routineCycle+index)%8];
        }
        else{const phase=(routineCycle+index)%12;
          if(phase<2)id=trainingJobs[(routineCycle+index)%trainingJobs.length];
          else if(phase<4)id=steadyWork[(routineCycle+index)%steadyWork.length];
          else if(phase===4)id='meditate';
          else if(phase<11){ // the "cult" hours — PRIESTS worship; everyone else keeps working/training/resting
            if(priest)id=devotionJobs[(routineCycle+index)%devotionJobs.length];
            else { const wp=(index%3===0)?trainingJobs:(index%3===1)?steadyWork:leisureJobs; id=wp[(routineCycle+index)%wp.length]; }
          }
          else id=leisureJobs[(routineCycle+index)%leisureJobs.length];}
      }} // cult-like by day, restful by night; rain drives shelter
      if(clock>=nextExpansion&&index===0){id=desiredExpansion()+'-build';nextExpansion=clock+45;}
      else if(clock>=nextAstro&&index===1){id='star-marker';nextAstro=clock+55;} // keep building astronomy at the Earth temple
      else if(clock>=nextShrine&&index===2){id='temple-build';nextShrine=clock+130;} // the cult raises symmetric shrines on their own — placed only on sacred-safe symmetric slots (capped)
      if(!groups.has(id))groups.set(id,[]);groups.get(id).push(body);n.lastRoutine=clock;
    });
    routineCycle++;for(const [id,bodies] of groups){issue(id,bodies,true);batch.automatic=true;batch.routine=true;}paintRoutine();
  }
  function buildEverywhere(){
    maintenance=true;config.priority='balanced';config.workers=12;config.pace=5;config.levels=Math.max(config.levels,8);api.resume();
    const builders=api.crew();
    const tasks=['house-build','workshop-build','garden-build','stage-build','recreation-build']; // no temple-build — stop the pyramid spam
    const teams=tasks.map(()=>[]);
    builders.forEach((body,index)=>{cancel(body);teams[index%teams.length].push(body);});
    api.highlightWorkers(builders);
    teams.forEach((team,index)=>{if(team.length){issue(tasks[index],team,true);batch.automatic=true;}});
    const wave=Math.max(8,Math.min(32,Math.ceil(builders.length/24)));
    const expansion={home:wave,workshop:Math.ceil(wave/2),garden:Math.ceil(wave/2),stage:Math.ceil(wave/3),recreation:Math.ceil(wave/2)};
    for(const [kind,count] of Object.entries(expansion))ensureQueued(kind,count);
    nextCare=clock+5;paintPlanner();api.focus('maya');report('Builders',`All ${builders.length} flies dispatched. Expansion wave queued ${Object.entries(expansion).map(([kind,count])=>`${count} ${kind}`).join(', ')}; hive homes may rise to ${config.levels} storeys.`);
  }
  const suggestions=document.createElement('details');suggestions.innerHTML='<summary>Click to compose a command</summary>';
  for(const text of ['regular life','build everywhere','build 5 homes','build 3 workshops','build 4 gardens','build 2 stages','build a village','build a town','expand land 12','build 3 temples','finish the temple','clear queue','status','environment dusk','environment golden hour','environment moonlit','environment tropical','environment snow','environment storm','rain','clear skies','time noon','sun 12','brighter','darker','fog off','shadows high','overview','assemble','celebrate','research improvements','test improvement','auto on','auto off','priority life','priority balanced','priority gardens','priority temple','priority music','priority research','hive floors 6','pace 5','workers 4','stop all','camera temple','camera forecourt','worship sun','worship moon','worship rain','save','pause','resume',...ACTIONS.map(a=>a.label)]){
    const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=()=>{const input=document.getElementById('local-command');input.value=text;input.focus();commandResult.textContent='Command ready. Click Run to execute.';};suggestions.append(b);
  }
  panel.querySelector('#local-command-form').after(suggestions);
  const BUNDLES={
    hamlet:{home:4,garden:1},
    village:{home:6,garden:2,workshop:1,stage:1,recreation:1},
    neighborhood:{home:10,garden:2,workshop:1},
    neighbourhood:{home:10,garden:2,workshop:1},
    quarter:{home:10,garden:2,workshop:2,stage:1},
    district:{home:12,garden:3,workshop:2,stage:1},
    town:{home:16,garden:4,workshop:3,stage:1,recreation:2},
    city:{home:24,garden:5,workshop:4,stage:2,recreation:3},
    plaza:{garden:3,stage:1},
    square:{garden:3,stage:1}
  };
  function queueBundle(jobs){
    for(const [kind,count] of Object.entries(jobs))if(count>0)enqueueBuild(kind,count);
    api.resume();nextCare=clock;paintPlanner();
    return Object.entries(jobs).filter(([,n])=>n>0).map(([k,n])=>`${n} ${k}${n===1?'':'s'}`).join(', ');
  }
  function runCommand(text){
    // Guest chrome: no colony surgery (build / rites / planner). Look & weather stay on the guest bar.
    if (document.body.classList.contains('role-guest')) {
      commandResult.textContent = 'Guest mode — switch to Admin (Shift+Alt+A) for colony commands.';
      return false;
    }
    { const tl=text.trim().toLowerCase();
      if(/\bhail\s+(the\s+)?(king|god|ruler)\b|\bwho\s+(is\s+)?(the\s+)?(king|god|ruler)\b/.test(tl)){
        if(api.hailSovereign){api.hailSovereign();commandResult.textContent='Gabe · God · Ruler · King.';return true;}
        commandResult.textContent='Sovereign focus unavailable.';return true;
      }
    }
    // Film lot — cast smartest flies, film school, shoot into riffs/videos/
    { const tl=text.trim().toLowerCase(); const desk=typeof window!=='undefined'?window.__FILM_DESK:null;
      if(desk&&(/\b(cast (the )?smartest|pick (the )?cast|film cast)\b/.test(tl))){
        const cast=desk.pickSmartest(12); commandResult.textContent=`Cast ${cast.length} smartest flies for the mountain lot.`; return true;
      }
      if(desk&&(/\b(film school|train (the )?cast|rehearse (on )?set)\b/.test(tl))){
        desk.trainCast(0.12); desk.gatherCast(); commandResult.textContent='Film school — cast rehearsing; craft rising.'; return true;
      }
      if(desk&&(/\b(call (the )?cast|places everyone|gather (the )?cast)\b/.test(tl))){
        const n=desk.gatherCast(); commandResult.textContent=`Places — ${n} flies on the film lot.`; return true;
      }
      if(desk&&(/\b(dress (the )?cast|costume(s)?)\b/.test(tl))){
        const n=desk.dressCast('star'); commandResult.textContent=`Dressed ${n} for camera.`; return true;
      }
      if(desk&&(/\b(flies? make (a )?videos?|shoot (a )?fly take|record (a )?fly (take|video)|make (a )?movie)\b/.test(tl))){
        desk.shootSlate(null,{auto:false}); commandResult.textContent='Rolling a fly take — saves to riffs/videos/ like songs to riffs/takes/.'; return true;
      }
      if(/\b(esplanade gate|jade gate)\b/.test(tl)){
        api.camera?.('esplanade'); commandResult.textContent='Camera: Esplanade gate (past the Jade).'; return true;
      }
      if(/\b(esplanade|pyramid avenue)\b/.test(tl)){
        api.camera?.('esplanade'); commandResult.textContent='Camera: Esplanade of Pyramids.'; return true;
      }
      if(/\b(first light|fifth gate|tenth arrival)\b/.test(tl)){
        const key=/\bfirst light\b/.test(tl)?'esp1':/\bfifth gate\b/.test(tl)?'esp5':'esp10';
        api.camera?.(key); commandResult.textContent='Camera: '+key+'.'; return true;
      }
      if(/\b(stage 2|open stage)\b/.test(tl)){
        api.camera?.('stage2'); commandResult.textContent='Camera: Stage 2 (open soundstage).'; return true;
      }
      if(/\b(approach shot|truck (the )?esplanade)\b/.test(tl)){
        const desk=window.__FILM_DESK; if(desk?.shootSlate){ desk.shootSlate(desk.slateIdeas?.find(s=>s.id==='approach-ten')||null,{auto:false}); commandResult.textContent='Rolling approach shot…'; return true; }
      }
      if(/\b(film lot|movie set|movie studio|go to (the )?lot)\b/.test(tl)){
        api.camera?.('filmset'); commandResult.textContent='Camera: north-corner movie studio.'; return true;
      }
    }
    if(text.trim().toLowerCase()==='build everywhere'){buildEverywhere();return true;}
    if(/\bmega\s*-?\s*city\b/.test(text.toLowerCase())){maintenance=true;api.resume();const msg=api.buildMegaCity?api.buildMegaCity():'Mega city not available in this build';nextCare=clock;paintPlanner();api.focus?.('top');report('Mega city',msg);commandResult.textContent=msg;return true;}
    { const tl=text.toLowerCase(); if(/\ball[\s-]*hands\b|\bovernight\b|work all night|make everyone (work|build)|leaders?.*(work|build|everyone)/.test(tl)){const off=/\b(off|stand down|stop|done|dismiss)\b/.test(tl);setAllHands(off?false:!allHands);commandResult.textContent=allHands?'All hands on deck — leaders have everyone working nonstop.':'All hands stood down.';return true;} }
    { const tl=text.toLowerCase(); const m=tl.match(/(\d[\d,]{2,})\s*houses?\b/)||(/thousand\s*houses?/.test(tl)?[null,'1000']:null);
      if(m&&api.buildHousesTo){const t=Math.min(6000,parseInt(String(m[1]).replace(/,/g,''))||1000);const msg=api.buildHousesTo(t);api.resume();commandResult.textContent=msg;report('Houses',msg);return true;} }
    { const tl=text.toLowerCase(); if(/\bclouds?\b/.test(tl)&&api.cloudControl){let mode=null;if(/\b(more|add|extra)\b/.test(tl))mode='more';else if(/\b(fewer|less|reduce)\b/.test(tl))mode='fewer';else if(/\b(no|none|clear|off|zero)\b/.test(tl))mode='none';else if(/\b(one|single)\b/.test(tl))mode='one';if(mode){const msg=api.cloudControl(mode);commandResult.textContent=msg;report('Clouds',msg);return true;}} }

    // REGULAR LIFE — the "just let them live" mode. The colony runs itself: flies do the daily
    // upkeep and life they need (furnish, clean, repair, garden, teach, music, study) with no
    // direction from you. Clears directed orders and any build queue so nobody is stuck on a task.
    { const tl=text.toLowerCase().trim();
      if(/\b(regular|daily|normal|free)\s+life\b|\blet them live\b|\bjust live\b|\blive freely\b/.test(tl)){
        const off=/\b(off|stop|end|pause|disable|no)\b/.test(tl);
        config.liveColony=!off; maintenance=!off;
        if(!off){
          config.priority='life';
          queue.length=0;                                   // drop any directed construction
          try{ for(const b of api.crew()) if(b.ritual && !b.ritual.batch?.automatic) cancel(b); }catch(_){}  // release manual orders
          api.resume(); nextCare=clock;
        }
        paintPlanner();
        const msg=off
          ? 'Regular life OFF — the colony waits for your direction again.'
          : 'Regular life ON — the colony just lives: furnishing, cleaning, gardening, repairing, teaching, music & study, all on its own. No direction needed.';
        commandResult.textContent=msg; report('Life',msg); return true;
      } }
    // POPULATION DENSITY — "N per home" / "N per household": set how many flies live in each home.
    // Lowering it (e.g. 1 per household) sheds the surplus (flies leave to settle elsewhere — no harm);
    // raising it repopulates the existing homes. syncHousing() applies it gradually, ≤40/pass.
    { const m=text.toLowerCase().match(/\b(\d+)\s*(?:fl(?:y|ies)\s*)?per\s*(?:home|household|house)\b/);
      if(m){ const n=Math.max(1,Math.min(12,parseInt(m[1])||1)); PER_HOME=n; nextHousing=clock; try{syncHousing();}catch(_){}
        const msg=`Set to ${n} ${n===1?'fly':'flies'} per home. The colony will ${n===1?'send its extra flies off to settle elsewhere':'repopulate the homes'} over the next little while — paced, nothing harmed.`;
        commandResult.textContent=msg; report('Colony',msg); return true; } }

    const command=parseLocalCommand(text);let result='';
    if(command.error)result=command.error;
    else if(command.type==='everything'){buildEverywhere();return true;}
    else if(command.type==='bundle'){const jobs=BUNDLES[command.preset]||BUNDLES.village;result=`Founding a ${command.preset}: queued ${queueBundle(jobs)}.`;}
    else if(command.type==='expand'){result=`Expanding the settlement outward: queued ${queueBundle({garden:command.count,workshop:Math.ceil(command.count/2),home:command.count})}. New ground opens as flies build.`;}
    else if(command.type==='help')result='BUILD: build 5 homes / build 2 workshops / build 3 gardens / build a stage / build 3 temples / finish the temple / clear queue / demolish / move building here. GROW: build a village (or hamlet, district, town, city) / expand land 12 / build everything / build everywhere / all hands (stand down) / 1000 houses / mega city. WORK: research / test improvement / worship / worship sun / worship moon / everyone chant / assemble / celebrate / feast / furnish homes / repair homes / sacrifice a roach / stop selected / stop all. CLEAN: tidy (clean up / fix the town). CAMERA (also "show"/"go"/"fly to"): sun temple / ix chel / kanul / sacrificial temple / equinox / sky citadel / elder ruins / great pyramid / maker / hive / roach altar / overview. TOGGLES ("<name> on/off"): day night / maintenance / clouds (more/fewer/none) / rain / clear skies / gold rings / glass / lawns / trees / paths / flies / fly names / labels / marker. RITES & WEATHER: worship now / earth rite / west rite / water rite / hold the equinox / eclipse / weather auto on/off / rain chance 40% / more rain / less rain. SCENE: day / night / environment dusk (dawn, golden hour, moonlit, desert, tropical, autumn, forest, mist, overcast, storm, snow) / time noon / sun 12 / brighter / darker / fog off / shadows high. SETTINGS: auto on/off / priority life (balanced, housing, gardens, temple, workshops, music, research, learning) / regular life / cross-train / hive floors 4 / pace 15 / workers 3. WORLD: status / pause / resume / save / export world / import world.';
    else if(command.type==='build'){enqueueBuild(command.kind,command.count);api.resume();nextCare=clock;result=`Queued ${command.count} ${command.kind}${command.count===1?'':'s'}; flies will build them.`;}
    else if(command.type==='auto'){maintenance=command.value;if(maintenance){api.resume();nextCare=clock;}result=maintenance?'Flies will choose community work automatically.':'Automatic work paused; explicit queued commands can still run.';}
    else if(command.type==='priority'){config.priority=command.value;result='Community priority: '+command.value;}
    else if(command.type==='cross-train'){let taught=0;for(let i=0;i<6;i++)taught+=crossTrain(3);const s=learningStats();result=`Cross-training: ${taught} lessons shared · avg mastery ${s.avgMastery}% · ${s.crossTrained} of ${api.crew().length} flies know every job.`;}
    else if(command.type==='levels'){config.levels=command.value;result=`New hive columns can grow to ${command.value} floors. Existing homes are preserved.`;}
    else if(command.type==='pace'){config.pace=command.value;result=`Choose a new job every ${command.value} seconds.`;}
    else if(command.type==='workers'){config.workers=command.value;result=`Up to ${command.value} flies work automatically at once.`;}
    else if(command.type==='pause'){api.pause(command.value);result=command.value?'World paused.':'World running.';}
    else if(command.type==='save'){api.saveWorld();result='Saving world; check the disk-save indicator.';}
    else if(command.type==='export'){result=api.exportWorld?api.exportWorld():'Export is not available in this build.';}
    else if(command.type==='import'){result=api.importWorld?api.importWorld():'Import is not available in this build.';}
    else if(command.type==='clear-queue'){queue.length=0;result='Queued construction cleared. Work already started can finish.';}
    else if(command.type==='status'){
      const queued=queue.reduce((n,j)=>n+j.count,0),acting=api.crew().filter(b=>b.ritual).length;
      result=`${api.crew().length} flies · ${api.homes().length} homes · ${acting} working now · ${queued} buildings queued · priority ${config.priority} · automatic work ${maintenance?'on':'off'}.`;
    }
    else if(command.type==='environment'){api.environment({preset:command.preset});result='Environment set to '+command.preset+'.';}
    else if(command.type==='weather'){api.environment({weather:command.value});result=command.value==='rain'?'Rain moving in over the community.':'Skies clearing.';}
    else if(command.type==='time'){api.environment({hour:command.value});result='Sun moved to '+(Math.floor(command.value)+':'+(command.value%1?'30':'00'))+'.';}
    else if(command.type==='brightness'){lightBrightness=Math.max(.6,Math.min(1.5,command.value!=null?command.value:lightBrightness+command.delta));api.environment({brightness:lightBrightness});result='Sun brightness '+lightBrightness.toFixed(2)+'.';}
    else if(command.type==='env'){api.environment(command.config);result='Scene updated: '+Object.entries(command.config).map(([k,v])=>`${k} ${v}`).join(', ')+'.';}
    else if(command.type==='camera')result=api.camera(command.value)?'Camera: '+command.value:'No camera there yet. Try: sun temple, ix chel, kanul, sacrificial temple, equinox, sky citadel, elder ruins, great pyramid, maker, hive, or overview.';
    else if(command.type==='toggle'){const s=api.toggle?api.toggle(command.key,command.on):null;result=s==null?"That control isn't available.":`${command.key.replace('labels-brain','labels').replace('maint','maintenance').replace('roofs','glass roofs')} ${s?'on':'off'}.`;}
    else if(command.type==='tidy')result=api.tidy?api.tidy():'Tidy is not available in this build.';
    else if(command.type==='arrange')result=api.arrangeHouses?api.arrangeHouses():'House arranging is not available in this build.';
    else if(command.type==='clear-temples')result=api.clearTemples?api.clearTemples():'Clear-temples is not available in this build.';
    else if(command.type==='thin-community')result=api.thinCommunity?api.thinCommunity():'Thin-community is not available in this build.';
    else if(command.type==='demolish')result=api.demolish?api.demolish():'Demolish is not available in this build.';
    else if(command.type==='move-building')result=api.moveBuilding?api.moveBuilding():'Move-building is not available in this build.';
    else if(command.type==='weatherauto'){weatherAuto=command.on;if(weatherAuto)nextWeather=clock+2;result=weatherAuto?'Automatic weather ON — the skies now change on their own.':'Automatic weather OFF — weather holds until you or a ritual changes it.';}
    else if(command.type==='rainchance'){rainChance=Math.max(0,Math.min(1,command.value!=null?command.value:rainChance+command.delta));weatherAuto=true;result='Chance of rain set to '+Math.round(rainChance*100)+'% (automatic weather on).';}
    else if(command.type==='rite'){const w=holdRite(command.which);result=!w?'No flies free to gather right now.':w==='eclipse'?'An eclipse — the sky darkens and the colony gathers to worship.':w==='equinox'?'The colony gathers at the observatory for the equinox rite.':w==='earth'?'Earth rite — star study at the eastern temple.':w==='west'?'West temple rite.':w==='water'?'Water temple worship.':'The colony gathers to worship.';}
    else if(command.type==='stop'){const who=command.all?api.crew():api.selected();for(const body of who)cancel(body);result=command.all?'All flies released from their current jobs.':'Selected flies released.';}
    else if(command.type==='action'){
      const act=ACTIONS.find(a=>a.id===command.id);
      // Any RITE the owner calls pulls the WHOLE colony: every fly stops what it's doing, gathers, and
      // stays until the rite is over (dwell). Non-rite actions still go to the selection as before.
      const rite=act&&(['forecourt','sacrifice','watertemple','earthtemple','westtemple','ruins','healing','sacrificialtemple','astronomy','temple'].includes(act.place)||String(act.effect).endsWith('-ritual')||['bow','sway','dance','pulse','circle','beetle','offering'].includes(act.effect));
      issue(command.id,(command.scope==='everyone'||rite)?api.crew():undefined);
      result=(rite?'The whole colony gathers for ':'Assigned ')+(act?act.label:command.id);
    }
    commandResult.textContent=result;paintPlanner();return !command.error;
  }
  document.getElementById('local-command-form').addEventListener('submit',e=>{e.preventDefault();const input=document.getElementById('local-command');if(runCommand(input.value))input.value='';});
  for(const button of document.querySelectorAll('[data-command]'))button.addEventListener('click',()=>{const input=document.getElementById('local-command');input.value=button.dataset.command;input.focus();});
  // Quick-run buttons (the bottom bar): execute a local command immediately and flash the result.
  const toast=document.createElement('div');toast.id='quick-toast';document.body.append(toast);let toastTimer=0;
  function flashToast(message){toast.textContent=message;toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('show'),2800);}
  for(const button of document.querySelectorAll('[data-run]'))button.addEventListener('click',()=>{runCommand(button.dataset.run);flashToast(commandResult.textContent||button.dataset.run);});
  for(const [id,key,min,max] of [['planner-pace','pace',5,300],['hive-levels','levels',1,12],['planner-workers','workers',1,12]])document.getElementById(id).addEventListener('change',e=>{const value=Number(e.target.value);if(Number.isInteger(value)&&value>=min&&value<=max)config[key]=value;paintPlanner();});
  document.getElementById('planner-priority').addEventListener('change',e=>{config.priority=e.target.value;paintPlanner();});
  document.getElementById('clear-build-queue').addEventListener('click',()=>{queue.length=0;paintPlanner();commandResult.textContent='Queued construction cleared. Work already started can finish.';});
  paintPlanner();
  document.getElementById('stop-actions').addEventListener('click',()=>{
    for(const body of api.selected())cancel(body);report('House','Selected flies released from actions');
  });

  // Rituals gather in the courtyard directly in front of (south of) the pyramid, not off to its side.
  const altar=new THREE.Group();altar.position.set(api.temple.x,0,api.temple.z+api.temple.radius+6);api.scene.add(altar);
  // A raised stepped stone so the offering sits UP where the gathered flies (who now
  // stand in front, not on top) can all see it.
  const altarMat=new THREE.MeshStandardMaterial({color:0x4a4152,roughness:0.7});
  const base=new THREE.Mesh(new THREE.CylinderGeometry(3.4,3.9,1.0,32),altarMat);base.position.y=0.5;base.castShadow=base.receiveShadow=true;altar.add(base);
  const stone=new THREE.Mesh(new THREE.CylinderGeometry(2.4,2.8,1.6,32),altarMat);stone.position.y=1.8;stone.castShadow=true;altar.add(stone);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(3.6,0.07,8,64),new THREE.MeshBasicMaterial({color:0xc7a3ff,transparent:true,opacity:0.7}));ring.rotation.x=Math.PI/2;ring.position.y=0.12;altar.add(ring);
  const offering=new THREE.Group();offering.position.y=2.7;altar.add(offering);offering.visible=false;
  // A wingless, six-legged roach prop — BIG and raised so the sacrifice is clearly
  // visible to the whole gathering. No fly is removed or harmed by rituals.
  const beetle=new THREE.Group();beetle.scale.setScalar(3.0);offering.add(beetle);
  const shell=new THREE.Mesh(new THREE.SphereGeometry(0.34,18,14),new THREE.MeshStandardMaterial({color:0x42ad89,metalness:0.45,roughness:0.3}));shell.scale.set(0.85,0.6,1.35);shell.position.y=0.18;shell.castShadow=true;beetle.add(shell);
  const head=new THREE.Mesh(new THREE.SphereGeometry(0.16,12,10),new THREE.MeshStandardMaterial({color:0x2f7d63,roughness:0.4}));head.position.set(0,0.14,0.5);beetle.add(head);
  for(const s2 of [-1,1]){const ant=new THREE.Mesh(new THREE.CylinderGeometry(0.015,0.015,0.4,4),new THREE.MeshStandardMaterial({color:0x224034}));ant.position.set(s2*0.08,0.28,0.62);ant.rotation.set(0.7,0,s2*0.3);beetle.add(ant);}
  for(const side of [-1,1])for(let i=0;i<3;i++){
    const leg=new THREE.Mesh(new THREE.CylinderGeometry(0.028,0.028,0.5,5),new THREE.MeshStandardMaterial({color:0x29433c}));leg.rotation.z=side*1.1;leg.position.set(side*0.3,0.02,(i-1)*0.24);beetle.add(leg);
  }
  const fruit=new THREE.Mesh(new THREE.SphereGeometry(0.5,16,12),new THREE.MeshStandardMaterial({color:0xe2a765}));fruit.position.y=0.4;offering.add(fruit);fruit.visible=false;
  let offeringUntil=0;
  // --- Per-rite SPECTACLE: each kind of gathering gets its own look at the altar — fire & smoke for a
  // sacrifice, drifting petals for a festival, a shaft of light for worship, falling rain for a water
  // rite. Lives on the altar group so it follows wherever the rite gathers; cleared when the rite ends.
  const riteFX=new THREE.Group();altar.add(riteFX);let riteFXKind='',riteFXUntil=0;
  function clearRiteFX(){while(riteFX.children.length){const c=riteFX.children.pop();if(c.geometry&&c.geometry.dispose)c.geometry.dispose();if(c.material&&c.material.dispose)c.material.dispose();}riteFX.userData.parts=null;riteFXKind='';}
  function startRiteFX(kind,secs){clearRiteFX();riteFXKind=kind;riteFXUntil=clock+(secs||32);const parts=[];
    if(kind==='fire'){const fm=new THREE.MeshBasicMaterial({color:0xff7a1e,transparent:true,opacity:0.92,fog:false});const em=new THREE.MeshBasicMaterial({color:0xffd24a,transparent:true,opacity:0.95,fog:false});
      for(let i=0;i<9;i++){const f=new THREE.Mesh(new THREE.ConeGeometry(0.6-i*0.045,2.6,6),i%3?fm:em);f.position.set((Math.random()-0.5)*1.8,3.4+Math.random()*0.6,(Math.random()-0.5)*1.8);riteFX.add(f);parts.push({m:f,ph:Math.random()*6.28,base:f.position.y});}
      const sm=new THREE.MeshBasicMaterial({color:0x453d34,transparent:true,opacity:0.42,fog:false});
      for(let i=0;i<7;i++){const s=new THREE.Mesh(new THREE.SphereGeometry(0.9+Math.random()*0.6,8,6),sm.clone());s.position.set((Math.random()-0.5)*2.2,5+i*2,(Math.random()-0.5)*2.2);riteFX.add(s);parts.push({m:s,smoke:true});}
    } else if(kind==='petals'){const cols=[0xff6fae,0xffd24a,0x7fd6ff,0xa6ff8f,0xc08aff];
      for(let i=0;i<46;i++){const p=new THREE.Mesh(new THREE.PlaneGeometry(0.45,0.45),new THREE.MeshBasicMaterial({color:cols[i%cols.length],side:THREE.DoubleSide,transparent:true,opacity:0.92,fog:false}));p.position.set((Math.random()-0.5)*22,7+Math.random()*20,(Math.random()-0.5)*22);p.rotation.set(Math.random()*6.28,Math.random()*6.28,0);riteFX.add(p);parts.push({m:p,fall:0.7+Math.random()*1.4,spin:Math.random()*2-1,sway:Math.random()*6.28});}
    } else if(kind==='light'){const beam=new THREE.Mesh(new THREE.CylinderGeometry(0.6,9,44,24,1,true),new THREE.MeshBasicMaterial({color:0xfff0b4,transparent:true,opacity:0.16,side:THREE.DoubleSide,fog:false,depthWrite:false}));beam.position.y=24;riteFX.add(beam);parts.push({m:beam,beam:true});
      for(let i=0;i<18;i++){const m=new THREE.Mesh(new THREE.SphereGeometry(0.12,6,5),new THREE.MeshBasicMaterial({color:0xfff6c8,transparent:true,opacity:0.9,fog:false}));m.position.set((Math.random()-0.5)*6,2+Math.random()*30,(Math.random()-0.5)*6);riteFX.add(m);parts.push({m,mote:true});}
    } else if(kind==='water'){const wm=new THREE.MeshBasicMaterial({color:0x6fc0ff,transparent:true,opacity:0.85,fog:false});
      for(let i=0;i<36;i++){const d=new THREE.Mesh(new THREE.SphereGeometry(0.17,6,5),wm.clone());d.scale.y=2.2;d.position.set((Math.random()-0.5)*18,8+Math.random()*20,(Math.random()-0.5)*18);riteFX.add(d);parts.push({m:d,fall:9+Math.random()*6,top:8+Math.random()*20});}
      const cloud=new THREE.Mesh(new THREE.SphereGeometry(7,10,8),new THREE.MeshBasicMaterial({color:0x6a7684,transparent:true,opacity:0.5,fog:false}));cloud.position.y=28;cloud.scale.set(1.8,0.7,1.8);riteFX.add(cloud);
    }
    riteFX.userData.parts=parts;
  }
  function stepRiteFX(dt,now){const parts=riteFX.userData.parts;if(!parts||!parts.length)return;
    if(riteFXKind==='fire'){for(const p of parts){if(p.smoke){p.m.position.y+=dt*2.6;p.m.material.opacity=Math.max(0,0.42-(p.m.position.y-5)/34);p.m.scale.addScalar(dt*0.35);if(p.m.position.y>26){p.m.position.y=5;p.m.scale.setScalar(1);p.m.material.opacity=0.42;}}else{p.m.scale.y=0.7+Math.abs(Math.sin(now*9+p.ph))*0.8;p.m.position.y=p.base+Math.sin(now*6+p.ph)*0.3;}}}
    else if(riteFXKind==='petals'){for(const p of parts){p.m.position.y-=dt*p.fall;p.m.position.x+=Math.sin(now+p.sway)*dt*1.6;p.m.rotation.z+=dt*p.spin;p.m.rotation.x+=dt*0.6;if(p.m.position.y<1.5)p.m.position.y=20+Math.random()*8;}}
    else if(riteFXKind==='light'){for(const p of parts){if(p.beam)p.m.material.opacity=0.1+Math.abs(Math.sin(now*1.5))*0.14;else if(p.mote){p.m.position.y-=dt*2.2;if(p.m.position.y<1)p.m.position.y=30;}}}
    else if(riteFXKind==='water'){for(const p of parts){if(p.fall){p.m.position.y-=dt*p.fall;if(p.m.position.y<1)p.m.position.y=p.top;}}}
  }
  function cancel(body,finished=false){if(body.ritual&&!finished){const job=body.ritual;job.batch.remaining=Math.max(0,job.batch.remaining-1);if(!job.batch.remaining)report('Work cancelled',job.action.label);}body.ritual=null;body.wait=0.2;body.t=1;body.to=[body.x,body.z];body.from=[body.x,body.z];body.ctrl=[body.x,body.z];body.ordered='';body.g.rotation.x=0;body.g.rotation.z=0;}
  function issue(id,assigned,automatic=false,plannedSite){
    const action=ACTIONS.find(a=>a.id===id),who=assigned||api.selected();if(!action||!who.length)return;
    api.resume();
    // Rituals gather on the forecourt platform in front of the pyramid: move the
    // altar (with its offering / beetle / ring props) there so the offering and
    // sacrifice visibly happen among the gathered flies, not by the pyramid base.
    const isGatherRite=['forecourt','sacrifice','watertemple','earthtemple','westtemple','ruins','healing','sacrificialtemple','astronomy','temple'].includes(action.place)||String(action.effect).endsWith('-ritual')||['bow','sway','dance','pulse','circle','beetle','offering'].includes(action.effect);
    if(isGatherRite){const spot=api.destination(action.place);if(spot&&Number.isFinite(spot.x))altar.position.set(spot.x,0,spot.z);}
    // Reveal the roach (or fruit) on the altar IMMEDIATELY when a sacrifice/offering is called — not
    // only after a fly finishes — so it's clearly on the altar the whole time the colony gathers.
    if(action.effect==='beetle'||action.effect==='offering'){offering.visible=true;beetle.visible=action.effect==='beetle';fruit.visible=!beetle.visible;offering.scale.setScalar(1);offeringUntil=clock+Math.max(28,who.length*0.2+14);}
    // Per-rite spectacle at the altar: fire(sacrifice) · petals(festival/dance) · water(rain/water) · light(worship/other).
    const riteFXOn=(typeof window==='undefined')||window.FLY_FEAT?.riteFX!==false;   // user-toggleable ritual spectacle
    if(isGatherRite&&riteFXOn){const fx=action.effect==='beetle'?'fire':(/festival|celebrat|dance|feast/.test(action.id)?'petals':(String(action.effect).startsWith('water')||String(action.effect).startsWith('rain')||/water|rain/.test(action.id)?'water':'light'));startRiteFX(fx,34);}
    if(action.effect.endsWith('-ritual'))api.weatherRitual(action.effect.split('-')[0]);
    batch={id,key:_uid(),remaining:who.length,total:who.length,completed:0};
    const kind={build:'home','workshop-build':'workshop','garden-build':'garden','stage-build':'stage','recreation-build':'recreation','temple-build':'temple'}[action.effect];
    let site=kind?(plannedSite||api.planBuild(kind)):null;
    const study=action.effect==='research-trial'?availableStudy():null;
    if(study?.action==='landscape')site=api.planBuild('garden');
    // Every temple/altar gathering fans out in a big grid IN FRONT of the shrine
    // (along its facing direction) so thousands of flies fit without covering it.
    const templePlaces=new Set(['forecourt','sacrifice','watertemple','earthtemple','westtemple','ruins','healing','sacrificialtemple','astronomy']);
    const cols=Math.max(6,Math.min(48,Math.ceil(Math.sqrt(who.length*1.7))));
    // Gathering RITES (worship/sacrifice/festival/temple) should LINGER so the congregation actually
    // stays — not break up after ~6s. Each fly dwells 18–34s (staggered) so they disperse gradually.
    const gather = templePlaces.has(action.place) || action.place==='temple' || action.effect.endsWith('-ritual') || ['bow','sway','dance','pulse','circle','beetle','offering'].includes(action.effect);
    for(const [i,body] of who.entries()){
      cancel(body);
      let target=action.place==='temple'?{x:altar.position.x,z:altar.position.z}:api.destination(action.place==='home'?(body.home||'lounge'):action.place);
      if(action.place==='temple') {const angle=i*2.39996,rad=3.5+Math.sqrt(i)*0.45;target={x:target.x+Math.cos(angle)*rad,z:target.z+Math.sin(angle)*rad};}
      if(templePlaces.has(action.place)){
        // They can FLY — so the congregation HOVERS in a 3-D dome around the altar (tiers stacked in
        // the air), instead of all piling flat on the ground on top of each other. Flies spread over a
        // hemisphere shell centred on the altar: a swarm cloud that leaves the altar + offering clear.
        const N=Math.max(1,who.length);
        const domeR=Math.min(70, 6+Math.sqrt(N)*0.95);
        const phi=Math.acos(1-(i+0.5)/N*0.95);           // polar angle 0 (top) → ~base ring
        const theta=2.39996*i;                            // golden-angle azimuth → even spiral
        const rad=domeR*Math.sin(phi)+1.5;
        target={x:target.x+Math.cos(theta)*rad, z:target.z+Math.sin(theta)*rad, y:2.5+domeR*Math.cos(phi)};
      }
      else if(who.length>1&&action.place!=='home'&&!site){const angle=i*2.39996,spread=.7+Math.sqrt(i)*.55;target={x:target.x+Math.cos(angle)*spread,z:target.z+Math.sin(angle)*spread,y:target.y};}
      if(study)target=api.destination(study.key);
      if(site){const angle=i*2.39996,spread=(site.r||2)+.7+Math.sqrt(i)*.28;target={x:site.x+Math.cos(angle)*spread,z:site.z+Math.sin(angle)*spread,y:site.y};}
      body.ritual={action,target,site,study,stage:'travel',elapsed:0,batch,dwell:(gather?30:(/build/.test(String(action.effect))?2.5:6))};
      body.key=study?.key||(action.place==='home'?(body.home||'lounge'):action.place);body.mode=action.id==='nap'?'sleep':'work';body.ordered=id;
      body.g.userData.task=`Going to ${action.label.toLowerCase()}`;
    }
    // Point the camera at exactly where this group is gathering, not a fixed preset.
    if(!automatic){
      let fx,fz,fs=12;
      if(site){fx=site.x;fz=site.z;fs=(site.r||6)+10;}
      else if(action.place==='forecourt'){const fc=api.destination('forecourt');fx=fc.x;fz=fc.z;fs=Math.min(32,8+Math.sqrt(who.length)*1.7);}
      else if(action.place==='temple'){fx=altar.position.x;fz=altar.position.z;fs=12;}
      else if(templePlaces.has(action.place)){const d=api.destination(action.place);fx=d.x;fz=d.z;fs=Math.min(90,18+Math.sqrt(who.length)*1.4);}  // pull back to see the whole hovering dome
      else {const d=api.destination(action.place==='home'?(who[0].home||'lounge'):action.place);fx=d.x;fz=d.z;fs=12;}
      if(Number.isFinite(fx)&&Number.isFinite(fz))api.focusArea(fx,fz,fs);
    }
    report(automatic?'Planner':'Command',`${action.label} · ${who.length} flies`);
  }
  // A communal rite: gather a big share of the colony to worship together. Cadence gives a
  // daily worship gathering, an equinox rite (at the observatory) every 4th day, and a rare
  // eclipse (sky darkens; moon rite). `force` = a specific rite requested by command (and
  // moves the camera to it); otherwise it's an automatic scheduled rite.
  function holdRite(force){
    if(!api.ready())return '';
    if(!force)riteDay++;
    const which=force||(riteDay%12===0?'eclipse':riteDay%4===0?'equinox':'worship');
    const auto=!force;
    // An AUTOMATIC/scheduled rite gathers only the PRIESTS; a rite the owner explicitly calls still
    // gathers the whole colony.
    const pool=auto?api.crew().filter(isPriest):api.crew();
    const cap=auto?Math.min(120,pool.length):Math.min(300,Math.max(20,Math.round(api.crew().length*0.35)));
    // prefer flies not mid-build; fall back to anyone in the pool if needed
    let group=pool.filter(b=>!b.ritual||(b.ritual.action&&b.ritual.action.category==='Temple')).slice(0,cap);
    if(group.length<6)group=pool.slice(0,cap);
    if(!group.length)return '';
    if(which==='equinox'){issue('star-study',group,auto);report('Equinox','The colony gathers at the observatory for the equinox rite.');}
    else if(which==='eclipse'){api.environment({preset:'moonlit'});eclipseUntil=clock+28;issue('moon-worship',group,auto);report('Eclipse','An eclipse — the sky darkens and the colony gathers to worship.');}
    else if(which==='earth'){issue('star-study',group,auto);try{api.camera?.('earthtemple')||api.camera?.('equinox');}catch(_){ }report('Earth','Priests gather at the Earth temple to study the heavens.');}
    else if(which==='west'){issue('west-rite',group,auto);try{api.camera?.('westgrand')||api.camera?.('westtemple');}catch(_){ }report('West','The colony holds rite at the West temple.');}
    else if(which==='water'){issue('water-worship',group,auto);try{api.camera?.('watertemple');}catch(_){ }report('Water','The colony worships at the water temple.');}
    else{const rite=['worship','chant','offering','procession'][riteDay%4];issue(rite,group,auto);report('Worship','The colony gathers to worship.');}
    return which;
  }
  function syncHousing(){
    if(syncing||!api.ready())return;
    syncing=true;
    try{
      // The city is ALREADY built. Size the LIVING population to the existing homes (PER_HOME per
      // home, capped at POP_CAP) — we never build new homes just to seat a surplus. If we're OVER
      // target (e.g. PER_HOME was lowered to one per household), the extra flies LEAVE to settle
      // elsewhere; nothing is harmed. If UNDER target, fill open slots so raising PER_HOME later
      // repopulates the homes. All paced ≤40/pass so it ramps smoothly, never in one frame.
      let homes=api.homes();
      const target=Math.min(POP_CAP, homes.length*PER_HOME);
      // Build homes ONLY if genuinely short for the target (never to seat a surplus we're about to shed).
      const homesNeeded=Math.min(Math.ceil(target/PER_HOME), Math.ceil(api.crew().length/PER_HOME));
      while(homes.length<homesNeeded){if(!api.buildHome())break;homes=api.homes();}
      if(api.crew().length>target && api.removeResident){
        // Prefer the extra residents of over-full homes (role "resident…-2/-3/-4") so every home keeps
        // its primary fly; fall back to anyone only if needed. Never touch the picked/followed fly.
        const secondary=api.crew().filter(b=>/-\d+$/.test(String(b.g.userData.role)));
        const pool=(secondary.length?secondary:api.crew().slice());
        let gone=0;
        for(const body of pool){ if(gone>=40||api.crew().length<=target)break; if(api.removeResident(body))gone++; }
        if(gone>0){homes=api.homes();report('Colony',`${gone} flies left to settle elsewhere — the colony is right-sizing to ${PER_HOME} per home.`);}
      }
      const plan=housingPlan(homes,api.crew().map(b=>({role:b.g.userData.role,home:b.home})),PER_HOME);
      for(const body of api.crew())body.home=plan.assignments.get(body.g.userData.role)||null;
      let added=0;
      if(api.crew().length<target){ for(const key of plan.vacant){ if(added>=40||api.crew().length>=target)break; api.addResident(key); added++; } }
      const text=`${api.crew().length} flies · ${homes.length} homes · ${PER_HOME} per home`;
      if(text!==lastHousing){lastHousing=text;document.getElementById('population').textContent=text;}
    }finally{syncing=false;}
  }
  function guiWork(who){
    api.fit();let repairs=0,checked=0;
    const luminance=color=>{const rgb=color.match(/[\d.]+/g)?.slice(0,3).map(Number)||[255,255,255];return rgb.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);};
    for(const element of panel.querySelectorAll('label,summary,p,li,button,select,input,h3,small')){
      if(!element.getClientRects().length)continue;checked++;
      const style=getComputedStyle(element);let parent=element,bg=style.backgroundColor;
      while((bg==='rgba(0, 0, 0, 0)'||bg==='transparent')&&parent.parentElement){parent=parent.parentElement;bg=getComputedStyle(parent).backgroundColor;}
      const fgL=luminance(style.color),bgL=luminance(bg),contrast=(Math.max(fgL,bgL)+.05)/(Math.min(fgL,bgL)+.05);
      if(contrast<4.5||parseFloat(style.fontSize)<14){element.classList.add('ui-repaired');repairs++;}
      if(element.tagName==='BUTTON'&&!element.getAttribute('aria-label'))element.setAttribute('aria-label',element.textContent.trim());
    }
    design.audits++;design.repairs+=repairs;uiPass+=repairs;
    design.lastAudit=checked?`${checked} visible controls checked; ${repairs} contrast or text-size repairs.`:'Panel closed; open it to inspect visible controls.';
    assignDesignTeams();report(who,design.lastAudit);return repairs>0;
  }
  function availableStudy(){
    const inProgress=new Set(api.crew().map(b=>b.ritual?.study?.id).filter(Boolean));
    return research.pending.find(s=>!inProgress.has(s.id));
  }
  function paintResearch(){
    document.getElementById('research-summary').textContent=`${research.studies} studies · ${research.trials} trials · ${research.improvements} measured improvements · ${research.pending.length} proposals`;
    const list=document.getElementById('research-notebook');list.replaceChildren();
    for(const record of research.records.slice(-5).reverse()){const row=document.createElement('li');row.textContent=record.message;list.append(row);}
  }
  function recordResearch(message){research.records.push({message,time:new Date().toISOString()});if(research.records.length>40)research.records.shift();paintResearch();}
  function studyImprovements(body){
    if(research.pending.length>=12)return 'Research board full; existing proposals need testing';
    const candidates=api.researchCandidates().filter(c=>!research.pending.some(p=>p.key===c.key&&p.action===c.action)&&research.tested[c.key+':'+c.action]!==c.before);
    candidates.sort((a,b)=>{
      const score=c=>c.need+(research.methods[c.action]?.wins||0)/Math.max(1,research.methods[c.action]?.trials||0);
      return score(b)-score(a);
    });
    research.studies++;
    if(!candidates.length){recordResearch('Inspection found no new furnishing or floor-space trial to run.');return 'Research complete: no new measurable improvement identified';}
    const candidate={...candidates[0],id:_uid()};research.pending.push(candidate);
    const message=`Study ${research.studies}: try ${candidate.action} in ${candidate.key}; baseline ${Number(candidate.before.toFixed(2))} ${candidate.metric}.`;
    recordResearch(message);return message;
  }
  function testImprovement(body){
    const study=body.ritual?.study;
    if(!study)return 'No unassigned proposal; research improvements first';
    const result=api.researchTrial(body,study);
    research.pending=research.pending.filter(p=>p.id!==study.id);
    if(result.missing){recordResearch(`Trial cancelled: ${study.key} no longer exists.`);return 'Trial target unavailable';}
    research.trials++;const improved=result.gain>1e-6;if(improved)research.improvements++;
    research.tested[study.key+':'+study.action]=result.after;
    const method=research.methods[study.action]||={trials:0,wins:0};method.trials++;if(improved)method.wins++;
    const message=`${study.key}: ${study.action}, ${Number(result.before.toFixed(2))} → ${Number(result.after.toFixed(2))} ${study.metric}. ${improved?'Improvement verified.':'No measurable gain; avoid repeating unchanged conditions.'}`;
    recordResearch(message);return message;
  }
  paintResearch();
  function effect(body,action){
    let result='';
    if(action.effect==='research-study')result=studyImprovements(body);
    else if(action.effect==='research-trial')result=testImprovement(body);
    else if(action.effect==='build'){const home=api.buildHome(body.ritual?.site);if(home)body.key=home.key;result=home?'Built home '+home.key:'No clear housing plot available';syncHousing();}
    else if(action.effect.endsWith('-build')){result=api.buildStructure(action.effect.replace('-build',''),body.ritual?.site);}
    else if(action.effect.endsWith('-ritual'))result='Completed '+action.label.toLowerCase()+' in the temple forecourt';
    else if(action.effect==='survey'){result=lastHousing;}
    else if(action.effect==='gui'){guiWork(body.g.userData.name);return;}
    else if(['furnish','repair','plant','clean'].includes(action.effect)){result=api.improve(body,action.effect)||'Inspected the site; no change needed';}
    else if(action.effect==='beetle'||action.effect==='offering'){
      offering.visible=true;beetle.visible=action.effect==='beetle';fruit.visible=!beetle.visible;offering.scale.setScalar(1);offeringUntil=Math.max(offeringUntil,clock+8);
      result=beetle.visible?'Completed a symbolic roach sacrifice at the altar':'Placed a fruit offering';
    }
    if(result)report(body.g.userData.name,result);
  }

  // Teaching: knowledge spreads from those who know a job to those who don't.
  // Runs continuously (stronger under the "learning" focus) so, given time, the
  // whole colony cross-trains on every job. Faster while teachers are teaching.
  function crossTrain(intensity=1){
    const roles=api.crew().map(b=>b.g.userData.role);
    if(roles.length<2||!ALL_JOBS.length)return 0;
    const teachingNow=api.crew().some(b=>b.ritual?.action.skill==='teaching');
    const step=(teachingNow?0.06:0.03)*intensity;
    const transfers=Math.min(40,4+Math.floor(intensity*roles.length/30));
    let taught=0;
    for(let t=0;t<transfers;t++){
      const job=ALL_JOBS[(Math.random()*ALL_JOBS.length)|0];
      let teacher=null,tv=0.25;
      for(const r of roles){const v=mastery(r,job);if(v>tv){tv=v;teacher=r;}}
      if(!teacher)continue;
      let student=null,sv=Infinity;
      for(let k=0;k<6;k++){const r=roles[(Math.random()*roles.length)|0];const v=mastery(r,job);if(r!==teacher&&v<sv){sv=v;student=r;}}
      if(student==null||sv>=tv-0.03)continue;
      learn[student]||={};learn[student][job]=Math.min(tv,+(sv+step).toFixed(4));
      taught++;
    }
    return taught;
  }
  // Bootstrap job proficiency from each fly's accumulated play history so an
  // established colony already has knowledge to teach (grows further by doing).
  function seedLearning(){
    for(const role of Object.keys(skills)){
      learn[role]||={};
      for(const a of ACTIONS){
        const c=skills[role][a.skill]||0;
        if(c>0&&!(a.id in learn[role]))learn[role][a.id]=Math.min(0.8,c/12);
      }
    }
  }
  function learningStats(){
    const roles=api.crew().map(b=>b.g.userData.role),J=ALL_JOBS.length||1;
    let sum=0,full=0;
    for(const r of roles){let known=0,s=0;for(const j of ALL_JOBS){const v=mastery(r,j);s+=v;if(v>=0.6)known++;}sum+=s/J;if(known>=J*0.9)full++;}
    return {jobs:J,avgMastery:roles.length?Math.round(sum/roles.length*100):0,crossTrained:full,
      teaching:api.crew().filter(b=>b.ritual?.action.skill==='teaching').length};
  }

  uiPass=Number(saved.ui)||0;
  seedLearning();
  paintRoutine();
  return {
    issue,cancel,syncHousing,guiWork,save,buildEverywhere,
    triggerRite:(which)=>holdRite(which),   // let the main module's natural-events director call a rite (eclipse/equinox/worship)
    setRainChance:(v)=>{rainChance=Math.max(0,Math.min(1,v));weatherAuto=true;nextWeather=clock+2;},   // seasons bias the odds of rain
    weatherActive:()=>({rain:rainChance,auto:weatherAuto}),
    settings:()=>({...config,beat:lastBeatLabel||'Regular life'}),isAutomatic:()=>maintenance,
    learningStats,
    exportState:()=>({skills,learn,wellbeing,wholeLife,history,uiPass,maintenance,config,queue,cycle,research,researchCycle,design,nextCareIn:Math.max(0,nextCare-clock)}),
    importState(value){if(!value)return;
      if(value.design)Object.assign(design,value.design);teamPanel.querySelector('#design-enabled').checked=design.enabled;assignDesignTeams();
      if(value.research){Object.assign(research,value.research);research.pending=(research.pending||[]).slice(0,12);research.records=(research.records||[]).slice(-40);research.methods||={};research.tested||={};}researchCycle=value.researchCycle||0;paintResearch();
      Object.assign(skills,value.skills||{});Object.assign(learn,value.learn||{});Object.assign(wellbeing,value.wellbeing||{});wholeLife=value.wholeLife!==false;seedLearning();history.splice(0,history.length,...(value.history||[]).slice(-40));uiPass=value.uiPass||0;maintenance=value.maintenance!==false;
      if(['balanced','housing','gardens','temple','workshops','music','research','learning','life'].includes(value.config?.priority))config.priority=value.config.priority;
      for(const [key,min,max] of [['pace',5,300],['levels',1,12],['workers',1,24],['panelWidth',250,480],['textSize',11,15]])if(Number.isInteger(value.config?.[key])&&value.config[key]>=min&&value.config[key]<=max)config[key]=value.config[key];
      if(typeof value.config?.liveColony==='boolean')config.liveColony=value.config.liveColony;
      if(Number.isFinite(value.config?.busyFrac))config.busyFrac=Math.max(0.05,Math.min(0.45,value.config.busyFrac));
      queue.splice(0,queue.length,...normalizeBuildQueue(value.queue,wholeLife?12:100));cycle=value.cycle||0;nextCare=clock+Math.min(config.pace,Math.max(0,value.nextCareIn||0));paintPlanner();paintRoutine();applyDisplay();paintFeed();},
    snapshot:()=>({homes:api.homes().length,population:api.crew().length,history:[...history],skills,active:api.crew().filter(b=>b.ritual).length,beat:lastBeatLabel||'Regular life'}),
    step(dt){
      clock+=dt;
      needsElapsed+=dt;if(needsElapsed>=.5){updateNeeds(needsElapsed);needsElapsed=0;}
      if(clock>=nextRoutine){nextRoutine=clock+(config.liveColony===false?2:1.35);scheduleWholeLife();}
      if(clock>=nextSocial&&api.ready()){
        nextSocial=clock+(config.liveColony===false?18:7+Math.random()*7);
        if(maintenance||config.liveColony!==false)pulseSocialLife();
      }
      if(clock>=nextDayBeat&&api.ready()){
        nextDayBeat=clock+(config.liveColony===false?40:22+Math.random()*16);
        if(maintenance||config.liveColony!==false)pulseDayBeat();
      }
      if(clock>=nextWeatherReact&&api.ready()){
        nextWeatherReact=clock+4;
        if(maintenance||config.liveColony!==false)pulseWeatherReact();
      }
      if(clock>=nextFestPulse&&api.ready()){
        nextFestPulse=clock+(config.liveColony===false?120:70+Math.random()*50);
        if(maintenance||config.liveColony!==false)pulseFestivalLife();
      }
      if(clock>=nextVisit&&api.ready()){
        nextVisit=clock+(config.liveColony===false?40:14+Math.random()*12);
        if(maintenance||config.liveColony!==false)pulseNeighborVisit();
      }
      if(clock>=nextLake&&api.ready()){
        nextLake=clock+(config.liveColony===false?55:24+Math.random()*20);
        if(maintenance||config.liveColony!==false)pulseLakeOuting();
      }
      if(clock>=nextApprentice&&api.ready()){
        nextApprentice=clock+(config.liveColony===false?50:18+Math.random()*16);
        if(maintenance||config.liveColony!==false)pulseApprentice();
      }
      if(clock>=nextTeach&&api.ready()){
        nextTeach=clock+(config.liveColony===false?2:1.2);
        if(maintenance||config.priority==='learning'||config.priority==='life')crossTrain(config.priority==='learning'?2:1);
      }
      if(clock>=nextDesign&&api.ready()){
        nextDesign=clock+20;assignDesignTeams();
        if(design.enabled){
          for(const [kind,ids] of [['ui',design.ui],['environment',design.environment]]){
            const body=api.crew().find(b=>ids.includes(b.g.userData.role)&&!b.ritual&&(!b.ordered||b.ordered==='grounds')&&b.mode!=='sleep');
            if(body){issue(kind==='ui'?'gui-audit':availableStudy()?'builder-experiment':'builder-research',[body],true);batch.automatic=true;}
          }
        }
      }
      if(clock>nextHousing){nextHousing=clock+2;if(api.crew().length!==Math.min(POP_CAP,api.homes().length*PER_HOME))syncHousing();} // keep the colony filled to two flies per home
      if(allHands&&clock>nextNightRefill){nextNightRefill=clock+6;const queued=queue.reduce((n,j)=>n+j.count,0);if(queued<50){
        // Only build what the colony actually NEEDS — this stops the overnight sprawl that piled up
        // hundreds of surplus gardens/workshops/stages. Civic kinds are queued ONLY while below their
        // population-based goal; homes only while we still lack houses to seat everyone two-up.
        const counts=api.communityCounts(),pop=api.crew().length,{goals}=chooseExpansion(counts,pop);
        const have={workshop:counts.workshops,garden:counts.gardens,stage:counts.stages,recreation:counts.recreation};
        for(const kind of ['workshop','garden','stage','recreation']){const need=goals[kind]-(have[kind]||0);if(need>0)ensureQueued(kind,Math.min(need,8));}
        const homesNeeded=Math.ceil(pop/PER_HOME);
        if(api.homes().length<homesNeeded&&api.homes().length<NIGHT_HOME_CAP)ensureQueued('home',12);
      }} // keep the build queue topped up overnight — but capped to real need
      if(clock>nextSave){nextSave=clock+5;syncHousing();save();}
      // Automatic weather: roll the dice on rainChance; the owner tunes the odds / turns it off (FEAT.autoWeather).
      // Spells last longer (~2.5–4 min) so a wet roll doesn't flip every minute.
      const autoWeatherOn=(typeof window==='undefined')||window.FLY_FEAT?.autoWeather!==false;
      if(weatherAuto&&autoWeatherOn&&clock>=nextWeather&&api.ready()){nextWeather=clock+150+Math.random()*90;const rain=Math.random()<rainChance;api.environment({weather:rain?'rain':'clear'});if(rain)report('Weather','Rain moves in over the colony.');}
      // Daily worship gathering (+ equinox / eclipse on their cadence).
      if(clock>=nextRite&&api.ready()){nextRite=clock+150;holdRite();}
      // Restore the sky after an eclipse; the day/night cycle then resumes on its own.
      if(eclipseUntil&&clock>=eclipseUntil){eclipseUntil=0;api.environment({preset:'meadow'});}
      const active=api.crew().filter(b=>b.ritual);
      const current=active[0]?.ritual.batch||batch;
      const workList=document.getElementById('active-work');
      if(Math.floor(clock*2)!==workList._tick){
        workList._tick=Math.floor(clock*2);workList.replaceChildren();
        for(const body of active.slice(0,12)){const job=body.ritual,row=document.createElement('li');
          row.textContent=`${body.g.userData.name} · ${job.action.label} · ${job.stage==='travel'?'travelling to site':Math.min(100,Math.round(job.elapsed/6*100))+'%'}${job.site?' · floor '+(Math.round((job.site.y||0)/3.2)+1):''}`;
          const follow=document.createElement('button');follow.textContent='Watch';follow.addEventListener('click',()=>api.watch(body));row.append(' ',follow);workList.append(row);
        }
        if(!active.length){const row=document.createElement('li');row.textContent='No active jobs';workList.append(row);}
      }
      document.getElementById('action-progress').textContent=active.length?`${active.length} acting · ${current?.completed||0}/${current?.total||0} finished`:'Choose a group below, then an action';
      ring.material.opacity=active.some(b=>b.ritual.action.category==='Temple')?0.55+Math.sin(clock*3)*0.25:0.16;
      if(offering.visible){offering.rotation.y+=dt;offering.scale.setScalar(Math.max(0,Math.min(1,(offeringUntil-clock)/5)));if(clock>=offeringUntil)offering.visible=false;}
      if(riteFXKind){ if(clock>=riteFXUntil)clearRiteFX(); else stepRiteFX(dt,clock); }
      for(const body of active){
        const job=body.ritual;
        if(job.stage==='travel'){
          const dx=job.target.x-body.x,dz=job.target.z-body.z,d=Math.hypot(dx,dz),step=Math.min(d,(body.brainLive?.speed||body.speed||6)*2*dt);
          if(d>0.01){body.x+=dx/d*step;body.z+=dz/d*step;body.g.rotation.y=turnToward(body.g.rotation.y,dx,dz,dt);}
          const targetY=job.target.y??api.destination(body.key).y??0;
          const flightY=targetY+(d>4?5:Math.max(0,d-.15)*1.25);
          body.g.position.set(body.x,THREE.MathUtils.lerp(body.g.position.y,flightY,Math.min(1,dt*4)),body.z);
          for(const wing of body.g.userData.wings||[]){const side=wing.mesh.name.startsWith('r_')?-1:1;body.g.userData.flap.makeRotationZ(Math.sin(clock*85)*1.1*side);wing.mesh.matrix.multiplyMatrices(wing.base,body.g.userData.flap);}
          if(d<0.2&&Math.abs(body.g.position.y-targetY)<.1){job.stage='act';job.elapsed=0;body.g.userData.task=job.action.label;}
          continue;
        }
        job.elapsed+=dt;const wave=Math.sin(job.elapsed*4);
        body.g.position.set(body.x,(job.target.y??api.floorAt(body.x,body.z,body.key))+(job.action.effect==='dance'?Math.abs(wave)*0.16:0),body.z);
        body.g.rotation.x=(job.action.effect==='bow'||job.action.effect.endsWith('-ritual'))?Math.max(0,wave)*0.65:0;
        body.g.rotation.z=['sway','dance','pulse'].includes(job.action.effect)?wave*0.16:0;
        if(job.action.effect==='circle')body.g.rotation.y+=dt;
        // Fire each job's effect ONCE, early in the rite. RITUAL/offering spectacle is globally throttled
        // (so it's not 450× at once), but actual CONSTRUCTION must never be throttled — every builder's
        // house is a distinct building. Throttling builds was dropping most queued houses (they hit their
        // dwell and got cancelled before their 1-shot window cleared the shared throttle), so building
        // crawled. Build effects now always fire.
        const _isBuild=/build/.test(String(job.action.effect));
        // Builds fire almost immediately (1.2s) so the builder frees up fast and the queue rips through;
        // rituals keep the 5s gather-first delay and the global spectacle throttle.
        if(job.batch.completed===0&&job.elapsed>=(_isBuild?1.2:5)&&(_isBuild||clock>=nextEffect)){
          if(!_isBuild)nextEffect=clock+0.12;
          effect(body,job.action); job.batch.completed=1;
          const role=body.g.userData.role;skills[role]||={};skills[role][job.action.skill]=(skills[role][job.action.skill]||0)+1;
          learn[role]||={};learn[role][job.action.id]=Math.min(1,(learn[role][job.action.id]||0)+0.2);
          if(job.action.skill==='teaching')crossTrain(2.5);
        }
        // The congregation HOLDS until the whole ritual's dwell is over, then everyone leaves together
        // (no per-fly throttle on leaving) — so a called rite stays full until it ends.
        if(job.elapsed>=(job.dwell||6)){
          job.batch.remaining=Math.max(0,job.batch.remaining-1);
          if(job.batch.remaining===0)report('House',`${job.action.label} finished · ${job.batch.total} flies`);
          cancel(body,true);
        }
      }
      if((maintenance||queue.length)&&clock>=nextCare&&api.ready()){
        // Faster ticks while a build queue is pending, so construction rips through it.
        nextCare=clock+(queue.length?Math.max(0.8,Math.min(config.pace,1.6)):(config.liveColony===false?config.pace:Math.max(0.7,Math.min(config.pace,2.2))));
        const activeAuto=()=>api.crew().filter(b=>b.ritual?.batch?.automatic&&!b.ritual?.batch?.routine).length;
        // Parallelize HARD while a build queue is pending: run many builders at once (not just the small
        // default worker count) so houses go up constantly. Idle (non-queue) work stays one job per tick.
        // Keep the colony VISIBLY ALIVE: with no build queue, don't start just one job every `pace`
        // seconds — keep a population-scaled share of flies busy with upkeep (furnish, clean, tend
        // gardens, teach, repair, research, art, social). Scales with crew (~22% by default), capped for
        // perf, so a large city always has hundreds genuinely working. Toggle with config.liveColony.
        const liveTarget=(config.liveColony===false)?config.workers:Math.min(900,Math.max(config.workers,Math.round(api.crew().length*(config.busyFrac||0.3))));
        const buildCap=queue.length?Math.max(config.workers,64):liveTarget;
        const maxThisTick=queue.length?Math.max(1,buildCap-activeAuto()):Math.max(0,Math.min(120,buildCap-activeAuto()));
        let dispatched=0;
        // BOUND autonomous building: the idle "keep busy" loop cycles a sequence that INCLUDES *-build
        // jobs; with no cap it grew the city FOREVER — a shell/geometry leak that balloons memory and
        // eventually crashes the renderer on a long session (made far worse once we dispatch many jobs
        // per tick). Only allow a build when BELOW the population-scaled goal for that type; homes cap
        // at crew/PER_HOME (and NIGHT_HOME_CAP); temples are explicit-command ONLY. At/over cap → upkeep.
        const _counts=api.communityCounts(), _bpop=api.crew().length;
        const _goals=(chooseExpansion(_counts,_bpop)||{}).goals||{};
        const _civicMap={'garden-build':['garden','gardens'],'workshop-build':['workshop','workshops'],'stage-build':['stage','stages'],'recreation-build':['recreation','recreation']};
        const _buildAllowed=(bid)=>{
          if(bid==='house-build')return api.homes().length < Math.min(Math.ceil(_bpop/PER_HOME), NIGHT_HOME_CAP);
          if(bid==='temple-build')return false;
          const m=_civicMap[bid]; if(m)return (_counts[m[1]]||0) < (_goals[m[0]]||0);
          return true;
        };
        while(dispatched<maxThisTick){
          if(activeAuto()>=buildCap)break;
          const available=api.crew().filter(b=>(!design.enabled||![...design.ui,...design.environment].includes(b.g.userData.role))&&!b.ritual&&(!b.ordered||b.ordered==='grounds')&&b.mode!=='sleep');
          if(!available.length){if(!dispatched)document.getElementById('planner-status').textContent='Waiting for an available resident';break;}
          let id;
          if(queue.length){const job=queue[0];id={home:'house-build',workshop:'workshop-build',garden:'garden-build',stage:'stage-build',recreation:'recreation-build',temple:'temple-build'}[job.kind];job.count--;if(!job.count)queue.shift();}
          else if(availableStudy()&&Math.random()<0.12){id='builder-experiment';}
          else if(researchCycle++%7===0){id='builder-research';}
          else {
            const sequences={balanced:['house-build','furnish','garden-build','temple-build','repair-home','workshop-build','gui-audit','cnc-machine','laser-cut','3d-print','hobby-maker'],housing:['house-build','house-build','furnish'],gardens:['garden-build','clean','garden-build'],temple:['temple-build','worship','temple-build'],workshops:['workshop-build','cnc-machine','laser-cut','3d-print','electronics-maker','hobby-maker','textile-maker','furnish'],music:['stage-build','rehearse','perform','stage-build'],research:['builder-research','builder-experiment','circuit-study','electronics-maker','3d-print'],learning:['teach-neighbor','teach-building','teach-music','teach-circuits','rehearse','circuit-study','furnish','panel-design','harmony','solder-practice','cnc-machine','laser-cut'],
              // "Regular life": daily upkeep & living, light on heavy construction. No 'worship' here —
              // autonomous worship stays priests-only (handled elsewhere); this is everyday life.
              life:['furnish','clean','repair-home','garden-build','teach-neighbor','circuit-study','harmony','hobby-maker','rehearse','teach-building','make-art','exercise','social-hour','explore','play-games','feast','meditate','furnish','clean','textile-maker','teach-music','groom','stretch','read','dance','jam','welcome','council','plant','soundcheck','compose']};
            const sequence=sequences[config.priority]||sequences.balanced;id=sequence[cycle++%sequence.length];
            if(/-build$/.test(id) && !_buildAllowed(id)) id='furnish'; // at/over the goal → do upkeep instead of growing the city forever
          }
          const action=ACTIONS.find(a=>a.id===id);if(!action)break;
          const kind={build:'home','workshop-build':'workshop','garden-build':'garden','stage-build':'stage','recreation-build':'recreation','temple-build':'temple'}[action.effect];
          const site=kind?api.planBuild(kind):null;
          const target=site||api.destination(action.place==='home'?(available[0].home||'lounge'):action.place==='temple'?'temple':action.place);
          available.sort((a,b)=>Math.hypot(a.x-target.x,a.z-target.z)-Math.hypot(b.x-target.x,b.z-target.z));
          issue(id,[available[0]],true,site);batch.automatic=true;dispatched++;
        }
        paintPlanner();
      }
    }
  };
}
