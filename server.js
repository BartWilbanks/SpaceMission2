const path=require("path");
const express=require("express");
const http=require("http");
const {Server}=require("socket.io");

const app=express();
const server=http.createServer(app);
const io=new Server(server,{cors:{origin:"*"}});

const PORT=process.env.PORT||3000;
app.use(express.static(path.join(__dirname,"public")));

const PLANETS=[
  {
    "id": "mercury",
    "name": "Mercury",
    "x": -245,
    "y": -206,
    "r": 17
  },
  {
    "id": "venus",
    "name": "Venus",
    "x": -442,
    "y": 161,
    "r": 27
  },
  {
    "id": "earth",
    "name": "Earth",
    "x": 490,
    "y": 411,
    "r": 28
  },
  {
    "id": "mars",
    "name": "Mars",
    "x": 743,
    "y": -347,
    "r": 20
  },
  {
    "id": "jupiter",
    "name": "Jupiter",
    "x": 0,
    "y": 1180,
    "r": 94
  },
  {
    "id": "saturn",
    "name": "Saturn",
    "x": -760,
    "y": -1316,
    "r": 86
  },
  {
    "id": "uranus",
    "name": "Uranus",
    "x": 1668,
    "y": 778,
    "r": 56
  },
  {
    "id": "neptune",
    "name": "Neptune",
    "x": 1227,
    "y": -1753,
    "r": 55
  },
  {
    "id": "pluto",
    "name": "Pluto",
    "x": -1040,
    "y": 2230,
    "r": 12
  }
];
const SUN={id:"sun",name:"Sun",x:0,y:0,r:130,danger:140};

function now(){return Date.now();}
function rand(min,max){return Math.random()*(max-min)+min;}
function shuffle(arr){
  const a=arr.slice();
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]];}
  return a;
}
function generateBigDipper(){
  const baseX=rand(-3800,3800);
  const baseY=rand(-3800,3800);
  const scale=rand(140,200);
  const pts=[[0,0],[1,0.35],[2,0.65],[3,0.95],[3.8,1.6],[4.6,2.1],[5.4,2.5]];
  return pts.map(([x,y])=>({x:Math.round(baseX+x*scale),y:Math.round(baseY+y*scale)}));
}
function makeQuestOrder(){
  const planetsOnly=PLANETS.map(p=>p.id);
  const shuffled=shuffle(planetsOnly);
  return [...shuffled,"bigdipper"];
}
function createRoomCode(){
  const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code="";
  for(let i=0;i<5;i++) code+=chars[Math.floor(Math.random()*chars.length)];
  return code;
}
function randomColor(){
  const colors=["#7dd3fc","#a7f3d0","#fda4af","#fde68a","#c4b5fd","#fdba74"];
  return colors[Math.floor(Math.random()*colors.length)];
}

const rooms=new Map();

function publicRoomState(code){
  const room=rooms.get(code); if(!room) return null;
  const players=[];
  for(const [id,p] of room.players.entries()){
    players.push({
      id, name:p.name, x:p.x, y:p.y, angle:p.angle, speed:p.speed, color:p.color,
      spawnPlanetId:p.spawnPlanetId, shields:p.shields, kills:p.kills,
      quest:{order:p.questOrder,index:p.questIndex,collected:p.collected},
      lastSeen:p.lastSeen
    });
  }
  const bullets=room.bullets.map(b=>({id:b.id,ownerId:b.ownerId,x:b.x,y:b.y}));
  return {code, planets:PLANETS, sun:SUN, bigDipper:room.bigDipper, players, bullets, winner:room.winner};
}

function pickSpawnPlanet(room){
  const used=new Set();
  for(const p of room.players.values()) used.add(p.spawnPlanetId);
  const all=PLANETS.map(p=>p.id);
  const unused=all.filter(id=>!used.has(id));
  const list=unused.length?unused:all;
  return list[Math.floor(Math.random()*list.length)];
}
function spawnNearPlanet(planetId){
  const pl=PLANETS.find(p=>p.id===planetId)||PLANETS[0];
  return {x:pl.x+pl.r+75, y:pl.y-(pl.r+35)};
}

function resetMission(room, playerId, reason){
  const p=room.players.get(playerId);
  if(!p) return;
  if(p.shields>0) p.shields-=1;

  const spawnPlanetId=pickSpawnPlanet(room);
  const pos=spawnNearPlanet(spawnPlanetId);

  p.spawnPlanetId=spawnPlanetId;
  p.x=pos.x; p.y=pos.y;
  p.angle=0; p.speed=0;
  p.questOrder=makeQuestOrder();
  p.questIndex=0;
  p.collected=[];
  p.input={up:false,down:false,left:false,right:false};
  p.lastSeen=now();

  io.to(room.code).emit("player:died",{id:playerId,name:p.name,reason,shieldsRemaining:p.shields});
}

