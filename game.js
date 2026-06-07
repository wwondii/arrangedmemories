import { FilesetResolver, HandLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

const wrap = document.getElementById('wrap');
const gc = document.getElementById('gc');
const ctx = gc.getContext('2d');
const vid = document.getElementById('vid');
const overlay = document.getElementById('overlay');
const olCtx = overlay.getContext('2d');

function resize() {
  const maxW = 960, maxH = 540;
  const scaleW = Math.min(1, maxW / wrap.offsetWidth);
  const scaleH = Math.min(1, maxH / wrap.offsetHeight);
  const scale = Math.min(scaleW, scaleH);
  gc.width = Math.round(wrap.offsetWidth * scale);
  gc.height = Math.round(wrap.offsetHeight * scale);
  gc.style.width = '100%';
  gc.style.height = '100%';
  overlay.width = overlay.offsetWidth;
  overlay.height = overlay.offsetHeight;
}
resize();
window.addEventListener('resize', () => { resize(); resizePlatforms(); });
const W = () => gc.width;
const H = () => gc.height;

const A4_BASE = 0.26;
const A5_BASE = 0.18;

function getPlatformSize(type) {
  const ch = H();
  if (type === 'a4')  return { h: ch*A4_BASE,          w: ch*A4_BASE*(210/297) };
  if (type === 'a4l') return { h: ch*A4_BASE*(210/297), w: ch*A4_BASE           };
  if (type === 'a5')  return { h: ch*A5_BASE,          w: ch*A5_BASE*(148/210) };
  if (type === 'a5l') return { h: ch*A5_BASE*(148/210), w: ch*A5_BASE           };
}

const PLATFORM_ASSETS = {
  0: { src: 'assets/platform_0.mp4', type: 'video' },
  1: { src: 'assets/platform_1.mp4', type: 'video' },
  2: { src: 'assets/platform_2.mp4', type: 'video' },
  4: { src: 'assets/platform_4.mp4', type: 'video' },
  5: { src: 'assets/platform_5.mp4', type: 'video' },
  6: { src: 'assets/platform_6.mp4', type: 'video' },
};

const PLATFORM_MEDIA = {};
// Offscreen canvas cache to hold last good frame
const PLATFORM_FRAME_CACHE = {};

function loadPlatformAssets() {
  Object.entries(PLATFORM_ASSETS).forEach(([id, asset]) => {
    if (!asset) return;
    if (asset.type === 'image') {
      const img = new Image();
      img.src = asset.src;
      PLATFORM_MEDIA[id] = img;
    } else if (asset.type === 'video') {
      const v = document.createElement('video');
      v.src = asset.src;
      v.autoplay = true;
      v.loop = true;
      v.muted = true;
      v.playsInline = true;
      v.preload = 'auto';
      v.play();
      PLATFORM_MEDIA[id] = v;
      // Create offscreen canvas for frame caching
      const offscreen = document.createElement('canvas');
      offscreen.width = 320;
      offscreen.height = 240;
      PLATFORM_FRAME_CACHE[id] = offscreen;
    }
  });
}
loadPlatformAssets();

const PAPER_COLOURS = [
  '#e8d5b0','#d4c4a0','#e0cfa8','#c8b896',
  '#ddd0b0','#cfc0a0','#e4d4b4','#d8c8a8',
];
const TAPE_COLOURS = ['#f4c2c2','#c2d4f4','#c2f4c2','#f4e8c2','#e8c2f4'];

const DEFAULTS = [
  { id:0, type:'a4',  xp:0.22, yp:0.25, label:'A4: 0' },
  { id:1, type:'a4l', xp:0.38, yp:0.33, label:'A4: 1' },
  { id:2, type:'a4l', xp:0.55, yp:0.60, label:'A4: 2' },
  { id:4, type:'a5',  xp:0.63, yp:0.22, label:'A5: 4' },
  { id:5, type:'a5l', xp:0.31, yp:0.62, label:'A5: 5' },
  { id:6, type:'a5',  xp:0.45, yp:0.62, label:'A5: 6' },
];

const START_DEFAULT = { xp: 0.25, yp: 0.20 };
const STAR_DEFAULT  = { xp: 0.72, yp: 0.15 };
let currentStart = { ...START_DEFAULT };
let currentStar  = { ...STAR_DEFAULT };
let prevStar     = null;

function randomisePositions(){
  prevStar = currentStar ? { ...currentStar } : null;
  if(!PLATFORMS || PLATFORMS.length===0){ currentStart={...START_DEFAULT}; currentStar={...STAR_DEFAULT}; return; }
  const inPlay = PLATFORMS.filter(p => p.x+p.w > PLAY.x && p.x < PLAY.x+PLAY.w);
  if(inPlay.length===0){ currentStart={...START_DEFAULT}; currentStar={...STAR_DEFAULT}; return; }
  const starTop = Math.random() > 0.5;
  const half = starTop ? 'bottom' : 'top';
  const halfPlats = inPlay.filter(p => half==='bottom' ? p.y > H()*0.45 : p.y < H()*0.55);
  const startPlats = halfPlats.length > 0 ? halfPlats : inPlay;
  const startPlat = startPlats[Math.floor(Math.random()*startPlats.length)];
  currentStart = { xp: (startPlat.x + startPlat.w/2) / W(), yp: (startPlat.y - 2) / H() };
  prevStar = currentStar ? { ...currentStar } : null;
  const starYMin = starTop ? H()*0.05 : H()*0.55;
  const starYMax = starTop ? H()*0.45 : H()*0.90;
  let attempts = 0;
  do {
    const sx = PLAY.x + PLAY.w*0.1 + Math.random()*PLAY.w*0.8;
    const sy = starYMin + Math.random()*(starYMax-starYMin);
    const onPlatform = PLATFORMS.some(p => sx>p.x-10&&sx<p.x+p.w+10&&sy>p.y-10&&sy<p.y+p.h+10);
    const distPx = Math.sqrt(Math.pow(sx-currentStart.xp*W(),2)+Math.pow(sy-currentStart.yp*H(),2));
    const farFromStart = distPx > Math.min(PLAY.w,H())*0.45;
    const farFromPrev = !prevStar || Math.sqrt(Math.pow(sx-prevStar.xp*W(),2)+Math.pow(sy-prevStar.yp*H(),2)) > Math.min(PLAY.w,H())*0.35;
    if((!onPlatform && farFromStart && farFromPrev) || attempts>40){ currentStar = { xp: sx/W(), yp: sy/H() }; break; }
    attempts++;
  } while(true);
}

let PLATFORMS = [];
let starCollected = false;
let won = false;
let wonTimer = 0;

function getStart(){ return { x: W()*currentStart.xp, y: H()*currentStart.yp }; }
function getStar(){  return { x: W()*currentStar.xp,  y: H()*currentStar.yp  }; }

let currentLevel = 1;
const MAX_LEVELS = 5;
const LEVEL_CONFIG = {
  1: { lockedCount: 0, hasHazard: false, playWidth: 0.60 },
  2: { lockedCount: 2, hasHazard: false, playWidth: 0.60 },
  3: { lockedCount: 2, hasHazard: true,  playWidth: 0.60 },
  4: { lockedCount: 3, hasHazard: false, playWidth: 0.48 },
  5: { lockedCount: 3, hasHazard: true,  playWidth: 0.50 },
};
let lockedPlatforms = new Set();
let hazardZone = null;
function getLevelConfig(){ return LEVEL_CONFIG[currentLevel]; }
const PLAY = {
  get x(){ return W()*(1-getLevelConfig().playWidth)/2; },
  get y(){ return 0; },
  get w(){ return W()*getLevelConfig().playWidth; },
  get h(){ return H(); }
};

let jumpPressedLast = false;

// ── Sound ─────────────────────────────────────────────────────────
const sounds = {};
function loadSound(name, src, volume=1.0){
  const audio = new Audio(src);
  audio.volume = volume;
  sounds[name] = audio;
}
loadSound('bgm',          'assets/sounds/animalcrossing_bgm.mp3', 0.35);
loadSound('jump',         'assets/sounds/jump.mp3',               0.7);
loadSound('levelcomplete','assets/sounds/levelcomplete.mp3',      0.7);
loadSound('fail',         'assets/sounds/fail.mp3',               0.7);
sounds.bgm.loop = true;
let cameraOn = false; // declared early so resetCharacter can reference it
const player = { x:80, y:60, w:14, h:20, vx:0, vy:0, onGround:false, facing:1, frame:0, frameTimer:0, dead:false, respawnTimer:0 };

function resizePlatforms(){
  // Just recalculate sizes — don't change level or positions
  PLATFORMS.forEach(p => { const s=getPlatformSize(p.type); p.w=s.w; p.h=s.h; });
}

let isFirstRound = true;
function resetPlatforms() {
  if(!isFirstRound){ currentLevel = currentLevel >= MAX_LEVELS ? 1 : currentLevel + 1; }
  isFirstRound = false;
  const cw=W(), ch=H();
  if(currentLevel === 1){
    PLATFORMS = DEFAULTS.map(def => { const { w, h } = getPlatformSize(def.type); return { ...def, x:cw*def.xp, y:ch*def.yp, w, h }; });
  } else {
    PLATFORMS.forEach(p => { const s=getPlatformSize(p.type); p.w=s.w; p.h=s.h; });
  }
  starCollected = false; won = false; wonTimer = 0;
  setupLevel();
  // Pause locked videos, resume unlocked — must run after setupLevel sets lockedPlatforms
  Object.entries(PLATFORM_MEDIA).forEach(([id, m]) => {
    if(!m.play) return;
    if(lockedPlatforms.has(parseInt(id))){ m.pause(); } else { m.play(); }
  });
  resetCharacter();
}

function resetCharacter() {
  const s = getStart();
  player.x = s.x; player.y = s.y;
  player.vx = 0; player.vy = 0; player.dead = false;
  jumpPressedLast = false;
  // Resume videos (except locked ones) and gestures
  Object.entries(PLATFORM_MEDIA).forEach(([id, m]) => {
    if(!m.play) return;
    if(lockedPlatforms.has(parseInt(id))){ m.pause(); } else { m.play(); }
  });
  if(cameraOn) gesture.active=true;
  sounds.bgm.play().catch(()=>{});
}
resetPlatforms();

function SCALE(){ return Math.min(W(),H())/600; }
const FRIC_G=0.6, FRIC_A=0.85;
function GRAVITY(){ return 0.35*SCALE(); }
function JUMP(){    return -7*SCALE(); }
function SPEED(){   return PLAY.w * 0.005; }
function ACCEL(){   return PLAY.w * 0.001; }
function updatePlayerSize(){ 
  player.w=Math.round(28*SCALE()); 
  player.h=Math.round(40*SCALE()); 
}

const keys={};
window.addEventListener('keydown',e=>{
  keys[e.code]=true;
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
  if(e.code==='Space' && !gameStarted){
    gameStarted=true;
    startBGM();
    document.getElementById('start-screen').style.display='none';
  }
});
window.addEventListener('keyup',e=>{keys[e.code]=false;});
const gesture={left:false,right:false,jump:false,stop:false,active:false};

const bc = new BroadcastChannel('aruco-tracker');
bc.addEventListener('message', e => {
  if (e.data.type !== 'markers') return;
  const positions = e.data.positions;
  const cw=W(), ch=H();
  PLATFORMS.forEach(p => {
    const pos = positions[p.id];
    if (!pos) return;
    p.x = Math.max(0, Math.min(cw-p.w, pos.x*cw - p.w/2));
    p.y = Math.max(0, Math.min(ch-p.h, pos.y*ch - p.h/2));
  });
});

let dragging=null, dragOffX=0, dragOffY=0;
function getPos(e){ const r=gc.getBoundingClientRect(),s=e.touches?e.touches[0]:e; return{x:(s.clientX-r.left)*(W()/r.width),y:(s.clientY-r.top)*(H()/r.height)}; }
function platAt(px,py){
  for(let i=PLATFORMS.length-1;i>=0;i--){
    const p=PLATFORMS[i];
    if(lockedPlatforms.has(p.id)&&p.x+p.w>PLAY.x&&p.x<PLAY.x+PLAY.w) continue;
    if(px>=p.x&&px<=p.x+p.w&&py>=p.y&&py<=p.y+p.h) return p;
  }
  return null;
}
gc.addEventListener('mousedown',e=>{ const pos=getPos(e),p=platAt(pos.x,pos.y); if(p){dragging=p;dragOffX=pos.x-p.x;dragOffY=pos.y-p.y;} });
gc.addEventListener('touchstart',e=>{ const pos=getPos(e),p=platAt(pos.x,pos.y); if(p){dragging=p;dragOffX=pos.x-p.x;dragOffY=pos.y-p.y;e.preventDefault();}},{passive:false});
function onMove(e){ if(!dragging)return; const pos=getPos(e); dragging.x=Math.max(0,Math.min(W()-dragging.w,pos.x-dragOffX)); dragging.y=Math.max(0,Math.min(H()-dragging.h,pos.y-dragOffY)); }
gc.addEventListener('mousemove',onMove);
gc.addEventListener('touchmove',e=>{onMove(e);e.preventDefault();},{passive:false});
gc.addEventListener('mouseup',()=>{
  if(dragging&&hazardZone){
    const p=dragging;
    if(p.x<hazardZone.x+hazardZone.w&&p.x+p.w>hazardZone.x&&p.y<hazardZone.y+hazardZone.h&&p.y+p.h>hazardZone.y)
      p.x=hazardZone.x-p.w-4;
  }
  dragging=null;
});
gc.addEventListener('touchend',()=>dragging=null);

let handLandmarker=null;
const gestureLabel = document.getElementById('gesture-label');

async function initAndStart(){
  gestureLabel.textContent='loading camera…';
  const vision=await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");
  handLandmarker=await HandLandmarker.createFromOptions(vision,{baseOptions:{modelAssetPath:"https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",delegate:"GPU"},runningMode:"VIDEO",numHands:2});
  try{
    const stream=await navigator.mediaDevices.getUserMedia({video:{width:160,height:120,facingMode:'user'},audio:false});
    vid.srcObject=stream; await new Promise(r=>vid.onloadedmetadata=r); vid.play();
    cameraOn=true; gesture.active=true;
    gestureLabel.textContent='· idle';
    detectLoop();
  }catch(e){ gestureLabel.textContent='camera error: use arrow keys'; }
}
initAndStart();

let lastVideoTime=-1, detectFrame=0;
function detectLoop(){
  if(!cameraOn) return;
  detectFrame++;
  if(detectFrame%4===0&&vid.currentTime!==lastVideoTime){
    lastVideoTime=vid.currentTime;
    processHands(handLandmarker.detectForVideo(vid,performance.now()));
  }
  requestAnimationFrame(detectLoop);
}

function fingerExtended(lm,tip,pip){ return lm[tip].y<lm[pip].y-0.03; }
function isFist(lm){ return !fingerExtended(lm,8,6)&&!fingerExtended(lm,12,10)&&!fingerExtended(lm,16,14)&&!fingerExtended(lm,20,18); }
function isHandFlat(lm){ return fingerExtended(lm,8,6)&&fingerExtended(lm,12,10)&&fingerExtended(lm,16,14)&&fingerExtended(lm,20,18); }
function isIndexPointing(lm){ return fingerExtended(lm,8,6)&&!fingerExtended(lm,12,10)&&!fingerExtended(lm,16,14)&&!fingerExtended(lm,20,18); }

let bothHandsTimer=0;
let startScreenTimer=0;
function processHands(results){
  if(!results.landmarks||results.landmarks.length===0){
    gesture.left=false;gesture.right=false;gesture.jump=false;gesture.stop=false;
    startScreenTimer=0;
    gestureLabel.textContent='no hand'; return;
  }

  // Start screen — wait for both hands
  if(!gameStarted){
    if(results.landmarks.length>=2){
      startScreenTimer++;
      const pct = Math.min(100, Math.round(startScreenTimer/15*100));
      gestureLabel.textContent=`hold... ${pct}%`;
      if(startScreenTimer>15){
        gameStarted=true;
        startBGM();
        document.getElementById('start-screen').style.display='none';
        startScreenTimer=0;
      }
    } else {
      startScreenTimer=0;
      gestureLabel.textContent='show both hands to begin';
    }
    return;
  }
  if(won){
    gesture.left=false; gesture.right=false; gesture.jump=false; gesture.stop=false;
    if(results.landmarks.length>=2){
      bothHandsTimer++;
      console.log('both hands detected, timer:', bothHandsTimer);
      gestureLabel.textContent=`hold... ${Math.min(100,Math.round(bothHandsTimer/25*100))}%`;
      if(bothHandsTimer>25){ 
        bothHandsTimer=0;
        won=false; // prevent re-triggering
        gesture.left=false; gesture.right=false; gesture.jump=false; gesture.stop=false;
        randomisePositions(); resetPlatforms(); 
      }
    } else {
      bothHandsTimer=0;
      gestureLabel.textContent='show both hands to continue';
    }
    return;
  }

  if(results.landmarks.length>=2){
    const bothFists=results.landmarks.every(lm=>isFist(lm));
    if(bothFists){
      bothHandsTimer++;
      gestureLabel.textContent=`resetting... ${Math.min(100,Math.round(bothHandsTimer/25*100))}%`;
      if(bothHandsTimer>25){ resetCharacter(); bothHandsTimer=0; }
      return;
    } else { bothHandsTimer=0; }
  } else { if(!won) bothHandsTimer=0; }
  const lm=results.landmarks[0];
  const flat=isHandFlat(lm), pointing=isIndexPointing(lm), mx=1-lm[0].x, dz=0.12;
  const movingLeft=!flat&&mx<0.5-dz, movingRight=!flat&&mx>0.5+dz;
  gesture.jump=pointing;
  gesture.stop=flat&&!pointing;
  gesture.left=!flat&&(movingLeft||(pointing&&movingLeft));
  gesture.right=!flat&&(movingRight||(pointing&&movingRight));
  const parts=[];
  if(gesture.jump)parts.push('JUMP');
  if(gesture.stop)parts.push('STOP');
  if(gesture.left)parts.push('LEFT');
  if(gesture.right)parts.push('RIGHT');
  gestureLabel.textContent=parts.length?parts.join(' + '):'· idle';
}

function updatePlayer(){
  if(!gameStarted) return;
  if(won){ wonTimer++; return; }
  if(player.dead){ player.respawnTimer--; if(player.respawnTimer<=0) resetCharacter(); return; }
  const kL=keys['ArrowLeft']||keys['KeyA'], kR=keys['ArrowRight']||keys['KeyD'], kJ=keys['Space']||keys['ArrowUp']||keys['KeyW'];
  const left=kL||(gesture.active&&gesture.left);
  const right=kR||(gesture.active&&gesture.right);
  const stop=gesture.active&&gesture.stop&&!kL&&!kR;
  const jumpHeld=kJ||(gesture.active&&gesture.jump);
  const jumpJust=jumpHeld&&!jumpPressedLast;
  jumpPressedLast=jumpHeld;
  updatePlayerSize();
  if(stop) player.vx*=0.4;
  else if(left)  player.vx=Math.max(-SPEED(),player.vx-ACCEL());
  else if(right) player.vx=Math.min(SPEED(),player.vx+ACCEL());
  else player.vx*=player.onGround?FRIC_G:FRIC_A;
  if(Math.abs(player.vx)<0.05) player.vx=0;
  if(jumpJust&&player.onGround){ player.vy=JUMP(); playSound('jump'); }
  player.vy+=GRAVITY(); player.x+=player.vx; player.y+=player.vy;
  player.onGround=false;
  if(player.vx!==0) player.facing=player.vx>0?1:-1;
  if(Math.abs(player.vx)>0.3){ 
    player.frameTimer++; 
    if(player.frameTimer>10){
      player.frame=(player.frame+1)%4;
      player.frameTimer=0;
    }
  } else { 
    player.frame=0;
  }
  for(const p of PLATFORMS){
    if(p===dragging) continue;
    if(!(p.x+p.w>PLAY.x&&p.x<PLAY.x+PLAY.w)) continue;
    const pr=player.x+player.w, pb=player.y+player.h;
    if(pr>p.x&&player.x<p.x+p.w&&pb>p.y&&player.y<p.y+p.h){
      const oL=pr-p.x, oR=(p.x+p.w)-player.x, oT=pb-p.y, oB=(p.y+p.h)-player.y;
      const mn=Math.min(oL,oR,oT,oB);
      if(mn===oT&&player.vy>=0){player.y=p.y-player.h;player.vy=0;player.onGround=true;}
      else if(mn===oB&&player.vy<0){player.y=p.y+p.h;player.vy=0;}
      else if(mn===oL){player.x=p.x-player.w;player.vx=0;}
      else if(mn===oR){player.x=p.x+p.w;player.vx=0;}
    }
  }
  player.x=Math.max(PLAY.x,Math.min(PLAY.x+PLAY.w-player.w,player.x));
  if(player.x<=PLAY.x||player.x>=PLAY.x+PLAY.w-player.w) player.vx=0;
  if(player.y>H()+40){
    player.dead=true; player.respawnTimer=120;
    sounds.bgm.pause();
    playSound('fail');
    Object.values(PLATFORM_MEDIA).forEach(m=>{ if(m.pause) m.pause(); });
    gesture.active=false;
  }
  if(!starCollected){
    const st=getStar();
    const dx=(player.x+player.w/2)-st.x, dy=(player.y+player.h/2)-st.y;
    if(Math.sqrt(dx*dx+dy*dy)<22){
      starCollected=true; won=true;
      gesture.active=false;
      playSound('levelcomplete');
      Object.values(PLATFORM_MEDIA).forEach(m=>{ if(m.pause) m.pause(); });
    }
  }
  if(won&&keys["KeyN"]){ randomisePositions(); resetPlatforms(); }
}

function setupLevel(){
  const cfg=getLevelConfig();
  lockedPlatforms.clear(); hazardZone=null;
  const inPlay=PLATFORMS.filter(p=>p.x+p.w>PLAY.x&&p.x<PLAY.x+PLAY.w);
  const lockPool=(currentLevel===5)?inPlay.filter(p=>p.type==='a5'||p.type==='a5l'):inPlay;
  const candidates=lockPool.length>=cfg.lockedCount?lockPool:inPlay;
  [...candidates].sort(()=>Math.random()-0.5).slice(0,cfg.lockedCount).forEach(p=>lockedPlatforms.add(p.id));
  if(cfg.hasHazard){
    const corner=Math.floor(Math.random()*4);
    const hw=PLAY.w*0.5, hh=H()*0.5;
    const hazardPositions=[
      {x:PLAY.x,          y:0,      w:hw,h:hh},
      {x:PLAY.x+PLAY.w-hw,y:0,      w:hw,h:hh},
      {x:PLAY.x+PLAY.w-hw,y:H()-hh, w:hw,h:hh},
      {x:PLAY.x,          y:H()-hh, w:hw,h:hh},
    ];
    hazardZone=hazardPositions[corner];
    const oppCorner=(corner+2)%4;
    const starCorners=[
      {xp:(PLAY.x+PLAY.w*0.25)/W(),yp:0.12},
      {xp:(PLAY.x+PLAY.w*0.75)/W(),yp:0.12},
      {xp:(PLAY.x+PLAY.w*0.75)/W(),yp:0.78},
      {xp:(PLAY.x+PLAY.w*0.25)/W(),yp:0.78},
    ];
    let starSet=false;
    for(let att=0;att<20;att++){
      const base=starCorners[oppCorner];
      const sx=(base.xp+(Math.random()-0.5)*0.15)*W();
      const sy=(base.yp+(Math.random()-0.5)*0.15)*H();
      const onPlat=PLATFORMS.some(p=>sx>p.x-10&&sx<p.x+p.w+10&&sy>p.y-10&&sy<p.y+p.h+10);
      if(!onPlat){ currentStar={xp:sx/W(),yp:sy/H()}; starSet=true; break; }
    }
    if(!starSet) currentStar=starCorners[oppCorner];
    const safeCorners=[(corner+1)%4,(corner+3)%4];
    const sci=safeCorners[Math.floor(Math.random()*2)];
    const sxr=sci===1||sci===2, syb=sci===2||sci===3;
    const safePlats=inPlay.filter(p=>{
      const xOk=sxr?p.x+p.w/2>PLAY.x+PLAY.w*0.5:p.x+p.w/2<PLAY.x+PLAY.w*0.5;
      const yOk=syb?p.y>H()*0.5:p.y<H()*0.5;
      return xOk&&yOk;
    });
    const platPool=safePlats.length>0?safePlats:inPlay;
    const sp=platPool[Math.floor(Math.random()*platPool.length)];
    currentStart={xp:(sp.x+sp.w/2)/W(),yp:(sp.y-2)/H()};
    return;
  }
}

let gameStarted = false;

function startBGM(){
  sounds.bgm.play().catch(()=>{});
}

function playSound(name){
  if(!sounds[name]) return;
  const s = sounds[name].cloneNode();
  s.volume = sounds[name].volume;
  s.play().catch(()=>{});
}

const bgImage = new Image();
bgImage.src = 'assets/background.png';

function drawBg(){
  if(bgImage.complete && bgImage.naturalWidth > 0){
    ctx.drawImage(bgImage, 0, 0, W(), H());
  } else {
    ctx.fillStyle='#f0e8d8';
    ctx.fillRect(0,0,W(),H());
  }
  ctx.fillStyle='rgba(0,0,0,0.18)';
  ctx.fillRect(0, 0, PLAY.x, H());
  ctx.fillRect(PLAY.x+PLAY.w, 0, W()-PLAY.x-PLAY.w, H());
  ctx.strokeStyle='rgba(90,62,40,0.85)';
  ctx.lineWidth=2;
  ctx.setLineDash([8,4]);
  ctx.strokeRect(PLAY.x+1, 1, PLAY.w-2, H()-2);
  ctx.setLineDash([]);
  if(hazardZone){
    ctx.fillStyle='rgba(200,80,80,0.12)';
    ctx.fillRect(hazardZone.x,hazardZone.y,hazardZone.w,hazardZone.h);
    ctx.strokeStyle='rgba(180,60,60,0.5)';
    ctx.lineWidth=2;
    ctx.setLineDash([10,5]);
    ctx.strokeRect(hazardZone.x,hazardZone.y,hazardZone.w,hazardZone.h);
    ctx.setLineDash([]);
    ctx.fillStyle='rgba(160,50,50,0.45)';
    ctx.font=`bold ${Math.round(14*SCALE())}px Caveat, cursive`;
    ctx.textAlign='center';
    ctx.fillText('hazard zone', hazardZone.x+hazardZone.w/2, hazardZone.y+hazardZone.h/2);
    ctx.textAlign='left';
  }
  ctx.fillStyle='rgba(90,62,40,0.6)';
  ctx.font=`${Math.round(13*SCALE()+10)}px Caveat, cursive`;
  ctx.fillText(`level ${currentLevel} / ${MAX_LEVELS}`, PLAY.x+10, 22);
}

function drawMediaOnPlatform(p, media) {
  const cache = PLATFORM_FRAME_CACHE[p.id];
  // Update cache with current frame if video has data
  if(media.readyState >= 2){
    if(cache){
      const cCtx = cache.getContext('2d');
      try { cCtx.drawImage(media, 0, 0, cache.width, cache.height); } catch(e){}
    }
  }
  // Draw from cache (gapless) or directly from media
  const source = (cache && cache.width > 0) ? cache : media;
  const mw = media.videoWidth || media.naturalWidth || 640;
  const mh = media.videoHeight || media.naturalHeight || 480;
  if(mw && mh){
    // Object-fit cover: scale so both dimensions fill, then centre and clip
    const scaleX = p.w / mw;
    const scaleY = p.h / mh;
    const scale = Math.max(scaleX, scaleY);
    const dw = mw * scale;
    const dh = mh * scale;
    const dx = (p.w - dw) / 2;
    const dy = (p.h - dh) / 2;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, p.w, p.h); ctx.clip();
    ctx.drawImage(source, dx, dy, dw, dh);
    ctx.restore();
  }
}

