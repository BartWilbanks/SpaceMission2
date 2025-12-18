
const socket = io();
const $ = (id) => document.getElementById(id);

const statusEl = $("status");
const codeEl = $("code");
const nameEl = $("name");
const joinBtn = $("joinBtn");
const landBtn = $("landBtn");
const fireBtn = $("fireBtn");
const tiltBtn = $("tiltBtn");
const tiltSensEl = $("tiltSens");

const targetNameEl = $("targetName");
const collectedCountEl = $("collectedCount");
const shieldsCountEl = $("shieldsCount");
const inventoryEl = $("inventory");
const winnerOverlay = $("winnerOverlay");
const winnerText = $("winnerText");

const canvas = $("game");
const ctx = canvas.getContext("2d");

let roomCode=null, myId=null;
let state=null;
let planets=[], sun=null, bigDipper=null, bullets=[];
let myQuest=null, myShields=3;

const input = { up:false, down:false, left:false, right:false };

// Tilt
let tiltEnabled=false, tiltPermitted=false;
let tiltGamma=0, tiltBeta=0, lastTiltAt=0;

const ICON={ mercury:"☿️", venus:"♀️", earth:"🌍", mars:"♂️", jupiter:"🟠", saturn:"🪐", uranus:"🟦", neptune:"🔵", pluto:"❄️" };
const PCOL={ mercury:"#9aa3ad", venus:"#d9b86f", earth:"#2b76ff", mars:"#d44b3a", jupiter:"#d6b38a", saturn:"#d9cf9b", uranus:"#7ad7e6", neptune:"#3d63ff", pluto:"#c7c2b7" };

let landFx=null;
let shotFx=[];
let hitFlashUntil=0;

function setStatus(m){ statusEl.textContent=m; }
function me(){ return state?.players?.find(p=>p.id===myId)||null; }
function planetById(id){ return planets.find(p=>p.id===id); }
function dipper(){ return state?.bigDipper || bigDipper; }

function renderInventory(){
  if(!myQuest) return;
  const got=new Set(myQuest.collected||[]);
  inventoryEl.innerHTML="";
  ["mercury","venus","earth","mars","jupiter","saturn","uranus","neptune","pluto"].forEach(id=>{
    const d=document.createElement("div");
    d.className="invItem"+(got.has(id)?" collected":"");
    d.textContent=ICON[id]||"•";
    inventoryEl.appendChild(d);
  });
}

function updateHud(){
  if(!myQuest) return;
  const tid=myQuest.order[myQuest.index];
  targetNameEl.textContent = (tid==="bigdipper") ? "Big Dipper" : (planetById(tid)?.name || "—");
  collectedCountEl.textContent = (myQuest.collected||[]).length;
  shieldsCountEl.textContent = myShields;

  const p=me();
  if(!p) { landBtn.disabled=true; return; }
  if(tid==="bigdipper"){
    const stars=dipper();
    if(!stars?.length) { landBtn.disabled=true; return; }
    let best=1e18;
    for(const s of stars) best=Math.min(best, Math.hypot(p.x-s.x,p.y-s.y));
    landBtn.disabled = best>90;
  } else {
    const t=planetById(tid);
    if(!t) { landBtn.disabled=true; return; }
    const d=Math.hypot(p.x-t.x,p.y-t.y);
    landBtn.disabled = d>(t.r+55);
  }
  renderInventory();
}

function showWinner(name){
  winnerText.textContent = `Winner: ${name}`;
  winnerOverlay.classList.remove("hidden");
}
function hideWinner(){ winnerOverlay.classList.add("hidden"); }

function playBeep(freq1, freq2, dur, shape){
  try{
    const AC=window.AudioContext||window.webkitAudioContext;
    const ac=new AC();
    const o=ac.createOscillator();
    const g=ac.createGain();
    o.type=shape||"triangle";
    o.frequency.setValueAtTime(freq1, ac.currentTime);
    o.frequency.exponentialRampToValueAtTime(freq2, ac.currentTime+dur*0.7);
    g.gain.setValueAtTime(0.0001, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.14, ac.currentTime+0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime+dur);
    o.connect(g); g.connect(ac.destination);
    o.start(); o.stop(ac.currentTime+dur);
    o.onended=()=>ac.close();
  }catch{}
}

