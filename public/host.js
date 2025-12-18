
const socket = io();
const $ = (id)=>document.getElementById(id);

const statusEl = $("status");
const createBtn = $("createBtn");
const joinBtn = $("joinBtn");
const restartBtn = $("restartBtn");
const codeEl = $("code");
const roomCodeEl = $("roomCode");
const leaderboardEl = $("leaderboard");
const miniGrid = $("miniGrid");
const map = $("map");
const mctx = map.getContext("2d");

let roomCode=null;
let state=null;

const setStatus = (m)=>statusEl.textContent=m;

createBtn.onclick=()=>{
  socket.emit("host:createRoom",(r)=>{
    if(!r?.ok) return setStatus("Create failed");
    roomCode=r.code;
    roomCodeEl.textContent=roomCode;
    codeEl.value=roomCode;
    setStatus(`Hosting ${roomCode}`);
  });
};

joinBtn.onclick=()=>{
  const code=codeEl.value.trim().toUpperCase();
  if(!code) return;
  socket.emit("host:joinRoom",{code},(r)=>{
    if(!r?.ok) return setStatus(r?.error||"Join failed");
    roomCode=code;
    roomCodeEl.textContent=roomCode;
    setStatus(`Hosting ${roomCode}`);
  });
};

restartBtn.onclick=()=>{
  if(!roomCode) return;
  socket.emit("host:restartRoom",{code:roomCode},(r)=>{
    if(!r?.ok) return setStatus(r?.error||"Restart failed");
    setStatus("Restarted");
  });
};

socket.on("room:state",(s)=>{ state=s; renderHost(); });
socket.on("room:tick",(s)=>{ state=s; renderHost(); });
socket.on("game:winner",(w)=>{ setStatus(`Winner: ${w.name}`); });

function renderLeaderboard(){
  if(!state) return;
  const rows=[...state.players].sort((a,b)=>{
    const ac=(a.quest?.collected?.length||0), bc=(b.quest?.collected?.length||0);
    if(bc!==ac) return bc-ac;
    return (b.kills||0)-(a.kills||0);
  });
  leaderboardEl.innerHTML="";
  const h=document.createElement("div");
  h.className="row header";
  h.innerHTML="<div>Player</div><div>Kills</div><div>Items</div>";
  leaderboardEl.appendChild(h);
  for(const p of rows){
    const r=document.createElement("div");
    r.className="row";
    const items=p.quest?.collected?.length||0;
    r.innerHTML=`<div>${p.name}${state.winner?.id===p.id?" 🏁":""}</div><div>${p.kills||0}</div><div>${items}/9</div>`;
    leaderboardEl.appendChild(r);
  }
}

function computeBounds(){
  const pts=[];
  for(const pl of (state.planets||[])) pts.push([pl.x,pl.y]);
  if(state.sun) pts.push([state.sun.x,state.sun.y]);
  if(state.bigDipper) for(const s of state.bigDipper) pts.push([s.x,s.y]);
  for(const p of (state.players||[])) pts.push([p.x,p.y]);
  for(const b of (state.bullets||[])) pts.push([b.x,b.y]);
  if(!pts.length) return {minX:-1,maxX:1,minY:-1,maxY:1};
  let minX=1e9,maxX=-1e9,minY=1e9,maxY=-1e9;
  for(const [x,y] of pts){ minX=Math.min(minX,x); maxX=Math.max(maxX,x); minY=Math.min(minY,y); maxY=Math.max(maxY,y); }
  const pad=250;
  return {minX:minX-pad,maxX:maxX+pad,minY:minY-pad,maxY:maxY+pad};
}

