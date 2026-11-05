// Commandes tactiles : joystick + boutons d'action. Elles simulent le clavier,
// donc game.js n'a pas besoin de connaître le tactile.
(()=>{
const IS_TOUCH=matchMedia("(pointer:coarse)").matches||/[?&]touch=1/.test(location.search);
if(!IS_TOUCH)return;
document.documentElement.classList.add("touch");
const $=s=>document.querySelector(s);
const el=(tag,id,cls,html)=>{const e=document.createElement(tag);if(id)e.id=id;if(cls)e.className=cls;if(html!=null)e.innerHTML=html;return e;};
const press=(k,down)=>document.dispatchEvent(new KeyboardEvent(down?"keydown":"keyup",{key:k,bubbles:true}));
const tap=k=>{press(k,true);setTimeout(()=>press(k,false),60);};
const IMP=["Imposteur","Imposteur 3","Ferreur","Métamorphe","Invisible"];

// Empêche le zoom par pincement / double-tap
["gesturestart","gesturechange","gestureend"].forEach(t=>document.addEventListener(t,e=>e.preventDefault()));
document.addEventListener("contextmenu",e=>{if(e.target.closest&&e.target.closest("#touchUI"))e.preventDefault();});

// ---- Conteneur ----
const ui=el("div","touchUI");document.body.appendChild(ui);
const stick=el("div","stick",null,'<div id="knob"></div>');
const actions=el("div","touchActions");
const misc=el("div","touchMisc");
const chatBtn=el("button","chatToggle","tbtn","💬");
const fsBtn=el("button","fsToggle","tbtn","⛶");
misc.append(fsBtn,chatBtn);
ui.append(stick,actions,misc);

// ---- Joystick (8 directions → flèches du clavier) ----
const knob=stick.querySelector("#knob"),held=new Set();let pid=null;
function setDirs(dx,dy){
  const want=new Set();
  if(Math.hypot(dx,dy)>.3){if(dy<-.38)want.add("arrowup");if(dy>.38)want.add("arrowdown");if(dx<-.38)want.add("arrowleft");if(dx>.38)want.add("arrowright");}
  for(const k of [...held])if(!want.has(k)){press(k,false);held.delete(k);}
  for(const k of want)if(!held.has(k)){press(k,true);held.add(k);}
}
function move(e){
  const r=stick.getBoundingClientRect(),R=r.width/2;
  let dx=(e.clientX-(r.left+R))/R,dy=(e.clientY-(r.top+R))/R;const m=Math.hypot(dx,dy);if(m>1){dx/=m;dy/=m;}
  knob.style.transform=`translate(${dx*R*.55}px,${dy*R*.55}px)`;setDirs(dx,dy);
}
stick.addEventListener("pointerdown",e=>{if(pid!==null)return;pid=e.pointerId;stick.setPointerCapture(pid);move(e);e.preventDefault();});
stick.addEventListener("pointermove",e=>{if(e.pointerId===pid)move(e);});
const endStick=e=>{if(e.pointerId!==pid)return;pid=null;knob.style.transform="";setDirs(0,0);};
stick.addEventListener("pointerup",endStick);stick.addEventListener("pointercancel",endStick);
window.addEventListener("blur",()=>{pid=null;knob.style.transform="";setDirs(0,0);});

// ---- Boutons d'action selon le rôle ----
function listFor(y){
  const imp=IMP.includes(y.role),a=[];
  if(y.alive){
    if(imp){
      a.push(["f","🔪","Tuer","imp"]);
      if(y.role==="Ferreur")a.push(["v","🔒","Fermer","imp"]);
      if(y.role==="Métamorphe")a.push(["c","🎭","Imiter","imp"]);
      if(y.role==="Invisible")a.push(["i","👻","Invisible","imp"]);
      a.push(["s","⚡","Courant","imp"],["d","🚪","Portes","imp"],["x","🕳","Bouche","imp"]);
    }else{
      a.push(["g","🔧","Tâche"]);
      if(window.currentBlackout)a.push(["r","💡","Courant"]);
      else if(y.role==="Infirmier")a.push(["r","✖","Stop"]);
    }
    a.push(["e","🚨","Signaler"],["b","🔔","Buzzer"]);
    if(y.role==="Traceur")a.push(["t","📡","Tracer"]);
    if(y.role==="Infirmier")a.push(["n","⛑","Contact"]);
  }else{
    if(imp)a.push(["s","⚡","Courant","imp"],["d","🚪","Portes","imp"]);else a.push(["g","🔧","Tâche"]);
    if(y.isAngel)a.push(["p","🛡","Protéger"]);
    if(y.isInfluencer){
      a.push(["p","📣","Photo"]);
      if(y.photoChoices){for(let i=1;i<=y.photoChoices.length;i++)a.push([String(i),String(i),"Choix"]);a.push(["escape","✖","Annuler"]);}
    }
    if(y.isAngel||y.isInfluencer)a.push(["x","🕳","Bouche"]);
  }
  if(imp||!y.alive)a.push(["shift","🏃","Courir",imp?"imp hold":"hold"]);
  return a;
}
let sig="";
function build(list){
  actions.innerHTML="";
  for(const [k,ic,label,cls] of list){
    const b=el("button",null,"tbtn act "+(cls||""),`<span>${ic}</span><small>${label}</small>`);
    if((cls||"").includes("hold")){
      b.addEventListener("pointerdown",e=>{b.setPointerCapture(e.pointerId);b.classList.add("down");press(k,true);e.preventDefault();});
      const up=()=>{b.classList.remove("down");press(k,false);};
      b.addEventListener("pointerup",up);b.addEventListener("pointercancel",up);
    }else{
      b.addEventListener("pointerdown",e=>{b.classList.add("down");tap(k);e.preventDefault();});
      const up=()=>b.classList.remove("down");b.addEventListener("pointerup",up);b.addEventListener("pointercancel",up);b.addEventListener("pointerleave",up);
    }
    actions.appendChild(b);
  }
}

// ---- Plein écran / chat ----
const canFS=!!document.documentElement.requestFullscreen;
if(!canFS)fsBtn.style.display="none";
async function goFS(){try{if(!document.fullscreenElement){await document.documentElement.requestFullscreen({navigationUI:"hide"});}try{await screen.orientation.lock("landscape");}catch(_){}}catch(_){}}
fsBtn.onclick=()=>{if(document.fullscreenElement)document.exitFullscreen();else goFS();};
chatBtn.onclick=()=>document.body.classList.toggle("chatopen");
$("#join")?.addEventListener("click",goFS);

// ---- Message « tourne ton téléphone » ----
const rot=el("div","rotateHint",null,'<div><div style="font-size:54px">📱↻</div><b>Tourne ton téléphone</b><p>Le jeu se joue en mode paysage.</p><button id="rotOk" class="small ghost">Jouer quand même</button></div>');
document.body.appendChild(rot);let rotDismissed=false;rot.querySelector("#rotOk").onclick=()=>{rotDismissed=true;rot.style.display="none";};

// ---- Mise à jour périodique ----
function tick(){
  const y=window.__you,started=!!window.__gameStarted,inGame=$("#game")&&$("#game").style.display==="block";
  const meeting=document.body.classList.contains("meeting");
  const playing=inGame&&started&&y&&!meeting;
  stick.style.display=playing?"block":"none";
  actions.style.display=playing?"flex":"none";
  misc.style.display=inGame&&!meeting?"flex":"none";
  if(playing){const l=listFor(y),s=JSON.stringify(l);if(s!==sig){sig=s;build(l);}}
  else if(held.size)setDirs(0,0);
  if(meeting)document.body.classList.remove("chatopen");
  rot.style.display=(!rotDismissed&&inGame&&started&&matchMedia("(orientation:portrait)").matches)?"flex":"none";
}
setInterval(tick,200);tick();
})();