joinBtn.onclick=()=>{
  const code=codeEl.value.trim().toUpperCase();
  if(!code) return;
  socket.emit("player:joinRoom",{code, name:nameEl.value.trim()},(r)=>{
    if(!r?.ok) return setStatus(r?.error||"Join failed");
    roomCode=r.code; myId=r.playerId;
    planets=r.planets||[]; sun=r.sun; bigDipper=r.bigDipper;
    myQuest=r.quest; myShields=r.shields ?? 3;
    hideWinner();
    setStatus(`Joined ${roomCode}`);
    updateHud(); render();
  });
};

function tryFire(){
  if(!roomCode) return;
  socket.emit("player:fire",{code:roomCode},(r)=>{
    if(r?.ok){
      const p=me();
      if(p) shotFx.push({x:p.x,y:p.y,t:performance.now()});
      playBeep(420,180,0.11,"square");
    }
  });
}
fireBtn.onclick=tryFire;
window.addEventListener("keydown",(e)=>{
  if(e.code==="Space"){ e.preventDefault(); tryFire(); }
});
canvas.addEventListener("pointerdown", ()=> tryFire());

landBtn.onclick=()=>{
  if(!roomCode) return;
  socket.emit("player:land",{code:roomCode},(r)=>{
    if(!r?.ok) return setStatus(r?.error||"Can't land");
    const p=me();
    if(p) landFx={x:p.x,y:p.y,t:performance.now(),d:650};
    playBeep(740,1240,0.19,"triangle");
    if(r.done){ setStatus("🏁 YOU WIN!"); showWinner(r.winner?.name||"You"); }
    else setStatus("Collected! Keep going...");
  });
};

// keys + pad
window.addEventListener("keydown",(e)=>{
  const k=e.key.toLowerCase();
  if(e.key==="ArrowUp"||k==="w") input.up=true;
  if(e.key==="ArrowDown"||k==="s") input.down=true;
  if(e.key==="ArrowLeft"||k==="a") input.left=true;
  if(e.key==="ArrowRight"||k==="d") input.right=true;
});
window.addEventListener("keyup",(e)=>{
  const k=e.key.toLowerCase();
  if(e.key==="ArrowUp"||k==="w") input.up=false;
  if(e.key==="ArrowDown"||k==="s") input.down=false;
  if(e.key==="ArrowLeft"||k==="a") input.left=false;
  if(e.key==="ArrowRight"||k==="d") input.right=false;
});
document.querySelectorAll(".padBtn").forEach(b=>{
  const k=b.dataset.key;
  const dn=()=>input[k]=true;
  const up=()=>input[k]=false;
  b.addEventListener("pointerdown",dn);
  b.addEventListener("pointerup",up);
  b.addEventListener("pointercancel",up);
  b.addEventListener("pointerleave",up);
});

// Tilt permission
async function requestTiltPermission(){
  try{
    if(typeof DeviceOrientationEvent!=="undefined" && typeof DeviceOrientationEvent.requestPermission==="function"){
      const res=await DeviceOrientationEvent.requestPermission();
      tiltPermitted=(res==="granted");
      return tiltPermitted;
    }
    tiltPermitted=true; return true;
  }catch{ tiltPermitted=false; return false; }
}
function onOri(e){
  if(e.gamma==null||e.beta==null) return;
  tiltGamma=e.gamma; tiltBeta=e.beta; lastTiltAt=performance.now();
}
function setTilt(on){
  tiltEnabled=!!on;
  tiltBtn.textContent=tiltEnabled ? "TILT: ON" : "TILT: OFF";
}
tiltBtn.onclick=async ()=>{
  if(!tiltEnabled){
    const ok=await requestTiltPermission();
    if(!ok){ setStatus("Tilt not permitted."); return; }
    window.addEventListener("deviceorientation", onOri, true);
    setTilt(true);
    setStatus("Tilt enabled: tilt L/R to steer, forward to accelerate.");
  } else {
    window.removeEventListener("deviceorientation", onOri, true);
    setTilt(false);
    setStatus("Tilt disabled.");
  }
};