io.on("connection",(socket)=>{
  socket.on("host:createRoom",(ack)=>{
    let code;
    do{code=createRoomCode();}while(rooms.has(code));
    rooms.set(code,{code, hostId:socket.id, players:new Map(), bullets:[], winner:null, bigDipper:generateBigDipper(), createdAt:now()});
    socket.join(code);
    ack?.({ok:true,code});
    socket.emit("room:state",publicRoomState(code));
  });

  socket.on("host:joinRoom",({code},ack)=>{
    const room=rooms.get(code);
    if(!room) return ack?.({ok:false,error:"Room not found"});
    room.hostId=socket.id;
    socket.join(code);
    ack?.({ok:true});
    socket.emit("room:state",publicRoomState(code));
  });

  socket.on("host:restartRoom",({code},ack)=>{
    const room=rooms.get(code);
    if(!room) return ack?.({ok:false,error:"Room not found"});
    if(room.hostId!==socket.id) return ack?.({ok:false,error:"Only host can restart"});

    room.winner=null;
    room.bullets=[];
    room.bigDipper=generateBigDipper();

    const existing=[...room.players.entries()];
    room.players.clear();
    for(const [id,old] of existing){
      const spawnPlanetId=pickSpawnPlanet(room);
      const pos=spawnNearPlanet(spawnPlanetId);
      room.players.set(id,{...old, x:pos.x,y:pos.y,angle:0,speed:0,spawnPlanetId,shields:3,kills:0,
        questOrder:makeQuestOrder(),questIndex:0,collected:[],input:{up:false,down:false,left:false,right:false},lastSeen:now(),lastShotAt:0});
    }

    io.to(code).emit("game:restarted",{time:now()});
    io.to(code).emit("room:state",publicRoomState(code));
    ack?.({ok:true});
  });

  socket.on("player:joinRoom",({code,name},ack)=>{
    const room=rooms.get(code);
    if(!room) return ack?.({ok:false,error:"Room not found"});

    const n=(name||"Pilot").toString().trim().slice(0,16);
    const spawnPlanetId=pickSpawnPlanet(room);
    const pos=spawnNearPlanet(spawnPlanetId);

    const player={name:n,x:pos.x,y:pos.y,angle:0,speed:0,color:randomColor(),spawnPlanetId,
      shields:3,kills:0,questOrder:makeQuestOrder(),questIndex:0,collected:[],
      input:{up:false,down:false,left:false,right:false},lastSeen:now(),lastShotAt:0};

    room.players.set(socket.id,player);
    socket.join(code);
    ack?.({ok:true,code,playerId:socket.id,planets:PLANETS,sun:SUN,bigDipper:room.bigDipper,
      quest:{order:player.questOrder,index:player.questIndex,collected:player.collected},shields:player.shields});
    io.to(code).emit("room:state",publicRoomState(code));
  });

  socket.on("player:input",({code,input})=>{
    const room=rooms.get(code); if(!room) return;
    const p=room.players.get(socket.id); if(!p) return;
    p.input={up:!!input?.up,down:!!input?.down,left:!!input?.left,right:!!input?.right};
    p.lastSeen=now();
  });

  socket.on("player:fire",({code},ack)=>{
    const room=rooms.get(code);
    if(!room) return ack?.({ok:false,error:"Room not found"});
    if(room.winner) return ack?.({ok:false,error:"Game over"});
    const p=room.players.get(socket.id);
    if(!p) return ack?.({ok:false,error:"Player not found"});
    const t=now();
    if(t-p.lastShotAt<250) return ack?.({ok:false,error:"Cooling down"});
    p.lastShotAt=t;

    const speed=14.0;
    const spawnDist=26;
    const bx=p.x+Math.cos(p.angle)*spawnDist;
    const by=p.y+Math.sin(p.angle)*spawnDist;

    room.bullets.push({
      id:`${t}-${Math.floor(Math.random()*1e9)}`,
      ownerId:socket.id,
      x:bx,y:by,
      vx:Math.cos(p.angle)*speed,
      vy:Math.sin(p.angle)*speed,
      ttlMs:1100
    });

    ack?.({ok:true});
  });

  socket.on("player:land",({code},ack)=>{
    const room=rooms.get(code);
    if(!room) return ack?.({ok:false,error:"Room not found"});
    if(room.winner) return ack?.({ok:false,error:`Game over. Winner: ${room.winner.name}`});
    const p=room.players.get(socket.id);
    if(!p) return ack?.({ok:false,error:"Player not found"});

    const targetId=p.questOrder[p.questIndex];

    if(targetId!=="bigdipper"){
      const target=PLANETS.find(pl=>pl.id===targetId);
      if(!target) return ack?.({ok:false,error:"Bad target"});
      const dist=Math.hypot(p.x-target.x,p.y-target.y);
      if(dist>target.r+55) return ack?.({ok:false,error:"Too far to land. Get closer."});
      if(!p.collected.includes(targetId)) p.collected.push(targetId);
      if(p.questIndex<p.questOrder.length-1) p.questIndex++;
      io.to(code).emit("room:state",publicRoomState(code));
      return ack?.({ok:true,collected:targetId,done:false,next:p.questOrder[p.questIndex]});
    }

    const needed=new Set(PLANETS.map(pl=>pl.id));
    const haveAll=[...needed].every(id=>p.collected.includes(id));
    if(!haveAll) return ack?.({ok:false,error:"Collect all 9 planet items before searching for the Big Dipper."});
    const stars=room.bigDipper||[];
    if(!stars.length) return ack?.({ok:false,error:"Big Dipper not available. Ask host to restart."});
    const close=stars.some(s=>Math.hypot(p.x-s.x,p.y-s.y)<=90);
    if(!close) return ack?.({ok:false,error:"Not close enough. Fly near a Big Dipper star and LAND."});

    room.winner={id:socket.id,name:p.name,time:now()};
    io.to(code).emit("game:winner",room.winner);
    io.to(code).emit("room:state",publicRoomState(code));
    return ack?.({ok:true,done:true,winner:room.winner});
  });

  socket.on("disconnect",()=>{
    for(const [code,room] of rooms.entries()){
      let changed=false;
      if(room.hostId===socket.id){room.hostId=null; changed=true;}
      if(room.players.delete(socket.id)) changed=true;
      const before=room.bullets.length;
      room.bullets=room.bullets.filter(b=>b.ownerId!==socket.id);
      if(room.bullets.length!==before) changed=true;

      if(!room.hostId && room.players.size===0){ rooms.delete(code); continue; }
      if(changed) io.to(code).emit("room:state",publicRoomState(code));
    }
  });
});