function renderMap(){
  if(!state) return;
  mctx.clearRect(0,0,map.width,map.height);
  mctx.fillStyle="rgba(0,0,0,0.15)";
  mctx.fillRect(0,0,map.width,map.height);

  const b=computeBounds();
  const w=b.maxX-b.minX, h=b.maxY-b.minY;
  const s=Math.min(map.width/(w||1), map.height/(h||1));
  const to=(x,y)=>({x:(x-b.minX)*s, y:(y-b.minY)*s});

  // sun ring
  if(state.sun){
    const ss=to(state.sun.x,state.sun.y);
    mctx.strokeStyle="rgba(255,190,120,0.35)";
    mctx.setLineDash([6,6]);
    mctx.beginPath(); mctx.arc(ss.x,ss.y,Math.max(6,(state.sun.r+state.sun.danger)*s*0.25),0,Math.PI*2); mctx.stroke();
    mctx.setLineDash([]);
  }

  // planets
  for(const pl of (state.planets||[])){
    const ps=to(pl.x,pl.y);
    mctx.fillStyle="rgba(200,220,255,0.25)";
    mctx.beginPath(); mctx.arc(ps.x,ps.y,Math.max(2,pl.r*s*0.18),0,Math.PI*2); mctx.fill();
  }

  // dipper
  if(state.bigDipper?.length){
    mctx.strokeStyle="rgba(180,220,255,0.7)";
    mctx.fillStyle="rgba(255,255,255,0.9)";
    mctx.lineWidth=2;
    for(let i=0;i<state.bigDipper.length;i++){
      const spt=state.bigDipper[i];
      const ss=to(spt.x,spt.y);
      if(i>0){
        const pp=state.bigDipper[i-1];
        const ps=to(pp.x,pp.y);
        mctx.beginPath(); mctx.moveTo(ps.x,ps.y); mctx.lineTo(ss.x,ss.y); mctx.stroke();
      }
      mctx.beginPath(); mctx.arc(ss.x,ss.y,3,0,Math.PI*2); mctx.fill();
    }
  }

  // bullets
  mctx.fillStyle="rgba(255,255,255,0.75)";
  for(const bl of (state.bullets||[])){
    const bs=to(bl.x,bl.y);
    mctx.beginPath(); mctx.arc(bs.x,bs.y,2,0,Math.PI*2); mctx.fill();
  }

  // players
  for(const p of (state.players||[])){
    const ps=to(p.x,p.y);
    mctx.fillStyle=p.color||"white";
    mctx.beginPath(); mctx.arc(ps.x,ps.y,3,0,Math.PI*2); mctx.fill();
  }
}

function renderMiniViews(){
  if(!state) return;
  miniGrid.innerHTML="";
  for(const p of (state.players||[])){
    const card=document.createElement("div");
    card.className="miniCard";
    const head=document.createElement("div");
    head.className="miniHeader";
    head.innerHTML=`<div><b>${p.name}</b></div><div>${p.quest?.collected?.length||0}/9 • ${p.kills||0}K</div>`;
    const c=document.createElement("canvas");
    c.width=340; c.height=190;
    c.className="miniCanvas";
    card.appendChild(head); card.appendChild(c);
    miniGrid.appendChild(card);

    const g=c.getContext("2d");
    const camX=p.x, camY=p.y, scale=0.35;
    const to=(x,y)=>({x:(x-camX)*scale+c.width/2, y:(y-camY)*scale+c.height/2});

    g.fillStyle="rgba(0,0,0,0.15)";
    g.fillRect(0,0,c.width,c.height);

    if(state.sun){
      const ss=to(state.sun.x,state.sun.y);
      g.strokeStyle="rgba(255,190,120,0.35)";
      g.setLineDash([6,6]);
      g.beginPath(); g.arc(ss.x,ss.y,(state.sun.r+state.sun.danger)*scale*0.25,0,Math.PI*2); g.stroke();
      g.setLineDash([]);
    }
    if(state.bigDipper){
      g.strokeStyle="rgba(180,220,255,0.35)";
      g.fillStyle="rgba(255,255,255,0.55)";
      for(let i=0;i<state.bigDipper.length;i++){
        const spt=state.bigDipper[i];
        const ss=to(spt.x,spt.y);
        if(i>0){
          const pp=state.bigDipper[i-1];
          const ps=to(pp.x,pp.y);
          g.beginPath(); g.moveTo(ps.x,ps.y); g.lineTo(ss.x,ss.y); g.stroke();
        }
        g.beginPath(); g.arc(ss.x,ss.y,2,0,Math.PI*2); g.fill();
      }
    }
    g.fillStyle="rgba(200,220,255,0.20)";
    for(const pl of (state.planets||[])){
      const ps=to(pl.x,pl.y);
      g.beginPath(); g.arc(ps.x,ps.y,Math.max(2,pl.r*scale*0.12),0,Math.PI*2); g.fill();
    }
    g.fillStyle="rgba(255,255,255,0.65)";
    for(const bl of (state.bullets||[])){
      const bs=to(bl.x,bl.y);
      g.beginPath(); g.arc(bs.x,bs.y,2,0,Math.PI*2); g.fill();
    }
    for(const op of (state.players||[])){
      const os=to(op.x,op.y);
      g.fillStyle=op.color||"white";
      g.beginPath(); g.arc(os.x,os.y,3,0,Math.PI*2); g.fill();
    }
  }
}

function renderHost(){
  renderLeaderboard();
  renderMap();
  renderMiniViews();
}