function drawPlatform(p){
  const insidePlayArea = p.x+p.w>PLAY.x && p.x<PLAY.x+PLAY.w;
  const locked = lockedPlatforms.has(p.id) && insidePlayArea;
  const media = PLATFORM_MEDIA[p.id];
  ctx.save();
  const angle = ((p.id * 7) % 7 - 3) * 0.008;
  ctx.translate(p.x+p.w/2, p.y+p.h/2);
  ctx.rotate(angle);
  ctx.translate(-p.w/2, -p.h/2);
  ctx.fillStyle='rgba(0,0,0,0.18)';
  ctx.fillRect(5, 6, p.w, p.h);
  if(media){
    drawMediaOnPlatform(p, media);
  } else {
    const colour = locked ? '#c9a0a0' : PAPER_COLOURS[p.id % PAPER_COLOURS.length];
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, p.w, p.h);
    ctx.strokeStyle = locked ? 'rgba(150,80,80,0.15)' : 'rgba(90,62,40,0.08)';
    ctx.lineWidth = 0.5;
    const lineSpacing = Math.max(8, p.h * 0.12);
    for(let ly = lineSpacing; ly < p.h-2; ly += lineSpacing){
      ctx.beginPath(); ctx.moveTo(4,ly); ctx.lineTo(p.w-4,ly); ctx.stroke();
    }
    const tapeColour = locked ? 'rgba(200,100,100,0.5)' : TAPE_COLOURS[p.id % TAPE_COLOURS.length] + '99';
    ctx.fillStyle = tapeColour;
    const ts = Math.min(p.w, p.h) * 0.12;
    ctx.fillRect(0, 0, ts*2, ts*0.6);
    ctx.fillRect(p.w-ts*2, p.h-ts*0.6, ts*2, ts*0.6);
  }
  if(locked){
    // Dark overlay over video
    ctx.fillStyle='rgba(80,30,30,0.55)';
    ctx.fillRect(0,0,p.w,p.h);
    ctx.strokeStyle='rgba(160,60,60,0.7)'; ctx.lineWidth=2;
    ctx.strokeRect(0.5,0.5,p.w-1,p.h-1);
    ctx.fillStyle='rgba(255,255,255,0.9)';
    ctx.font=`${Math.max(12,Math.min(20,p.h*0.25))}px sans-serif`;
    ctx.textAlign='center';
    ctx.fillText('🔒', p.w/2, p.h/2+6);
    ctx.textAlign='left';
  } else {
    ctx.strokeStyle='rgba(90,62,40,0.2)'; ctx.lineWidth=1;
    ctx.strokeRect(0.5,0.5,p.w-1,p.h-1);
    if(p===dragging){ ctx.strokeStyle='rgba(90,62,40,0.6)'; ctx.lineWidth=2; ctx.strokeRect(-1,-1,p.w+2,p.h+2); }
  }
  ctx.restore();

  // Number only — no A4/A5 label
  ctx.fillStyle='rgba(90,62,40,0.7)';
  ctx.font=`${Math.round(11*SCALE()+8)}px Caveat, cursive`;
  ctx.textAlign='left';
  ctx.fillText(p.id, p.x+4, p.y-5);
}