const TICK_HZ=30;
setInterval(()=>{
  for(const [code,room] of rooms.entries()){
    if(room.winner){ io.to(code).emit("room:tick",publicRoomState(code)); continue; }

    // Players
    for(const [id,p] of room.players.entries()){
      const turn=0.09;
      if(p.input.left) p.angle-=turn;
      if(p.input.right) p.angle+=turn;
      const accel=0.25;
      if(p.input.up) p.speed+=accel;
      if(p.input.down) p.speed-=accel*0.8;
      p.speed*=0.92;
      p.speed=Math.max(Math.min(p.speed,6.0),-3.6);
      p.x+=Math.cos(p.angle)*p.speed;
      p.y+=Math.sin(p.angle)*p.speed;

      const bound=4200;
      p.x=Math.max(-bound,Math.min(bound,p.x));
      p.y=Math.max(-bound,Math.min(bound,p.y));

      const sunDist=Math.hypot(p.x-SUN.x,p.y-SUN.y);
      if(sunDist<SUN.r+SUN.danger){ resetMission(room,id,"sun"); continue; }

      p.lastSeen=now();
    }

    // Bullets
    const newBullets=[];
    for(const b of room.bullets){
      b.ttlMs-=(1000/TICK_HZ);
      if(b.ttlMs<=0) continue;
      b.x+=b.vx; b.y+=b.vy;
      if(Math.abs(b.x)>4600||Math.abs(b.y)>4600) continue;
      const sd=Math.hypot(b.x-SUN.x,b.y-SUN.y);
      if(sd<SUN.r+SUN.danger) continue;

      let hit=false;
      for(const [pid,p] of room.players.entries()){
        if(pid===b.ownerId) continue;
        const d=Math.hypot(p.x-b.x,p.y-b.y);
        if(d<(18+6)){
          hit=true;
          const shooter=room.players.get(b.ownerId);
          if(shooter) shooter.kills=(shooter.kills||0)+1;
          resetMission(room,pid,"shot");
          io.to(room.code).emit("bullet:hit",{by:b.ownerId,victim:pid});
          break;
        }
      }
      if(hit) continue;
      newBullets.push(b);
    }
    room.bullets=newBullets;

    io.to(code).emit("room:tick",publicRoomState(code));
  }
}, Math.floor(1000/TICK_HZ));

server.listen(PORT,()=>console.log(`Rhys' Space Mission running on port ${PORT}`));
