import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import {createSkeld} from "./skeld.js";
const $=s=>document.querySelector(s);
const VIEW_H=14;
function viewH(){const a=innerWidth/innerHeight;return a>=1.5?VIEW_H:VIEW_H*1.5/a;}
let curViewH=VIEW_H;const IS_TOUCH=matchMedia("(pointer:coarse)").matches;
// Caméra : vue du dessus légèrement inclinée (comme Among Us) pour voir la face des murs ; commandes toujours fixes par rapport à l'écran.
const CAM_PITCH=66*Math.PI/180,CAM_DIST=36;
const WALL_H=3.1;
const crewSvg=c=>`<svg viewBox="0 0 60 84"><rect x="9" y="30" width="42" height="40" rx="14" fill="${c}" stroke="#0008" stroke-width="2"/><rect x="12" y="10" width="36" height="44" rx="18" fill="${c}" stroke="#0008" stroke-width="2"/><rect x="26" y="20" width="28" height="16" rx="8" fill="#bcecff" stroke="#0008" stroke-width="2"/><rect x="12" y="62" width="14" height="16" rx="5" fill="${c}" stroke="#0008" stroke-width="2"/><rect x="34" y="62" width="14" height="16" rx="5" fill="${c}" stroke="#0008" stroke-width="2"/></svg>`;
let SK=null,sunLight=null;
function placeCamera(x,z){camera.position.set(x,CAM_DIST*Math.sin(CAM_PITCH),z+CAM_DIST*Math.cos(CAM_PITCH));camera.up.set(0,1,0);camera.lookAt(x,0,z);if(sunLight){sunLight.position.set(x-7,20,z+6);sunLight.target.position.set(x,0,z);sunLight.target.updateMatrixWorld();}}
const isImpRole=r=>["Imposteur","Imposteur 3","Ferreur","Métamorphe","Invisible"].includes(r);
const roleLabel=r=>r==="Ferreur"||r==="Métamorphe"||r==="Invisible"?"Imposteur : "+r:r==="Imposteur 3"?"Imposteur":r;
let scene,camera,renderer,ws,myId,roomCode,me=null,you=null,isHost=false,keys={},clock=new THREE.Clock(),lastSend=0,lastTp=null,lastSettings="";
let MAP=null,MAPS=[],builtMapId=null,mapGroup=null,PANEL={x:0,z:0},MAP_XS=[],MAP_ZS=[],DOORS=[];
let VENTS=[],ROOMS=[],LOCKS=[],nurseContactActive=false,gameStarted=false,previousBlackout=null,repairTimer=null,repairStartAt=0,taskTimer=null,taskStartAt=0,taskTarget=null;window.repairMap=new Map();const lockMeshes=new Map();
const avatars=new Map(),corpseMeshes=new Map(),taskMeshes=new Map();let yaw=0,pitch=-0.12;
const cameraDesired=new THREE.Vector3(),cameraLookDesired=new THREE.Vector3(),cameraLookTarget=new THREE.Vector3();
const cameraForward=new THREE.Vector3(),cameraRight=new THREE.Vector3(),worldUp=new THREE.Vector3(0,1,0);
const wallMeshes=[],cameraRaycaster=new THREE.Raycaster(),cameraOrigin=new THREE.Vector3(),cameraRayDirection=new THREE.Vector3();
const status=$("#status"),toast=$("#toast");
const SETTINGS=[["taskCount","Nombre de tâches par partie (10–300, au prochain lancement)"],["maxPlayers","Joueurs maximum (4–10)"],["impostors","Nombre d’imposteurs (1–3)"],["nurseContactDuration","Durée contact infirmier (s)"],["angelDuration","Durée de protection de l'Ange gardien (s)"],["angelCooldown","Recharge de l'Ange gardien (s)"],["angelPhotoUses","Objets envoyés par l'Influenceur (0 = aucun)"],["judgeTasks","Tâches à réparer pour débloquer le pouvoir du Juge (0 = dès le début)"],["trackerDuration","Durée de vision du Traceur"],["trackerCooldown","Recharge du Traceur"],["corpseVanish","Disparition d'un corps (0 = immédiat)"],["doorsDuration","Durée de fermeture globale des portes (s)"],["doorsUsesPerGame","Fermetures globales disponibles par partie"],["lightsCooldown","Recharge du sabotage électrique (s)"],["invisDuration","Durée d'invisibilité de l'Invisible (s)"],["invisCooldown","Recharge de l'Invisible (s)"],["morphDuration","Durée de transformation du Métamorphe (s)"],["morphCooldown","Recharge du Métamorphe (s)"],["lockDuration","Durée de fermeture de salle du Ferreur (s)"],["lockCooldown","Recharge du Ferreur après fermeture (s)"],["killCooldown","Recharge du meurtre"],["meetingDuration","Durée de la réunion (buzzer)"],["buzzerCooldown","Recharge du buzzer"],["visionRadius","Rayon de vision à 360° (style Among Us)"]];
SETTINGS.forEach(([k,l])=>{const r=document.createElement("div");r.className="row";r.innerHTML=`<label for="s_${k}">${l}</label><input id="s_${k}" type="number" min="0" step="1">`;$("#setfields").appendChild(r);});
["enableTracker","enableNurse","enableAngel","enableInfluencer","anonymousVotes"].forEach(k=>{const r=document.createElement("div");r.className="row";r.innerHTML=`<label for="s_${k}">${({enableTracker:"Activer le rôle Traceur",enableNurse:"Activer le rôle Infirmier",enableAngel:"Activer le rôle Ange gardien",enableInfluencer:"Activer le rôle Influenceur",anonymousVotes:"Votes anonymes (sinon : on voit qui a voté pour qui)"})[k]}</label><input id="s_${k}" type="checkbox">`;$("#setfields").appendChild(r);});
let cdEnd=0,cdLast=0,cdTimer=null;
function updateCountdown(leftMs){const el=document.getElementById("countdown");if(!el)return;
 if(leftMs>0){cdEnd=performance.now()+leftMs;if(!cdTimer)cdTimer=setInterval(()=>{const l=Math.max(0,cdEnd-performance.now()),n=Math.ceil(l/1000);if(n<=0){el.style.display="none";clearInterval(cdTimer);cdTimer=null;cdLast=0;return;}if(n!==cdLast){cdLast=n;el.querySelector("b").textContent=n;el.style.display="flex";}},100);}
 else{cdEnd=0;cdLast=0;if(cdTimer){clearInterval(cdTimer);cdTimer=null;}el.style.display="none";}}
const sendMsg=o=>{if(ws?.readyState===1)ws.send(JSON.stringify(o));};
// ---------- Musique de suspense (générée en direct avec Web Audio : aucun fichier audio) ----------
// Nappe sombre + battements de cœur + notes isolées avec écho. Plus tendue pendant une panne, plus discrète pendant une réunion, coupée au salon et à l'écran de fin.
const Music=(()=>{
 let ctx=null,master=null,sfx=null,filt=null,timer=null,mode="off",muted=false,nextBeat=0,nextNote=0,delay=null,noiseBuf=null;
 try{muted=localStorage.getItem("musicMuted")==="1";}catch(e){}
 const NOTES=[220,246.94,261.63,329.63,349.23,392,440,523.25]; // gamme de la mineur, avec le si bémol-do qui crée la tension
 const LEVEL={off:0,meeting:.14,play:.3,tense:.42};
 const apply=()=>{if(!ctx)return;const g=muted?0:(LEVEL[mode]||0);master.gain.setTargetAtTime(g,ctx.currentTime,.8);filt.frequency.setTargetAtTime(mode==="tense"?820:mode==="meeting"?260:420,ctx.currentTime,1.2);};
 const thump=(t,vol)=>{const o=ctx.createOscillator(),g=ctx.createGain();o.type="sine";o.frequency.setValueAtTime(70,t);o.frequency.exponentialRampToValueAtTime(34,t+.22);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol,t+.02);g.gain.exponentialRampToValueAtTime(.001,t+.3);o.connect(g);g.connect(master);o.start(t);o.stop(t+.35);};
 const ping=(t,f,vol)=>{const o=ctx.createOscillator(),g=ctx.createGain();o.type="triangle";o.frequency.value=f;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol,t+.03);g.gain.exponentialRampToValueAtTime(.001,t+3);o.connect(g);g.connect(master);g.connect(delay);o.start(t);o.stop(t+3.2);};
 const tick=()=>{if(!ctx||muted||mode==="off")return;const now=ctx.currentTime;
  if(mode!=="meeting"){const period=mode==="tense"?.62:.98;if(nextBeat<now)nextBeat=now+.05;
   while(nextBeat<now+.6){thump(nextBeat,mode==="tense"?.55:.42);thump(nextBeat+.2,mode==="tense"?.32:.22);nextBeat+=period;}}
  if(nextNote<now)nextNote=now+1;
  if(now>=nextNote){const base=NOTES[Math.floor(Math.random()*NOTES.length)]*(Math.random()<.35?2:1);ping(now+.05,base,mode==="tense"?.09:.06);nextNote=now+(mode==="tense"?2.5:4)+Math.random()*(mode==="tense"?3:6);}};
 const init=()=>{if(ctx)return;const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
  try{ctx=new AC();}catch(e){ctx=null;return;}
  master=ctx.createGain();master.gain.value=0;master.connect(ctx.destination);
  sfx=ctx.createGain();sfx.gain.value=.6;sfx.connect(ctx.destination);
  noiseBuf=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate);{const ch=noiseBuf.getChannelData(0);for(let i=0;i<ch.length;i++)ch[i]=Math.random()*2-1;}
  filt=ctx.createBiquadFilter();filt.type="lowpass";filt.frequency.value=420;filt.Q.value=2;filt.connect(master);
  [[55,"sawtooth",.15],[55.45,"sawtooth",.15],[82.4,"triangle",.1],[110.3,"sine",.08]].forEach(([f,type,v])=>{const o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.frequency.value=f;g.gain.value=v;o.connect(g);g.connect(filt);o.start();});
  const lfo=ctx.createOscillator(),lg=ctx.createGain();lfo.frequency.value=.07;lg.gain.value=150;lfo.connect(lg);lg.connect(filt.frequency);lfo.start();
  delay=ctx.createDelay(1.5);delay.delayTime.value=.6;const fb=ctx.createGain();fb.gain.value=.5;delay.connect(fb);fb.connect(delay);const wet=ctx.createGain();wet.gain.value=.55;delay.connect(wet);wet.connect(master);
  timer=setInterval(tick,200);apply();};
 return{
  unlock(){init();if(ctx&&ctx.state==="suspended")ctx.resume();},
  setMode(m){if(m===mode)return;mode=m;apply();},
  toggle(){muted=!muted;try{localStorage.setItem("musicMuted",muted?"1":"0");}catch(e){}apply();return muted;},
  // Jingle de meurtre : coup sourd, accord dissonant, cri qui monte, souffle. La victime entend en plus le grésillement de l'écran.
  kill(role){if(!ctx||muted)return;const t=ctx.currentTime+.02,v=role==="victim"?1:role==="killer"?.7:.45;
   const env=(g,t0,peak,dur)=>{g.gain.setValueAtTime(0,t0);g.gain.linearRampToValueAtTime(peak,t0+.015);g.gain.exponentialRampToValueAtTime(.001,t0+dur);};
   const boom=ctx.createOscillator(),bg=ctx.createGain();boom.type="sine";boom.frequency.setValueAtTime(120,t);boom.frequency.exponentialRampToValueAtTime(26,t+.7);env(bg,t,.9*v,.8);boom.connect(bg);bg.connect(sfx);boom.start(t);boom.stop(t+.9);
   const lp=ctx.createBiquadFilter();lp.type="lowpass";lp.frequency.value=1800;lp.connect(sfx);
   [233.08,246.94,349.23,466.16].forEach(f=>{const o=ctx.createOscillator(),g=ctx.createGain();o.type="sawtooth";o.frequency.value=f;env(g,t,.12*v,1.6);o.connect(g);g.connect(lp);o.start(t);o.stop(t+1.7);});
   const cry=ctx.createOscillator(),cg=ctx.createGain();cry.type="sawtooth";cry.frequency.setValueAtTime(500,t);cry.frequency.exponentialRampToValueAtTime(2100,t+.45);cry.frequency.exponentialRampToValueAtTime(900,t+.8);env(cg,t,.09*v,.85);cry.connect(cg);cg.connect(lp);cry.start(t);cry.stop(t+.9);
   const hit=ctx.createBufferSource(),hg=ctx.createGain(),hp=ctx.createBiquadFilter();hit.buffer=noiseBuf;hp.type="highpass";hp.frequency.value=1500;env(hg,t,.4*v,.3);hit.connect(hp);hp.connect(hg);hg.connect(sfx);hit.start(t);hit.stop(t+.35);
   if(role==="victim"){const st=ctx.createBufferSource(),sg=ctx.createGain(),bp=ctx.createBiquadFilter();st.buffer=noiseBuf;st.loop=true;bp.type="bandpass";bp.frequency.value=2600;bp.Q.value=.6;sg.gain.setValueAtTime(.22,t);sg.gain.setValueAtTime(.22,t+2.5);sg.gain.linearRampToValueAtTime(0,t+3);st.connect(bp);bp.connect(sg);sg.connect(sfx);st.start(t);st.stop(t+3.05);}},
  get muted(){return muted;}
 };
})();

// ---------- Cinématique de meurtre (3 s) : écran de la victime = bruit TV + scène « le tueur frappe » avec son nom ----------
function drawKillScene(c,w,h,t,d){
 const K=d.killer,V=d.victim,ease=x=>x*x*(3-2*x),cl=(x,a,b)=>Math.max(0,Math.min(1,(x-a)/(b-a)));
 const g=c.createLinearGradient(0,0,0,h);g.addColorStop(0,"#1a1d2b");g.addColorStop(1,"#0a0b12");c.fillStyle=g;c.fillRect(0,0,w,h);
 c.fillStyle="#2a2f42";c.fillRect(0,h*.72,w,h*.28);c.fillStyle="#3a4058";c.fillRect(0,h*.72,w,3);
 const unit=h/9,gy=h*.84;
 const body=(x,y,col,rot,facing)=>{c.save();c.translate(x,y);c.rotate(rot);c.scale(facing,1);
  c.fillStyle=col;c.strokeStyle="#000a";c.lineWidth=4;
  c.beginPath();c.roundRect(-unit*.8,-unit*2.5,unit*1.6,unit*2.2,unit*.75);c.fill();c.stroke();
  c.beginPath();c.roundRect(-unit*.7,-unit*.9,unit*.5,unit*.8,unit*.2);c.fill();c.stroke();c.beginPath();c.roundRect(unit*.2,-unit*.9,unit*.5,unit*.8,unit*.2);c.fill();c.stroke();
  c.fillStyle="#bcecff";c.beginPath();c.ellipse(unit*.35,-unit*1.8,unit*.55,unit*.38,0,0,7);c.fill();c.stroke();c.restore();};
 // la victime (à droite) : sursaut au coup, puis chute
 const hit=cl(t,.42,.5),fall=ease(cl(t,.5,.78));
 const vx=w*.66+Math.sin(t*90)*unit*.18*hit*(1-fall)+fall*unit*1.2,vy=gy+fall*unit*.35;
 // sang
 if(t>.45){const s=ease(cl(t,.45,.8));c.fillStyle="#b3122a";[[0,.2,1.6],[.9,.4,.9],[-.8,.5,1],[1.7,.25,.6],[-1.5,.35,.5]].forEach(p=>{c.beginPath();c.ellipse(vx+p[0]*unit*1.3,gy+unit*p[1]*.5,unit*p[2]*s*1.1,unit*p[2]*s*.35,0,0,7);c.fill();});}
 body(vx,vy,V.color,fall*(Math.PI/2),-1);
 // le tueur : court vers la victime, frappe avec un couteau, reste au-dessus
 const run=ease(cl(t,.08,.42)),kx=-unit*2+run*(w*.66-unit*3.6+unit*2),bob=Math.abs(Math.sin(t*28))*unit*.25*(1-cl(t,.42,.46));
 body(kx,gy-bob,K.color,0,1);
 const swing=cl(t,.36,.5);const ang=-1.9+swing*2.6;
 c.save();c.translate(kx+unit*.7,gy-bob-unit*1.5);c.rotate(ang);c.strokeStyle="#e8edf5";c.lineWidth=7;c.lineCap="round";c.beginPath();c.moveTo(0,0);c.lineTo(unit*1.9,0);c.stroke();c.strokeStyle="#7d8798";c.lineWidth=11;c.beginPath();c.moveTo(-unit*.45,0);c.lineTo(0,0);c.stroke();c.restore();
 // éclair blanc puis rouge au moment du coup
 const fl=Math.max(0,1-Math.abs(t-.46)/.05);if(fl>0){c.fillStyle="rgba(255,255,255,"+(fl*.85).toFixed(3)+")";c.fillRect(0,0,w,h);}
 const rd=cl(t,.46,.9);if(rd>0){c.fillStyle="rgba(150,0,20,"+(.28*rd*(1-cl(t,.9,1))).toFixed(3)+")";c.fillRect(0,0,w,h);}
 // noms et texte
 c.textAlign="center";c.font="bold "+Math.round(unit*.55)+"px Arial";c.fillStyle=V.color;c.fillText(V.name,vx,gy+unit*1.1);
 if(t>.1){c.fillStyle=K.color;c.fillText(K.name,kx,gy+unit*1.1);}
 const ta=ease(cl(t,.55,.68));if(ta>0){c.globalAlpha=ta;c.font="900 "+Math.round(unit*.85)+"px Arial";c.fillStyle="#fff";c.shadowColor="#000";c.shadowBlur=14;c.fillText("TU AS ÉTÉ ÉLIMINÉ PAR",w/2,h*.2);c.font="900 "+Math.round(unit*1.35)+"px Arial";c.fillStyle=K.color;c.fillText(K.name.toUpperCase(),w/2,h*.2+unit*1.5);c.shadowBlur=0;c.globalAlpha=1;}
 // vignette
 const vg=c.createRadialGradient(w/2,h/2,h*.25,w/2,h/2,h*.85);vg.addColorStop(0,"rgba(0,0,0,0)");vg.addColorStop(1,"rgba(0,0,0,.7)");c.fillStyle=vg;c.fillRect(0,0,w,h);
}
let killcamRaf=0;
function startKillcam(d){
 let box=document.getElementById("killcam");
 if(!box){box=document.createElement("div");box.id="killcam";box.innerHTML='<canvas id="kcNoise" width="192" height="108"></canvas><canvas id="kcScene" width="960" height="540"></canvas>';document.getElementById("game").appendChild(box);}
 const nz=document.getElementById("kcNoise"),sc=document.getElementById("kcScene"),nc=nz.getContext("2d"),sx=sc.getContext("2d"),img=nc.createImageData(192,108);
 cancelAnimationFrame(killcamRaf);box.style.transition="none";box.style.opacity="1";box.style.display="block";
 const t0=performance.now(),DUR=3000;
 const frame=now=>{const t=Math.min(1,(now-t0)/DUR);
  for(let i=0;i<img.data.length;i+=4){const v=Math.random()*255;img.data[i]=img.data[i+1]=img.data[i+2]=v;img.data[i+3]=255;}nc.putImageData(img,0,0);
  const a=Math.min(1,t/.1)*Math.min(1,(1-t)/.1); // la scène apparaît du bruit et y retourne : le début et la fin sont du bruit seul
  sc.style.opacity=a.toFixed(3);sx.clearRect(0,0,960,540);if(a>0)drawKillScene(sx,960,540,t,d);
  if(t<1)killcamRaf=requestAnimationFrame(frame);else{box.style.transition="opacity .4s";box.style.opacity="0";setTimeout(()=>{if(performance.now()-t0>=DUR)box.style.display="none";},450);}};
 killcamRaf=requestAnimationFrame(frame);
}
function onKill(d){Music.kill(d.role);if(d.role==="victim"&&d.killer&&d.victim)startKillcam(d);}
const refreshMusicBtn=()=>{const b=document.getElementById("musicBtn");if(b)b.textContent=Music.muted?"🔇 Musique coupée":"🔊 Musique";};

