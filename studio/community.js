// Actions describe simulation work, not external fabrication or autonomous code edits.
export const ACTIONS = [
  ['sun-worship','Worship the sun','Temple','forecourt','sun-ritual','devotion'],
  ['moon-worship','Worship the moon','Temple','forecourt','moon-ritual','devotion'],
  ['rain-worship','Worship the rain','Temple','forecourt','rain-ritual','devotion'],
  ['worship','Worship','Temple','forecourt','bow','devotion'],
  ['chant','Chant','Temple','forecourt','pulse','devotion'],
  ['procession','Procession','Temple','forecourt','circle','devotion'],
  ['meditate','Meditate','Temple','forecourt','still','focus'],
  ['offering','Fruit offering','Temple','forecourt','offering','devotion'],
  ['bug-sacrifice','Roach sacrifice','Temple','sacrifice','beetle','devotion'],
  ['vigil','Keep vigil','Temple','forecourt','still','devotion'],
  ['initiation','Initiation','Temple','forecourt','circle','community'],
  ['consecrate','Consecrate altar','Temple','forecourt','pulse','devotion'],
  ['bell','Ring the bell','Temple','forecourt','pulse','devotion'],
  ['festival','Temple festival','Temple','forecourt','dance','community'],
  ['memorial','Hold a memorial','Temple','forecourt','bow','community'],
  ['water-worship','Worship the water','Temple','watertemple','bow','devotion'],
  ['star-study','Study the stars','Temple','earthtemple','still','focus'],
  ['sky-chart','Chart the heavens','Temple','earthtemple','pulse','focus'],
  ['astronomy','Learn the calendar','Temple','astronomy','still','learning'],
  ['astrology','Read the omens','Temple','astronomy','pulse','learning'],
  ['star-marker','Raise a star-marker','Community','earthtemple','astronomy-build','housing'],
  ['west-rite','West temple rite','Temple','westtemple','circle','devotion'],
  ['elder-vigil','Elder-ruins vigil','Temple','ruins','still','devotion'],
  ['heal','Rest & be healed','Temple','healing','still','care'],
  ['moon-rite','Moon rite of Ix Chel','Temple','healing','bow','devotion'],
  ['rehearse','Rehearse','Music','practice','pulse','music'],
  ['compose','Compose a motif','Music','studio','still','music'],
  ['jam','Jam session','Music','studio','dance','music'],
  ['soundcheck','Soundcheck','Music','stage','pulse','music'],
  ['perform','Play a show','Music','stage','dance','music'],
  ['rhythm','Practice rhythm','Music','practice','pulse','music'],
  ['harmony','Practice harmony','Music','practice','sway','music'],
  ['teach-music','Teach music','Music','seminar','pulse','teaching'],
  ['listen-take','Review a take','Music','studio','still','music'],
  ['dance','Dance','Music','stage','dance','community'],
  ['circuit-study','Study a circuit','Company','rnd','still','research'],
  ['prototype','Prototype exercise','Company','rnd','pulse','research'],
  ['scope','Scope practice','Company','rnd','still','research'],
  ['patch-session','Patch session','Company','rnd','sway','research'],
  ['inspect-board','Inspect a board','Company','prove','still','craft'],
  ['solder-practice','Solder practice','Company','prove','pulse','craft'],
  ['inventory','Count inventory','Company','dock','still','craft'],
  ['panel-design','Panel design study','Company','seminar','still','research'],
  ['teach-circuits','Teach circuits','Company','seminar','pulse','teaching'],
  ['merch','Plan merch','Company','stage','still','craft'],
  ['cnc-machine','Run the CNC mill','Company','maker','pulse','craft'],
  ['laser-cut','Use the laser cutter','Company','maker','still','craft'],
  ['3d-print','Run the 3D print farm','Company','maker','pulse','craft'],
  ['electronics-maker','Build at the electronics bench','Company','maker','still','research'],
  ['hobby-maker','Work at the hobby bench','Company','maker','sway','craft'],
  ['textile-maker','Use the textile station','Company','maker','pulse','craft'],
  ['temple-build','Build the temple','Community','temple','temple-build','housing'],
  ['workshop-build','Build a workshop','Community','yard','workshop-build','craft'],
  ['garden-build','Build a garden','Community','yard','garden-build','community'],
  ['stage-build','Build a stage','Community','yard','stage-build','music'],
  ['recreation-build','Build a recreation pavilion','Community','yard','recreation-build','community'],
  ['house-build','Build a home','Community','yard','build','housing'],
  ['furnish','Furnish homes','Community','home','furnish','housing'],
  ['repair-home','Improve a home','Community','home','repair','housing'],
  ['plant','Plant a garden','Community','yard','plant','community'],
  ['clean','Clean the room','Community','home','clean','community'],
  ['feast','Hold a feast','Community','kitchen','sway','community'],
  ['council','Hold council','Community','lounge','circle','community'],
  ['welcome','Welcome residents','Community','lounge','circle','community'],
  ['assemble','Assemble in the courtyard','Community','forecourt','circle','community'],
  ['teach-building','Teach building','Community','seminar','pulse','teaching'],
  ['builder-research','Research improvements','Community','seminar','research-study','research'],
  ['builder-experiment','Test an improvement','Community','home','research-trial','research'],
  ['survey','Survey housing','Community','yard','survey','housing'],
  ['gui-audit','Improve the GUI','Care','dock','gui','craft'],
  ['groom','Groom','Care','yard','bow','care'],
  ['stretch','Stretch wings','Care','yard','sway','care'],
  ['nap','Take a nap','Care','home','still','care'],
  ['play-games','Play games','Care','recreation','circle','care'],
  ['make-art','Make art','Care','recreation','pulse','craft'],
  ['exercise','Exercise together','Care','recreation','sway','care'],
  ['social-hour','Social hour','Care','recreation','circle','community'],
  ['explore','Explore together','Care','yard','circle','focus'],
  ['read','Read in the library','Care','library','still','focus'],
  ['teach-neighbor','Teach a neighbor','Care','seminar','pulse','teaching'],
  // —— North-corner movie studio + Esplanade of Pyramids (takes → riffs/videos/) ——
  ['film-school','Film school','Film','filmset','pulse','teaching'],
  ['film-rehearse','Rehearse a scene','Film','filmset','circle','craft'],
  ['film-esplanade','Walk the Esplanade','Film','esplanade','circle','craft'],
  ['film-approach','Approach shot — ten temples','Film','esplanade_mid','pulse','craft'],
  ['film-gate','Studio gate call','Film','studio_gate','still','teaching'],
  ['film-block','Block the shot','Film','backlot','pulse','craft'],
  ['film-record','Record a fly take','Film','soundstage','still','craft'],
  ['film-dress','Costume fitting','Film','wardrobe','sway','craft'],
  ['film-props','Dress the set','Film','propyard','pulse','craft'],
  ['film-review','Watch the dailies','Film','filmset','still','learning'],
  ['film-direct','Call action','Film','filmset','pulse','teaching']
].map(([id,label,category,place,effect,skill])=>({id,label,category,place,effect,skill}));