function drawStart(){
  const s=getStart();
  ctx.fillStyle='#2d6a2d';
  ctx.font=`bold ${Math.round(11*SCALE()+8)}px Caveat, cursive`;
  ctx.textAlign='center';
  ctx.fillText('▼ start', s.x, s.y-8);
  ctx.textAlign='left';
}

// ── Goal image ────────────────────────────────────────────────────
const goalImage = new Image();
goalImage.src = 'assets/goal_button.png';

function drawStar(){
  if(starCollected) return;
  const st=getStar();
  const r=10*SCALE()+8;
  if(goalImage.complete && goalImage.naturalWidth > 0){
    const iw = goalImage.naturalWidth;
    const ih = goalImage.naturalHeight;
    const size = 35 * SCALE() + 14;
    const w = size * (iw/ih);
    const h = size;
    // Text above
    ctx.fillStyle='rgba(0,0,0,0.85)';
    ctx.font=`bold ${Math.round(10*SCALE()+7)}px Caveat, cursive`;
    ctx.textAlign='center';
    ctx.fillText('Collect Me!', st.x, st.y-h/2-6);
    ctx.textAlign='left';
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(goalImage, st.x-w/2, st.y-h/2, w, h);
    ctx.restore();
  } else {
    ctx.save();
    ctx.fillStyle='#f5c518';
    ctx.beginPath();
    for(let i=0;i<10;i++){
      const angle=(i*Math.PI/5)-Math.PI/2;
      const rad=i%2===0?r:r*0.42;
      i===0?ctx.moveTo(st.x+Math.cos(angle)*rad,st.y+Math.sin(angle)*rad)
           :ctx.lineTo(st.x+Math.cos(angle)*rad,st.y+Math.sin(angle)*rad);
    }
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

// ── Sprite sheet ──────────────────────────────────────────────────
const spriteSheet = new Image();
spriteSheet.src = 'assets/character.png';
const SPRITE_SIZE = 64; // each frame is 64x64
// Row 0 = forward, Row 1 = left, Row 2 = right, Row 3 = backward
// We use: right=row2, left=row1, idle=row0 col0, jump=row3 col0, fall=row0 col1
let spriteFrame = 0;
let spriteTimer = 0;
const SPRITE_FPS = 8; // frames per animation cycle step

function getSpriteFrame(p){
  // Returns {sx, sy} — source x,y in sprite sheet
  const col = spriteFrame % 4;
  if(!p.onGround && p.vy < 0) return { sx: 0*SPRITE_SIZE, sy: 3*SPRITE_SIZE }; // jump — row 4 col 0
  if(!p.onGround && p.vy >= 0) return { sx: 1*SPRITE_SIZE, sy: 0*SPRITE_SIZE }; // fall — row 1 col 1
  if(Math.abs(p.vx) < 0.05) return { sx: 0*SPRITE_SIZE, sy: 0*SPRITE_SIZE };    // idle — row 1 col 0
  if(p.facing > 0) return { sx: col*SPRITE_SIZE, sy: 2*SPRITE_SIZE };            // walk right — row 3
  return { sx: col*SPRITE_SIZE, sy: 1*SPRITE_SIZE };                             // walk left — row 2
}

function drawPlayer(){
  if(player.dead) return;
  const x=Math.round(player.x), y=Math.round(player.y), w=player.w, h=player.h;

  // Advance animation frame
  spriteTimer++;
  if(spriteTimer >= Math.round(60/SPRITE_FPS)){
    spriteTimer=0;
    spriteFrame=(spriteFrame+1)%4;
  }

  if(spriteSheet.complete && spriteSheet.naturalWidth > 0){
    const {sx, sy} = getSpriteFrame(player);
    // Draw sprite larger than hitbox, centred on hitbox
    const drawSize = player.w * 1.8;
    const drawX = x + player.w/2 - drawSize/2;
    const drawY = y + player.h - drawSize;
    ctx.save();
    ctx.drawImage(spriteSheet, sx, sy, SPRITE_SIZE, SPRITE_SIZE, drawX, drawY, drawSize, drawSize);
    ctx.restore();
  } else {
    // Fallback to pixel character if sprite not loaded
    ctx.save();
    ctx.translate(x+w/2,y+h/2); ctx.scale(player.facing,1); ctx.translate(-w/2,-h/2);
    ctx.fillStyle='#fdbcb4'; ctx.fillRect(w*0.2,0,w*0.6,h*0.35);
    ctx.fillStyle='#3d2b1f'; ctx.fillRect(w*0.2,0,w*0.6,h*0.18);
    ctx.fillStyle='#c0392b'; ctx.fillRect(w*0.05,h*0.35,w*0.9,h*0.35);
    ctx.restore();
  }
}

function drawWin(){
  if(!won) return;
  ctx.fillStyle='rgba(200,185,155,0.85)';
  ctx.fillRect(0,0,W(),H());
  const isLast = currentLevel >= MAX_LEVELS;
  ctx.fillStyle='#5a3e28';
  ctx.font=`bold ${Math.round(28*SCALE()+16)}px Caveat, cursive`;
  ctx.textAlign='center';
  ctx.fillText(isLast?'all levels complete! ★':`level ${currentLevel} complete! ★`, W()/2, H()/2-20);
  ctx.font=`${Math.round(16*SCALE()+10)}px Caveat, cursive`;
  ctx.fillStyle='#7a5e40';
  if(isLast){
    ctx.fillText('show both hands to play again', W()/2, H()/2+20);
  } else {
    ctx.fillText(`next: level ${currentLevel+1}: ${getLevelDescription(currentLevel+1)}`, W()/2, H()/2+20);
    ctx.fillText('show both hands to continue', W()/2, H()/2+44);
    ctx.font=`${Math.round(12*SCALE()+8)}px Caveat, cursive`;
    ctx.fillStyle='rgba(122,94,64,0.5)';
    ctx.fillText('(or press N)', W()/2, H()/2+64);
  }
  if(bothHandsTimer>0){
    ctx.fillStyle='rgba(90,62,40,0.3)'; ctx.fillRect(W()/2-80,H()/2+80,160,6);
    ctx.fillStyle='rgba(90,62,40,0.7)'; ctx.fillRect(W()/2-80,H()/2+80,160*Math.min(1,bothHandsTimer/25),6);
  }
  // Level dots
  for(let i=1;i<=MAX_LEVELS;i++){
    ctx.fillStyle = i<=currentLevel ? '#5a3e28' : 'rgba(90,62,40,0.25)';
    ctx.beginPath(); ctx.arc(W()/2-(MAX_LEVELS-1)*14+i*28-28, H()/2+98, 6, 0, Math.PI*2); ctx.fill();
  }
  ctx.textAlign='left';
}

function getLevelDescription(l){
  const d={1:'free play',2:'2 locked platforms',3:'2 locked + hazard zone',4:'3 locked + narrow border',5:'3 locked + hazard + narrow'};
  return d[l]||'';
}

function loop(){
  updatePlayer();
  ctx.clearRect(0,0,W(),H());
  drawBg();
  PLATFORMS.forEach(p=>drawPlatform(p));

  drawStar();
  drawPlayer();
  drawWin();
  if(player.dead&&!won){
    ctx.fillStyle='rgba(140,40,40,0.55)';
    ctx.fillRect(0,0,W(),H());
    ctx.fillStyle='#fff';
    ctx.font=`bold ${Math.round(28*SCALE()+16)}px Caveat, cursive`;
    ctx.textAlign='center';
    ctx.fillText('TAT you failed to finish the scrapbook...', W()/2, H()/2-20);
    ctx.font=`${Math.round(16*SCALE()+10)}px Caveat, cursive`;
    ctx.fillStyle='rgba(255,255,255,0.85)';
    const seconds = Math.min(3, Math.ceil(player.respawnTimer/40));
    ctx.fillText(`respawning in ${seconds}...`, W()/2, H()/2+20);
    ctx.textAlign='left';
  }
  requestAnimationFrame(loop);
}
loop();