$("#join").onclick=()=>{
 Music.unlock();
 const name=$("#name").value.trim();if(!name)return;
 roomCode=$("#code").value.trim().toUpperCase();
 ws=new WebSocket((location.protocol==="https:"?"wss://":"ws://")+location.host);
 ws.onopen=()=>sendMsg({type:"join",name,code:roomCode,maxPlayers:Number($("#capacity").value)||6});
 ws.onmessage=e=>{const d=JSON.parse(e.data);if(d.type==="error"){$("#err").textContent=d.message;return}
 if(d.type==="joined"){applyMap(d.map,d.maps);myId=d.me;roomCode=d.code;$("#login").style.display="none";$("#game").style.display="block";init3D();}
 if(d.type==="map")applyMap(d.map,d.maps);
 if(d.type==="kill")onKill(d);
 if(d.type==="state")onState(d);
 if(d.type==="notice")toast.textContent=d.text;
 if(d.type==="chat"){const log=$("#chatlog");const row=document.createElement("div");row.style.color=d.color||"#dce8ff";const tag={room:"salon",living:"réunion",ghost:"fantôme",nurse:"infirmier"}[d.channel]||d.channel;
  const nm=document.createElement("b");nm.textContent=d.name+" ";const tg=document.createElement("small");tg.textContent="["+tag+"] ";tg.style.opacity=".7";nm.prepend(tg);const tx=document.createElement("span");tx.textContent=": "+d.text;row.append(nm,tx);log.appendChild(row);log.scrollTop=log.scrollHeight;}};
 ws.onerror=()=>$("#err").textContent="Connexion impossible au serveur.";
};
$("#start").onclick=()=>sendMsg({type:"start"});
$("#ready").onclick=()=>sendMsg({type:"ready",ready:!you?.ready});
$("#lobbyLaunch").onclick=()=>sendMsg({type:"start"});
$("#lobbySettings").onclick=()=>toggleSettings(true);
$("#musicBtn").onclick=()=>{Music.unlock();Music.toggle();refreshMusicBtn();};refreshMusicBtn();
document.addEventListener("pointerdown",()=>Music.unlock());document.addEventListener("keydown",()=>Music.unlock());
$("#mapSelect").onchange=e=>sendMsg({type:"setMap",id:e.target.value});
$("#quitBtn").onclick=()=>{if(confirm("Quitter la partie ?")){try{ws?.close();}catch(e){}location.reload();}};
$("#closeRules").onclick=()=>$("#rules").style.display="none";
$("#lobbyRules").onclick=()=>$("#rules").style.display="block";
$("#openSettings").onclick=()=>toggleSettings();
$("#closeSettings").onclick=()=>toggleSettings(false);
$("#saveSettings").onclick=()=>{const s={};SETTINGS.forEach(([k])=>s[k]=Number($("#s_"+k).value));["enableTracker","enableNurse","enableAngel","enableInfluencer","anonymousVotes"].forEach(k=>s[k]=$("#s_"+k).checked);sendMsg({type:"settings",settings:s});};
function toggleSettings(force){const p=$("#settings");const show=force??(p.style.display!=="block");p.style.display=show?"block":"none";if(show)document.exitPointerLock?.();}
const escapeHtml=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));
const sec=ms=>Math.ceil(ms/1000);
const cdLine=(k,l,ms)=>`<kbd>${k}</kbd> ${l} : ${ms>0?sec(ms)+" s":'<span class="ok">prêt</span>'}`;
function onState(d){
 you=d.you;window.__you=you;gameStarted=d.started&&!d.gameOver;window.__gameStarted=gameStarted;isHost=d.host;window.currentBlackout=!!d.blackout;
 if(d.started)ensureMapBuilt();updateMapPicker();
 Music.setMode(!d.started||d.gameOver?"off":(you.meetingLeft>0?"meeting":(d.blackout?"tense":"play")));
 
 const progress=d.taskProgress||0,goal=d.taskGoal||8;
 let taskHud=document.getElementById("taskHud");if(!taskHud){taskHud=document.createElement("div");taskHud.id="taskHud";taskHud.className="panel";document.getElementById("game").appendChild(taskHud);}
 taskHud.style.display=d.started?"block":"none";
 taskHud.innerHTML=`<b>🔧 TÂCHES DES JOUEURS</b><div style="margin:7px 0;font-size:13px">${progress} / ${goal} terminées</div><div style="height:9px;background:#263954;border-radius:9px;overflow:hidden"><div style="height:100%;width:${Math.min(100,progress/goal*100)}%;background:#65e6a4"></div></div>${!isImpRole(you.role)?'<small style="display:block;margin-top:7px;color:#b9c9e5">Tâches : G'+(you.alive?' · Réparer le courant : R (3 secondes)':'')+'</small>':''}`;
 const mask=document.getElementById("visionMask");
 const isImpostor=isImpRole(you.role);
 const crewBlackout=!!d.blackout&&you.alive&&!isImpostor&&you.meetingLeft<=0&&you.trackLeft<=0;
 mask.style.display=crewBlackout?"block":"none";
  // Panne : la zone de lumière diminue pour les joueurs (pas les imposteurs), mais reste large.
 const R=d.blackoutRadius||6,pxU=innerHeight/curViewH;mapRadius=crewBlackout?R:(d.settings.visionRadius||6.5);
 mask.style.background=crewBlackout?`radial-gradient(circle at 50% 50%,transparent 0 ${(R*.8*pxU).toFixed(0)}px,rgba(0,0,0,.6) ${(R*pxU).toFixed(0)}px,rgba(0,0,0,.95) ${(R*1.2*pxU).toFixed(0)}px,#000 ${(R*1.4*pxU).toFixed(0)}px)`:'';
 // Annonce plein écran après un vote : rouge si quelqu'un est éliminé, gris si personne.
 if(d.verdict&&d.verdict.id!==window.lastVerdictId){window.lastVerdictId=d.verdict.id;let vb=document.getElementById("verdictBox");if(!vb){vb=document.createElement("div");vb.id="verdictBox";document.getElementById("game").appendChild(vb);}
  const vText=d.verdict.text,vElim=d.verdict.elim,vDelay=d.voteReveal?d.voteReveal.left:0;clearTimeout(window.verdictTimer0);clearTimeout(window.verdictTimer);
  window.verdictTimer0=setTimeout(()=>{vb.textContent=vText;vb.className="show "+(vElim?"elim":"none");window.verdictTimer=setTimeout(()=>vb.className="",4000);},vDelay);}
 // Écran de fin : bonhommes des couleurs gagnantes, rôles révélés.
 {let es=document.getElementById("endScreen");
  if(!d.gameOver){if(es)es.style.display="none";window.lastEndId=null;}
  else if(d.gameOver.id!==window.lastEndId&&d.gameOver.players){window.lastEndId=d.gameOver.id;
   if(!es){es=document.createElement("div");es.id="endScreen";document.getElementById("game").appendChild(es);}
   const go=d.gameOver,crewWin=go.winner==="crew";
   const fig=(p,big)=>`<div class="fig${big?" big":""}${p.alive?"":" dead"}"><svg viewBox="0 0 60 84"><rect x="9" y="30" width="42" height="40" rx="14" fill="${p.color}" stroke="#0008" stroke-width="2"/><rect x="12" y="10" width="36" height="44" rx="18" fill="${p.color}" stroke="#0008" stroke-width="2"/><ellipse cx="38" cy="26" rx="12" ry="8" fill="#bcecff" stroke="#0008" stroke-width="2"/><rect x="12" y="66" width="14" height="14" rx="5" fill="${p.color}" stroke="#0008" stroke-width="2"/><rect x="34" y="66" width="14" height="14" rx="5" fill="${p.color}" stroke="#0008" stroke-width="2"/></svg><b style="color:${p.color}">${escapeHtml(p.name)}</b><small>${escapeHtml(roleLabel(p.role))}${p.alive?"":" · 💀"}</small></div>`;
   const win=go.players.filter(p=>p.winner),lose=go.players.filter(p=>!p.winner);
   es.className=crewWin?"crew":"imp";
   es.innerHTML=`<h1>${crewWin?"VICTOIRE DES JOUEURS":"VICTOIRE DES IMPOSTEURS"}</h1><p>${escapeHtml(go.reason||"")}</p><div class="row win">${win.map(p=>fig(p,true)).join("")}</div><div class="lbl">Perdants</div><div class="row lose">${lose.map(p=>fig(p,false)).join("")}</div>${isHost?'<div class="lbl">Terrain de la prochaine partie : <select id="endMapSelect"></select></div>':''}<div class="btns">${isHost?'<button id="replayBtn">Rejouer</button>':''}<button id="closeEnd" class="ghost">Fermer</button></div>`;
   es.style.display="flex";
   {const ems=document.getElementById("endMapSelect");if(ems){fillMapSelect(ems);ems.onchange=()=>sendMsg({type:"setMap",id:ems.value});}}
   document.getElementById("closeEnd").onclick=()=>es.style.display="none";
   const rb=document.getElementById("replayBtn");if(rb)rb.onclick=()=>sendMsg({type:"start"});}}
 const alertBox=document.getElementById("powerAlert");
 if(previousBlackout!==null && previousBlackout!==!!d.blackout){
   alertBox.textContent=d.blackout?"⚡ COURANT COUPÉ":"💡 COURANT REVENU";
   alertBox.className="show "+(d.blackout?"off":"ok");
   clearTimeout(window.powerAlertTimer);
   window.powerAlertTimer=setTimeout(()=>alertBox.className="",3000); // disparaît après 3 s
 }
 previousBlackout=!!d.blackout;
 if(!d.blackout&&repairTimer){clearTimeout(repairTimer);repairTimer=null;}
 // ---- Écran de réunion : gros chat à gauche, fenêtre des joueurs (bonhommes de couleur) à droite, puis page « qui a voté qui »
 const inMeeting=!!(d.started&&d.meetingPhase&&!d.gameOver);
 document.body.classList.toggle("meeting",inMeeting);
 let votePanel=document.getElementById("votePanel");if(!votePanel){votePanel=document.createElement("div");votePanel.id="votePanel";votePanel.className="panel";document.getElementById("game").appendChild(votePanel);}
 if(!document.getElementById("meetingBack")){const mb=document.createElement("div");mb.id="meetingBack";document.getElementById("game").appendChild(mb);}
 const revealing=!!d.voteReveal;
 votePanel.style.display=inMeeting&&!revealing?"block":"none";
 if(votePanel.style.display==="block"){
  const phase=d.meetingPhase,left=Math.max(0,Math.ceil((d.phaseLeft||0)/1000)-(phase==="judge"?7:0)),roster=d.meetingRoster||[],canAct=you.alive;
  const isJudge=you.id===d.judgeId,cands=d.judgeCandidates||[];
  const info=phase==="discussion"?"Discutez dans le chat. Le vote commence à la fin du temps.":phase==="vote"?(canAct?`Clique sur un joueur pour voter${isJudge?" ou le juger":""} · ${d.votesCast||0}/${roster.length} votes`:`Votes : ${d.votesCast||0}/${roster.length}`):isJudge?"Clique sur le joueur majoritaire pour l'éliminer. Une erreur t'élimine.":"Le juge examine le résultat du vote.";
  votePanel.innerHTML=`<div class="mtitle">${phase==="discussion"?"💬 DISCUSSION":phase==="vote"?"🗳 VOTE":"⚖ DÉCISION DU JUGE"}</div><div class="mtimer">${left}s</div><div class="minfo">${info}</div><div class="mgrid"></div>`;
  const grid=votePanel.querySelector(".mgrid");
  roster.forEach(p=>{
   const clickVote=phase==="vote"&&canAct&&p.id!==you.id&&!d.youVoted, clickJudge=phase==="judge"&&isJudge&&cands.includes(p.id);
   const card=document.createElement("div");card.className="mcard"+(p.id===you.id?" me":"")+(clickVote||clickJudge?" click":"")+(clickJudge?" cand":"");
   card.innerHTML=crewSvg(p.color||"#668cff")+`<small></small>`;card.querySelector("small").textContent=p.name+(p.id===you.id?" (toi)":"");
   if(clickVote)card.onclick=()=>{if(isJudge&&phase==="vote")window.judgeChoice={id:p.id,name:p.name,color:p.color};else sendMsg({type:"vote",target:p.id});};
   if(clickJudge)card.onclick=()=>sendMsg({type:"judge",target:p.id});
   grid.appendChild(card);});
  if(phase==="vote"&&canAct){const pass=document.createElement("button");pass.className="small ghost";pass.textContent=d.youVoted?"Vote enregistré ✔":"PASSER / VOTE BLANC";pass.disabled=!!d.youVoted;pass.onclick=()=>sendMsg({type:"vote",pass:true});votePanel.appendChild(pass);}
  if(phase==="judge"&&isJudge){const pass=document.createElement("button");pass.className="small ghost";pass.textContent="NE PAS ÉLIMINER";pass.onclick=()=>sendMsg({type:"judge",pass:true});votePanel.appendChild(pass);}
 }
 { // choix du juge : voter ou juger le joueur sur lequel il a cliqué
  let jc=document.getElementById("judgeChoice");if(!jc){jc=document.createElement("div");jc.id="judgeChoice";jc.className="panel";document.getElementById("game").appendChild(jc);}
  const ch=window.judgeChoice,on=!!(ch&&inMeeting&&!revealing&&d.meetingPhase==="vote"&&you.id===d.judgeId&&you.alive&&!d.youVoted);
  if(on){if(jc.dataset.t!==String(ch.id)){jc.dataset.t=String(ch.id);const need=d.settings.judgeTasks||0,got=you.judgeDone||0,ok=got>=need;
    jc.innerHTML=`<div class="mtitle">${crewSvg(ch.color||"#668cff")}<br>${escapeHtml(ch.name)}</div><p>Que veux-tu faire ?</p><button id="jcVote" class="small">🗳 VOTER pour ${escapeHtml(ch.name)}</button><button id="jcJudge" class="small"${ok?"":" disabled"}>⚖ JUGER ${escapeHtml(ch.name)}${ok?"":" (🔒 "+got+"/"+need+" tâches)"}</button><p class="minfo">Juger : ta décision clôt la réunion. Si c'est un imposteur, il sort. Sinon, c'est toi qui sors.</p><button id="jcCancel" class="small ghost">Annuler</button>`;
    jc.querySelector("#jcVote").onclick=()=>{sendMsg({type:"vote",target:ch.id});window.judgeChoice=null;};
    jc.querySelector("#jcJudge").onclick=()=>{sendMsg({type:"judgeNow",target:ch.id});window.judgeChoice=null;};
    jc.querySelector("#jcCancel").onclick=()=>{window.judgeChoice=null;};}
   jc.style.display="block";}
  else{if(!(ch&&inMeeting))window.judgeChoice=null;jc.style.display="none";jc.dataset.t="";}
 }
 { // page de résultat : qui a voté pour qui
  let vr=document.getElementById("voteReveal");if(!vr){vr=document.createElement("div");vr.id="voteReveal";document.getElementById("game").appendChild(vr);}
  if(!revealing){vr.style.display="none";window.lastRevealId=null;}
  else if(window.lastRevealId!==d.voteReveal.id){
   window.lastRevealId=d.voteReveal.id;
   const R=d.voteReveal,tally=new Map();let blanks=0,none=0;
   R.rows.forEach(r=>{if(r.state==="vote"&&r.target)tally.set(r.target.id,{t:r.target,n:(tally.get(r.target.id)?.n||0)+1});else if(r.state==="pass")blanks++;else none++;});
   if(R.anonymous){(R.tally||[]).forEach(x=>tally.set(x.t.id,x));blanks=R.blanks||0;none=R.none||0;}
   const person=(c,n)=>`<span class="vp">${crewSvg(c)}<b>${escapeHtml(n)}</b></span>`;
   vr.innerHTML=`<div class="vrbox"><div class="vrtitle">🗳 RÉSULTAT DU VOTE</div><div class="vrrows">`+(R.anonymous?`<div class="vrrow"><span class="vp vpx">🕶 Votes anonymes : on ne sait pas qui a voté pour qui</span></div>`:"")+(R.anonymous?[]:R.rows).map((r,i)=>`<div class="vrrow" style="animation-delay:${i*.35}s">${person(r.voter.color,r.voter.name)}<span class="vrarrow">➜</span>`+(r.state==="vote"&&r.target?person(r.target.color,r.target.name):r.state==="pass"?`<span class="vp vpx">🏳 Vote blanc</span>`:`<span class="vp vpx">⏳ N'a pas voté</span>`)+`</div>`).join("")+`</div><div class="vrtally">`+[...tally.values()].sort((a,b)=>b.n-a.n).map(x=>`<span class="vchip" style="border-color:${x.t.color}">${crewSvg(x.t.color)}<b>${x.n}</b></span>`).join("")+(blanks?`<span class="vchip">🏳 <b>${blanks}</b></span>`:"")+(none?`<span class="vchip">⏳ <b>${none}</b></span>`:"")+`</div></div>`;
   vr.style.display="flex";
  }
 }
 mapShowRoute=!!d.blackout&&!isImpostor&&you.alive;

 window.currentTasks=d.tasks||[];updateTasks(d.tasks||[]);if(!d.started&&!window.rulesShown){window.rulesShown=true;$("#rules").style.display="block";}if(d.started)$("#rules").style.display="none"; /* règles affichées avant le lancement */ const lobby=$("#lobby");lobby.style.display=d.started?"none":"flex";$("#lobbyCode").textContent=roomCode;$("#lobbyCount").textContent=d.count+" / "+d.settings.maxPlayers+" joueurs";$("#ready").textContent=d.ready?"Annuler ma disponibilité":"Je suis prêt";$("#lobbyLaunch").style.display=isHost?"block":"none";$("#lobbyLaunch").disabled=d.count<(d.minPlayers||4)||!(d.roster||[]).every(p=>p.ready)||(d.countdownLeft||0)>0;$("#lobbySettings").style.display=isHost?"block":"none";$("#ready").classList.toggle("ghost",d.ready);$("#roster").innerHTML=(d.roster||[]).map(p=>`<div class="rosterrow"><span>${escapeHtml(p.name)} ${p.host?"👑":""}</span><b class="${p.ready?"ok":"wait"}">${p.ready?"PRÊT":"EN ATTENTE"}</b></div>`).join("");$("#lobbyHint").textContent=(d.countdownLeft||0)>0?"Lancement en cours… une arrivée, un départ ou un joueur non prêt annule le compte à rebours.":d.count<(d.minPlayers||4)?"Il faut au moins "+(d.minPlayers||4)+" joueurs pour lancer.":(d.roster||[]).every(p=>p.ready)?(d.count<d.settings.maxPlayers?"Tout le monde est prêt ("+d.count+"/"+d.settings.maxPlayers+"). L’hôte peut lancer maintenant ou attendre d’autres joueurs.":"Tout le monde est prêt. L’hôte peut lancer la partie."):"Chaque joueur doit se déclarer prêt.";const nurseContact=(d.corpses||[]).some(c=>c.conversation);nurseContactActive=nurseContact;$("#chatbox").style.display=d.started?(you.alive?(you.meetingLeft>0|| (you.role==="Infirmier"&&nurseContact)?"block":"none"):(nurseContact?"block":"block")):"block";
 if(!me)me={x:you.x,z:you.z,rot:0};
 if(you.tpSeq!==lastTp){me.x=you.x;me.z=you.z;lastTp=you.tpSeq;}
 LOCKS=d.locks||[];document.getElementById("visionMask").style.display=crewBlackout?"block":"none";window.lastPlayers=d.players||[];updatePlayers(d.players,you);updateCorpses(d.corpses||[]);updateLocks();
 status.textContent="Salon "+roomCode+" · "+d.count+" joueur"+(d.count>1?"s":"");
 if(d.gameOver){const winner=d.gameOver.winner==="crew"?"VICTOIRE DES JOUEURS":"VICTOIRE DES IMPOSTEURS";status.textContent=winner+" — "+d.gameOver.reason;}
 $("#role").innerHTML=d.started?`Rôle : <b class="r-${you.role.replace(/\s/g,"")}">${roleLabel(you.role)}</b>${you.alive?"":" · 👻 éliminé (tu vois tout le monde)"}`:"En attente du lancement de la partie…";
 const ab=[];
 if(d.started&&you.alive){
  if(isImpRole(you.role))ab.push(cdLine("F","Tuer",you.cd.kill),`<kbd>S</kbd> Couper le courant`,`<kbd>D</kbd> Fermer les portes (${d.doorUsesRemaining??0} restante(s))`);
  if(you.role==="Invisible")ab.push(you.invisLeft>0?`<span class="ok">👻 Invisible : ${sec(you.invisLeft)} s (tu peux tuer)</span>`:cdLine("I","Devenir invisible",you.cd.invis));
  if(you.role==="Métamorphe")ab.push(you.morphLeft>0?`<span class="ok">🎭 Tu ressembles à ${escapeHtml(you.morphAs)} : ${sec(you.morphLeft)} s</span>`:cdLine("C","Se transformer (joueur le plus proche)",you.cd.morph));
  if(you.role==="Ferreur")ab.push(cdLine("V","Fermer la salle où tu te trouves",you.cd.lock));
  if(you.role==="Juge")ab.push("⚖ Tu es le juge : tu tranches après le vote.");
  if(you.role==="Traceur")ab.push(you.trackLeft>0?`<span class="ok">👁 Traçage actif</span>`:cdLine("T","Traçage",you.cd.track));
  ab.push(cdLine("B","Buzzer",you.cd.buzzer));
 }
 if(d.started&&!you.alive&&isImpRole(you.role))ab.push("👻 <b>Imposteur fantôme</b> : tu peux encore saboter",`<kbd>S</kbd> Couper le courant`,`<kbd>D</kbd> Fermer les portes (${d.doorUsesRemaining??0} restante(s))`);
 if(d.started&&!you.alive&&!isImpRole(you.role))ab.push("🔧 Tu peux encore réparer des tâches : <kbd>G</kbd> près d'un objet cassé");
 if(d.started&&you.role==="Juge"){const need=d.settings.judgeTasks||0,got=you.judgeDone||0;ab.push(got>=need?`⚖ <b>Juge</b> : <span class="ok">pouvoir débloqué</span>${need?` (${got}/${need} tâches)`:""}`:`⚖ <b>Juge</b> : 🔒 pouvoir bloqué · <b>${got}/${need}</b> tâches réparées`);}
 if(d.started&&!you.alive&&you.isAngel){ab.push("👼 <b>Ange gardien</b> : approche-toi d'un joueur vivant");ab.push(you.angelLeft>0?`<span class="ok">🛡 Tu protèges ${escapeHtml(you.angelTarget)} : ${sec(you.angelLeft)} s</span>`:cdLine("P","Protéger le joueur vivant le plus proche",you.cdAngel));}
 if(d.started&&!you.alive&&you.isInfluencer){ab.push("📣 <b>Influenceur</b> : approche-toi d'un joueur vivant");ab.push(you.knowsKiller?`<kbd>P</kbd> Liste d'objets colorés (${you.photosLeft} envoi(s) restant(s))`:"<span class=\"muted\">Tu ne connais pas ton meurtrier</span>");}
 const html=ab.join("<br>");if($("#abilities").innerHTML!==html)$("#abilities").innerHTML=html;
 // Aide privée : chaque client ne reçoit à l’écran que les touches de son propre rôle.
 const help = ["<b>COMMANDES</b>","<kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd> : se déplacer · <kbd>Z</kbd>/<kbd>W</kbd> : avancer · <kbd>Q</kbd>/<kbd>A</kbd> : gauche", (d.started&&(isImpRole(you.role)||!you.alive)?"<kbd>SHIFT</kbd> : courir (imposteurs et fantômes) · ":"")+"Vue aérienne fixe à 360°"];
 if(d.started){
  if(you.alive) help.push("<kbd>E</kbd> : signaler un corps (lance aussitôt la réunion)", "<kbd>B</kbd> : buzzer (réunion, uniquement dans la salle « "+(MAP&&ROOMS[MAP.meetingRoom]?ROOMS[MAP.meetingRoom].name:"de réunion")+" »)");
  if(you.alive && isImpRole(you.role)) help.push("<kbd>F</kbd> : éliminer un joueur", "<kbd>X</kbd> : canalisation (près d'un cercle noir) pour voyager vite", "<kbd>S</kbd> : couper le courant (réparable dans la salle électrique)", `<kbd>D</kbd> : fermer les portes (${d.doorUsesRemaining??0} utilisation(s) restante(s) pour toute l’équipe)`);
  if(you.alive && !isImpRole(you.role)) help.push("<kbd>G</kbd> : accomplir une tâche à proximité", "<kbd>R</kbd> : réparer le courant en restant près du tableau pendant 3 secondes");
  if(you.alive && you.role==="Invisible") help.push("<kbd>I</kbd> : devenir invisible (10 s par défaut) · tu peux tuer pendant ce temps");
  if(you.alive && you.role==="Métamorphe") help.push("<kbd>C</kbd> : prendre l'apparence du joueur le plus proche (10 s par défaut)");
  if(you.alive && you.role==="Ferreur") help.push("<kbd>V</kbd> : fermer les portes de ta salle (recharge après utilisation)");
  if(you.alive && you.role==="Traceur") help.push("<kbd>T</kbd> : activer le traçage");
  if(you.alive && you.role==="Infirmier") help.push("<kbd>N</kbd> : contacter un corps signalé", "<kbd>R</kbd> : arrêter le contact");
  if(!you.alive) help.push("Mode fantôme : tu observes la partie"+(isImpRole(you.role)?" et tu peux encore saboter (S : courant, D : portes).":" et tu peux encore réparer des tâches (G)."));
  if(!you.alive&&you.isAngel) help.push("👼 Ange gardien : <kbd>P</kbd> près d'un joueur vivant le protège (30 s par défaut) · <kbd>X</kbd> canalisation (près d'un cercle noir)");
  if(!you.alive&&you.isInfluencer) help.push("📣 Influenceur : <kbd>P</kbd> près d'un joueur vivant ouvre la liste d'objets colorés · <kbd>1</kbd>-<kbd>5</kbd> choisir · <kbd>P</kbd> encore pour valider · <kbd>Échap</kbd> annuler · <kbd>X</kbd> canalisation");
 } else help.push("Les rôles et capacités seront révélés au lancement.");
 help.push("<kbd>M</kbd> : agrandir la carte · <kbd>O</kbd> : réglages");
 $("#help").innerHTML=help.join("<br>");
 const b=[];
 if(you.doorsLeft>0)b.push("🚪 Portes fermées : "+sec(you.doorsLeft)+" s");
 LOCKS.forEach(l=>{const r=ROOMS[l.roomId];if(r)b.push("🔒 "+r.name+" verrouillée : "+sec(l.left*1)+" s");});
 if(d.blackout)b.unshift(you.alive&&!isImpostor?"⚡ COURANT COUPÉ · suis la route verte jusqu'au tableau de la SALLE ÉLECTRIQUE, puis appuie sur R (3 s)":"⚡ COURANT COUPÉ"+(isImpostor&&you.alive?" · tu gardes ta lumière":""));
 if(you.shieldLeft>0)b.push("🛡 Un ange gardien te protège : "+sec(you.shieldLeft)+" s");
 if(you.invisLeft>0)b.push("👻 Invisible : "+sec(you.invisLeft)+" s");
 if(you.morphLeft>0)b.push("🎭 Transformé en "+you.morphAs+" : "+sec(you.morphLeft)+" s");
 if(you.meetingLeft>0)b.push("🔔 Réunion d'urgence : "+sec(you.meetingLeft)+" s");
 if(you.trackLeft>0&&you.role==="Traceur")b.push("👁 Tu vois tout le monde : "+sec(you.trackLeft)+" s");
 {let pc=document.getElementById("photoCard");if(!pc){pc=document.createElement("div");pc.id="photoCard";pc.style.cssText="position:fixed;left:50%;top:90px;transform:translateX(-50%);z-index:60;background:#0b1224ee;border:2px solid #ffd36b;border-radius:12px;padding:12px 18px;color:#fff;text-align:center;font:14px sans-serif;display:none";document.body.appendChild(pc);}
 if(you.photo&&you.alive){pc.style.display="block";pc.innerHTML=`📷 <b>${escapeHtml(you.photo.from)}</b> (éliminé) t'envoie un objet<br><span style="display:inline-block;font-size:34px;line-height:60px;width:64px;height:64px;border-radius:50%;background:${you.photo.color};border:3px solid #fff;margin:8px 0">${you.photo.icon}</span><br><b>${escapeHtml(you.photo.label)}</b> : cette couleur est celle d'un imposteur !`;}else pc.style.display="none";}
 {let pk=document.getElementById("photoPicker");if(!pk){pk=document.createElement("div");pk.id="photoPicker";pk.style.cssText="position:fixed;left:50%;bottom:120px;transform:translateX(-50%);z-index:60;background:#0b1224ee;border:2px solid #ffd36b;border-radius:12px;padding:10px 14px;color:#fff;text-align:center;font:13px sans-serif;display:none";document.body.appendChild(pk);}
 if(you.photoChoices&&!you.alive&&you.isInfluencer){if(window.photoSel==null||window.photoSel>=you.photoChoices.length)window.photoSel=0;pk.style.display="block";pk.innerHTML="👼 Choisis l'objet qui a la couleur de ton meurtrier (touches 1-"+you.photoChoices.length+"), puis appuie sur <kbd>P</kbd> pour VALIDER · <kbd>Échap</kbd> annule<br>"+you.photoChoices.map((c,i)=>`<span style="display:inline-block;margin:6px;text-align:center"><span style="display:inline-block;font-size:28px;line-height:54px;width:58px;height:58px;border-radius:50%;background:${c.color};border:${i===window.photoSel?"4px solid #ffd36b":"3px solid #fff4"}">${c.icon}</span><br>${i+1} · ${escapeHtml(c.label)}</span>`).join("");}else{pk.style.display="none";window.photoSel=null;}}
 $("#banner").style.display=b.length?"block":"none";$("#banner").innerHTML=b.join("<br>");
 $("#start").style.display="none";$("#start").textContent=d.started?"Relancer la partie":"Lancer la partie";$("#start").disabled=d.count<(d.minPlayers||4)||!(d.roster||[]).every(p=>p.ready)||(d.countdownLeft||0)>0;$("#start").textContent="Lancer la partie ("+d.count+"/"+d.settings.maxPlayers+")";$("#start").title=$("#start").disabled?"Au moins "+(d.minPlayers||4)+" joueurs, tous prêts":"";updateCountdown(d.countdownLeft||0);
 const s=JSON.stringify(d.settings);
 if(s!==lastSettings){lastSettings=s;SETTINGS.forEach(([k])=>{$("#s_"+k).value=d.settings[k];});["enableTracker","enableNurse","enableAngel","enableInfluencer","anonymousVotes"].forEach(k=>{$("#s_"+k).checked=d.settings[k]!==false;});}
 document.querySelectorAll("#setfields input").forEach(i=>i.disabled=!isHost);$("#saveSettings").style.display=isHost?"inline-block":"none";
}
// ---------- Carte du manoir, route vers le tableau électrique et réparation ----------
const ROOM_NAMES_FALLBACK=["TERRASSE","CUISINE","SALLE ÉLECTRIQUE","GRAND SALON","SALLE À MANGER","CHAMBRE PRINCIPALE","CHAMBRE 2","SALLE DE BAIN","BIBLIOTHÈQUE","BUREAU","CONFÉRENCE","BUANDERIE","STOCKAGE","GRENIER","SOUS-SOL"];
let mapShowRoute=false,mapRadius=6.5,lastMapDraw=0,lastRouteAt=0,routeCache=[],routeGroup=null,panelBeacon=null;const routeDots=[];
const roomIdxAt=(x,z)=>{const nc=MAP_XS.length-1,nr=MAP_ZS.length-1;let c=MAP_XS.findIndex((v,i)=>i<nc&&x>=v&&x<MAP_XS[i+1]),r=MAP_ZS.findIndex((v,i)=>i<nr&&z>=v&&z<MAP_ZS[i+1]);if(c<0)c=x<0?0:nc-1;if(r<0)r=z<0?0:nr-1;return r*nc+c;};
// Les portes viennent du plan du terrain (MAP.doors) : une au milieu de chaque cloison ouverte entre deux salles voisines.
// Plus court chemin (Dijkstra) à travers les portes, du joueur jusqu'au tableau électrique.
function computeRoute(x,z){
 const nodes=[{x,z,rooms:[roomIdxAt(x,z)]},...DOORS.map(d=>({x:d.x,z:d.z,rooms:[d.a,d.b]})),{x:PANEL.x,z:PANEL.z,rooms:[roomIdxAt(PANEL.x,PANEL.z)]}];
 const n=nodes.length,dist=Array(n).fill(Infinity),prev=Array(n).fill(-1),done=Array(n).fill(false);dist[0]=0;
 for(;;){let u=-1;for(let i=0;i<n;i++)if(!done[i]&&(u<0||dist[i]<dist[u]))u=i;if(u<0||dist[u]===Infinity||u===n-1)break;done[u]=true;
  for(let v=0;v<n;v++){if(done[v]||!nodes[u].rooms.some(r=>nodes[v].rooms.includes(r)))continue;const w=dist[u]+Math.hypot(nodes[u].x-nodes[v].x,nodes[u].z-nodes[v].z);if(w<dist[v]){dist[v]=w;prev[v]=u;}}}
 const pts=[];let i=n-1;while(i>=0){pts.unshift({x:nodes[i].x,z:nodes[i].z});if(i===0)break;i=prev[i];}
 return pts;
}
function setupMap(){let wrap=document.getElementById("radarWrap");if(wrap)return;wrap=document.createElement("div");wrap.id="radarWrap";wrap.innerHTML='<canvas id="radarCanvas" width="720" height="720"></canvas><div id="radarHint"></div>';document.getElementById("game").appendChild(wrap);wrap.onclick=()=>wrap.classList.toggle("expanded");}
function drawMap(now){
 setupMap();const wrap=document.getElementById("radarWrap");wrap.style.display=gameStarted?"block":"none";if(!gameStarted||!me)return;
 const c=document.getElementById("radarCanvas"),ctx=c.getContext("2d"),S=c.width,pad=16,k=(S-pad*2)/54,px=x=>pad+(x+27)*k,py=z=>pad+(z+27)*k;
 const names=ROOMS.length?ROOMS.map(r=>r.name):ROOM_NAMES_FALLBACK,blackout=!!window.currentBlackout;
 ctx.clearRect(0,0,S,S);ctx.fillStyle="#071225";ctx.fillRect(0,0,S,S);
 // Salles + noms
 for(let r=0;r<MAP.nRows;r++)for(let col=0;col<MAP.cols;col++){const i=r*MAP.cols+col,x=px(MAP_XS[col]),y=py(MAP_ZS[r]),w=px(MAP_XS[col+1])-x,h=py(MAP_ZS[r+1])-y,elec=i===MAP.panelRoom;
  ctx.fillStyle=elec?(blackout?"#4a3a12":"#1f4a42"):"#162844";ctx.fillRect(x,y,w,h);
  ctx.strokeStyle=elec?"#ffd36b":"#7a96c4";ctx.lineWidth=elec?4:3;ctx.strokeRect(x+1,y+1,w-2,h-2);
  ctx.fillStyle=elec?"#fff1bf":"#e6efff";ctx.font="bold "+Math.max(11,Math.min(21,Math.floor(w/5.4)))+"px Arial";ctx.textAlign="center";ctx.textBaseline="middle";
  const label=String(names[i]||"PIÈCE");let lines=[label];if(ctx.measureText(label).width>w-14){const wd=label.split(" ");let best=[label],bi=1;for(let j=1;j<wd.length;j++){const l1=wd.slice(0,j).join(" "),l2=wd.slice(j).join(" ");if(Math.abs(l1.length-l2.length)<Math.abs(best[0].length-(best[1]||"").length)||best.length===1)best=[l1,l2];}lines=best;}
  lines.forEach((t,j)=>ctx.fillText(t,x+w/2,y+h/2+(j-(lines.length-1)/2)*25,w-10));}
 // Ouvertures de portes
 ctx.strokeStyle="#ffd36b";ctx.lineWidth=7;ctx.lineCap="round";
 for(const d of DOORS){ctx.beginPath();if(!d.vertical){ctx.moveTo(px(d.x-1.1),py(d.z));ctx.lineTo(px(d.x+1.1),py(d.z));}else{ctx.moveTo(px(d.x),py(d.z-1.1));ctx.lineTo(px(d.x),py(d.z+1.1));}ctx.stroke();}
 {const en=MAP.entrance,ez=MAP_ZS[MAP_ZS.length-1];ctx.beginPath();ctx.moveTo(px(en.x-en.half),py(ez));ctx.lineTo(px(en.x+en.half),py(ez));ctx.stroke();}ctx.lineCap="butt";
 // Canalisations (visibles seulement des imposteurs sur la carte)
 if(you&&(isImpRole(you.role)||you.isAngel||you.isInfluencer)){for(const v of VENTS){ctx.beginPath();ctx.arc(px(v.x),py(v.z),12,0,Math.PI*2);ctx.fillStyle="#05060a";ctx.fill();ctx.strokeStyle="#8b93a6";ctx.lineWidth=3;ctx.stroke();const p=VENTS[v.partner];ctx.save();ctx.strokeStyle="rgba(139,147,166,.25)";ctx.lineWidth=2;ctx.setLineDash([4,6]);ctx.beginPath();ctx.moveTo(px(v.x),py(v.z));ctx.lineTo(px(p.x),py(p.z));ctx.stroke();ctx.restore();}}
 // Zone de lumière du joueur
 ctx.beginPath();ctx.arc(px(me.x),py(me.z),mapRadius*k,0,Math.PI*2);ctx.fillStyle=blackout&&mapShowRoute?"rgba(255,211,107,.16)":"rgba(255,255,255,.07)";ctx.fill();ctx.strokeStyle=blackout&&mapShowRoute?"rgba(255,211,107,.8)":"rgba(255,255,255,.35)";ctx.lineWidth=3;ctx.setLineDash([10,8]);ctx.stroke();ctx.setLineDash([]);
 // Route vers le tableau électrique
 if(blackout){const pulse=1+.25*Math.sin(now/180);
  if(mapShowRoute){const pts=routeCache.length?routeCache:computeRoute(me.x,me.z);ctx.save();ctx.lineJoin="round";ctx.strokeStyle="#55f2a5";ctx.lineWidth=9;ctx.setLineDash([22,14]);ctx.lineDashOffset=-now/25;ctx.shadowColor="#55f2a5";ctx.shadowBlur=16;ctx.beginPath();ctx.moveTo(px(me.x),py(me.z));pts.slice(1).forEach(p=>ctx.lineTo(px(p.x),py(p.z)));ctx.stroke();ctx.restore();}
  ctx.beginPath();ctx.arc(px(PANEL.x),py(PANEL.z),13*pulse,0,Math.PI*2);ctx.fillStyle="#ffd36b";ctx.fill();ctx.strokeStyle="#fff";ctx.lineWidth=3;ctx.stroke();ctx.fillStyle="#3a2a00";ctx.font="bold 18px Arial";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("⚡",px(PANEL.x),py(PANEL.z)+1);}
 // Joueur
 ctx.beginPath();ctx.fillStyle="#fff";ctx.strokeStyle="#4b86ff";ctx.lineWidth=5;ctx.arc(px(me.x),py(me.z),11,0,Math.PI*2);ctx.fill();ctx.stroke();
 ctx.fillStyle="#fff";ctx.textAlign="left";ctx.font="bold 20px Arial";ctx.fillText("N ↑",S-62,26);
 const hint=document.getElementById("radarHint"),own=you&&you.alive&&!isImpRole(you.role);
 hint.textContent=blackout?(own?"⚡ PANNE · suis la route verte jusqu'au tableau (⚡) puis R":"⚡ COURANT COUPÉ"):"PLAN DU MANOIR · M ou clic pour agrandir";
 wrap.classList.toggle("alert",blackout);
}
// Route de flèches animées tracée directement sur le sol du manoir + balise sur le tableau électrique.
function ensureRoute(){if(routeGroup)return;routeGroup=new THREE.Group();const sh=new THREE.Shape();sh.moveTo(0,.6);sh.lineTo(.46,-.38);sh.lineTo(0,-.14);sh.lineTo(-.46,-.38);sh.closePath();const geo=new THREE.ShapeGeometry(sh),m=new THREE.MeshBasicMaterial({color:0x55f2a5,transparent:true,opacity:.95,depthTest:false,side:THREE.DoubleSide});
 for(let i=0;i<150;i++){const h=new THREE.Group(),mesh=new THREE.Mesh(geo,m);mesh.rotation.x=-Math.PI/2;mesh.renderOrder=20;h.add(mesh);h.visible=false;routeGroup.add(h);routeDots.push(h);}scene.add(routeGroup);}