export function housingPlan(homes, residents, perHome = 1) {
  const cap = Math.max(1, perHome | 0);
  const assignments = new Map();
  const used = new Map(homes.map(h => [h.key, 0]));   // residents already placed in each home
  // Keep residents in their current home while it still has an open slot.
  for (const resident of residents) {
    const n = used.get(resident.home);
    if (n != null && n < cap) { assignments.set(resident.role, resident.home); used.set(resident.home, n + 1); }
  }
  const waiting = residents.filter(r => !assignments.has(r.role));
  const vacant = [];                                    // one entry per still-open slot
  for (const h of homes) {
    for (let n = used.get(h.key) || 0; n < cap; n++) {
      const resident = waiting.shift();
      if (resident) assignments.set(resident.role, h.key);
      else vacant.push(h.key);
    }
  }
  return {assignments, vacant, waiting: waiting.map(r => r.role)};
}

export function normalizeBuildQueue(items,perKindCap=100) {
  const allowed=new Set(['home','workshop','garden','stage','recreation','temple']),totals=new Map();
  for(const item of Array.isArray(items)?items:[]){
    if(!allowed.has(item?.kind)||!Number.isInteger(item.count)||item.count<1)continue;
    totals.set(item.kind,Math.min(perKindCap,(totals.get(item.kind)||0)+item.count));
  }
  return [...totals].map(([kind,count])=>({kind,count}));
}