// send input (tilt overrides)
setInterval(()=>{
  if(!roomCode) return;

  if(tiltEnabled && tiltPermitted){
    const sens=parseFloat(tiltSensEl?.value||"1.6");
    const g=(tiltGamma||0)/25*sens;
    const b=(tiltBeta||0)/35*sens;
    input.left = g < -0.35;
    input.right = g > 0.35;
    input.up = b > 0.25;
    input.down = b < -0.25;
    if(performance.now()-lastTiltAt>1500){
      input.left=input.right=input.up=input.down=false;
    }
  }

  socket.emit("player:input",{code:roomCode,input});
},33);

socket.on("player:died",(d)=>{
  if(d.id===myId){
    myShields=d.shieldsRemaining;
    hitFlashUntil=performance.now()+500;
    setStatus(`You died (${d.reason}). Shields left: ${myShields}. Mission restarted.`);
    playBeep(180,90,0.22,"sawtooth");
  }
});
socket.on("game:winner",(w)=>{ setStatus(`🏁 Winner: ${w.name}`); showWinner(w.name); });
socket.on("game:restarted",()=>{ hideWinner(); setStatus("🔄 Room restarted"); });

function ingest(s){
  state=s;
  planets=s.planets||planets;
  sun=s.sun||sun;
  bigDipper=s.bigDipper||bigDipper;
  bullets=s.bullets||bullets;
  const p=me();
  if(p?.quest){
    myQuest={order:p.quest.order,index:p.quest.index,collected:p.quest.collected};
    myShields=p.shields ?? myShields;
  }
  updateHud();
}
socket.on("room:state",ingest);
socket.on("room:tick",(s)=>{ ingest(s); render(); });