function updateRoute(active,now){
 if(!scene||!me)return;ensureRoute();routeGroup.visible=active;if(panelBeacon){panelBeacon.visible=!!window.currentBlackout;panelBeacon.scale.set(1+.15*Math.sin(now/180),1,1+.15*Math.sin(now/180));}
 if(!active)return;if(now-lastRouteAt>100){routeCache=computeRoute(me.x,me.z);lastRouteAt=now;}
 const pts=routeCache,spacing=1.7,phase=(now/1000*2.6)%spacing;let used=0,segStart=0;
 for(let i=0;i<pts.length-1;i++){const a=pts[i],b=pts[i+1],len=Math.hypot(b.x-a.x,b.z-a.z);if(len<1e-6)continue;const dx=(b.x-a.x)/len,dz=(b.z-a.z)/len;
  for(let s=Math.ceil((segStart-phase)/spacing)*spacing+phase;s<segStart+len&&used<routeDots.length;s+=spacing){if(s<segStart)continue;const t=s-segStart,h=routeDots[used++];h.visible=true;h.position.set(a.x+dx*t,.12,a.z+dz*t);h.rotation.y=Math.atan2(-dx,-dz);}
  segStart+=len;}
 for(let j=used;j<routeDots.length;j++)routeDots[j].visible=false;
}
function updateRepairUi(now){
 let el=document.getElementById("repairBox");if(!el){el=document.createElement("div");el.id="repairBox";el.className="panel";document.getElementById("game").appendChild(el);}
 let html="";const crew=!!you&&!isImpRole(you.role);
 if(taskTimer&&taskTarget){const p=Math.min(1,(now-taskStartAt)/3000);html=`<b>🔧 RÉPARATION EN COURS…</b><div class="bar"><div style="width:${(p*100).toFixed(0)}%"></div></div>`;}
 if(!html&&window.currentBlackout&&crew&&you.alive&&me){
  if(repairTimer){const p=Math.min(1,(now-repairStartAt)/3000);html=`<b>🔧 RÉPARATION EN COURS…</b><div class="bar"><div style="width:${(p*100).toFixed(0)}%"></div></div>`;}
  else if(Math.hypot(me.x-PANEL.x,me.z-PANEL.z)<=2.8)html=`<b>⚡ Tableau électrique</b><br>Appuie sur <kbd>R</kbd> pour réparer (3 secondes)`; }
 if(!html&&((you?.alive&&isImpRole(you.role))||you?.isAngel||you?.isInfluencer)&&me&&gameStarted&&VENTS.some(v=>Math.hypot(v.x-me.x,v.z-me.z)<=2.2))html=`<b>🕳 Canalisation</b><br>Appuie sur <kbd>X</kbd> pour voyager vers l'autre bouche`;
 if(!html&&you&&me&&gameStarted&&!you.alive&&(you.isAngel||you.isInfluencer)){
  const near=(window.lastPlayers||[]).filter(q=>q.id!==you.id&&q.alive&&Math.hypot(q.x-me.x,q.z-me.z)<=4).sort((a,b)=>Math.hypot(a.x-me.x,a.z-me.z)-Math.hypot(b.x-me.x,b.z-me.z))[0];
  if(you.isInfluencer&&you.photoChoices)html=`<b>📣 Objets colorés</b><br>Choisis avec <kbd>1</kbd>-<kbd>${you.photoChoices.length}</kbd> puis appuie sur <kbd>P</kbd> pour valider`;
  else if(near&&you.isAngel&&!(you.cdAngel>0))html=`<b>🛡 ${escapeHtml(near.name)}</b><br>Appuie sur <kbd>P</kbd> pour le protéger`;
  else if(near&&you.isInfluencer&&you.knowsKiller&&you.photosLeft>0)html=`<b>📣 ${escapeHtml(near.name)}</b><br>Appuie sur <kbd>P</kbd> pour envoyer la liste d'objets colorés`;}
 if(!html&&you?.alive&&me&&gameStarted&&!window.currentBlackout){const cd=you.cd||{};let t="";
  if(isImpRole(you.role)&&cd.kill<=0)t="<kbd>F</kbd> pour éliminer un joueur proche";
  else if(you.role==="Ferreur"&&cd.lock<=0)t="<kbd>V</kbd> pour fermer ta salle";
  else if(you.role==="Métamorphe"&&cd.morph<=0&&!(you.morphLeft>0))t="<kbd>C</kbd> pour te transformer";
  else if(you.role==="Invisible"&&cd.invis<=0&&!(you.invisLeft>0))t="<kbd>I</kbd> pour devenir invisible";
  else if(you.role==="Traceur"&&cd.track<=0)t="<kbd>T</kbd> pour activer le traçage";
  if(t)html=`<b>${escapeHtml(roleLabel(you.role))}</b><br>Appuie sur ${t}`;}
 if(!html&&crew&&me&&gameStarted){let best=null,bd=2.8;for(const t of window.currentTasks||[]){if(t.done||t.id===2)continue;const dd=Math.hypot(t.x-me.x,t.z-me.z);if(dd<bd){bd=dd;best=t;}}if(best)html=`<b>🔧 ${escapeHtml(best.name)}</b><br>Appuie sur <kbd>G</kbd> pour réparer (3 secondes)`;}
 el.style.display=html?"block":"none";if(el.dataset.h!==html){el.innerHTML=html;el.dataset.h=html;}
}
function startPowerRepair(){
 if(!you?.alive||!you||isImpRole(you.role)||!window.currentBlackout)return;
 if(Math.hypot(me.x-PANEL.x,me.z-PANEL.z)>2.8){toast.textContent="Approche-toi du tableau électrique : suis la route verte.";return;}
 if(repairTimer)return;
 repairStartAt=performance.now();sendMsg({type:"repairStart"});toast.textContent="🔧 Réparation en cours… reste près du tableau pendant 3 secondes.";
 repairTimer=setTimeout(()=>{repairTimer=null;if(!you?.alive||!window.currentBlackout||Math.hypot(me.x-PANEL.x,me.z-PANEL.z)>2.8){toast.textContent="Réparation interrompue : reste près du tableau.";return;}sendMsg({type:"task",id:2});toast.textContent="Réparation terminée…";},3100);
}