export function chooseExpansion(counts,population) {
  const pop=Math.max(1,Number(population)||1),goals={garden:Math.ceil(pop/18),workshop:Math.ceil(pop/32),stage:Math.ceil(pop/70),recreation:Math.ceil(pop/24)};
  const values={garden:counts?.gardens||0,workshop:counts?.workshops||0,stage:counts?.stages||0,recreation:counts?.recreation||0};
  const kind=Object.keys(goals).sort((a,b)=>values[a]/goals[a]-values[b]/goals[b])[0];
  return {kind,count:values[kind],goal:goals[kind],goals};
}

export function chooseCareAction(needs) {
  const choices=[
    {id:'nap',value:Number(needs?.energy),threshold:.34},
    {id:'feast',value:Number(needs?.satiety),threshold:.34},
    {id:'meditate',value:Number(needs?.calm),threshold:.3}
  ].filter(item=>Number.isFinite(item.value)&&item.value<item.threshold);
  choices.sort((a,b)=>a.value/a.threshold-b.value/b.threshold);
  return choices[0]?.id||null;
}

export function summarizeWellbeing(records) {
  const rows=(Array.isArray(records)?records:Object.values(records||{})).filter(row=>
    ['energy','satiety','calm'].every(key=>Number.isFinite(Number(row?.[key])))
  );
  const average=key=>rows.length?rows.reduce((sum,row)=>sum+Number(row[key]),0)/rows.length:0;
  return {
    count:rows.length,
    energy:average('energy'),satiety:average('satiety'),calm:average('calm'),
    critical:rows.filter(row=>chooseCareAction(row)).length
  };
}

export function activityKind(body) {
  if (body?.ritual) return body.ritual.action.category === 'Temple' ? 'ritual' :
    body.ritual.action.category === 'Music' ? 'music' :
    body.ritual.action.skill === 'teaching' ? 'learning' :
    body.ritual.action.category === 'Company' ? 'research' : 'building';
  if (body?.mode === 'sleep') return 'rest';
  if (body?.mode === 'eat') return 'feeding';
  if (body?.mode === 'rest') return 'rest';
  if (body?.wait <= 0) return 'movement';
  const task=body?.g?.userData.task || '';
  if (/teach|learn|seminar/i.test(task)) return 'learning';
  if (/riff|music|beat|tempo|chord|record|sound/i.test(task)) return 'music';
  if (/circuit|scope|pedal|patch|breadboard/i.test(task)) return 'research';
  return 'building';
}

