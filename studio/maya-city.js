import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/** Unit instanced geom — scaled per instance; softens plaza/temple trim silhouettes (Slice A). */
const INST_UNIT = new RoundedBoxGeometry(1, 1, 1, 4, 0.07);

// A fictional Maya-inspired precinct, not a reconstruction of a particular site.
// Stable coordinates keep saved worlds and spectators on the same plan.
export const PRECINCT = {x:0,z:-285,halfX:132,halfZ:105};
export function inPrecinct(x,z,r=0){return Math.abs(x-PRECINCT.x)<PRECINCT.halfX+r&&Math.abs(z-PRECINCT.z)<PRECINCT.halfZ+r;}
export function limestoneMaterial(){
  const N=512;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=N;
  const rough=document.createElement('canvas');rough.width=rough.height=N;
  const c=canvas.getContext('2d'),rc=rough.getContext('2d');
  let seed=391;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const fbm=(x,y)=>{let v=0,a=0.5,f=1;for(let o=0;o<5;o++){const s=Math.sin((x*f)*12.9898+(y*f)*78.233+o*17.1)*43758.5453;v+=((s-Math.floor(s))-0.5)*a;a*=0.5;f*=2.07;}return v;};
  // Broad, low-frequency weathering so the tile never resolves into a grid.
  const img=c.createImageData(N,N),rimg=rc.createImageData(N,N);
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const i=(y*N+x)*4;
    const mott=fbm(x/N*3,y/N*3)*40+fbm(x/N*13,y/N*13)*16;
    const streak=Math.max(0,fbm(x/N*2+9,y/N*0.4)*1.6)*-26; // vertical rain staining
    const base=176+mott+streak;
    img.data[i]=Math.max(70,base+8);img.data[i+1]=Math.max(64,base+2);img.data[i+2]=Math.max(48,base-18);img.data[i+3]=255;
    const rr=205+mott*1.4+streak*1.6;rimg.data[i]=rimg.data[i+1]=rimg.data[i+2]=Math.max(120,Math.min(255,rr));rimg.data[i+3]=255;
  }
  c.putImageData(img,0,0);rc.putImageData(rimg,0,0);
  // Irregular ashlar courses: jittered heights, offset joints, recessed mortar.
  let y=0;const course=N/9;
  while(y<N){
    const h=course*(0.82+rand()*0.4);let x=-rand()*course*1.5;
    while(x<N){
      const w=course*(1.1+rand()*1.3);
      c.fillStyle='rgba(38,30,18,0.55)';c.fillRect(x,y,w,1.4);c.fillRect(x,y,1.4,h); // mortar
      rc.fillStyle='rgb(240,240,240)';rc.fillRect(x,y,w,1.4);rc.fillRect(x,y,1.4,h);
      const chip=rand();if(chip<0.12){c.fillStyle='rgba(90,74,52,0.4)';c.fillRect(x+w*rand()*0.7,y+h*rand()*0.7,3,3);} // spalls
      x+=w;
    }
    y+=h;
  }
  const map=new THREE.CanvasTexture(canvas);map.wrapS=map.wrapT=THREE.RepeatWrapping;map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=8;
  const rmap=new THREE.CanvasTexture(rough);rmap.wrapS=rmap.wrapT=THREE.RepeatWrapping;rmap.colorSpace=THREE.NoColorSpace;rmap.anisotropy=8;
  // Physical + light clearcoat = wet limestone sheen (reads stone, not chalk box).
  return new THREE.MeshPhysicalMaterial({
    map, roughnessMap: rmap, bumpMap: map, bumpScale: 0.09,
    color: 0xe4d8bc, roughness: 0.88, metalness: 0.02,
    clearcoat: 0.18, clearcoatRoughness: 0.55,
    envMapIntensity: 0.95
  });
}
export function createMayaCity(scene,stone){
  const group=new THREE.Group();group.name='maya-city';scene.add(group);
  const plaster=new THREE.MeshPhysicalMaterial({color:0xc9bea3,roughness:.9,metalness:0.02,clearcoat:0.08,clearcoatRoughness:0.7,envMapIntensity:0.7});
  const red=new THREE.MeshPhysicalMaterial({color:0x883e2c,roughness:.82,metalness:0.04,clearcoat:0.12,clearcoatRoughness:0.45,envMapIntensity:0.85});
  const dark=new THREE.MeshStandardMaterial({color:0x322d23,roughness:.92,envMapIntensity:0.45});
  const batches=new Map();
  function box(x,y,z,w,h,d,mat=stone){if(!batches.has(mat))batches.set(mat,[]);batches.get(mat).push([x,y,z,w,h,d]);}
  function temple(x,z,width,height,levels){
    const top=width*.22,step=(width-top)/levels;
    for(let i=0;i<levels;i++){
      const size=width-i*step,y=i*height/levels;
      box(x,y+height/levels/2,z,size,height/levels,size);
      box(x,y+height/levels-.14,z,size+.35,.28,size+.35,plaster);
    }
    // Many shallow treads form a continuous staircase up the south face.
    const n=Math.ceil(height/.48),run=(width-top)/2;
    for(let i=0;i<n;i++){const h=(i+1)*height/n;box(x,h/2,z+width/2-(i+.5)*run/n,width*.16,h,run/n+.02,plaster);}
    const w=top*.82,h=height*.2,d=top*.7;
    box(x,height+h/2,z,w,h,d);box(x,height+h*.46,z+d/2+.02,w*.32,h*.92,.09,dark);
    box(x,height+h*.92,z+d/2+.09,w*.72,.42,.28,red);
    box(x,height+h+.22,z,w+1,.44,d+1,plaster);
    for(let i=-2;i<=2;i++)box(x+i*w/5,height+h+1.7,z-.3,w/7,2.6,.9);
    box(x,height+h+3.1,z-.3,w, .45,1.1,red);
  }
  box(0,.025,-285,260,.05,206,plaster);
  // Central open plaza faces three tall northern temples, with paired flanking temples.
  const temples=[[-76,-349,44,28,8],[0,-353,56,39,9],[76,-349,44,31,8],[-99,-285,37,23,7],[99,-285,37,23,7],[-100,-222,31,18,6],[100,-222,31,18,6]];
  temples.forEach(t=>temple(...t));
  // Palace ranges around a courtyard. Door recesses and a continuous red cornice.
  for(const x of [-49,49]){
    box(x,1,-229,19,2,53);box(x,4.3,-229,16,4.6,49);
    box(x,6.8,-229,18,.5,51,plaster);box(x,6.25,-229,16.2,.5,49.2,red);
    for(let z=-249;z<=-209;z+=8)box(x+(x<0?8.03:-8.03),3.7,z,.12,3.4,2.4,dark);
  }
  // Recessed visual playing lane and sloping-looking stepped spectator banks.
  box(0,.09,-232,17,.12,49,dark);
  for(const side of [-1,1])for(let i=0;i<4;i++)box(side*(11+i*1.8),.3+i*.45,-232,1.9,.6+i*.9,51,plaster);
  // Sacbe-style walks remain level for residents and camera navigation.
  box(0,.065,-283,12,.08,73,plaster);
  for(const x of [-127,127])box(x,.045,-100,7,.06,165,plaster);
  box(0,.065,-182,260,.08,8,plaster);
  // Stelae and altars line the plaza, leaving the central gathering area clear.
  for(const x of [-30,-15,15,30]){box(x,2.2,-302,1.4,4.4,.85);box(x,2.2,-301.54,.8,3.5,.1,red);box(x,.32,-298,2.6,.64,2.2);}
  const geometry=INST_UNIT,transform=new THREE.Object3D();
  for(const [mat,items] of batches){const mesh=new THREE.InstancedMesh(geometry,mat,items.length);items.forEach(([x,y,z,w,h,d],i)=>{transform.position.set(x,y,z);transform.scale.set(w,h,d);transform.updateMatrix();mesh.setMatrixAt(i,transform.matrix);});mesh.castShadow=true;mesh.receiveShadow=true;mesh.computeBoundingSphere();mesh.frustumCulled=false;group.add(mesh);}
  // Dense, layered canopy around the precinct edges leaves plazas and paths open.
  const bark=new THREE.MeshStandardMaterial({color:0x514731,roughness:1});
  const foliage=new THREE.MeshStandardMaterial({color:0x284d3e,roughness:.95});
  const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.35,.65,1,6),bark,160);
  const crowns=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),foliage,480);
  let seed=17;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<160;i++){
    const side=i%3,x=side===0?-155-random()*30:side===1?155+random()*30:(random()-.5)*320;
    const z=side===2?-409-random()*35:-190-random()*200,h=8+random()*11;
    transform.position.set(x,h/2,z);transform.scale.set(1,h,1);transform.updateMatrix();trunks.setMatrixAt(i,transform.matrix);
    for(let j=0;j<3;j++){transform.position.set(x+(random()-.5)*6,h+j*1.5,z+(random()-.5)*6);transform.scale.set(4+random()*3,2+random()*2,4+random()*3);transform.updateMatrix();crowns.setMatrixAt(i*3+j,transform.matrix);crowns.setColorAt(i*3+j,new THREE.Color().setHSL(.36+random()*.1,.25+random()*.18,.13+random()*.12));}
  }
  trunks.castShadow=crowns.castShadow=true;trunks.receiveShadow=crowns.receiveShadow=true;trunks.frustumCulled=false;crowns.frustumCulled=false;group.add(trunks,crowns);
  group.userData.temples=temples.length;group.userData.style='Maya-inspired ceremonial city';
  return group;
}