// ---------- Terrains : réception du plan, sélecteur de l'hôte, (re)construction de la scène 3D ----------
const THEMES={
 manor:{bg:"#02050d",base:"#303b50",wall:"#59677e",rugs:true,ground:"grass",carpets:["#5a4a72","#4a5f7a","#6b4a4a"],hardFloor:null},
 lab:{bg:"#02050d",base:"#242a36",wall:"#7b8aa0",rugs:false,ground:"asphalt",carpets:["#4a5f7a","#3f6a78","#5a5a72"],hardFloor:"white"},
 ship:{bg:"#01020a",base:"#161b29",wall:"#4a5672",rugs:false,ground:"space",carpets:["#2f3b57","#3a3f5a","#34505f"],hardFloor:"metal"},
 castle:{bg:"#02050d",base:"#4a463f",wall:"#867b6a",rugs:true,ground:"castle",carpets:["#6b2a32","#4a3a5a","#5a4a2a"],hardFloor:null}
};
function applyMap(m,list){if(!m)return;MAP=m;if(list)MAPS=list;ROOMS=m.rooms;VENTS=m.vents;PANEL=m.panel;MAP_XS=m.xs;MAP_ZS=m.zs;DOORS=m.doors;routeCache=[];updateMapPicker();if(scene&&gameStarted)ensureMapBuilt();}
function fillMapSelect(sel){if(!sel||!MAPS.length)return;if(sel.options.length!==MAPS.length||[...sel.options].some((o,i)=>o.value!==MAPS[i].id))sel.innerHTML=MAPS.map(m=>`<option value="${m.id}">${escapeHtml(m.name)} · ${m.rooms} pièces</option>`).join("");if(MAP)sel.value=MAP.id;sel.disabled=!isHost;}
function updateMapPicker(){if(!MAP)return;
 for(const id of ["mapSelect","endMapSelect"])fillMapSelect(document.getElementById(id));
 const dsc=document.getElementById("mapDesc");if(dsc)dsc.textContent=((MAPS.find(m=>m.id===MAP.id)||{}).desc||"")+(isHost?"":" (choisi par l'hôte)");}
function ensureMapBuilt(){if(!scene||!MAP||builtMapId===MAP.id)return;rebuildMap();}
function rebuildMap(){
 if(mapGroup){scene.remove(mapGroup);mapGroup.traverse(o=>{if(o.geometry)o.geometry.dispose();});}
 wallRects.length=0;wallMeshes.length=0;mapGroup=new THREE.Group();
 scene.add=(...o)=>mapGroup.add(...o); // tout ce que construit buildMansion() va dans un groupe qu'on peut retirer au changement de terrain
 try{buildMansion();}finally{delete scene.add;}
 scene.add(mapGroup);builtMapId=MAP.id;
}
function init3D(){
 const sendChat=()=>{const inp=$("#chatinput");if(inp.value.trim()){let channel="room";if(you?.alive&&you?.meetingLeft>0)channel="living";else if(you?.role==="Infirmier"&&[...corpseMeshes.keys()].length>=0&&document.querySelector("#role")?.textContent.includes("Infirmier"))channel="nurse";if(you&&!you.alive)channel=nurseContactActive?"nurse":"ghost";sendMsg({type:"chat",channel,text:inp.value});inp.value="";}};$("#chatsend").onclick=sendChat;$("#chatinput").addEventListener("keydown",e=>{if(e.key==="Enter")sendChat();});
 scene=new THREE.Scene();scene.background=new THREE.Color("#02050d");scene.fog=null;
 curViewH=viewH();camera=new THREE.OrthographicCamera(-curViewH*innerWidth/innerHeight/2,curViewH*innerWidth/innerHeight/2,curViewH/2,-curViewH/2,.1,100);
 placeCamera(0,0);
 renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,IS_TOUCH?1.5:2));renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;document.querySelector("#game").appendChild(renderer.domElement);
 scene.add(new THREE.HemisphereLight(0xdfe8ff,0x3a3f58,1.55));
 const light=new THREE.DirectionalLight(0xfff0d8,1.35);light.castShadow=true;light.shadow.mapSize.set(IS_TOUCH?1024:2048,IS_TOUCH?1024:2048);{const sc=light.shadow.camera;sc.left=-22;sc.right=22;sc.top=22;sc.bottom=-22;sc.near=1;sc.far=60;}light.shadow.bias=-.0004;light.shadow.radius=3;sunLight=light;scene.add(light);scene.add(light.target);
 const fillLight=new THREE.PointLight(0x8caeff,0.65,24);fillLight.position.set(0,3,0);scene.add(fillLight);
 window.addEventListener("resize",resize);window.addEventListener("orientationchange",()=>setTimeout(resize,250));
 const ACTIONS={x:"vent",i:"invis",c:"morph",e:"report",g:"task",s:"lights",n:"nurse",r:"stopnurse",f:"kill",d:"doors",v:"lock",t:"track",b:"buzzer",p:"protect",k:"testkill"};