export const ACTIVITY_COLORS = {
  movement:'#62c9ff', learning:'#9a6ad4', music:'#ed8ccf', research:'#5ce0c1',
  building:'#f3bb79', ritual:'#9a6ad4', feeding:'#a8d781', rest:'#8693b2'
};
// The posed fly faces local -Z; positive Y rotation points its nose toward -X.
export function travelYaw(dx,dz) { return Math.atan2(-dx,-dz); }
export function turnToward(current,dx,dz,dt) {
  if(Math.hypot(dx,dz)<1e-8)return current;
  const delta=Math.atan2(Math.sin(travelYaw(dx,dz)-current),Math.cos(travelYaw(dx,dz)-current));
  return current+delta*(1-Math.exp(-14*dt));
}
export function spiralPlot(index,spacing) {
  if(index===0)return {x:0,z:0};
  const ring=Math.ceil((Math.sqrt(index+1)-1)/2),side=2*ring;
  const offset=index-(2*ring-1)**2;
  const edge=Math.floor(offset/side),step=offset%side;
  const coords=[[ring,-ring+step],[ring-step,ring],[-ring,ring-step],[-ring+step,-ring]];
  return {x:coords[edge][0]*spacing,z:coords[edge][1]*spacing};
}
export function parseLocalCommand(input) {
  const text=input.toLowerCase().trim().replace(/[.!?]+$/,'').replace(/\s+/g,' ');
  if(!text)return {error:'Enter a command or choose an example.'};
  if(text==='help')return {type:'help'};
  if(['pause','pause world','pause day'].includes(text))return {type:'pause',value:true};
  if(['resume','resume world','resume day'].includes(text))return {type:'pause',value:false};
  if(['save','save world'].includes(text))return {type:'save'};
  if(['export','export world','download world','export colony'].includes(text))return {type:'export'};
  if(['import','import world','load world file','import colony'].includes(text))return {type:'import'};
  if(['status','report','summary'].includes(text))return {type:'status'};
  if(['clear queue','clear build queue','cancel queue'].includes(text))return {type:'clear-queue'};
  if(['stop all','cancel all','release all','stop everyone','recall everyone'].includes(text))return {type:'stop',all:true};
  if(['stop','stop selected'].includes(text))return {type:'stop'};
  let m=text.match(/^(?:auto|autonomy|automatic building) (on|off)$/);
  if(m)return {type:'auto',value:m[1]==='on'};
  m=text.match(/^(?:priority|focus) (life|balanced|housing|gardens|temple|workshops|music|research|learning)$/);
  if(m)return {type:'priority',value:m[1]};
  if(['cross-train','cross train','teach everyone','train everyone','everyone learn','share skills','learn all jobs'].includes(text))return {type:'cross-train'};
  m=text.match(/^(?:workers|crew|builders) (\d+)$/);
  if(m)return +m[1]>=1&&+m[1]<=12?{type:'workers',value:+m[1]}:{error:'Choose 1–12 active workers.'};
  m=text.match(/^hive (?:levels|floors) (\d+)$/);
  if(m)return +m[1]>=1&&+m[1]<=12?{type:'levels',value:+m[1]}:{error:'Choose 1–12 floors per hive column.'};
  m=text.match(/^(?:pace|build every) (\d+)(?: seconds?)?$/);
  if(m)return +m[1]>=5&&+m[1]<=300?{type:'pace',value:+m[1]}:{error:'Choose a work interval from 5 to 300 seconds.'};
  if(['build everything','build it all','build the whole town','build the whole city'].includes(text))return {type:'everything'};
  if(['finish the temple','complete the temple','raise the temple','top out the temple'].includes(text))return {type:'build',count:99,kind:'temple'};
  m=text.match(/^(?:build|make|found|start) (?:a |an |the )?(village|hamlet|district|neighborhood|neighbourhood|quarter|town|city|plaza|square)$/);
  if(m)return {type:'bundle',preset:m[1]};
  m=text.match(/^(?:expand|grow|extend|open) (?:the )?(?:land|map|world|ground|frontier|plots|territory|border)(?: (\d+))?$/);
  if(m){const count=/^\d+$/.test(m[1]||'')?+m[1]:8;return count>=1&&count<=100?{type:'expand',count}:{error:'Expand 1–100 plots at a time.'};}
  m=text.match(/^(?:build|make|add|raise|place|put(?: up)?|construct|queue) (?:up )?(?:(\d+|a|an) )?(homes?|houses?|hives?|workshops?|shops?|gardens?|parks?|stages?|temples?|shrines?|towers?|recreation pavilions?|pavilions?|playgrounds?)$/);
  if(m){const count=/^\d+$/.test(m[1]||'')?+m[1]:1;if(count<1||count>100)return {error:'Queue 1–100 buildings at a time; you can add more afterward.'};
    const word=m[2],kind=/home|house|hive/.test(word)?'home':/workshop|shop/.test(word)?'workshop':/garden|park/.test(word)?'garden':/stage/.test(word)?'stage':/temple|shrine|tower/.test(word)?'temple':/recreation|pavilion|playground/.test(word)?'recreation':word.replace(/s$/,'');
    return {type:'build',count,kind};}
  // --- Environment, weather, sky, lighting, time of day ---
  const PRESETS={meadow:'meadow',dawn:'dawn','golden hour':'goldenhour',goldenhour:'goldenhour',golden:'goldenhour',dusk:'dusk',twilight:'dusk',moonlit:'moonlit',night:'moonlit',nighttime:'moonlit',moon:'moonlit',desert:'desert',tropical:'tropical',autumn:'autumn',fall:'autumn',forest:'forest',woodland:'forest',mist:'mist',misty:'mist',overcast:'overcast',cloudy:'overcast',storm:'storm',stormy:'storm',snow:'snow',snowfield:'snow',winter:'snow',urban:'urban'};
  m=text.match(/^(?:environment|scene|set environment(?: to)?|set the scene(?: to)?|make it) (.+)$/);
  if(m&&PRESETS[m[1]])return {type:'environment',preset:PRESETS[m[1]]};
  if(PRESETS[text]&&!['moon','city','fog'].includes(text))return {type:'environment',preset:PRESETS[text]};
  if(['rain','make it rain','weather rain','let it rain','start the rain','start rain'].includes(text))return {type:'weather',value:'rain'};
  if(['clear skies','weather clear','stop rain','sunny','clear sky','no rain','sunshine'].includes(text))return {type:'weather',value:'clear'};
  const TIMES={sunrise:7.5,morning:9,'late morning':11,noon:13,midday:13,afternoon:15,'late afternoon':16.5,evening:17.5,sunset:18};
  m=text.match(/^(?:time|set time(?: to)?|make it) (.+)$/);
  if(m&&TIMES[m[1]]!==undefined)return {type:'time',value:TIMES[m[1]]};
  m=text.match(/^sun(?: angle)? (\d+(?:\.\d+)?)$/);
  if(m){const h=+m[1];return h>=7&&h<=18?{type:'time',value:h}:{error:'Sun angle runs 7 (sunrise) to 18 (sunset).'};}
  if(['brighter','brighten','lighter','more light','turn up the lights'].includes(text))return {type:'brightness',delta:0.2};
  if(['darker','dim','dimmer','less light','turn down the lights'].includes(text))return {type:'brightness',delta:-0.2};
  m=text.match(/^(?:brightness|sun brightness) (\d+(?:\.\d+)?)$/);
  if(m){const v=+m[1];return v>=0.6&&v<=1.5?{type:'brightness',value:v}:{error:'Brightness runs 0.6 to 1.5.'};}
  m=text.match(/^(?:fog|atmosphere|haze|depth|mist) (on|off)$/);
  if(m)return {type:'env',config:{fog:m[1]==='on'}};
  m=text.match(/^shadows? (off|soft|balanced|high|detailed)$/);
  if(m)return {type:'env',config:{shadows:m[1]==='detailed'?'high':m[1]==='soft'?'balanced':m[1]}};
  // --- Camera: natural names for every landmark map to their CAMS key ---
  const CAM_ALIASES={
    'top':'top','overview':'top','aerial':'top','city':'top','the city':'top','sky':'top','zoom out':'top','out':'top','reset':'top','reset view':'top','reset camera':'top','wide':'top','whole map':'top','everything':'top',
    'hive':'hive','home':'hive','homes':'hive','dorm':'hive','dorms':'hive','bedrooms':'hive','houses':'hive',
    'temple':'temple','great temple':'temple','great pyramid':'temple','main temple':'temple','pyramid':'temple',"za'kuun":'temple','zakuun':'temple','temple of zakuun':'temple',
    'forecourt':'forecourt','courtyard':'forecourt','plaza':'plaza','great plaza':'plaza','maya':'maya','maya city':'maya','acropolis':'maya',
    'maker':'maker','warehouse':'maker','maker warehouse':'maker','workshop':'maker','workshops':'maker',
    'south temples':'annexTemple','south temple':'annexTemple','annex':'annexTemple','south':'annexTemple',
    'east temple':'easttemple','east temples':'easttemple','ix chel':'easttemple','moon temple':'easttemple','healing':'easttemple','healing temple':'easttemple','medicine':'easttemple',
    'sun temple':'suntemple','sun':'suntemple',"k'inich ajaw":'suntemple','kinich ajaw':'suntemple','kinich':'suntemple','jaguar temple':'suntemple','jaguars':'suntemple',
    'west temple':'westgrand','kanul':'westgrand','temple of kanul':'westgrand','guardian':'westgrand','west':'westgrand',
    'sacrificial temple':'sacrificialtemple','sacrifice temple':'sacrificialtemple','sacrificial':'sacrificialtemple','pyramid of sacrifice':'sacrificialtemple','shaman':'sacrificialtemple',
    'roach altar':'sacrifice','roach':'sacrifice','altar':'sacrifice',
    'equinox':'equinox','equinox temple':'equinox',
    'astronomy':'astronomy','observatory':'astronomy','astrology':'astronomy','calendar':'astronomy','hall of the calendar':'astronomy','astronomy hall':'astronomy',
    'sky citadel':'citadel','citadel':'citadel','machu picchu':'citadel','mountaintop':'citadel','mountain city':'citadel','terraces':'citadel',
    'elder ruins':'ruins','ruins':'ruins','alien ruins':'ruins','alien city':'ruins','elder city':'ruins','the ruins':'ruins',
    'moon':'moon','studio':'studio',
    'film lot':'filmset','filmset':'filmset','movie set':'filmset','movie studio':'filmset','backlot':'backlot','soundstage':'soundstage',
    'film pyramid':'filmpyramid','movie pyramid':'filmpyramid','house of moving light':'filmpyramid',
    'esplanade':'esplanade','esplanade of pyramids':'esplanade','pyramid avenue':'esplanade',
    'esplanade mid':'esplanade_mid','mid esplanade':'esplanade_mid','studio gate':'studio_gate',
    'esplanade gate':'esplanade','first light':'esp1','fifth gate':'esp5','tenth arrival':'esp10',
    'stage 2':'stage2','open stage':'stage2','sound stage':'soundstage',
    'wardrobe':'wardrobe','prop yard':'propyard','props':'propyard'
  };
  // --- Feature toggles (the on/off UI buttons), by natural name. Defined BEFORE the camera
  // parser so "show flies"/"show trees" route here (a toggle) instead of a bogus camera move. ---
  const TOG_ALIASES={
    'day night':'daynight','day/night':'daynight','daynight':'daynight','day night cycle':'daynight','auto day':'daynight','night cycle':'daynight','day and night':'daynight',
    'maintenance':'maint','maintenance bot':'maint','janitor':'maint','cleanup bot':'maint','clean up bot':'maint',
    'gold rings':'goldrings','goldrings':'goldrings','rings':'goldrings','halos':'goldrings',
    'glass':'roofs','glass roofs':'roofs','roofs':'roofs','roof':'roofs',
    'lawns':'lawns','grass':'lawns','trees':'trees','paths':'paths','walkways':'paths',
    'flies':'flies','the flies':'flies','fly names':'flynames','flynames':'flynames','names':'roster',
    'labels':'labels-brain','map labels':'labels-brain','map text':'labels-brain',
    'marker':'ring','markers':'ring','selection ring':'ring',
    'dots':'dots','readouts':'readouts','signals':'signals','meters':'meters','motion':'motion','transmitters':'nt'
  };
  m=text.match(/^(camera|show me|show|view|look at|fly to|jump to|take me to|pan to) (?:the )?(.+)$/);
  if(m){const verb=m[1],noun=m[2];
    if((verb==='show'||verb==='show me')&&TOG_ALIASES[noun]&&!CAM_ALIASES[noun])return {type:'toggle',key:TOG_ALIASES[noun],on:true}; // "show flies" = turn the toggle on
    return {type:'camera',value:CAM_ALIASES[noun]||noun.replace(/\s+/g,'')};}
  // softer "go to X" only means the camera when X is a known place (so "go to sleep" stays an action)
  m=text.match(/^(?:go to|goto|head to|travel to|take me) (?:the )?(.+)$/);
  if(m&&CAM_ALIASES[m[1]])return {type:'camera',value:CAM_ALIASES[m[1]]};
  if(CAM_ALIASES[text])return {type:'camera',value:CAM_ALIASES[text]};
  m=text.match(/^(?:the )?(.+?) (on|off|visible|hidden)$/);
  if(m&&TOG_ALIASES[m[1]])return {type:'toggle',key:TOG_ALIASES[m[1]],on:m[2]==='on'||m[2]==='visible'};
  m=text.match(/^(turn on|turn off|enable|disable|show|hide|toggle) (?:the )?(.+)$/);
  if(m&&TOG_ALIASES[m[2]])return {type:'toggle',key:TOG_ALIASES[m[2]],on:m[1]==='toggle'?undefined:/^(turn on|enable|show)$/.test(m[1])};
  // --- Tidy / day / night convenience ---
  if(['tidy','tidy up','clean up','cleanup','clean up the town','fix the town','fix overlaps','relocate buildings','organize','organize the town',
      'take everything out of the roads','take everything off the roads','clear the roads','get off the roads','houses off the roads','nothing on the roads','off the roads',
      'take the houses out of the lake','take the house out of the lake','houses out of the lake','houses out of the water','get out of the water','clear the water','clear the lake','nothing in the water'].includes(text))return {type:'tidy'};
  if(['arrange houses','houses in rows','rows','organize houses','arrange the houses','make neighborhoods','make neighbourhoods','make communities','house rows','line up the houses','fix the houses'].includes(text))return {type:'arrange'};
  if(['clear temples','remove temples','remove extra temples','no more temples','remove the extra pyramids','clear pyramids','remove stray temples','too many temples'].includes(text))return {type:'clear-temples'};
  if(['thin buildings','reduce buildings','fewer buildings','less buildings','thin the city','thin community','too many buildings','reduce the sprawl','thin buildings to needs'].includes(text))return {type:'thin-community'};
  if(['demolish','demolish building','demolish nearest','remove building','tear down','tear down building','destroy building'].includes(text))return {type:'demolish'};
  if(['move building','move building here','relocate building','move nearest here','bring building here'].includes(text))return {type:'move-building'};
  if(['day','daytime','daylight','make it day','make it daytime'].includes(text))return {type:'environment',preset:'meadow'};
  if(['night','nighttime','make it night','make it nighttime','lights out'].includes(text))return {type:'environment',preset:'moonlit'};
  // --- Weather automation, rain probability, and communal rites ---
  if(['weather auto on','automatic weather on','auto weather on','automate the weather','automate weather'].includes(text))return {type:'weatherauto',on:true};
  if(['weather auto off','automatic weather off','auto weather off','manual weather','stop automatic weather'].includes(text))return {type:'weatherauto',on:false};
  m=text.match(/^(?:rain chance|rain probability|chance of rain|rain odds)\s+(\d+(?:\.\d+)?)%?$/);
  if(m){let v=+m[1];if(v>1)v/=100;return v>=0&&v<=1?{type:'rainchance',value:v}:{error:'Rain chance is 0 to 1 (or 0–100%).'};}
  if(['more rain','rain more','rain more often','rainier','wetter','make it rain more'].includes(text))return {type:'rainchance',delta:0.15};
  if(['less rain','rain less','drier','rarely rain','rain rarely','make it rain less'].includes(text))return {type:'rainchance',delta:-0.15};
  if(['worship now','hold worship','call to worship','call the colony to worship','daily worship','gather to worship','gather the colony','gather everyone to worship'].includes(text))return {type:'rite',which:'worship'};
  if(['equinox rite','hold the equinox','equinox ceremony','celebrate the equinox','hold an equinox'].includes(text))return {type:'rite',which:'equinox'};
  if(['eclipse','hold an eclipse','summon an eclipse','solar eclipse','lunar eclipse','trigger an eclipse'].includes(text))return {type:'rite',which:'eclipse'};
  if(['earth rite','worship earth','worship the earth','hold an earth rite','astronomy rite'].includes(text))return {type:'rite',which:'earth'};
  if(['west rite','worship west','west temple rite','hold a west rite'].includes(text))return {type:'rite',which:'west'};
  if(['water rite','hold a water rite'].includes(text))return {type:'rite',which:'water'};
  const phrase=text.replace(/^(?:everyone|selected) /,'');
  const aliases={'worship sun':'sun-worship','worship moon':'moon-worship','worship rain':'rain-worship','worship water':'water-worship','water worship':'water-worship','worship earth':'star-study','earth worship':'star-study','worship west':'west-rite','west worship':'west-rite',research:'builder-research','research improvements':'builder-research','test improvement':'builder-experiment',sleep:'nap','go to sleep':'nap','build a home':'house-build','sacrifice a bug':'bug-sacrifice','sacrifice a roach':'bug-sacrifice','roach sacrifice':'bug-sacrifice','improve gui':'gui-audit','repair homes':'repair-home','furnish homes':'furnish','plant a garden':'garden-build','build temple':'temple-build',celebrate:'festival',party:'festival',gather:'assemble','gather everyone':'assemble','call everyone':'assemble',pray:'worship','call to worship':'worship',dine:'feast',meeting:'council'};
  const action=ACTIONS.find(a=>a.id===phrase||a.label.toLowerCase()===phrase||a.id===aliases[phrase]);
  if(action)return {type:'action',id:action.id,scope:text.startsWith('everyone ')?'everyone':undefined};
  return {error:'Not recognized. Try “build 5 homes”, “build a village”, “show sun temple”, “maintenance off”, “tidy”, “night”, “all hands”, “status”, or “help” for the full list.'};
}