// Ceremonial annex plus a maker floor, batched by material into a handful of
// instanced draws so the permanent expansion stays cheap as the city grows.
export function createMakerExpansion(scene,stone,warehouseZ){
  const group=new THREE.Group();group.name='maker-temple-expansion';scene.add(group);
  const plaster=new THREE.MeshPhysicalMaterial({color:0xc8b99a,roughness:.88,metalness:0.02,clearcoat:0.1,clearcoatRoughness:0.65,envMapIntensity:0.75});
  const red=new THREE.MeshPhysicalMaterial({color:0x793a2d,roughness:.78,metalness:0.05,clearcoat:0.15,clearcoatRoughness:0.4,envMapIntensity:0.9});
  const metal=new THREE.MeshPhysicalMaterial({color:0x55606a,metalness:.72,roughness:.3,clearcoat:0.35,clearcoatRoughness:0.25,envMapIntensity:1.2});
  const dark=new THREE.MeshStandardMaterial({color:0x20252a,metalness:.35,roughness:.45,envMapIntensity:0.6});
  const safety=new THREE.MeshStandardMaterial({color:0xc78d35,roughness:.58,envMapIntensity:0.7});
  const obsidian=new THREE.MeshPhysicalMaterial({color:0x17171a,metalness:.25,roughness:.22,clearcoat:0.55,clearcoatRoughness:0.15,envMapIntensity:1.4});
  const jade=new THREE.MeshPhysicalMaterial({color:0x2b776b,metalness:.12,roughness:.48,clearcoat:0.4,clearcoatRoughness:0.3,envMapIntensity:1.1});
  const gold=new THREE.MeshPhysicalMaterial({color:0xc9993c,metalness:.62,roughness:.28,clearcoat:0.45,clearcoatRoughness:0.2,envMapIntensity:1.35});
  const ember=new THREE.MeshStandardMaterial({color:0xff6b24,emissive:0xb52b0d,emissiveIntensity:2.4,roughness:.5});
  const glass=new THREE.MeshStandardMaterial({color:0x74a8aa,transparent:true,opacity:.38,roughness:.2,depthWrite:false});
  const batches=new Map(),add=(mat,x,y,z,w,h,d)=>{if(!batches.has(mat))batches.set(mat,[]);batches.get(mat).push([x,y,z,w,h,d]);};
  const templeZ=warehouseZ+280;
  const eastTempleX=210;
  const temple=(x,z,w,h,levels)=>{for(let i=0;i<levels;i++){const k=1-i/(levels*1.28),hh=h/levels;add(stone,x,i*hh+hh/2,z,w*k,hh,w*k);add(plaster,x,(i+1)*hh-.08,z,w*k+.3,.16,w*k+.3);}const top=w*.25;add(stone,x,h+2,z,top,4,top*.75);add(red,x,h+3.65,z+top*.39,top*.75,.35,.25);};
  add(plaster,0,.04,templeZ,132,.08,78);temple(0,templeZ+10,42,27,8);temple(-43,templeZ-9,26,16,6);temple(43,templeZ-9,26,16,6);
  add(plaster,0,.08,(warehouseZ+templeZ)/2,12,.12,templeZ-warehouseZ-40);
  add(plaster,0,.08,templeZ-35,14,.12,52);for(const x of [-24,-12,12,24])add(red,x,1.8,templeZ-17,1.1,3.6,.75);
  // A second sanctuary occupies the open land across the east side of the
  // warehouse. Five differently sized temples surround a clear ritual court.
  add(plaster,eastTempleX,.04,warehouseZ,132,.08,118);
  temple(eastTempleX+15,warehouseZ,44,30,8);
  temple(eastTempleX-38,warehouseZ-32,27,18,6);
  temple(eastTempleX-38,warehouseZ+32,27,18,6);
  temple(eastTempleX+48,warehouseZ-37,23,15,5);
  temple(eastTempleX+48,warehouseZ+37,23,15,5);
  add(plaster,98,.08,warehouseZ,104,.12,12);
  for(const z of [warehouseZ-21,warehouseZ-7,warehouseZ+7,warehouseZ+21])add(red,eastTempleX-12,1.8,z,.75,3.6,1.1);
  const stela=(x,z,h=5)=>{add(stone,x,h/2,z,1.45,h,.72);add(jade,x,h*.54,z-.39,.68,h*.55,.08);add(gold,x,h*.78,z-.44,.22,.22,.08);add(stone,x,.3,z,2.8,.6,2.15);};
  const guardian=(x,z,side=1)=>{add(stone,x,1.5,z,2.3,2.4,2);add(stone,x,3.25,z-.12,2.05,1.1,1.8);add(stone,x+side*1.05,.62,z+.62,1.35,.7,2.1);add(obsidian,x-.46,3.42,z-.98,.22,.2,.1);add(obsidian,x+.46,3.42,z-.98,.22,.2,.1);add(jade,x,2.18,z-1.03,.72,.42,.09);};
  const serpentColumn=(x,z)=>{for(let i=0;i<5;i++){const sway=Math.sin(i*1.7)*.35;add(stone,x+sway,.55+i*1.05,z,1.05,1.1,1.05);}add(jade,x,5.65,z-.15,1.65,1.15,1.5);add(obsidian,x-.38,5.8,z-.92,.18,.16,.08);add(obsidian,x+.38,5.8,z-.92,.18,.16,.08);};
  // Carved art lines both maker sanctuaries: narrative stelae, seated guardians,
  // and tall serpent columns create distinct silhouettes instead of repeated props.
  for(const x of [-52,-34,-16,16,34,52])stela(x,templeZ-31,4.4+(Math.abs(x)%3));
  guardian(-59,templeZ+23,-1);guardian(59,templeZ+23,1);
  for(const z of [warehouseZ-47,warehouseZ-28,warehouseZ+28,warehouseZ+47])stela(eastTempleX-47,z,5.4);
  serpentColumn(eastTempleX-49,warehouseZ-52);serpentColumn(eastTempleX-49,warehouseZ+52);
  guardian(eastTempleX+56,warehouseZ-4,-1);guardian(eastTempleX+56,warehouseZ+18,1);
  // The stepped roach-offering platform is the visual focus of the east court.
  const altarX=eastTempleX-34,altarZ=warehouseZ;
  add(stone,altarX,.45,altarZ,30,.9,24);add(plaster,altarX,1.18,altarZ,24,.58,18);add(red,altarX,1.8,altarZ,18,.65,12);
  add(obsidian,altarX,2.55,altarZ,9,1.15,5.2);add(gold,altarX,3.2,altarZ,7.2,.18,3.8);
  for(const [x,z] of [[altarX-11,altarZ-8],[altarX+11,altarZ-8],[altarX-11,altarZ+8],[altarX+11,altarZ+8]]){add(obsidian,x,2.25,z,1.8,2.7,1.8);add(ember,x,3.9,z,1.05,.6,1.05);}
  const stations=[
    {name:'CNC mill',x:-10,z:warehouseZ-4,w:5,d:4,mat:metal},
    {name:'Laser cutter',x:0,z:warehouseZ-4,w:5,d:4,mat:dark,glass:true},
    {name:'3D print farm',x:10,z:warehouseZ-4,w:5,d:4,mat:metal,glass:true},
    {name:'Electronics bench',x:-10,z:warehouseZ+5,w:6,d:3,mat:dark},
    {name:'Wood & hobby bench',x:0,z:warehouseZ+5,w:6,d:3,mat:safety},
    {name:'Textile & model station',x:10,z:warehouseZ+5,w:6,d:3,mat:plaster}
  ];
  for(const s of stations){add(s.mat,s.x,.7,s.z,s.w,1.4,s.d);add(metal,s.x,1.58,s.z,s.w*.82,.35,s.d*.72);if(s.glass)add(glass,s.x,2.35,s.z,s.w*.76,1.35,s.d*.67);for(const side of [-1,1])add(dark,s.x+side*s.w*.38,.35,s.z+s.d*.35,.32,.7,.32);}
  const cube=INST_UNIT,o=new THREE.Object3D();
  for(const [mat,items] of batches){const mesh=new THREE.InstancedMesh(cube,mat,items.length);items.forEach(([x,y,z,w,h,d],i)=>{o.position.set(x,y,z);o.scale.set(w,h,d);o.updateMatrix();mesh.setMatrixAt(i,o.matrix);});mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;group.add(mesh);}
  group.userData={templeZ,eastTempleX,altarX,altarZ,stations,temples:8};return group;
}