document.addEventListener("keydown",e=>{if(e.target.tagName==="INPUT"||e.ctrlKey||e.metaKey||e.altKey)return;const k=e.key.toLowerCase();if(k.startsWith("arrow"))e.preventDefault();keys[k]=true;if(e.repeat)return;
 if(k==="o"){toggleSettings();return}
 if(k==="g"){doNearestTask();return;}
  if(k==="m"){document.getElementById("radarWrap")?.classList.toggle("expanded");return;}
  if(k==="r"&&window.currentBlackout&&you?.alive&&!isImpRole(you.role)&&!(you.role==="Infirmier"&&nurseContactActive)){startPowerRepair();return;}
  if(!you?.alive&&you?.isInfluencer){
   if(you.photoChoices){if(k>="1"&&k<=String(you.photoChoices.length)){window.photoSel=Number(k)-1;return;}if(k==="escape"){sendMsg({type:"influencecancel"});return;}}
   if(k==="p"){sendMsg({type:"influence",index:window.photoSel??0});return;}
  }
  if(ACTIONS[k])sendMsg({type:ACTIONS[k]});
});document.addEventListener("keyup",e=>keys[e.key.toLowerCase()]=false);window.addEventListener("blur",()=>keys={});
 animate();
}
function mat(c){return new THREE.MeshStandardMaterial({color:c,roughness:.8});}
function box(x,y,z,sx,sy,sz,color,coll=true){const m=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),mat(color));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;scene.add(m);return m;}
function buildMansion(){
 // Le plan (grille de pièces, portes, entrée) vient du serveur : MAP.xs / MAP.zs / MAP.doors.
 const TH=THEMES[MAP.theme]||THEMES.manor;scene.background=new THREE.Color(TH.bg);
 const xs=MAP.xs,zs=MAP.zs,nc=MAP.cols,nr=MAP.nRows,EN=MAP.entrance;
 SK=createSkeld(THREE,scene);
 box(0,-.25,0,54,.5,54,"#1b2232");
 const wallH=WALL_H, thickness=.42;
 const wall=(x,z,len,alongX=true)=>{const mesh=SK.wall(x,z,len,alongX,wallH,thickness);wallMeshes.push(mesh);wallRects.push({x1:x-(alongX?len:thickness)/2,x2:x+(alongX?len:thickness)/2,z1:z-(alongX?thickness:len)/2,z2:z+(alongX?thickness:len)/2});};
 const x0=xs[0],x1=xs[nc],z0=zs[0],z1=zs[nr];
 // Murs extérieurs ; l'entrée principale est une ouverture dans la façade sud.
 wall((x0+x1)/2,z0,x1-x0); wall(x0,(z0+z1)/2,z1-z0,false);wall(x1,(z0+z1)/2,z1-z0,false);
 wall((x0+EN.x-EN.half)/2,z1,EN.x-EN.half-x0);wall((EN.x+EN.half+x1)/2,z1,x1-(EN.x+EN.half));
 // Cloisons intérieures : une ouverture de porte (2,2 unités) au milieu des cloisons qui en ont une, mur plein sinon.
 const doorHalf=1.1,hasDoor=(x,z,vertical)=>DOORS.some(d=>d.vertical===vertical&&Math.abs(d.x-x)<1e-6&&Math.abs(d.z-z)<1e-6);
 for(let r=1;r<nr;r++){const z=zs[r];for(let c=0;c<nc;c++){const a=xs[c],b=xs[c+1],mid=(a+b)/2;
  if(hasDoor(mid,z,false)){wall((a+mid-doorHalf)/2,z,mid-doorHalf-a);wall((mid+doorHalf+b)/2,z,b-mid-doorHalf);}else wall(mid,z,b-a);}}
 for(let c=1;c<nc;c++){const x=xs[c];for(let r=0;r<nr;r++){const a=zs[r],b=zs[r+1],mid=(a+b)/2;
  if(hasDoor(x,mid,true)){wall(x,(a+mid-doorHalf)/2,mid-doorHalf-a,false);wall(x,(mid+doorHalf+b)/2,b-mid-doorHalf,false);}else wall(x,mid,b-a,false);}}
 box(PANEL.x,.7,PANEL.z-1.2,1.8,1.4,.5,"#2a3140");box(PANEL.x,1.05,PANEL.z-.93,.5,.2,.08,"#ffd36b");
 panelBeacon=new THREE.Mesh(new THREE.CylinderGeometry(1.1,1.1,3.2,24,1,true),new THREE.MeshBasicMaterial({color:0xffd36b,transparent:true,opacity:.3,depthWrite:false,side:THREE.DoubleSide}));panelBeacon.position.set(PANEL.x,1.6,PANEL.z-.2);panelBeacon.visible=false;scene.add(panelBeacon);
 VENTS.forEach(v=>SK.vent(v));
 beautifyTerrain(xs,zs,wallH);
}
// Collision contre les murs: le personnage est un disque, les portes sont les ouvertures laissées dans la géométrie.
const wallRects=[];
// ---------- Décor du manoir : sols texturés, plinthes, cadres de portes, meubles par pièce, jardin ----------
function beautifyTerrain(xs,zs,wallH){
 const TH=THEMES[MAP.theme]||THEMES.manor;
 const T=(w,h,draw,rx,ry)=>{const c=document.createElement("canvas");c.width=w;c.height=h;draw(c.getContext("2d"),w,h);const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(rx||1,ry||1);t.anisotropy=4;return t;};
 const M=(c,o)=>new THREE.MeshStandardMaterial(Object.assign({color:c,roughness:.78,metalness:.02},o||{}));
 const mc={};const MM=c=>mc[c]||(mc[c]=M(c));
 const B=(x,y,z,sx,sy,sz,m,sh)=>{const k=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),typeof m==="string"?MM(m):m);k.position.set(x,y,z);k.castShadow=!!sh;k.receiveShadow=true;scene.add(k);if(sh&&y>.25&&sy>.5&&sx>.4&&sz>.4)SK.contactShadow(x,z,sx,sz);return k;};
 const C=(x,y,z,rt,rb,h,m,seg)=>{const k=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,seg||18),typeof m==="string"?MM(m):m);k.position.set(x,y,z);k.castShadow=false;k.receiveShadow=true;scene.add(k);return k;};
 const S=(x,y,z,r,m)=>{const k=new THREE.Mesh(new THREE.SphereGeometry(r,14,10),typeof m==="string"?MM(m):m);k.position.set(x,y,z);scene.add(k);return k;};
 const rnd=(a,b)=>a+Math.random()*(b-a);
 // --- Textures procédurales
 const woodTex=T(256,256,(g,w,h)=>{for(let i=0;i<8;i++){const l=48+Math.random()*10;g.fillStyle=`hsl(28,38%,${l}%)`;g.fillRect(0,i*32,w,32);g.fillStyle="rgba(0,0,0,.28)";g.fillRect(0,i*32,w,2);for(let k=0;k<5;k++){g.fillStyle="rgba(60,30,10,.10)";g.fillRect(Math.random()*w,i*32+Math.random()*28,rnd(30,110),1.5);}g.fillStyle="rgba(0,0,0,.22)";g.fillRect((i*83)%w,i*32,2,32);}});
 const tileTex=T(256,256,(g,w,h)=>{for(let y=0;y<4;y++)for(let x=0;x<4;x++){g.fillStyle=(x+y)%2?"#cfd7e0":"#e3e8ee";g.fillRect(x*64,y*64,64,64);}g.strokeStyle="#9aa6b5";g.lineWidth=3;for(let i=0;i<=4;i++){g.beginPath();g.moveTo(i*64,0);g.lineTo(i*64,h);g.moveTo(0,i*64);g.lineTo(w,i*64);g.stroke();}});
 const stoneTex=T(256,256,(g,w,h)=>{g.fillStyle="#6c7482";g.fillRect(0,0,w,h);for(let y=0;y<4;y++)for(let x=0;x<4;x++){const l=44+Math.random()*10;g.fillStyle=`hsl(215,9%,${l}%)`;g.fillRect(x*64+2,y*64+2,60,60);}g.strokeStyle="rgba(10,14,22,.55)";g.lineWidth=3;for(let i=0;i<=4;i++){g.beginPath();g.moveTo(i*64,0);g.lineTo(i*64,h);g.moveTo(0,i*64);g.lineTo(w,i*64);g.stroke();}});
 const concTex=SK.floorTex("conc");
 const carpetTex=(hex)=>T(128,128,(g,w,h)=>{g.fillStyle=hex;g.fillRect(0,0,w,h);for(let i=0;i<1400;i++){g.fillStyle=`rgba(255,255,255,${Math.random()*.07})`;g.fillRect(Math.random()*w,Math.random()*h,1.5,1.5);g.fillStyle=`rgba(0,0,0,${Math.random()*.08})`;g.fillRect(Math.random()*w,Math.random()*h,1.5,1.5);}});
 const grassTex=T(256,256,(g,w,h)=>{g.fillStyle="#2e5236";g.fillRect(0,0,w,h);for(let i=0;i<2200;i++){g.fillStyle=`hsl(${rnd(110,140)},${rnd(30,45)}%,${rnd(20,34)}%)`;g.fillRect(Math.random()*w,Math.random()*h,1.5,rnd(2,5));}},28,28);
 const bookTex=T(256,128,(g,w,h)=>{g.fillStyle="#241a12";g.fillRect(0,0,w,h);for(let r=0;r<3;r++){let x=4;while(x<w-8){const bw=rnd(6,13),bh=rnd(28,38);g.fillStyle=`hsl(${Math.floor(Math.random()*360)},${rnd(35,60)}%,${rnd(30,52)}%)`;g.fillRect(x,r*42+(40-bh)+2,bw,bh);x+=bw+1;}g.fillStyle="#3a2a1c";g.fillRect(0,r*42+40,w,3);}});
 // --- Sols par pièce
 const metalTex=SK.floorTex("metal"),whiteTex=SK.floorTex("white");
 const FLOOR_OF={terrace:"wood",kitchen:"tile",electrical:"conc",living:"carpet",dining:"wood",bedroom_master:"carpet",bedroom2:"carpet",bathroom:"tile",library:"wood",office:"wood",conference:"wood",laundry:"tile",storage:"conc",attic:"wood",basement:"stone",
  veranda:"tile",hall:"stone",games:"carpet",airlock:"metal",lab:"white",server:"metal",cryo:"white",dormitory:"carpet",medbay:"white",control:"metal",quarantine:"white",archives:"conc",cafeteria:"white",workshop:"conc",greenhouse:"grass",hangar:"conc",armory:"metal",comms:"metal",security:"metal",lounge:"carpet",engine:"metal",navigation:"metal",cargo:"metal",bridge:"metal",
  tower:"stone",vault:"stone",chapel:"stone",dungeon:"stone",forge:"stone",stables:"conc",crypt:"stone",guardroom:"stone",courtyard:"grass",alchemy:"stone",throne:"stone"};
 ROOMS.forEach((rm,i)=>{let k=FLOOR_OF[rm.kind]||"conc";if((k==="wood"||k==="carpet")&&TH.hardFloor)k=TH.hardFloor;
  const w=rm.x2-rm.x1-.5,d=rm.z2-rm.z1-.5,x=(rm.x1+rm.x2)/2,z=(rm.z1+rm.z2)/2;
  const tex=k==="wood"?woodTex:k==="tile"?tileTex:k==="stone"?stoneTex:k==="conc"?concTex:k==="metal"?metalTex:k==="white"?whiteTex:k==="grass"?grassTex:carpetTex(TH.carpets[i%3]);
  const t=tex.clone();t.needsUpdate=true;const sc=k==="carpet"?3:k==="grass"?9:4;t.repeat.set(Math.max(1,w/sc),Math.max(1,d/sc));
  B(x,.01,z,w,.02,d,M("#ffffff",{map:t,roughness:k==="tile"||k==="white"?.35:.85}));SK.roomDecal(rm);});
 // --- Ombres douces au pied des murs
 SK.wallShadows(wallRects,{x0:xs[0],x1:xs[xs.length-1],z0:zs[0],z1:zs[zs.length-1]});
 SK.hull({x0:xs[0],x1:xs[xs.length-1],z0:zs[0],z1:zs[zs.length-1]},MAP.entrance,"#c4cee0");
 // --- Cadres de portes + seuils (d'après la liste des portes du terrain)
 const post=(x,z,sx,sz)=>B(x,wallH/2,z,sx,wallH,sz,"#76839c");
 DOORS.forEach(d=>SK.door(d,wallH));
 // Entrée principale (sud)
 {const en=MAP.entrance,ez=zs[zs.length-1],hf=en.half;
  post(en.x-hf-.1,ez,.35,.7);post(en.x+hf+.1,ez,.35,.7);B(en.x,.04,ez-1,hf*2-1,.05,1.8,"#2a3142");
  B(en.x,.1,ez+1.3,hf*2+.4,.2,1.6,"#6b7280");B(en.x,.04,ez+2.6,hf*2+.4,.1,1.6,"#7a8190");}
 // --- Meubles
 const plant=(x,z,s)=>{s=s||1;C(x,.3*s,z,.28*s,.22*s,.6*s,"#7a4a32");S(x,.85*s,z,.5*s,"#2f7a46");S(x+.2*s,1.1*s,z+.1*s,.32*s,"#3c9157");};
 const bed=(x,z,col)=>{B(x,.3,z,2.3,.5,3.3,"#5a4332",true);B(x,.68,z+.1,2.1,.3,3.1,"#ece6da");B(x,.84,z+.7,2.12,.1,1.9,col);B(x-.55,.9,z-1.2,.8,.2,.5,"#ffffff");B(x+.55,.9,z-1.2,.8,.2,.5,"#ffffff");B(x,1.1,z-1.62,2.3,1.1,.18,"#4a3626");};
 const nightstand=(x,z)=>{B(x,.3,z,.7,.6,.6,"#6a4e3a");B(x,.72,z,.12,.24,.12,"#ffd98a");};
 const wardrobe=(x,z,w)=>{B(x,1.3,z,w,2.6,.9,"#6a4e3a",true);B(x,1.3,z+.46,.04,2.3,.04,"#2b1d12");};
 const shelf=(x,z,w)=>{B(x,1.5,z,w,3,.7,"#3a2a1c",true);const p=new THREE.Mesh(new THREE.PlaneGeometry(w-.2,2.6),new THREE.MeshStandardMaterial({map:bookTex,roughness:.9}));p.position.set(x,1.5,z+.36);scene.add(p);};
 const table=(x,z,w,d,col,h)=>{h=h||.8;B(x,h,z,w,.1,d,col,true);for(const sx of [-1,1])for(const sz of [-1,1])B(x+sx*(w/2-.15),h/2,z+sz*(d/2-.15),.12,h,.12,"#3a281b");};
 const chair=(x,z,col)=>{B(x,.45,z,.55,.08,.55,col);B(x,.9,z,.55,.08,.08,col);for(const sx of [-1,1])for(const sz of [-1,1])B(x+sx*.22,.22,z+sz*.22,.07,.44,.07,"#2a2a30");};
 const sofa=(x,z,w,col)=>{B(x,.35,z,w,.7,1.2,col,true);B(x,.95,z+.5,w,.8,.25,col);B(x-w/2+.15,.65,z,.3,.5,1.2,col);B(x+w/2-.15,.65,z,.3,.5,1.2,col);};
 const machine=(x,z)=>{B(x,.55,z,1.1,1.1,.9,"#e8edf2",true);C(x,.6,z+.46,.34,.34,.06,"#5a6a7e",20).rotation.x=Math.PI/2;B(x,1.02,z+.46,.6,.08,.04,"#9aa6b5");};
 const crate=(x,z,s,col)=>{B(x,s/2,z,s,s,s,col||"#8a6a45",true);B(x,s/2,z,s+.03,.1,s+.03,"#5a4328");};
 const barrel=(x,z)=>{C(x,.55,z,.42,.42,1.1,"#6b4a2a",14);C(x,.35,z,.44,.44,.07,"#2a2a30",14);C(x,.78,z,.44,.44,.07,"#2a2a30",14);};
 const screen=(x,z,w)=>{B(x,1.7,z,w,1.4,.1,"#0b1018");B(x,1.7,z+.06,w-.2,1.2,.02,"#244b78");};
 // --- Décors : un décor par type de pièce (les pièces de même type partagent le même décor)
 const DECOR={
  terrace:({cx,cz,N,Z,E,W})=>{[-4.2,0,4.2].forEach(dx=>{B(cx+dx,.4,N,2.4,.8,.9,"#6b4a2a",true);B(cx+dx,.82,N,2.2,.1,.7,"#2f5d3a");S(cx+dx-.5,1.1,N,.35,"#3c9157");S(cx+dx+.5,1.15,N,.4,"#2f7a46");});
     C(cx+1.2,.8,cz-1.2,.9,.9,.1,"#8a6a45",24);C(cx+1.2,.4,cz-1.2,.1,.1,.8,"#3a281b");C(cx+1.2,2.2,cz-1.2,.06,1.6,.06,"#3a281b",8);C(cx+1.2,2.9,cz-1.2,.05,1.9,.5,"#c9573a",16);
     [[-1.2,-.5],[1.2,-.5]].forEach(a=>chair(cx+1.2+a[0],cz-1.2+a[1]+1.1,"#6b4a2a"));plant(E,Z,1.2);plant(W,Z,1.2);},
  kitchen:({cx,cz,N,Z,E,W})=>{B(cx-1.5,.5,N,6,1,1,"#cfd6df",true);B(cx-1.5,1.03,N,6.05,.06,1.05,"#2f343e");for(let k=0;k<4;k++)C(cx-3.2+k*.5+(k>1?1.6:0),1.08,N,.16,.16,.03,"#111",12);B(cx+2.9,1.15,N,1.2,2.3,1,"#e5e9ef",true);B(cx+2.9,1.4,N+.52,.04,.8,.04,"#9aa6b5");
     B(cx+1,.5,Z,4,1,1.2,"#8a6a45",true);B(cx+1,1.03,Z,4.1,.06,1.3,"#d9dde3");chair(cx+1,Z-1.4,"#a85a3a");},
  living:({cx,cz,N,Z,E,W})=>{sofa(cx,Z,4.6,"#5c6b8a");B(cx,.4,N,3.4,.8,.7,"#2a2a32",true);B(cx,1.25,N,2.4,1.2,.1,"#0b0e14");B(cx,.28,cz+4.3,2,.3,1,"#6a4e3a");plant(W,N,1.3);plant(E,N,1.3);plant(E,Z,1.2);},
  dining:({cx,cz,N,Z,E,W})=>{table(cx,cz,5.2,1.5,"#7a5535");[-1.9,-.65,.65,1.9].forEach(dx=>{chair(cx+dx,cz-1.3,"#4a3626");chair(cx+dx,cz+1.3,"#4a3626");});B(cx,1.4,cz,.5,.4,.5,"#e8c36a");B(cx,.55,N,5,1.1,.9,"#5a4332",true);plant(E,Z,1.2);},
  bedroom_master:({cx,cz,N,Z,E,W})=>{bed(cx+1.6,N+1.2,"#7a3a4a");nightstand(cx-.3,N);nightstand(cx+3.5,N);wardrobe(W+.6,N,2.6);B(cx,.02,Z,3.6,.04,1.4,"#6a3a3a");},
  bedroom2:({cx,cz,N,Z,E,W})=>{bed(cx+2.4,N+1.2,"#3a5a7a");nightstand(cx+.7,N);table(cx-3,N+.2,2.4,1,"#6a4e3a",.75);chair(cx-3,N+1.4,"#3a3a46");B(cx-3,1.15,N+.1,.8,.5,.06,"#0b1018");wardrobe(E-.5,Z,2.2);},
  bathroom:({cx,cz,N,Z,E,W})=>{B(cx+2.4,.4,N+.1,3.2,.8,1.5,"#f1f5f9",true);B(cx+2.4,.82,N+.1,2.8,.04,1.1,"#7cc4e8");B(cx-1.2,.5,N,1.3,1,.7,"#dfe6ee",true);B(cx-1.2,1.7,N-.3,1.2,1,.04,"#a8d4ee");B(cx+3.5,.35,Z,.8,.7,1,"#f1f5f9",true);B(cx-3,.3,Z,1.4,.6,.9,"#b0bac6");},
  library:({cx,cz,N,Z,E,W})=>{[-3.3,0,3.3].forEach(dx=>shelf(cx+dx,N-.15,3));shelf(E-1.3,cz-2,3);table(cx,Z-.5,2.6,1.1,"#6a4e3a",.75);B(cx+1,1.2,Z-.5,.5,.4,.5,"#ffd98a");chair(cx,Z-1.7,"#4a3626");},
  office:({cx,cz,N,Z,E,W})=>{table(cx+1,N+.9,3.6,1.5,"#7a5a3c",.8);B(cx+1,1.15,N+.8,.9,.55,.06,"#0b1018");chair(cx+1,N+2.3,"#2f3340");B(E,.9,Z,1.1,1.8,.8,"#6e7787",true);B(E-1.3,.9,Z,1.1,1.8,.8,"#6e7787",true);plant(W,Z,1.1);},
  conference:({cx,cz,N,Z,E,W})=>{screen(cx,N,5);table(cx+.4,cz+.5,5.2,1.8,"#4a3626",.85);[-1.9,-.6,.6,1.9].forEach(dx=>{chair(cx+.4+dx,cz-.9,"#2f3340");chair(cx+.4+dx,cz+1.9,"#2f3340");});plant(E,Z,1.2);},
  laundry:({cx,cz,N,Z,E,W})=>{[-3.2,-1.9,-.6].forEach(dx=>machine(cx+dx,N));B(cx+2.4,.35,N,1.2,.7,.9,"#c9a46b",true);B(cx+2.4,.6,N,1.1,.14,.8,"#d8c19a");B(cx,1.3,Z,4.6,.1,.8,"#8a6a45");B(cx,.6,Z,4.6,.1,.8,"#8a6a45");B(cx-2.2,.9,Z,.1,1.8,.8,"#6a4e3a");B(cx+2.2,.9,Z,.1,1.8,.8,"#6a4e3a");},
  storage:({cx,cz,N,Z,E,W})=>{crate(cx-3.6,N,1.3);crate(cx-2.3,N,1);crate(cx+3.6,Z,1.4);crate(cx+2.2,Z,1,"#7a5c3a");B(cx+3.8,1.2,N,2,2.4,.7,"#59606c",true);B(cx+3.8,1.25,N+.4,1.8,.06,.04,"#39414f");},
  attic:({cx,cz,N,Z,E,W})=>{B(cx-3.6,.4,N,1.8,.8,1,"#6b4a2a",true);B(cx-3.6,.85,N,1.9,.1,1.1,"#4a3220");crate(cx-1.8,N,.9);crate(cx+3.5,N,1.2,"#7a5c3a");chair(cx+3,Z,"#6a4e3a");B(cx-3.8,1.2,Z,1.2,2.4,.06,"#9aa6b5");B(cx+.5,.5,Z,1.8,1,.7,"#5a4332",true);},
  basement:({cx,cz,N,Z,E,W})=>{C(cx+3.8,1.2,N+.2,.9,.9,2.4,"#59606c",20);C(cx+3.8,2.5,N+.2,.2,.2,1.2,"#3a404d",10);C(cx-3.5,1.5,N,.1,.1,3,"#9aa6b5",8);[-1.6,0,1.6].forEach(dx=>barrel(cx+dx,N));B(cx,2.6,N-.35,9,.12,.12,"#8f5a3a");barrel(E,Z);barrel(E-1,Z);crate(W,Z,1.2,"#6a5a45");},
  electrical:({cx,cz,N,Z,hw})=>{const sp=Math.min(3.2,hw-1.9),w=Math.min(2.4,sp*.8);[-1,0,1].forEach((f,k)=>{B(cx+f*sp,1.3,N,w,2.6,.8,"#39414f",true);B(cx+f*sp,2.1,N+.42,w*.75,.12,.03,"#ffd36b");B(cx+f*sp,1.5,N+.42,.1,.1,.03,k===1?"#4cff88":"#ff5a4c");});
     B(cx-sp*1.2,.4,Z,1.4,.8,.8,"#b8452f",true);B(cx+sp*1.1,.4,Z,1,.8,1,"#39414f",true);C(cx,2.5,cz+1.5,.04,.04,5,"#222",6).rotation.z=Math.PI/2;},
  veranda:({cx,cz,N,Z,ux,hw})=>{[-.7,0,.7].forEach(f=>plant(ux(f),N,1.3));table(cx,cz,2.2,1.1,"#8a6a45",.7);chair(cx-1.5,cz,"#6b4a2a");chair(cx+1.5,cz,"#6b4a2a");B(cx,.45,Z,Math.min(4,hw*1.2),.2,.8,"#8a6a45",true);},
  hall:({cx,cz,N,W,E,hd})=>{B(cx,.03,cz,2.6,.04,hd*1.6,"#6a2c2c");B(W,.5,cz,.7,1,2,"#5a4332",true);B(E,.5,cz,.7,1,2,"#5a4332",true);plant(W,N,1.3);plant(E,N,1.3);C(cx,3.4,cz,.9,.9,.12,"#ffd98a",18);C(cx,3.75,cz,.05,.05,.8,"#3a281b",6);},
  games:({cx,cz,N,Z,ux,hw})=>{B(cx,.7,cz,3.4,.2,1.9,"#2f7a46",true);B(cx,.45,cz,3.2,.5,1.7,"#4a3220");sofa(cx,Z,Math.min(4,hw*1.1),"#6b4a4a");[-.5,.5].forEach(f=>{B(ux(f),1,N,1,2,.8,"#2a2f4a",true);B(ux(f),1.3,N+.42,.8,.6,.04,"#4cc3ff");});},
  airlock:({cx,cz,N,Z,ux,hw})=>{B(cx,1.4,N,Math.min(4,hw*1.6),2.8,.3,"#8f98a8",true);B(cx,1.4,N+.2,Math.min(3.6,hw*1.4),2.4,.05,"#e8b84a");B(cx,.03,cz,2.6,.04,2.6,"#e8b84a");B(cx,.035,cz,2.2,.04,2.2,"#1c2230");[-.6,0,.6].forEach(f=>B(ux(f),.9,Z,.9,1.8,.7,"#4b5568",true));},
  lab:({cx,cz,N,ux,hw,hd})=>{const L=Math.min(6,hd*1.3);[-.55,.55].forEach(f=>{B(ux(f),.5,cz,1.2,1,L,"#dfe6ee",true);B(ux(f),1.03,cz,1.25,.06,L+.05,"#2f343e");[-1,0,1].forEach(g=>C(ux(f),1.25,cz+g*Math.min(2,hd*.4),.18,.18,.4,"#7cd6e8",10));});B(cx,1,N,Math.min(4,hw*1.6),2,.8,"#cfd6df",true);},
  server:({N,Z,ux})=>{[-1,-.35,.35,1].forEach((f,k)=>{B(ux(f),1.3,N,1.4,2.6,.9,"#2a303c",true);B(ux(f),1.6,N+.47,1,.9,.03,k%2?"#27d27a":"#3aa0ff");B(ux(f),1.3,Z,1.4,2.6,.9,"#2a303c",true);B(ux(f),1.6,Z-.47,1,.9,.03,k%2?"#3aa0ff":"#27d27a");});},
  cryo:({cx,cz,N,ux,hw})=>{[-.6,0,.6].forEach(f=>{C(ux(f),1.1,cz,.75,.75,2.2,"#8fd8ff",18);C(ux(f),.15,cz,.9,.9,.3,"#39414f",18);C(ux(f),2.3,cz,.8,.8,.12,"#39414f",18);});B(cx,.5,N,Math.min(4,hw*1.6),1,.8,"#39414f",true);},
  dormitory:({N,Z,ux})=>{[-.6,0,.6].forEach(f=>{[N+.6,Z-.6].forEach(z=>{B(ux(f),.35,z,1.5,.7,2.6,"#4a5f7a",true);B(ux(f),1.5,z,1.5,.7,2.6,"#4a5f7a",true);B(ux(f),.9,z,.1,1.8,.1,"#2a2f3a");});});},
  medbay:({cx,N,Z,E,ux})=>{[-.6,0,.6].forEach(f=>{B(ux(f),.4,N+.9,1.3,.8,2.4,"#f1f5f9",true);B(ux(f),.85,N+.7,1.1,.1,1.9,"#7cc4e8");});B(E,1,Z,1,2,.8,"#e8edf2",true);B(cx,.55,Z,1.6,1.1,.9,"#bcd6e6",true);},
  quarantine:({cx,cz,ux,hw})=>{[-.55,.55].forEach(f=>{B(ux(f),1.4,cz,Math.min(3.8,hw*.9),2.8,.1,"#9fd6e8");B(ux(f),.4,cz-1.6,1.2,.8,2.2,"#e8edf2",true);});B(cx,.03,cz+2.6,2.4,.04,1,"#e8b84a");},
  archives:({cx,cz,N,Z,ux,hw})=>{[-.65,0,.65].forEach(f=>shelf(ux(f),N-.15,Math.min(3,hw*.62)));[-.65,.65].forEach(f=>B(ux(f),.9,Z,Math.min(3,hw*.62),1.8,.8,"#6e7787",true));table(cx,cz,2.4,1.1,"#6a4e3a",.75);chair(cx,cz+1,"#4a3626");},
  cafeteria:({cx,cz,N,ux,uz,hw})=>{[-.55,.55].forEach(f=>[-.5,.5].forEach(g=>{const x=ux(f),z=uz(g*.9);table(x,z,2.4,1.2,"#c9ccd3",.8);chair(x,z-1.1,"#e0b84a");chair(x,z+1.1,"#e0b84a");}));B(cx,.6,N,Math.min(5,hw*1.6),1.2,.9,"#9aa6b5",true);},
  workshop:({cx,cz,N,Z,ux,hw})=>{B(cx,.6,N,Math.min(6,hw*1.7),1.2,1,"#7a5c3a",true);C(ux(.7),1.3,cz,.25,.25,2.6,"#59606c",10);B(ux(.7),.4,cz,1.2,.8,1.2,"#3a404d",true);crate(ux(-.7),Z,1.1,"#7a5c3a");table(cx,cz,2.4,1.2,"#5a4332",.85);},
  greenhouse:({cx,cz,ux,hd})=>{const L=Math.min(5,hd*1.2);[-.6,0,.6].forEach(f=>{B(ux(f),.35,cz,1.6,.7,L,"#6b4a2a",true);B(ux(f),.75,cz,1.4,.2,L-.2,"#2f7a46");[-1,0,1].forEach(g=>S(ux(f),1.1,cz+g*Math.min(1.8,hd*.4),.4,g?"#3c9157":"#2f7a46"));});},
  hangar:({cx,cz,N,Z,ux,hd})=>{const vx=ux(-.4);B(vx,.6,cz,2.8,1.2,Math.min(6,hd*1.5),"#59606c",true);B(vx,1.5,cz-.3,2.2,.6,2.6,"#7a8190");[[-1.2,-2],[1.2,-2],[-1.2,2],[1.2,2]].forEach(w=>{C(vx+w[0],.35,cz+w[1],.35,.35,.4,"#1a1a1f",12).rotation.z=Math.PI/2;});crate(ux(.8),Z,1.2);crate(ux(.8),N,1.1,"#7a5c3a");B(cx,.03,cz,.3,.04,hd*1.7,"#e8b84a");},
  armory:({cx,cz,N,ux,hw})=>{const w=Math.min(2,(hw-1.4)*1.1);[-.6,0,.6].forEach(f=>{B(ux(f),1.2,N,w,2.4,.6,"#3a404d",true);[-.3,0,.3].forEach(o=>B(ux(f)+o*w/.6*.5,1.3,N+.35,.1,1.8,.1,"#9aa6b5"));});B(cx,.5,cz+1,Math.min(3,hw*1.2),1,1.2,"#4b5568",true);},
  comms:({cx,cz,N,ux,hw})=>{const w=Math.min(2.4,hw*.8);screen(ux(-.5),N,w);screen(ux(.5),N,w);table(cx,N+1.4,Math.min(5,hw*1.5),1.2,"#39414f",.85);C(cx,.9,cz+1.5,.9,.9,.12,"#cfd6df",24);B(cx,.45,cz+1.5,.2,.9,.2,"#59606c");},
  security:({cx,N,Z,E,ux,hw})=>{[-.6,-.2,.2,.6].forEach(f=>{B(ux(f),1.7,N,.9,.7,.1,"#0b1018");B(ux(f),1.7,N+.06,.8,.6,.02,"#2a5a3a");});table(cx,N+1.5,Math.min(5,hw*1.5),1.2,"#39414f",.85);chair(cx,N+2.7,"#2f3340");B(E,.9,Z,1.1,1.8,.8,"#6e7787",true);},
  lounge:({cx,cz,N,Z,W,E,hw})=>{sofa(cx,Z,Math.min(4.2,hw*1.5),"#4a5f7a");B(cx,.3,cz+.8,2.2,.5,1.2,"#6a4e3a",true);B(cx,1.5,N,Math.min(3.4,hw*1.3),1.5,.1,"#0b1018");plant(E,N,1.1);plant(W,N,1.1);},
  engine:({cx,cz,ux,hw})=>{[-.6,0,.6].forEach(f=>{C(ux(f),1.2,cz,.6,.6,2.4,"#59606c",16);C(ux(f),2.6,cz,.3,.3,1.2,"#9aa6b5",10);});B(cx,.3,cz-2.5,hw*1.4,.5,.5,"#8f5a3a");B(cx,.3,cz+2.5,hw*1.4,.5,.5,"#8f5a3a");B(cx,.04,cz,hw*1.2,.04,.8,"#ff8a3a");},
  navigation:({cx,cz,N,hw})=>{screen(cx,N,Math.min(6,hw*1.6));B(cx,.6,cz,2.4,1.2,2.4,"#244b78",true);B(cx,1.3,cz,2.2,.1,2.2,"#4cc3ff");chair(cx,cz+2.2,"#2f3340");},
  cargo:({cx,cz,ux,uz,hd})=>{[[-.6,-.6],[-.1,-.6],[.6,-.5],[.5,.5],[-.6,.5],[0,.1]].forEach((p,k)=>crate(ux(p[0]),uz(p[1]),k%2?1.1:1.4,k%3?"#8a6a45":"#7a5c3a"));B(cx,.03,cz,.2,.04,hd*1.6,"#e8b84a");},
  bridge:({cx,cz,N,ux,hw})=>{screen(cx,N,Math.min(8,hw*1.8));[-.6,.6].forEach(f=>B(ux(f),.55,cz-.5,2.2,1.1,1.1,"#39414f",true));B(cx,.5,cz+1.5,1,1,1,"#b8452f",true);B(cx,1,cz+2,.9,1,.2,"#b8452f");},
  control:a=>{DECOR.conference(a);[-.8,.8].forEach(f=>B(a.ux(f),.55,a.Z,2,1.1,.9,"#39414f",true));},
  tower:({cx,cz,N,W,E})=>{C(cx,1.4,cz,1.1,1.1,2.8,"#8a8478",16);for(let k=0;k<8;k++){const t=k/8*Math.PI*2;B(cx+Math.cos(t)*1.6,.2+k*.35,cz+Math.sin(t)*1.6,.9,.12,.5,"#6a6458");}B(W,1.8,N,.3,.3,.3,"#ff9d35");B(E,1.8,N,.3,.3,.3,"#ff9d35");},
  vault:({cx,N,ux,uz,hw})=>{B(cx,1.1,N,Math.min(3,hw*1.2),2.2,.9,"#59606c",true);C(cx,1.2,N+.5,.5,.5,.1,"#9aa6b5",18).rotation.x=Math.PI/2;[[-.6,.2],[0,.3],[.6,.1],[-.3,.7],[.3,.7]].forEach(p=>B(ux(p[0]),.2,uz(p[1]),.9,.35,.45,"#e0b84a",true));},
  chapel:({cx,N,ux,uz,hw})=>{[-.6,.6].forEach(f=>[-.1,.45,.9].forEach(g=>B(ux(f),.45,uz(g),Math.min(2.8,hw*.7),.9,.6,"#5a4332",true)));B(cx,.6,N,Math.min(3,hw),1.2,1,"#cfd6df",true);B(cx,1.6,N+.1,.5,.9,.1,"#e0b84a");},
  dungeon:({N,W,E,cz,ux})=>{[-.5,.5].forEach(f=>{for(let k=-4;k<=4;k++)B(ux(f)+k*.4,1.2,cz,.06,2.4,.06,"#3a404d");B(ux(f),2.4,cz,3.4,.08,.08,"#3a404d");B(ux(f),.3,cz+1.1,1.6,.15,.9,"#6a5a45");});B(W,1.6,N,.1,1.4,.1,"#8f98a8");B(E,1.6,N,.1,1.4,.1,"#8f98a8");},
  forge:({cx,cz,N,Z,ux})=>{B(ux(-.5),.5,cz,1,1,.6,"#2f343e",true);B(ux(-.5),1.05,cz,1.2,.12,.8,"#59606c");B(ux(.6),1,N,2.6,2,1.2,"#6b4a2a",true);B(ux(.6),.7,N+.65,1.4,.5,.05,"#ff7a2a");B(ux(.6),2.4,N,.6,1.6,.6,"#4a4036");C(cx,.3,Z,.5,.5,.6,"#3a2a1c",12);},
  stables:({cz,E,Z,ux,hd})=>{const L=Math.min(4,hd*1.2);[-.6,0,.6].forEach(f=>{B(ux(f)-1,.9,cz,.08,1.8,L,"#6a4e3a");B(ux(f),.2,cz,1.6,.3,L-.4,"#d8c46b");});B(E,.4,Z,1.6,.8,.8,"#5a4332",true);},
  crypt:({cz,N,W,E,ux,hd})=>{const L=Math.min(3.2,hd*.9);[-.5,.5].forEach(f=>{B(ux(f),.5,cz,1.5,1,L,"#8a8478",true);B(ux(f),1.02,cz,1.6,.06,L+.1,"#a39d90");});[W,E].forEach(x=>{B(x,1.6,N,.2,.5,.2,"#ffb347");B(x,1.1,N,.1,.8,.1,"#4a4036");});},
  guardroom:({cx,cz,N,Z,E,ux})=>{table(cx,cz,2.6,1.2,"#5a4332",.8);chair(cx-.8,cz+1,"#4a3626");chair(cx+.8,cz+1,"#4a3626");B(ux(-.6),.35,N+.2,2.2,.6,1.2,"#5a6a4a",true);B(ux(.6),.35,N+.2,2.2,.6,1.2,"#5a6a4a",true);B(E,1.1,Z,1.6,2.2,.4,"#3a404d",true);},
  courtyard:({cx,cz,Z,ux,uz,hw})=>{C(cx,.4,cz,1.8,1.8,.8,"#8a8478",24);C(cx,.82,cz,1.4,1.4,.12,"#4a8fc9",24);C(cx,1.4,cz,.2,.2,1.4,"#8a8478",8);[[-.7,-.6],[.7,-.6],[-.7,.6],[.7,.6]].forEach(p=>plant(ux(p[0]),uz(p[1]),1.3));B(cx,.4,Z,Math.min(3.4,hw*.9),.3,.7,"#8a8478",true);},
  alchemy:({cx,cz,N,Z,ux,hw})=>{C(cx,.5,cz,.9,.7,1,"#2f343e",18);C(cx,1.1,cz,.7,.7,.15,"#55d97a",18);[-.6,.6].forEach(f=>shelf(ux(f),N-.15,Math.min(3,hw*.8)));table(ux(.6),Z-.6,2.2,1,"#6a4e3a",.75);B(ux(.6),1,Z-.6,.4,.5,.4,"#b18cff");},
  throne:({cx,cz,N,Z,W,E,hw})=>{const tw=Math.min(5.2,hw*1.5);B(cx,.4,N,1.3,.8,1.3,"#b8860b",true);B(cx,1.4,N-.3,1.4,1.8,.2,"#b8860b");table(cx,cz+.8,tw,1.8,"#4a3626",.85);[-.6,-.2,.2,.6].forEach(f=>{chair(cx+f*tw*.8,cz-.3,"#7a1f2a");chair(cx+f*tw*.8,cz+1.9,"#7a1f2a");});B(W,1.1,Z,.4,2.2,.4,"#8a8478",true);B(E,1.1,Z,.4,2.2,.4,"#8a8478",true);},
 };
 ROOMS.forEach(rm=>{const cx=(rm.x1+rm.x2)/2,cz=(rm.z1+rm.z2)/2,hw=(rm.x2-rm.x1)/2,hd=(rm.z2-rm.z1)/2,N=cz-hd+.95,Z=cz+hd-.95,W=cx-hw+.95,E=cx+hw-.95;
  const f=DECOR[rm.kind];if(f)f({cx,cz,hw,hd,N,Z,W,E,ux:q=>cx+q*(hw-1.4),uz:q=>cz+q*(hd-1.4)});});
 // --- Extérieur selon le thème du terrain
 const gx=MAP.entrance.x,gold=new THREE.MeshBasicMaterial({color:0xffe6a8});
 const tree=(x,z,s)=>{C(x,1.4*s,z,.25*s,.35*s,2.8*s,"#5a3a22",8);const l=M("#2f7a46",{roughness:.9});for(let k=0;k<3;k++){const cn=new THREE.Mesh(new THREE.ConeGeometry((2.1-k*.5)*s,2.4*s,10),l);cn.position.set(x,(3.2+k*1.4)*s,z);cn.castShadow=false;scene.add(cn);}};
 const lamp=(x,z,mat)=>{C(x,1.3,z,.06,.06,2.6,"#222",8);S(x,2.7,z,.2,mat||gold);};
 if(TH.ground==="grass"){ // manoir : pelouse, haies, arbres, allée
  B(0,-.85,0,170,.6,170,M("#ffffff",{map:grassTex,roughness:1}));
  B(gx,-.45,38,5.4,.1,24,"#8b8f99"); // allée d'entrée
  for(let k=0;k<7;k++)B(gx,-.38,29+k*3.3,4,.03,2.4,"#a3a8b3");
  B(0,-.4,0,60,.2,60,"#6f7683"); // trottoir autour de la maison
  const hedge=(x,z,sx,sz)=>B(x,.65,z,sx,1.3,sz,"#2c5a38");
  hedge(0,-32,66,1.4);hedge(-32,0,1.4,66);hedge(32,0,1.4,66);hedge((-33+gx-2)/2,32,(gx-2)+33,1.4);hedge((gx+2+33)/2,32,33-(gx+2),1.4);
  [[-38,-38,1.2],[38,-38,1.3],[-38,10,1],[38,16,1.1],[-37,36,1.3],[37,38,1.2],[-44,-8,1.4],[44,-12,1.3],[0,-42,1.4],[-22,-41,1],[22,-41,1.1],[-20,44,1],[20,45,1.2]].forEach(q=>tree(q[0],q[1],q[2]));
  [[gx-3.4,30],[gx+3.4,30],[gx-3.4,40],[gx+3.4,40]].forEach(q=>lamp(q[0],q[1]));
 }else if(TH.ground==="asphalt"){ // laboratoire : cour bétonnée, clôture, projecteurs, conteneurs
  const ct=concTex.clone();ct.needsUpdate=true;ct.repeat.set(40,40);
  B(0,-.85,0,170,.6,170,M("#8a93a3",{map:ct,roughness:1}));
  B(0,-.4,0,60,.2,60,"#59616f");
  B(gx,-.3,40,7,.04,26,"#20232b");for(let k=0;k<6;k++)B(gx,-.27,30+k*4,.3,.02,2,"#e8b84a");
  const fence=(x,z,sx,sz)=>B(x,.6,z,sx,1.2,sz,"#6b7280");
  fence(0,-32,66,.3);fence(-32,0,.3,66);fence(32,0,.3,66);fence((-33+gx-5)/2,32,(gx-5)+33,.3);fence((gx+5+33)/2,32,33-(gx+5),.3);
  const lightMat=new THREE.MeshBasicMaterial({color:0xfff2c8});
  [[-30,-30],[30,-30],[-30,30],[30,30]].forEach(q=>{C(q[0],2.2,q[1],.08,.08,4.4,"#2b2f38",8);S(q[0],4.5,q[1],.3,lightMat);});
  B(-38,1.3,-18,6,2.6,2.4,"#a8432f",true);B(-38,1.3,-12,6,2.6,2.4,"#2f5fa8",true);B(38,1.3,20,2.4,2.6,6,"#3a7a4a",true);B(38,1.3,27,2.4,2.6,6,"#a8432f",true);
 }else if(TH.ground==="space"){ // vaisseau : vide spatial, étoiles, astéroïdes, rampe d'accès
  B(0,-.85,0,170,.6,170,"#01030a");
  const pts=[];for(let k=0;k<900;k++){const x=rnd(-85,85),z=rnd(-85,85);if(Math.abs(x)<31&&Math.abs(z)<31)continue;pts.push(x,-.4,z);}
  const sg=new THREE.BufferGeometry();sg.setAttribute("position",new THREE.Float32BufferAttribute(pts,3));scene.add(new THREE.Points(sg,new THREE.PointsMaterial({color:0xffffff,size:2,sizeAttenuation:false})));
  B(0,-.3,0,58,.3,58,"#232a3c");
  B(gx,-.1,30,7,.2,6,"#4b5568");B(gx-3.4,.02,30,.2,.05,6,"#e8b84a");B(gx+3.4,.02,30,.2,.05,6,"#e8b84a");
  [[-42,-30,3],[45,-25,2.2],[-48,22,2.6],[40,40,3.4],[-30,48,1.8],[28,-48,2.4]].forEach(q=>{const m=new THREE.Mesh(new THREE.DodecahedronGeometry(q[2],0),MM("#4a4f5c"));m.position.set(q[0],q[2]*.3,q[1]);scene.add(m);});
  const cyan=new THREE.MeshBasicMaterial({color:0x7be0ff});S(gx-3.4,.4,33,.25,cyan);S(gx+3.4,.4,33,.25,cyan);
 }else{ // château : pelouse, douves, pont-levis, arbres, torches
  B(0,-.85,0,170,.6,170,M("#ffffff",{map:grassTex,roughness:1}));
  B(0,-.45,0,68,.2,68,M("#2f6f9a",{roughness:.25,metalness:.1})); // douves
  B(0,-.3,0,58,.2,58,"#7d7566");
  B(gx,-.15,32,5.4,.3,7,"#6a4e3a");for(let k=0;k<6;k++)B(gx,.03,29.2+k*1.1,5.2,.04,.12,"#4a3626");
  B(gx-2.7,.4,32,.2,.8,7,"#4a3626");B(gx+2.7,.4,32,.2,.8,7,"#4a3626");
  [[-44,-40,1.3],[44,-38,1.4],[-46,0,1.2],[47,8,1.3],[-44,40,1.2],[46,42,1.3],[0,-46,1.4],[-24,-46,1.1],[26,-46,1.2]].forEach(q=>tree(q[0],q[1],q[2]));
  const fire=new THREE.MeshBasicMaterial({color:0xff9d35});
  [[gx-3.4,29],[gx+3.4,29],[gx-3.4,35],[gx+3.4,35]].forEach(q=>lamp(q[0],q[1],fire));
 }
}