// Scene channels are engineering mappings, not biological sensory annotations.
export const LIVE_CHANNELS=['target distance','eastward target','westward target','southward target','northward target','height','travelling','working','resting','daylight','rain','job progress'];
export function stepConnectome(circuit,inputs,outputCount){
  const raw=Array(outputCount).fill(0),scale=Array(outputCount).fill(0),signals=[];
  for(const [i,j,count,weight] of circuit.edges){const value=(Number.isFinite(inputs[i])?inputs[i]:0)*weight;raw[j]+=value;scale[j]+=Math.abs(weight);signals.push(value);}
  const outputs=raw.map((v,i)=>Math.tanh(v/Math.max(1,scale[i])));
  const energy=outputs.reduce((n,v)=>n+Math.abs(v),0)/Math.max(1,outputs.length);
  return {raw,outputs,signals,energy,speed:5+energy*6};
}

export function compactBrainState(state) {
  if(!state||!Number.isFinite(Number(state.tick)))return null;
  const round=value=>Number.isFinite(Number(value))?Math.round(Number(value)*10000)/10000:0;
  const array=value=>Array.isArray(value)?value.map(round):[];
  return {inputs:array(state.inputs),raw:array(state.raw),outputs:array(state.outputs),signals:array(state.signals),energy:round(state.energy),speed:round(state.speed),tick:Number(state.tick),model:String(state.model||'')};
}