function drawSun(){
  if(!sun) return;
  const g=ctx.createRadialGradient(sun.x,sun.y,sun.r*0.2,sun.x,sun.y,sun.r*2.3);
  g.addColorStop(0,"rgba(255,204,80,0.95)");
  g.addColorStop(0.35,"rgba(255,140,40,0.55)");
  g.addColorStop(1,"rgba(255,140,40,0)");
  ctx.fillStyle=g;
  ctx.beginPath(); ctx.arc(sun.x,sun.y,sun.r*2.2,0,Math.PI*2); ctx.fill();

  ctx.save();
  ctx.strokeStyle="rgba(255,180,120,0.45)";
  ctx.setLineDash([10,10]);
  ctx.lineWidth=2;
  ctx.beginPath(); ctx.arc(sun.x,sun.y,sun.r+sun.danger,0,Math.PI*2); ctx.stroke();
  ctx.restore();
}
function drawBigDipper(stars){
  if(!stars?.length) return;
  ctx.save();
  ctx.strokeStyle="rgba(180,220,255,0.65)";
  ctx.fillStyle="rgba(255,255,255,0.9)";
  ctx.lineWidth=2;
  for(let i=0;i<stars.length;i++){
    const s=stars[i];
    if(i>0){ const p=stars[i-1]; ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(s.x,s.y); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(s.x,s.y,4,0,Math.PI*2); ctx.fill();
  }
  ctx.restore();
}
function drawPlanet(p){
  ctx.save();
  ctx.fillStyle=PCOL[p.id]||"rgba(200,200,255,0.5)";
  ctx.strokeStyle="rgba(0,0,0,0.35)";
  ctx.lineWidth=3;
  ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill(); ctx.stroke();
  if(p.id==="jupiter"){
    ctx.fillStyle="rgba(210,60,60,0.9)";
    ctx.beginPath(); ctx.ellipse(p.x+p.r*0.2,p.y+p.r*0.05,p.r*0.35,p.r*0.22,0.3,0,Math.PI*2); ctx.fill();
  }
  if(p.id==="saturn"){
    ctx.strokeStyle="rgba(255,255,255,0.35)";
    ctx.lineWidth=4;
    ctx.beginPath(); ctx.ellipse(p.x,p.y,p.r*1.25,p.r*0.65,0.25,0,Math.PI*2); ctx.stroke();
  }
  ctx.fillStyle="rgba(255,255,255,0.85)";
  ctx.font="12px system-ui";
  ctx.fillText(p.name,p.x-p.r,p.y-p.r-10);
  ctx.restore();
}
function drawShip(p){
  ctx.save();
  ctx.translate(p.x,p.y); ctx.rotate(p.angle);
  ctx.fillStyle=p.color||"white";
  ctx.strokeStyle="rgba(0,0,0,0.35)";
  ctx.lineWidth=2;
  ctx.beginPath();
  ctx.moveTo(18,0); ctx.lineTo(-12,-10); ctx.lineTo(-8,0); ctx.lineTo(-12,10); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.restore();
}

function render(){
  const mp=me();
  if(!mp){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle="rgba(255,255,255,0.7)";
    ctx.font="16px system-ui";
    ctx.fillText("Join a room to start.",24,40);
    return;
  }
  const camX=mp.x, camY=mp.y;
  const scale=1.0;

  ctx.clearRect(0,0,canvas.width,canvas.height);

  // starfield
  ctx.save();
  ctx.globalAlpha=0.35; ctx.fillStyle="white";
  for(let i=0;i<90;i++){ const sx=(i*97)%canvas.width; const sy=(i*173)%canvas.height; ctx.fillRect(sx,sy,1,1); }
  ctx.restore();

  ctx.save();
  ctx.translate(canvas.width/2,canvas.height/2);
  ctx.scale(scale,scale);
  ctx.translate(-camX,-camY);

  drawSun();
  for(const p of planets) drawPlanet(p);
  drawBigDipper(dipper());

  // bullets
  ctx.fillStyle="rgba(255,255,255,0.85)";
  for(const b of bullets){ ctx.beginPath(); ctx.arc(b.x,b.y,4,0,Math.PI*2); ctx.fill(); }

  for(const p of (state?.players||[])) drawShip(p);

  // landing beam
  if(landFx){
    const t=performance.now()-landFx.t;
    if(t<landFx.d){
      const a=1-(t/landFx.d);
      ctx.save();
      ctx.globalAlpha=0.65*a;
      ctx.fillStyle="rgba(140,240,255,1)";
      ctx.beginPath();
      ctx.moveTo(landFx.x,landFx.y);
      ctx.lineTo(landFx.x-22,landFx.y-120);
      ctx.lineTo(landFx.x+22,landFx.y-120);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else landFx=null;
  }

  // shot ring
  const nowp=performance.now();
  shotFx=shotFx.filter(s=>nowp-s.t<250);
  for(const s of shotFx){
    const a=1-(nowp-s.t)/250;
    ctx.save();
    ctx.globalAlpha=0.7*a;
    ctx.strokeStyle="rgba(255,220,180,1)";
    ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(s.x,s.y,18+(1-a)*16,0,Math.PI*2); ctx.stroke();
    ctx.restore();
  }

  // target ring
  const tid=myQuest?.order?.[myQuest.index];
  if(tid==="bigdipper"){
    const stars=dipper();
    if(stars?.length){
      let best=null, bestD=1e18;
      for(const s of stars){ const d=Math.hypot(mp.x-s.x, mp.y-s.y); if(d<bestD){bestD=d;best=s;} }
      if(best){
        ctx.save();
        ctx.strokeStyle="rgba(107,191,89,0.95)";
        ctx.lineWidth=3; ctx.setLineDash([8,8]);
        ctx.beginPath(); ctx.arc(best.x,best.y,95,0,Math.PI*2); ctx.stroke();
        ctx.restore();
      }
    }
  } else {
    const t=planetById(tid);
    if(t){
      ctx.save();
      ctx.strokeStyle="rgba(107,191,89,0.95)";
      ctx.lineWidth=3; ctx.setLineDash([8,8]);
      ctx.beginPath(); ctx.arc(t.x,t.y,(t.r||12)+55,0,Math.PI*2); ctx.stroke();
      ctx.restore();
    }
  }

  // hit flash
  if(nowp<hitFlashUntil){
    ctx.save();
    ctx.globalAlpha=0.20;
    ctx.fillStyle="rgba(255,80,80,1)";
    ctx.fillRect(camX-canvas.width/2, camY-canvas.height/2, canvas.width, canvas.height);
    ctx.restore();
  }

  ctx.restore();
}