function collides(x,z){const radius=.52;for(const r of wallRects){const px=Math.max(r.x1,Math.min(x,r.x2)),pz=Math.max(r.z1,Math.min(z,r.z2));if((x-px)**2+(z-pz)**2<radius*radius)return true;}return false;}

function makeNameTag(name){
 const canvas=document.createElement("canvas");canvas.width=512;canvas.height=128;
 const ctx=canvas.getContext("2d");ctx.clearRect(0,0,512,128);
 ctx.fillStyle="rgba(5,12,25,.82)";ctx.strokeStyle="rgba(190,215,255,.85)";ctx.lineWidth=5;
 ctx.beginPath();ctx.roundRect(18,18,476,92,24);ctx.fill();ctx.stroke();
 ctx.fillStyle="#ffffff";ctx.font="bold 46px Arial";ctx.textAlign="center";ctx.textBaseline="middle";
 ctx.shadowColor="#000000";ctx.shadowBlur=8;ctx.fillText(String(name||"Joueur").slice(0,26),256,66,440);
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false}));
 sprite.scale.set(2.7,.68,1);sprite.position.set(0,.22,-.92);sprite.renderOrder=10;
 sprite.userData.nameText=String(name||"Joueur");return sprite;
}
function avatar(p){
 const g=new THREE.Group();const body=new THREE.Mesh(new THREE.CapsuleGeometry(.48,.8,4,8),mat(p.color));body.position.y=1;body.castShadow=true;g.add(body);
 const visor=new THREE.Mesh(new THREE.SphereGeometry(.28,16,10),mat("#bcecff"));visor.position.set(0,1.35,.43);g.add(visor);
 const feet=new THREE.Mesh(new THREE.BoxGeometry(.55,.18,.65),mat(p.color));feet.position.set(0,.15,0);g.add(feet);
 g.userData.color=p.color;g.add(makeNameTag(p.name));scene.add(g);return g;
}
function setGhost(g,on){g.traverse(o=>{if(o.material){o.material.transparent=true;o.material.opacity=on?.45:1;}});}
function setRepairBar(g,prog){
 let bar=g.children.find(o=>o.userData.isRepairBar);
 if(prog==null){if(bar){g.remove(bar);bar.material.map?.dispose();bar.material.dispose();}return;}
 const q=Math.round(prog*20);
 if(bar&&bar.userData.q===q)return;
 if(!bar){const cv=document.createElement("canvas");cv.width=256;cv.height=64;const tex=new THREE.CanvasTexture(cv);tex.colorSpace=THREE.SRGBColorSpace;
  bar=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false,depthWrite:false}));bar.scale.set(2.4,.6,1);bar.position.set(0,2.7,0);bar.renderOrder=11;bar.userData.isRepairBar=true;bar.userData.cv=cv;g.add(bar);}
 const cv=bar.userData.cv,ctx=cv.getContext("2d");ctx.clearRect(0,0,256,64);
 ctx.fillStyle="rgba(5,12,25,.85)";ctx.strokeStyle="rgba(255,255,255,.9)";ctx.lineWidth=4;ctx.beginPath();ctx.roundRect(6,10,244,44,14);ctx.fill();ctx.stroke();
 ctx.fillStyle="#ffd24d";ctx.beginPath();ctx.roundRect(12,16,232*(q/20),32,10);ctx.fill();
 ctx.fillStyle="#fff";ctx.font="bold 22px Arial";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("🔧 "+Math.round(q*5)+" %",128,33);
 bar.userData.q=q;bar.material.map.needsUpdate=true;
}
function updatePlayers(ps,you){const seen=new Set();repairMap.clear();
 for(const p of ps){seen.add(p.id);let g=avatars.get(p.id);
  if(!g){g=avatar(p);g.position.set(p.id===myId?me.x:p.x,0,p.id===myId?me.z:p.z);avatars.set(p.id,g);}
  const tag=g.children.find(o=>o.isSprite&&o.userData.nameText!==undefined);
  if(tag && tag.userData.nameText!==String(p.name||"Joueur")){
   const oldTexture=tag.material.map;const oldMaterial=tag.material;const replacement=makeNameTag(p.name);
   g.remove(tag);g.add(replacement);oldTexture?.dispose();oldMaterial.dispose();
  }
  if(g.userData.color!==p.color){g.userData.color=p.color;g.children.forEach(o=>{if(o.isMesh&&o.material&&o.geometry.type!=="SphereGeometry")o.material.color.set(p.color);});}
  g.userData.target=new THREE.Vector3(p.x,0,p.z);g.userData.rot=p.rot;setGhost(g,!p.alive||!!p.invisible);
  setRepairBar(g,p.alive&&p.repair!=null?p.repair:null);
  if(p.alive&&p.repair!=null&&p.repairTask)repairMap.set(p.repairTask,p.repair);}
 for(const [id,g] of avatars)if(!seen.has(id)){scene.remove(g);avatars.delete(id);}}
// ---------- Objets cassés à réparer (remplacent les anciens repères verts) ----------
function _tn(x){return String(x||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");}
const TASK_CATS=[["wire",/cable|fusible|routeur/],["lamp",/ampoule|lampe|lustre|torche|projecteur|phare/],["pipe",/robinet|tuyau|plomberie|lavabo|douche|pompe|arrosage|fontaine|puits|abreuvoir|valve|alambic|chaudron|soufflet|joint|filtre|cuve|perfusion/],["pane",/fenetre|vitre|volet|store|\bporte|miroir|tableau|lucarne|vitrail|meurtriere|barreaux|\bsas\b|hublot|portique|rampe|escalier|poutre|dalle|rambarde|drapeau|chaine|sarcophage|gouvernail|cloche|carte stellaire/],["seat",/canape|\blit\b|couchette|chaise|\bbanc\b|siege|selle|trone|autel/],["table",/table|bureau|etabli|buffet|commode|console|billard|baby|comptoir|treuil|chariot|enclume/],["cabinet",/armoire|placard|etagere|casier|classeur|rayonnage|caisse|coffre|ratelier|serrure|lingot|tiroir|stalle/]];
function taskCategory(t){if(t.critical)return "panel";const n=_tn(t.name);for(const [c,re] of TASK_CATS)if(re.test(n))return c;return "machine";}
function makeTaskObject(t){
 const cat=taskCategory(t),g=new THREE.Group(),model=new THREE.Group();g.add(model);
 const rnd=i=>{const x=Math.sin(t.id*131.7+i*17.3)*43758.5453;return x-Math.floor(x);};
 const parts=[],dark=new THREE.Color(0x2b1d16),tint=new THREE.Color(.45,.4,.38);
 const add=(geo,color,x,y,z,o={})=>{const mt=o.basic?new THREE.MeshBasicMaterial({color}):new THREE.MeshStandardMaterial({color,roughness:.8});const me=new THREE.Mesh(geo,mt);me.position.set(x,y,z);if(o.rx)me.rotation.x=o.rx;if(o.rz)me.rotation.z=o.rz;me.castShadow=true;(o.parent||model).add(me);
  parts.push({me,base:new THREE.Color(color),broken:o.broken!==undefined?new THREE.Color(o.broken):new THREE.Color(color).multiply(tint).lerp(dark,.25)});return me;};
 const bx=(w,h,d,c,x,y,z,o)=>add(new THREE.BoxGeometry(w,h,d),c,x,y,z,o);
 const cy=(rt,rb,h,c,x,y,z,o)=>add(new THREE.CylinderGeometry(rt,rb,h,14),c,x,y,z,o);
 let topY=1,door=null,doorAngle=0;const debris=new THREE.Group();g.add(debris);
 if(cat==="lamp"){cy(.4,.45,.1,0x555555,0,.05,0);cy(.05,.05,1.3,0x777777,0,.7,0);cy(.25,.5,.45,0xd9b36a,0,1.5,0);add(new THREE.SphereGeometry(.18,12,8),0xffe9a0,0,1.3,0,{basic:true,broken:0x2a2a2a});topY=1.75;}
 else if(cat==="seat"){bx(1.3,.45,.8,0x7a4f35,0,.25,0);bx(1.3,.7,.2,0x6a4330,0,.7,-.4);bx(.2,.6,.8,0x6a4330,-.55,.5,0);bx(.2,.6,.8,0x6a4330,.55,.5,0);bx(1,.15,.6,0xa0584b,0,.55,.05);topY=.8;}
 else if(cat==="table"){bx(1.5,.1,.95,0x8a6a45,0,.8,0);for(const sx of[-1,1])for(const sz of[-1,1])bx(.1,.8,.1,0x6e5233,sx*.65,.4,sz*.38);topY=.86;}
 else if(cat==="cabinet"){bx(1,1.5,.6,0x7b5a3c,0,.75,0);bx(1.06,.06,.66,0x9a7650,0,1.53,0);const pv=new THREE.Group();pv.position.set(-.5,.75,.31);model.add(pv);bx(.5,1.3,.05,0x8d6a47,.25,0,0,{parent:pv});door=pv;doorAngle=1.1;topY=1.6;}
 else if(cat==="pipe"){cy(.13,.13,1.4,0x8a9aa6,0,.5,0,{rz:Math.PI/2});cy(.13,.13,.9,0x8a9aa6,.7,.45,0);add(new THREE.SphereGeometry(.17,12,8),0x8a9aa6,.7,.5,0);add(new THREE.TorusGeometry(.22,.05,8,16),0xcc3b2f,-.2,.78,0,{rx:Math.PI/2});cy(.04,.04,.3,0x8a9aa6,-.2,.65,0);
  const pd=new THREE.Mesh(new THREE.CylinderGeometry(.6,.6,.02,20),new THREE.MeshBasicMaterial({color:0x3d9cff,transparent:true,opacity:.75}));pd.position.set(0,.02,.45);debris.add(pd);topY=.85;}
 else if(cat==="pane"){bx(1.4,1.3,.14,0x7a5a3a,0,.75,0);bx(1.15,1.05,.06,0xaee4ff,0,.75,.05,{broken:0x4a5a66});bx(.25,.1,.7,0x5a4630,-.5,.05,0);bx(.25,.1,.7,0x5a4630,.5,.05,0);topY=1.4;}
 else if(cat==="wire"){bx(.9,1.1,.3,0x5b6670,0,.55,-.2);bx(.7,.05,.5,0x3c444c,0,1.12,-.1);add(new THREE.TorusGeometry(.3,.05,8,18),0xe0a020,0,.06,.55,{rx:Math.PI/2,broken:0x8a1c1c});add(new THREE.TorusGeometry(.2,.05,8,18),0xe0a020,.3,.06,.7,{rx:Math.PI/2,broken:0x8a1c1c});topY=1.15;}
 else if(cat==="panel"){bx(1.3,1.9,.5,0x6e7782,0,.95,0);bx(1.34,.14,.54,0xf2c230,0,1.5,0,{broken:0x7a6418});for(let i=-1;i<=1;i++)bx(.25,.35,.05,0x222222,i*.35,1.1,.27);topY=1.95;}
 else if(cat==="crate"){bx(1,.9,1,0x9a7a45,0,.45,0);topY=1;}
 else {bx(1.2,.9,.85,0x9aa3ad,0,.45,0);bx(.9,.06,.35,0x2c3440,0,.93,.2);bx(.5,.04,.25,0x5fe0ff,0,.97,.2,{basic:true,broken:0x15202a});for(let i=-1;i<=1;i++)cy(.05,.05,.06,i===0?0xd04030:0xdddddd,i*.28,.96,-.1);topY=1;}
 // fissures visibles du dessus (disparaissent à la réparation)
 const cracks=[];for(let i=0;i<3;i++){const c=new THREE.Mesh(new THREE.BoxGeometry(.6,.02,.05),new THREE.MeshBasicMaterial({color:0xff6a2a}));c.position.set((rnd(10+i)-.5)*.5,topY+.03,(rnd(20+i)-.5)*.4);c.rotation.y=rnd(30+i)*3.1;model.add(c);cracks.push(c);}
 // morceaux cassés par terre (ramassés pendant la réparation)
 for(let i=0;i<5;i++){const w=.18+rnd(40+i)*.22,a=rnd(50+i)*6.28,r=.85+rnd(60+i)*.4;const p=new THREE.Mesh(new THREE.BoxGeometry(w,.1,.15+rnd(70+i)*.15),new THREE.MeshStandardMaterial({color:i%2?0x4a3a2c:0x6d6d70,roughness:.9}));p.position.set(Math.cos(a)*r,.06,Math.sin(a)*r);p.rotation.y=rnd(80+i)*3.1;debris.add(p);}
 // étincelles et fumée
 const sparks=[],smoke=[];const sparky=["lamp","machine","wire","panel"].includes(cat),smokey=cat!=="pipe";
 for(let i=0;i<3;i++){const sp=new THREE.Mesh(new THREE.SphereGeometry(.09,8,6),new THREE.MeshBasicMaterial({color:0xffe066}));sp.position.set((rnd(90+i)-.5)*.9,topY+.1+rnd(95+i)*.2,(rnd(100+i)-.5)*.7);sp.visible=false;g.add(sp);sparks.push(sp);}
 for(let i=0;i<3;i++){const sm=new THREE.Mesh(new THREE.SphereGeometry(.22,8,6),new THREE.MeshBasicMaterial({color:sparky?0x6b6b6b:0xb8a88a,transparent:true,opacity:.4,depthWrite:false}));sm.position.set((rnd(110+i)-.5)*.5,topY+.3,(rnd(120+i)-.5)*.4);sm.visible=false;g.add(sm);smoke.push(sm);}
 const yaw=(rnd(5)<.5?-1:1)*(.45+rnd(6)*.4);model.rotation.y=yaw;
 g.userData={model,parts,cracks,debris,sparks,smoke,door,doorAngle,topY,sparky,smokey,yaw,dx:(rnd(7)-.5)*.3,seed:rnd(8)*10,k:0,done:false,wasDone:false,flash:0,name:t.name};
 return g;
}
function updateTasks(tasks){
 const active=new Set();
 for(const t of tasks){active.add(t.id);let m=taskMeshes.get(t.id);
  if(m&&m.userData.name!==t.name){scene.remove(m);taskMeshes.delete(t.id);m=null;}
  if(!m){m=makeTaskObject(t);m.userData.done=!!t.done;m.userData.wasDone=!!t.done;m.userData.k=t.done?1:0;scene.add(m);taskMeshes.set(t.id,m);}
  if(m.userData.done&&!t.done){m.userData.k=0;m.userData.wasDone=false;}
  m.position.set(t.x,0,t.z);m.visible=true;m.userData.done=!!t.done;
 }
 for(const [id,m] of taskMeshes)if(!active.has(id)){scene.remove(m);taskMeshes.delete(id);}
}
// Animation : l'objet cassé « se répare » en direct selon la progression (0 = cassé, 1 = réparé).
function animateTasks(dt,time){
 for(const [id,m] of taskMeshes){const u=m.userData;if(!u.model)continue;
  if(me){m.visible=Math.hypot(m.position.x-me.x,m.position.z-me.z)<=17;if(!m.visible)continue;}
  const rp=repairMap.get(id),working=rp!=null&&!u.done,target=u.done?1:(rp!=null?rp:0);
  u.k+=(target-u.k)*Math.min(1,dt*(target>u.k?12:6));
  const k=Math.min(1,Math.max(0,u.k)),inv=1-k,broken=!u.done&&k<.9;
  u.model.rotation.y=u.yaw*inv;u.model.position.x=u.dx*inv+(working?Math.sin(time*50)*.035:0);
  for(const p of u.parts)p.me.material.color.copy(p.broken).lerp(p.base,k);
  for(const c of u.cracks){c.visible=inv>.03;c.scale.set(Math.max(.001,inv),1,Math.max(.001,inv));}
  for(const c of u.debris.children)c.scale.setScalar(Math.max(.001,inv));
  if(u.door)u.door.rotation.y=u.doorAngle*inv;
  u.sparks.forEach((s,i)=>{const on=(working||(broken&&u.sparky))&&(Math.sin(time*37+i*5.1+u.seed)+Math.sin(time*23+i*2.3))>.6;s.visible=on;if(on)s.material.color.set(working?0xbff3ff:0xffe066);});
  u.smoke.forEach((s,i)=>{const ph=(time*.35+i/3+u.seed)%1;s.visible=broken&&!working&&u.smokey;s.position.y=u.topY+.2+ph;s.scale.setScalar(.6+ph*1.4);s.material.opacity=.45*(1-ph);});
  if(u.done&&!u.wasDone)u.flash=.6;u.wasDone=u.done;if(u.flash>0)u.flash-=dt;
  m.scale.setScalar(1+(u.flash>0?.12*Math.sin(u.flash/.6*Math.PI):0));
 }
}
function startTaskRepair(t){
 if(taskTimer)return;
 taskTarget={id:t.id,x:t.x,z:t.z};taskStartAt=performance.now();sendMsg({type:"taskStart",id:t.id});
 toast.textContent="🔧 Réparation en cours… reste près de la tâche pendant 3 secondes.";
 taskTimer=setTimeout(()=>{taskTimer=null;const tg=taskTarget;taskTarget=null;
  if(!you?.alive||!tg||Math.hypot(me.x-tg.x,me.z-tg.z)>2.8){toast.textContent="Réparation interrompue : reste près de la tâche.";return;}
  sendMsg({type:"task",id:tg.id});},3100);
}
function cancelTaskRepair(msg){if(!taskTimer)return;clearTimeout(taskTimer);taskTimer=null;taskTarget=null;if(msg)toast.textContent=msg;}
function doNearestTask(){if(!you||isImpRole(you.role))return;let best=null,dist=2.8;for(const t of window.currentTasks||[]){if(t.done|| (t.id===2&&window.currentBlackout))continue;const d=Math.hypot(t.x-me.x,t.z-me.z);if(d<dist){dist=d;best=t;}}if(best)startTaskRepair(best);else toast.textContent="Aucune tâche à proximité. Cherche un repère vert.";}
function updateCorpses(cs){const seen=new Set();
 for(const c of cs){seen.add(c.id);let m=corpseMeshes.get(c.id);
  if(!m){m=new THREE.Mesh(new THREE.BoxGeometry(.7,.25,.9),mat("#b83248"));m.material.transparent=true;scene.add(m);corpseMeshes.set(c.id,m);}
  m.position.set(c.x,.18,c.z);m.material.opacity=c.vanishLeft==null?1:Math.max(.15,Math.min(1,c.vanishLeft/2000));m.material.color.set(c.reported?"#ffb347":"#b83248");}
 for(const [id,m] of corpseMeshes)if(!seen.has(id)){scene.remove(m);corpseMeshes.delete(id);}}
const inRect=(r,x,z)=>x>=r.x1&&x<r.x2&&z>=r.z1&&z<r.z2;
const crosses=(ox,oz,nx,nz)=>LOCKS.some(l=>{const r=ROOMS[l.roomId];return r&&inRect(r,ox,oz)!==inRect(r,nx,nz);});
function resolveMove(ox,oz,nx,nz){if(!crosses(ox,oz,nx,nz))return[nx,nz];if(!crosses(ox,oz,nx,oz))return[nx,oz];if(!crosses(ox,oz,ox,nz))return[ox,nz];return[ox,oz];}
function updateLocks(){if(!scene)return;const ids=new Set(LOCKS.map(l=>l.roomId));
 for(const l of LOCKS){if(lockMeshes.has(l.roomId))continue;const r=ROOMS[l.roomId];if(!r)continue;
  const g=new THREE.Group(),m=new THREE.MeshBasicMaterial({color:"#ff2d4a",transparent:true,opacity:.3,side:THREE.DoubleSide,depthWrite:false});
  const w=r.x2-r.x1,d=r.z2-r.z1,cx=(r.x1+r.x2)/2,cz=(r.z1+r.z2)/2;
  [[cx,r.z1,w,.3],[cx,r.z2,w,.3],[r.x1,cz,.3,d],[r.x2,cz,.3,d]].forEach(([x,z,sx,sz])=>{const b=new THREE.Mesh(new THREE.BoxGeometry(sx,4,sz),m);b.position.set(x,2,z);g.add(b);});
  const f=new THREE.Mesh(new THREE.PlaneGeometry(w,d),new THREE.MeshBasicMaterial({color:"#ff2d4a",transparent:true,opacity:.1,depthWrite:false}));f.rotation.x=-Math.PI/2;f.position.set(cx,.06,cz);g.add(f);
  scene.add(g);lockMeshes.set(l.roomId,g);}
 for(const [id,g] of lockMeshes)if(!ids.has(id)){scene.remove(g);lockMeshes.delete(id);}}
function resize(){if(camera?.isOrthographicCamera){const h=curViewH=viewH();camera.left=-h*innerWidth/innerHeight/2;camera.right=h*innerWidth/innerHeight/2;camera.top=h/2;camera.bottom=-h/2;camera.updateProjectionMatrix();}renderer.setSize(innerWidth,innerHeight);}
function animate(){requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.05);
 animateTasks(dt,performance.now()/1000);
 if(me&&you&&gameStarted){
  // Déplacement clavier : flèches directionnelles, ZQSD (AZERTY) et WASD (QWERTY).
  // Les flèches sont relatives à la caméra : haut = avancer, bas = reculer,
  // gauche/droite = déplacement latéral sans inversion de l'axe.
  let forward=(keys["arrowup"]||keys["z"]||keys["w"]?1:0)-(keys["arrowdown"]?1:0);
  let side=(keys["arrowright"]?1:0)-(keys["arrowleft"]||keys["q"]||keys["a"]?1:0);
  const inputLen=Math.hypot(forward,side);if(inputLen>1){forward/=inputLen;side/=inputLen;}
  const speed=keys["shift"]&&(isImpRole(you.role)||!you.alive)?6.2:3.6; // imposteurs et fantômes (morts) peuvent courir
  // Vue aérienne : les commandes restent fixes par rapport à l'écran.
  // Haut = nord de la carte (-Z), bas = +Z, gauche = -X, droite = +X.
  const dx=side*speed*dt;
  const dz=-forward*speed*dt;
  const BD=MAP?MAP.bound:24;let nx=Math.max(-BD,Math.min(BD,me.x+dx)),nz=Math.max(-BD,Math.min(BD,me.z+dz));
  if(you.alive){if(collides(nx,me.z))nx=me.x;if(collides(nx,nz))nz=me.z;if(LOCKS.length)[nx,nz]=resolveMove(me.x,me.z,nx,nz);}
  me.x=nx;me.z=nz;
  if(taskTimer&&taskTarget&&(Math.hypot(me.x-taskTarget.x,me.z-taskTarget.z)>2.8))cancelTaskRepair("Réparation annulée : tu t'es éloigné de la tâche.");
  if(repairTimer && Math.hypot(me.x-PANEL.x,me.z-PANEL.z)>2.8){clearTimeout(repairTimer);repairTimer=null;toast.textContent="Réparation annulée : tu t'es éloigné du tableau.";}
  // En vue de dessus, le personnage s'oriente dans le sens de son déplacement.
  if(inputLen>.05) me.rot=Math.atan2(dx,dz);
  for(const [id,g] of avatars){
   if(id===myId){g.position.set(me.x,0,me.z);const da=Math.atan2(Math.sin(me.rot-g.rotation.y),Math.cos(me.rot-g.rotation.y));g.rotation.y+=da*(1-Math.exp(-14*dt));}
   else if(g.userData.target){g.position.lerp(g.userData.target,Math.min(1,dt*12));const target=g.userData.rot??0;const da=Math.atan2(Math.sin(target-g.rotation.y),Math.cos(target-g.rotation.y));g.rotation.y+=da*(1-Math.exp(-12*dt));}
  }
  // Caméra orthographique verticale, centrée sur le joueur : vue aérienne 2D.
  // Elle ne pivote pas : la carte reste lisible et la vision est circulaire à 360°.
  placeCamera(me.x,me.z);
  const now=performance.now();if(now-lastSend>70){sendMsg({type:"move",x:me.x,z:me.z,rot:me.rot});lastSend=now;}
 }
 {const nowT=performance.now();updateRoute(!!(me&&you&&gameStarted&&mapShowRoute),nowT);updateRepairUi(nowT);if(nowT-lastMapDraw>60){drawMap(nowT);lastMapDraw=nowT;}}
 renderer.render(scene,camera);}
