const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");
const { MAPS, TASK_GOAL, TASK_MIN, TASK_MAX, generateTasks, PANEL_TASK_ID, roomAt: roomAtMap, clientMap, mapList } = require("./maps");
const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, "public");
const rooms = new Map();
let nextId = 1;
let nextCorpse = 1;

// ---------- Réglages par défaut (modifiables en jeu par l'hôte, touche O) ----------
const DEFAULTS = {
  trackerDuration: 10,   // durée de vision du Traceur (s)
  trackerCooldown: 30,   // recharge du Traceur, comptée après la fin de la vision (s)
  corpseVanish: 6,       // délai avant disparition d'un corps (s) — 0 = immédiat
  doorsDuration: 5,      // durée des portes fermées globalement (s)
  doorsCooldown: 25,     // recharge de la fermeture des portes (s)
  invisDuration: 10,     // durée d'invisibilité de l'Invisible (s)
  invisCooldown: 30,     // recharge de l'Invisible après la fin de l'invisibilité (s)
  morphDuration: 10,     // durée de transformation du Métamorphe (s)
  morphCooldown: 30,     // recharge du Métamorphe après la fin de la transformation (s)
  lockDuration: 5,       // durée de fermeture de la salle par le Ferreur (s)
  lockCooldown: 30,      // recharge du Ferreur après chaque fermeture (s)
  lightsCooldown: 45,   // recharge du sabotage électrique par imposteur (s)
  doorsUsesPerGame: 2,  // nombre total de sabotages de portes pour toute l’équipe
  killCooldown: 20,      // recharge du meurtre (s)
  meetingDuration: 20,   // durée de discussion (s)
  buzzerCooldown: 30,    // recharge du buzzer par joueur (s)
  visionRadius: 5,        // portée radiale réduite à 360° (style Among Us)
  taskCount: TASK_GOAL,  // nombre de tâches à accomplir par partie (appliqué au prochain lancement)
  maxPlayers: 10, impostors: 2, enableTracker: true, enableNurse: true, enableAngel: true, enableInfluencer: true, anonymousVotes: false, nurseContactDuration: 15,
  angelDuration: 30,     // durée de la protection de l'Ange gardien (s)
  angelPhotoUses: 1,    // photos du meurtrier qu'un fantôme peut envoyer
  angelCooldown: 45,     // recharge de l'Ange gardien après la fin de la protection (s)
  judgeTasks: 5          // tâches que le Juge doit réparer pour débloquer son pouvoir (0 = dès le début)
};
const LIMITS = {
  taskCount: [TASK_MIN, TASK_MAX], invisDuration: [3, 60], invisCooldown: [0, 300],
  morphDuration: [3, 60], morphCooldown: [0, 300],
  trackerDuration: [1, 120], trackerCooldown: [0, 300], corpseVanish: [0, 120],
  doorsDuration: [1, 60], doorsCooldown: [0, 300], lockDuration: [1, 60], lockCooldown: [0, 300], lightsCooldown: [0, 300], doorsUsesPerGame: [1, 10], killCooldown: [0, 120],
  meetingDuration: [5, 120], buzzerCooldown: [0, 300], visionRadius: [3, 15], maxPlayers: [4, 10], impostors: [1, 3], nurseContactDuration: [5, 60], angelDuration: [5, 120], angelCooldown: [0, 300], angelPhotoUses: [0, 5], judgeTasks: [0, 100]
};
// ---------- Terrains ----------
// Le plan (pièces, portes, tâches, canalisations, tableau électrique) vient de maps.js et dépend du terrain choisi par l'hôte (room.map).
const roomAt = (room, x, z) => roomAtMap(room.map, x, z);
const inRect = (r, x, z) => x >= r.x1 && x < r.x2 && z >= r.z1 && z < r.z2;
const meetingRoomOf = room => room.map.rooms[room.map.meetingRoom];
const panelRoomName = room => room.map.rooms[room.map.panelRoom].name;
const isAngel = p => !p.alive && p.role === "Ange gardien";      // Ange gardien : pouvoir de protection une fois éliminé
const isInfluencer = p => !p.alive && p.role === "Influenceur";  // Influenceur : envoie un objet coloré une fois éliminé
const isImp = role => role === "Imposteur" || role === "Imposteur 3" || role === "Ferreur" || role === "Métamorphe" || role === "Invisible";
// Une salle verrouillée est une barrière : on ne peut ni en sortir ni y entrer (le mouvement qui franchit la limite est annulé).
function lockCrosses(room, ox, oz, nx, nz) { return room.locks.some(l => { const r = room.map.rooms[l.roomId]; return inRect(r, ox, oz) !== inRect(r, nx, nz); }); }
function resolveMove(room, ox, oz, nx, nz) {
  if (!lockCrosses(room, ox, oz, nx, nz)) return [nx, nz];
  if (!lockCrosses(room, ox, oz, nx, oz)) return [nx, oz];
  if (!lockCrosses(room, ox, oz, ox, nz)) return [ox, nz];
  return [ox, oz];
}
// Réparation interrompue si le joueur s'éloigne de la tâche (ou du tableau électrique).
function cancelRepair(room, p) {
  if (p.taskId) { const t = (room.tasks || []).find(q => q.id === p.taskId); if (!t || Math.hypot(t.x-p.x, t.z-p.z) > 2.8) { p.taskId = 0; p.taskStartedAt = 0; } }
  if (p.repairStartedAt && Math.hypot(p.x-room.map.panel.x, p.z-room.map.panel.z) > 2.8) p.repairStartedAt = 0;
}
const REPAIR_MS = 3000;
const MIN_PLAYERS = 4, COUNTDOWN_MS = 5000; // minimum pour lancer, et compte à rebours 5-4-3-2-1 avant le début

const KILL_RANGE = 2.5, REPORT_RANGE = 3, NURSE_RANGE = 4, TICK_MS = 80;
// Les 40 tâches de réparation (et la tâche 2 : le tableau électrique) sont définies par terrain dans maps.js.
let endSeq = 0;
function finishIfNeeded(room) {
  if (!room.started || room.gameOver) return;
  const impostors = room.players.filter(p => isImp(p.role));
  const aliveImpostors = impostors.filter(p => p.alive).length;
  const aliveCrew = room.players.filter(p => !isImp(p.role) && p.alive).length;
  if (aliveImpostors === 0) room.gameOver = {winner:"crew", reason:"Tous les imposteurs ont été démasqués et éliminés !"};
  else if (aliveCrew === 0) room.gameOver = {winner:"impostors", reason:"Les imposteurs ont éliminé tous les autres joueurs !"};
  else if (room.taskGoal > 0 && room.tasksDone.size >= room.taskGoal) room.gameOver = {winner:"crew", reason:"Toutes les tâches ont été accomplies !"};
  if (room.gameOver) {
    // Écran de fin : on révèle les rôles et on marque les gagnants.
    const impWin = room.gameOver.winner === "impostors";
    room.gameOver.id = ++endSeq;
    room.gameOver.players = room.players.map(p => ({ name: p.name, color: p.color, role: p.role, alive: p.alive, winner: isImp(p.role) === impWin }));
  }
  if (room.gameOver) noticeAll(room, room.gameOver.reason + (room.gameOver.winner === "crew" ? " Les joueurs gagnent !" : " Les imposteurs gagnent !"));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/health") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ ok: true, rooms: rooms.size })); }
  let file = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  const p = path.join(ROOT, file);
  if (!p.startsWith(ROOT)) { res.writeHead(403); return res.end("Forbidden"); }
  fs.readFile(p, (e, data) => {
    if (e) { res.writeHead(404); return res.end("Not found"); }
    const ext = path.extname(p);
    res.writeHead(200, { "Content-Type": ext === ".js" ? "text/javascript" : ext === ".css" ? "text/css" : "text/html" });
    res.end(data);
  });
});
const wss = new WebSocketServer({ server });

function send(ws, obj) { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); }
const notice = (p, text) => send(p.ws, { type: "notice", text });
const noticeAll = (room, text) => room.players.forEach(p => notice(p, text));
const left = (t, now) => Math.max(0, t - now);

// ---------- Visibilité : chacun ne voit que son propre déplacement ----------
// Exceptions : salon avant le lancement, joueur éliminé (fantôme), réunion buzzer,
// Traceur pendant son traçage, ou rayon de vision > 0 dans les réglages.
// Rayon de lumière des joueurs (hors imposteurs) pendant une panne : réduit, mais encore large.
const blackoutRadius = room => Math.max(4, room.settings.visionRadius - 0.5);
function playersFor(room, v, now) {
  const all = !room.started || !v.alive || isImp(v.role) || now < room.meetingUntil || now < v.trackUntil;
  // En panne, l'éclairage des joueurs non-imposteurs diminue, mais reste jouable.
  const r = room.powerOut && !isImp(v.role) ? blackoutRadius(room) : room.settings.visionRadius;
  const myRoom = roomAt(room, v.x, v.z);
  return room.players.filter(p => {
    if (p === v) return true;
    // Invisible : caché à tous les joueurs vivants qui ne sont pas imposteurs (même au Traceur).
    if (p.alive && now < (p.invisUntil || 0) && v.alive && !isImp(v.role)) return false;
    if (room.started && !p.alive && v.alive) return false;
    if (all) return true;
    // Vision circulaire à 360° : la distance compte, pas la direction du regard
    // ni l'identifiant de la pièce. 20 unités couvrent environ deux salles voisines.
    return r > 0 && Math.hypot(p.x - v.x, p.z - v.z) <= r;
  }).map(p => {
    // Métamorphe : pendant la transformation, les autres voient le nom et la couleur du joueur imité.
    // Les imposteurs voient la vérité : « vrai nom → nom imité ».
    const mo = p.alive && now < (p.morphUntil || 0);
    const name = mo ? (isImp(v.role) ? p.name + " → " + p.morphName : p.morphName) : p.name;
    // Réparation en cours : visible par tous ceux qui voient ce joueur (barre au-dessus de lui + effet sur la tâche).
    let repair = null, repairTask = 0;
    if (p.alive && room.started && now >= room.meetingUntil) {
      if (p.taskId && !room.tasksDone.has(p.taskId)) { repair = Math.min(1, (now - p.taskStartedAt) / REPAIR_MS); repairTask = p.taskId; }
      else if (p.repairStartedAt && room.powerOut) { repair = Math.min(1, (now - p.repairStartedAt) / REPAIR_MS); repairTask = PANEL_TASK_ID; }
    }
    return { id: p.id, name, color: mo ? p.morphColor : p.color, x: p.x, z: p.z, rot: p.rot, alive: p.alive, invisible: p.alive && now < (p.invisUntil || 0), repair, repairTask };
  });
}

function broadcast(room) {
  const now = Date.now();
  room.players.forEach(p => {
    const seeAll = !room.started || !p.alive || isImp(p.role) || now < room.meetingUntil || now < p.trackUntil;
    const ownRoom = roomAt(room, p.x, p.z);
    const corpses = room.corpses.filter(c => seeAll || (room.settings.visionRadius > 0 && Math.hypot(c.x-p.x,c.z-p.z) <= room.settings.visionRadius)).map(c => ({ id: c.id, name: c.name, x: c.x, z: c.z, conversation: c.conversation, reported: !!c.reporter, vanishLeft: c.vanishAt ? left(c.vanishAt, now) : null }));
    send(p.ws, {
    type: "state", started: room.started, countdownLeft: room.countdownUntil ? Math.max(0, room.countdownUntil - now) : 0, minPlayers: MIN_PLAYERS, host: room.players[0] === p, count: room.players.length, ready: p.ready, roster: room.players.map(q => ({ name:q.name, ready:q.ready, host:room.players[0]===q })),
    settings: room.settings, players: playersFor(room, p, now), corpses, tasks: (room.tasks || []).filter(t => (t.id !== PANEL_TASK_ID || room.powerOut) && (t.id === PANEL_TASK_ID || Math.hypot(t.x-p.x, t.z-p.z) <= 18)).map(t => ({...t,done:t.id === PANEL_TASK_ID ? !room.powerOut : room.tasksDone.has(t.id), critical:t.id === PANEL_TASK_ID})), mapId: room.map.id, taskProgress: room.tasksDone.size, taskGoal: room.taskGoal || 0, lightsOut: room.powerOut && !isImp(p.role), verdict: room.verdict&&now<room.verdict.until?room.verdict:null, voteReveal: room.voteReveal&&now<room.voteReveal.until?{...room.voteReveal,left:room.voteReveal.until-now}:null, blackout: room.powerOut, blackoutRadius: blackoutRadius(room), lightsLeft: 0, doorUsesRemaining: room.doorUsesRemaining, gameOver: room.gameOver, meetingRoster: now < room.meetingUntil ? room.players.filter(q=>q.alive).map(q=>({id:q.id,name:q.name,color:q.color})) : [], votesCast: room.votes?.size || 0, youVoted: room.votes?.has(p.id) || false, meetingPhase: room.meetingPhase || "", phaseLeft: left(room.phaseUntil || 0, now), judgeId: room.judgeId || null, judgeCandidates: room.judgeCandidates || [],
    locks: room.locks.map(l => ({ roomId: l.roomId, left: left(l.until, now) })),
    you: {
      id: p.id, role: p.role, alive: p.alive, x: p.x, z: p.z, tpSeq: p.tpSeq, judgeDone: p.judgeTasksDone || 0,
      cd: { kill: left(p.cd.kill, now), doors: left(p.cd.doors, now), lock: left(p.cd.lock, now), track: left(p.cd.track, now), buzzer: left(p.cd.buzzer, now), morph: left(p.cd.morph || 0, now), invis: left(p.cd.invis || 0, now) },
      invisLeft: p.alive ? left(p.invisUntil || 0, now) : 0,
      morphLeft: p.alive ? left(p.morphUntil || 0, now) : 0, morphAs: p.morphName || "",
      trackLeft: left(p.trackUntil, now), shieldLeft: p.alive ? left(p.shieldUntil || 0, now) : 0,
      angelLeft: isAngel(p) && now < (p.shieldUntil2 || 0) ? left(p.shieldUntil2, now) : 0,
      angelTarget: isAngel(p) && now < (p.shieldUntil2 || 0) ? (room.players.find(q => q.id === p.angelTargetId)?.name || "") : "",
      cdAngel: left(p.cd.angel || 0, now), isAngel: room.settings.enableAngel && isAngel(p), isInfluencer: room.settings.enableInfluencer && isInfluencer(p), knowsKiller: isInfluencer(p) && !!p.killerId, photosLeft: isInfluencer(p) ? Math.max(0, room.settings.angelPhotoUses - (p.photoUsed || 0)) : 0,
      photo: p.photo && now < p.photo.until ? { icon: p.photo.icon, label: p.photo.label, color: p.photo.color, from: p.photo.from, left: left(p.photo.until, now) } : null,
      photoChoices: isInfluencer(p) && p.photoChoices ? p.photoChoices : null, doorsLeft: left(room.doorsUntil, now), meetingLeft: left(room.meetingUntil, now)
    }
    });
  });
}

function makeCorpse(room, victim, hidden, now) {
  if (hidden) return; // portes fermées : le corps disparaît tout de suite, il n'existe jamais
  room.corpses.push({ id: nextCorpse++, victimId: victim.id, killerId: null, name: victim.name, x: victim.x, z: victim.z, reporter: null, conversation: false, reviveUntil: 0, vanishAt: now + room.settings.corpseVanish * 1000 });
}

function cancelCountdown(room, reason) {
  if (!room.countdownTimer) return;
  clearTimeout(room.countdownTimer); room.countdownTimer = null; room.countdownUntil = 0;
  if (reason) noticeAll(room, "⏹ Compte à rebours annulé : " + reason + " L'hôte doit relancer la partie.");
}

function startCountdown(room) {
  room.countdownUntil = Date.now() + COUNTDOWN_MS;
  room.countdownTimer = setTimeout(() => {
    room.countdownTimer = null; room.countdownUntil = 0;
    if (!room.players.length) return;
    if (!startGame(room)) noticeAll(room, "Impossible de lancer : il faut au moins " + MIN_PLAYERS + " joueurs, tous prêts.");
    broadcast(room);
  }, COUNTDOWN_MS);
  noticeAll(room, "⏳ La partie démarre dans 5 secondes…");
  broadcast(room);
}

function startGame(room) {
  if (room.players.length < MIN_PLAYERS || !room.players.every(p => p.ready)) return false;
  const shuffled = room.players.slice().sort(() => Math.random() - .5);
  shuffled.forEach(p => p.role = "Joueur");
  let index = 0;
  const specials = ["Ferreur", "Métamorphe", "Invisible"].sort(() => Math.random() - .5); // rôles spéciaux d'imposteur
  for (let i = 0; i < Math.min(room.settings.impostors, shuffled.length - 1); i++) shuffled[index++].role = specials[i];
  if (room.settings.enableTracker && index < shuffled.length) shuffled[index++].role = "Traceur";
  if (room.settings.enableNurse && index < shuffled.length) shuffled[index++].role = "Infirmier";
  if (room.settings.enableAngel && index < shuffled.length) shuffled[index++].role = "Ange gardien";
  if (room.settings.enableInfluencer && index < shuffled.length) shuffled[index++].role = "Influenceur";
  if (index < shuffled.length) shuffled[index++].role = "Juge";
  room.players.forEach(p => {
    p.alive = true; p.judgeTasksDone = 0; p.repairStartedAt = 0; p.taskId = 0; p.taskStartedAt = 0; p.cd = { kill: 0, doors: 0, lock: 0, track: 0, buzzer: 0, lights: 0, morph: 0, invis: 0, vent: 0, angel: 0 }; p.invisUntil = 0; p.trackUntil = 0; p.shieldUntil = 0; p.shieldUntil2 = 0; p.shieldBy = null; p.angelTargetId = null; p.killerId = null; p.photo = null; p.photoUsed = 0; p.photoChoices = null; p.morphUntil = 0; p.morphName = ""; p.morphColor = "";
    notice(p, "Partie lancée ! Ton rôle : " + p.role);
  });
  gatherAt(room, room.players); // tout le monde démarre dans la salle de réunion du terrain
  room.corpses = []; room.locks = []; room.started = true; room.gameOver = null; room.tasksDone = new Set(); room.tasks = generateTasks(room.map, room.settings.taskCount); room.taskGoal = room.tasks.length - 1; room.lightsOutUntil = 0; room.powerOut = false; room.doorUsesRemaining = room.settings.doorsUsesPerGame;
  room.doorsUntil = 0; room.doorsActive = false; room.meetingUntil = 0; room.meetingActive = false; room.meetingPhase = ""; room.phaseUntil = 0; room.votes = new Map(); room.judgeCandidates=[]; room.judgeId=null;
  return true;
}


// Annonce plein écran après un vote : élimination (rouge) ou personne.
let verdictSeq=0;
const verdict=(room,p)=>{let text="PERSONNE N'A ÉTÉ ÉLIMINÉ";if(p){const n=room.players.filter(q=>q!==p&&q.alive&&isImp(q.role)).length;text=p.name.toUpperCase()+" A ÉTÉ ÉLIMINÉ\n"+(isImp(p.role)?"C'ÉTAIT UN IMPOSTEUR":"N'ÉTAIT PAS UN IMPOSTEUR")+"\n"+(n===0?"IL N'EN RESTE AUCUN":n===1?"IL EN RESTE 1 IMPOSTEUR":"IL EN RESTE "+n+" IMPOSTEURS");}room.verdict={id:++verdictSeq,text,elim:!!p,until:Date.now()+(room.voteReveal&&Date.now()<room.voteReveal.until?room.voteReveal.until-Date.now():0)+4000};};
// Place les joueurs en cercle au centre de la salle de réunion du terrain (le cercle reste dans la pièce).
function gatherAt(room, list) {
  const mr = meetingRoomOf(room), cx = (mr.x1 + mr.x2) / 2, cz = (mr.z1 + mr.z2) / 2;
  const rad = Math.max(1.5, Math.min(4, (mr.x2 - mr.x1) / 2 - 1.3, (mr.z2 - mr.z1) / 2 - 1.3));
  list.forEach((p, i) => { const a = (i / list.length) * Math.PI * 2; p.x = cx + Math.cos(a) * rad; p.z = cz + Math.sin(a) * rad; p.tpSeq++; });
}
function startMeeting(room, headline, now) { // lance une réunion (buzzer ou signalement d'un corps) : tous les vivants sont rassemblés dans la salle de réunion du terrain
  room.players.forEach(q => { q.morphUntil = 0; q.invisUntil = 0; }); // la transformation prend fin au début d'une réunion
  room.meetingUntil = now + (room.settings.meetingDuration+27) * 1000; room.meetingActive = true; room.meetingPhase="discussion"; room.phaseUntil=now+room.settings.meetingDuration*1000; room.votes = new Map(); room.judgeCandidates=[]; room.judgeId=room.players.find(p=>p.alive&&p.role==="Juge")?.id || room.players.find(p=>p.alive&&!isImp(p.role))?.id || null;
  room.doorsUntil = 0; room.doorsActive = false; room.locks = [];
  const alive = room.players.filter(p => p.alive);
  gatherAt(room, alive);
  noticeAll(room, headline + " Discussion : " + room.settings.meetingDuration + " s, vote : 15 s, décision du juge : 12 s.");
}
function endMeeting(room){room.meetingActive=false;room.meetingPhase="";room.meetingUntil=0;room.phaseUntil=0;room.votes?.clear();room.corpses=[];room.judgeCandidates=[];room.judgeId=null;}
let revealSeq=0;
const REVEAL_MS=7000; // durée de l'écran « qui a voté qui »
function finishVote(room){
 { // écran de résultat : qui a voté pour qui (visible par tous pendant quelques secondes)
  const info=q=>q?{id:q.id,name:q.name,color:q.color}:null;
  const rows=room.players.filter(q=>q.alive||room.votes.has(q.id)).map(q=>{const has=room.votes.has(q.id),t=has?room.votes.get(q.id):undefined;
   return {voter:info(q),state:!has?"none":t===null?"pass":"vote",target:t==null?null:info(room.players.find(x=>x.id===t))};});
  room.voteReveal={id:++revealSeq,rows,until:Date.now()+REVEAL_MS};
  if(room.settings.anonymousVotes){ // vote anonyme : on ne révèle que les totaux, jamais qui a voté pour qui
   const tl=new Map();let bl=0,nn=0;
   rows.forEach(r=>{if(r.state==="vote"&&r.target)tl.set(r.target.id,{t:r.target,n:(tl.get(r.target.id)?.n||0)+1});else if(r.state==="pass")bl++;else nn++;});
   room.voteReveal={id:room.voteReveal.id,rows:[],anonymous:true,tally:[...tl.values()],blanks:bl,none:nn,until:room.voteReveal.until};
  }
 }
 const counts=new Map(); for(const target of room.votes.values()) if(target!==null) counts.set(target,(counts.get(target)||0)+1);
 if(!counts.size){noticeAll(room,"Vote terminé : aucun vote valide, personne n'est éliminé.");verdict(room,null);endMeeting(room);return;}
 const judge=room.players.find(p=>p.id===room.judgeId&&p.alive);
 if(!judge){noticeAll(room,"Aucun juge vivant : la réunion se termine sans élimination.");verdict(room,null);endMeeting(room);return;}
 if((judge.judgeTasksDone||0)<room.settings.judgeTasks){noticeAll(room,"⚖ Le juge n'a pas encore débloqué son pouvoir ("+(judge.judgeTasksDone||0)+"/"+room.settings.judgeTasks+" tâches) : personne n'est éliminé.");verdict(room,null);endMeeting(room);return;}
 const max=Math.max(...counts.values()), winners=[...counts].filter(([,n])=>n===max).map(([id])=>id);
 if(winners.length!==1 || max <= room.players.filter(q=>q.alive).length/2){noticeAll(room,"Aucune majorité absolue : le juge peut décider de passer.");room.judgeCandidates=[];}
 else {room.judgeCandidates=winners;noticeAll(room,"⚖ Le juge doit confirmer l'élimination du joueur majoritaire.");}
 room.meetingPhase="judge";room.phaseUntil=Date.now()+REVEAL_MS+12000;
}

function tick(room) {
  const now = Date.now();
  room.corpses = room.corpses.filter(c => {
    if (c.conversation && now > c.reviveUntil) {
      c.conversation = false; c.reporter = null; c.vanishAt = now + room.settings.corpseVanish * 1000;
      noticeAll(room, "La conversation avec " + c.name + " est terminée.");
    }
    return !(c.vanishAt && now >= c.vanishAt);
  });
  room.locks = room.locks.filter(l => {
    if (now < l.until) return true;
    noticeAll(room, "🔓 La porte de la salle « " + room.map.rooms[l.roomId].name + " » se rouvre.");
    return false;
  });
  if (room.doorsActive && now >= room.doorsUntil) { room.doorsActive = false; noticeAll(room, "🚪 Les portes se rouvrent."); }
  
  if (room.meetingActive && now >= room.phaseUntil) {
    if (room.meetingPhase === "discussion") { room.meetingPhase="vote"; room.phaseUntil=now+15000; noticeAll(room,"🗳 Phase de vote : survolez une couleur pour voter, ou passez."); }
    else if (room.meetingPhase === "vote") { finishVote(room); }
    else if (room.meetingPhase === "judge") { const j=room.players.find(p=>p.id===room.judgeId); if(j&&j.alive){j.alive=false;verdict(room,j);noticeAll(room,"⏱ Le juge n'a pas tranché à temps : il est éliminé.");} else verdict(room,null); endMeeting(room); finishIfNeeded(room); }
  }
  broadcast(room);
}

wss.on("connection", ws => {
  let room = null, player = null;
  ws.on("message", raw => {
    let d; try { d = JSON.parse(raw); } catch { return; }
    const now = Date.now();

    if (d.type === "join") {
      if (player) return;
      const code = (d.code || "").toUpperCase().trim() || Math.random().toString(36).slice(2, 6).toUpperCase();
      if (!rooms.has(code)) {
        const r = { code, players: [], corpses: [], settings: { ...DEFAULTS, maxPlayers: Math.max(4, Math.min(10, Number(d.maxPlayers) || DEFAULTS.maxPlayers)) }, started: false, doorsUntil: 0, doorsActive: false, meetingUntil: 0, meetingActive: false, locks: [], tasks: [], taskGoal: 0, tasksDone: new Set(), lightsOutUntil: 0, powerOut: false, doorUsesRemaining: DEFAULTS.doorsUsesPerGame, gameOver: null, map: MAPS[0] };
        r.timer = setInterval(() => tick(r), TICK_MS);
        rooms.set(code, r);
      }
      const r = rooms.get(code);
      if (r.started) return send(ws, { type: "error", message: "Cette partie a déjà commencé. Rejoins un autre salon." });
      if (r.players.length >= r.settings.maxPlayers) return send(ws, { type: "error", message: "Salon plein (" + r.settings.maxPlayers + " joueurs max)." });
      room = r;
      const colors = ["#ff4f67", "#49a6ff", "#35d59a", "#ffd34d", "#ff914d", "#ad78ff", "#ff70c5", "#5de5e8", "#eeeeee", "#9aa6b2"];
      player = {
        id: nextId++, role: "Joueur", name: String(d.name || "Joueur").slice(0, 16),
        color: colors[room.players.length % colors.length], x: (Math.random() - .5) * 5, z: (Math.random() - .5) * 5, rot: 0,
        alive: true, ready: false, ws, cd: { kill: 0, doors: 0, lock: 0, track: 0, buzzer: 0 }, trackUntil: 0, tpSeq: 0
      };
      room.players.push(player);
      cancelCountdown(room, player.name + " a rejoint le salon.");
      send(ws, { type: "joined", code, me: player.id, map: clientMap(room.map), maps: mapList() });
      broadcast(room);
      return;
    }
    if (!room || !player) return;

    switch (d.type) {
      case "move":
      {
        if (!room.started || room.gameOver) return;
        const bd = room.map.bound, nx = Math.max(-bd, Math.min(bd, Number(d.x) || 0)), nz = Math.max(-bd, Math.min(bd, Number(d.z) || 0));
        player.rot = Number(d.rot) || 0;
        if (player.alive && room.doorsActive && roomAt(room,player.x,player.z)?.id !== roomAt(room,nx,nz)?.id) break;
        if (player.alive && room.locks.length) {
          const [rx, rz] = resolveMove(room, player.x, player.z, nx, nz);
          if (rx !== nx || rz !== nz) player.tpSeq++; // porte fermée : on remet le client à sa vraie position
          player.x = rx; player.z = rz;
        } else { player.x = nx; player.z = nz; }
        cancelRepair(room, player);
        break;
      }

      case "setMap": { // L'hôte choisit le terrain (avant le lancement, ou entre deux parties)
        if (room.players[0] !== player) return notice(player, "Seul l'hôte peut choisir le terrain.");
        if (room.started && !room.gameOver) return notice(player, "Le terrain ne peut pas être changé pendant une partie.");
        const m = MAPS.find(q => q.id === d.id);
        if (!m || m === room.map) return;
        room.map = m;
        room.players.forEach(p => send(p.ws, { type: "map", map: clientMap(m), maps: mapList() }));
        noticeAll(room, "🗺 Terrain choisi par l'hôte : « " + m.name + " » (" + m.rooms.length + " pièces).");
        broadcast(room); break;
      }

      case "ready":
        if (room.started) return;
        player.ready = !!d.ready;
        if (!player.ready) cancelCountdown(room, player.name + " n'est plus prêt.");
        broadcast(room);
        break;

      case "start":
        if (room.started && !room.gameOver) return notice(player, "Cette partie est déjà lancée.");
        if (room.gameOver) room.players.forEach(p => { p.ready = true; }); // rejouer : tout le monde est prêt
        if (room.players[0] !== player) return notice(player, "Seul l'hôte peut lancer la partie.");
        if (room.countdownTimer) return notice(player, "Le compte à rebours est déjà en cours.");
        if (room.players.length < MIN_PLAYERS) return notice(player, "Il faut au moins " + MIN_PLAYERS + " joueurs pour lancer la partie.");
        if (!room.players.every(p => p.ready)) return notice(player, "Tous les joueurs doivent être prêts.");
        startCountdown(room);
        break;

      case "settings": {
        if (room.players[0] !== player) return notice(player, "Seul l'hôte peut modifier les réglages.");
        if (d.settings && typeof d.settings === "object") {
          for (const k of ["enableTracker", "enableNurse", "enableAngel", "enableInfluencer", "anonymousVotes"]) if (typeof d.settings[k] === "boolean") room.settings[k] = d.settings[k];
          for (const k in LIMITS) {
            if (k === "maxPlayers" && Number(d.settings[k]) < room.players.length) continue;
            if (k in d.settings) { const v = Number(d.settings[k]); if (Number.isFinite(v)) room.settings[k] = Math.max(LIMITS[k][0], Math.min(LIMITS[k][1], v)); }
          }
        }
        noticeAll(room, "⚙ Réglages mis à jour par l'hôte."); broadcast(room);
        break;
      }

      case "kill": { // Imposteur
        if (!room.started || !player.alive || !isImp(player.role)) return;
        if (now < room.meetingUntil) return notice(player, "Impossible pendant une réunion.");
        if (now < player.cd.kill) return notice(player, "Meurtre en recharge : " + Math.ceil((player.cd.kill - now) / 1000) + " s");
        let target = null, best = KILL_RANGE;
        for (const p of room.players) {
          if (p === player || !p.alive || isImp(p.role)) continue;
          const dist = Math.hypot(p.x - player.x, p.z - player.z);
          if (dist <= best) { best = dist; target = p; }
        }
        if (!target) return notice(player, "Personne à portée.");
        if (now < (target.shieldUntil || 0)) { // protégé par l'Ange gardien
          player.cd.kill = now + room.settings.killCooldown * 1000;
          notice(player, "🛡 " + target.name + " est protégé : le meurtre échoue !");
          notice(target, "🛡 Ton ange gardien t'a sauvé d'une attaque !");
          const angel = room.players.find(q => q.id === target.shieldBy);
          if (angel) notice(angel, "🛡 Ton protégé " + target.name + " vient d'être attaqué : tu l'as sauvé !");
          broadcast(room);
          break;
        }
        target.alive = false; target.killerId = player.id;
        player.cd.kill = now + room.settings.killCooldown * 1000;
        const hidden = now < room.doorsUntil;
        makeCorpse(room, target, hidden, now);
        const createdCorpse = room.corpses[room.corpses.length - 1]; if (createdCorpse) createdCorpse.killerId = player.id;
        notice(target, "💀 Tu as été éliminé. Tu vois maintenant tout le monde (fantôme).");
        notice(player, hidden ? "Portes fermées : le corps de " + target.name + " a disparu." : "Tu as éliminé " + target.name + ".");
        // Événement de meurtre : tout le monde entend le jingle ; seule la victime reçoit l'identité du tueur pour la cinématique (3 s).
        room.players.forEach(p => send(p.ws, p.id === target.id
          ? { type: "kill", role: "victim", killer: { name: player.name, color: player.color }, victim: { name: target.name, color: target.color } }
          : { type: "kill", role: p.id === player.id ? "killer" : "witness" }));
        finishIfNeeded(room); broadcast(room);
        break;
      }

      case "doors": // Sabotage commun des portes : deux utilisations pour toute l'équipe (un imposteur éliminé peut encore saboter)
        if (!room.started || room.gameOver || !isImp(player.role)) return;
        if (now < room.meetingUntil) return notice(player, "Impossible pendant une réunion.");
        if (room.doorUsesRemaining <= 0) return notice(player, "Les imposteurs ont déjà utilisé leurs deux fermetures de portes.");
        if (room.doorsActive && now < room.doorsUntil) return notice(player, "Les portes sont déjà fermées.");
        room.doorUsesRemaining--;
        room.doorsUntil = now + room.settings.doorsDuration * 1000; room.doorsActive = true;
        noticeAll(room, "🚪 Les imposteurs ferment toutes les portes ! Il reste " + room.doorUsesRemaining + " utilisation(s) pour l'équipe.");
        broadcast(room);
        break;

      case "morph": { // Pouvoir du Métamorphe : prend l'apparence du joueur le plus proche
        if (!room.started || room.gameOver || !player.alive || player.role !== "Métamorphe") return;
        if (now < room.meetingUntil) return notice(player, "Impossible de te transformer pendant une réunion.");
        if (now < (player.cd.morph || 0)) return notice(player, "Transformation en recharge : " + Math.ceil((player.cd.morph - now) / 1000) + " s");
        let best = null, bd = 10;
        for (const q of room.players) { if (q === player || !q.alive) continue; const dd = Math.hypot(q.x - player.x, q.z - player.z); if (dd < bd) { bd = dd; best = q; } }
        if (!best) return notice(player, "Aucun joueur à imiter à proximité.");
        const dur = room.settings.morphDuration;
        player.morphUntil = now + dur * 1000; player.morphName = best.name; player.morphColor = best.color;
        player.cd.morph = now + (dur + room.settings.morphCooldown) * 1000;
        notice(player, "🎭 Tu as pris l'apparence de " + best.name + " pendant " + dur + " secondes.");
        broadcast(room); break;
      }

      case "invis": { // Pouvoir de l'Invisible : disparaît (et peut tuer) pendant quelques secondes
        if (!room.started || room.gameOver || !player.alive || player.role !== "Invisible") return;
        if (now < room.meetingUntil) return notice(player, "Impossible pendant une réunion.");
        if (now < (player.cd.invis || 0)) return notice(player, "Invisibilité en recharge : " + Math.ceil((player.cd.invis - now) / 1000) + " s");
        const dur = room.settings.invisDuration;
        player.invisUntil = now + dur * 1000; player.cd.invis = now + (dur + room.settings.invisCooldown) * 1000;
        notice(player, "👻 Tu es invisible pendant " + dur + " secondes. Tu peux tuer (F).");
        broadcast(room); break;
      }

      case "vent": { // Canalisations : imposteurs et Anges gardiens
        const angelVent = (room.settings.enableAngel && isAngel(player)) || (room.settings.enableInfluencer && isInfluencer(player)); // l'Ange gardien (fantôme) peut aussi les utiliser
        if (!room.started || room.gameOver || !(angelVent || (player.alive && isImp(player.role)))) return;
        if (now < room.meetingUntil) return notice(player, "Impossible pendant une réunion.");
        if (now < (player.cd.vent || 0)) return;
        const v = room.map.vents.find(q => Math.hypot(q.x - player.x, q.z - player.z) <= 2.2);
        if (!v) return notice(player, "Approche-toi d'une canalisation (cercle noir).");
        const to = room.map.vents[v.partner];
        player.x = to.x; player.z = to.z; player.tpSeq++; player.cd.vent = now + 1500;
        notice(player, "🕳 Tu voyages par la canalisation vers « " + roomAt(room, to.x, to.z).name + " ».");
        broadcast(room); break;
      }

      case "lock": { // Pouvoir spécial du Ferreur : fermeture locale illimitée avec recharge
        if (!room.started || !player.alive || player.role !== "Ferreur") return;
        if (now < room.meetingUntil) return notice(player, "Impossible pendant une réunion.");
        if (now < player.cd.lock) return notice(player, "Pouvoir du Ferreur en recharge : " + Math.ceil((player.cd.lock-now)/1000) + " s");
        const rm = roomAt(room, player.x, player.z);
        if (!rm) return notice(player, "Tu n'es dans aucune salle.");
        if (room.locks.some(l => l.roomId === rm.id)) return notice(player, "Cette salle est déjà verrouillée.");
        room.locks.push({ roomId: rm.id, until: now + room.settings.lockDuration * 1000, by: player.id });
        player.cd.lock = now + room.settings.lockCooldown * 1000;
        noticeAll(room, "🔒 Le Ferreur ferme les portes de la salle « " + rm.name + " » pour " + room.settings.lockDuration + " secondes !");
        broadcast(room);
        break;
      }

      case "track": // Traceur
        if (!room.started || !player.alive || player.role !== "Traceur") return;
        if (now < player.cd.track) return notice(player, "Traçage en recharge : " + Math.ceil((player.cd.track - now) / 1000) + " s");
        player.trackUntil = now + room.settings.trackerDuration * 1000;
        player.cd.track = now + (room.settings.trackerDuration + room.settings.trackerCooldown) * 1000;
        notice(player, "👁 Traçage actif : tu vois tout le monde pendant " + room.settings.trackerDuration + " s.");
        broadcast(room);
        break;

      case "protect": { // Ange gardien : protège le joueur le plus proche
        if (!room.started || room.gameOver || !room.settings.enableAngel || !isAngel(player)) return;
        if (now < room.meetingUntil) return notice(player, "Impossible pendant une réunion.");
        if (now < (player.cd.angel || 0)) return notice(player, "Protection en recharge : " + Math.ceil((player.cd.angel - now) / 1000) + " s");
        let target = null, best = NURSE_RANGE;
        for (const p of room.players) {
          if (p === player || !p.alive) continue;
          const dist = Math.hypot(p.x - player.x, p.z - player.z);
          if (dist <= best) { best = dist; target = p; }
        }
        if (!target) return notice(player, "Personne à portée pour être protégé.");
        const dur = room.settings.angelDuration * 1000;
        target.shieldUntil = now + dur; target.shieldBy = player.id;
        player.shieldUntil2 = now + dur; player.angelTargetId = target.id;
        player.cd.angel = now + (room.settings.angelDuration + room.settings.angelCooldown) * 1000;
        notice(player, "🛡 Tu protèges " + target.name + " pendant " + room.settings.angelDuration + " s.");
        notice(target, "🛡 Un ange gardien (un joueur éliminé) te protège pendant " + room.settings.angelDuration + " s !");
        broadcast(room);
        break;
      }

      case "influence": { // Influenceur (fantôme) : P près d'un vivant ouvre la liste d'objets colorés, puis P valide le choix
        if (!room.started || room.gameOver || !room.settings.enableInfluencer || !isInfluencer(player)) return;
        if (now < room.meetingUntil) return notice(player, "Impossible pendant une réunion.");
        const nearest = () => { let t = null, best = NURSE_RANGE; for (const p of room.players) { if (p === player || !p.alive) continue; const dist = Math.hypot(p.x - player.x, p.z - player.z); if (dist <= best) { best = dist; t = p; } } return t; };
        if (!player.photoChoices) { // 1er appui sur P : ouvrir la liste
          const killer = room.players.find(q => q.id === player.killerId);
          if (!killer) return notice(player, "Tu ne connais pas ton meurtrier : tu n'as pas été tué par un imposteur.");
          if ((player.photoUsed || 0) >= room.settings.angelPhotoUses) return notice(player, "Tu as déjà envoyé tous tes objets.");
          const target = nearest();
          if (!target) return notice(player, "Approche-toi d'un joueur vivant, puis appuie sur P.");
          const OBJECTS = [["🔑","Clé"],["🕯️","Bougie"],["🎩","Chapeau"],["📕","Livre"],["🧸","Peluche"],["🔔","Cloche"],["🕰️","Horloge"],["🎒","Sac"],["🔦","Lampe"],["☂️","Parapluie"]].sort(() => Math.random() - .5);
          const colors = [killer.color];
          for (const q of room.players.slice().sort(() => Math.random() - .5)) if (colors.length < 5 && q !== killer && !colors.includes(q.color)) colors.push(q.color);
          player.photoChoices = colors.sort(() => Math.random() - .5).map((color, k) => ({ icon: OBJECTS[k][0], label: OBJECTS[k][1], color }));
          player.photoTargetId = target.id;
          notice(player, "📷 Liste des objets affichée : choisis celui qui a la couleur de ton meurtrier (touches 1-" + colors.length + "), puis appuie encore sur P pour valider.");
          return broadcast(room);
        }
        // 2e appui sur P : valider l'objet choisi
        const choice = player.photoChoices[Number(d.index)];
        if (!choice) return notice(player, "Choisis d'abord un objet (touches 1 à " + player.photoChoices.length + ").");
        const target = room.players.find(q => q.id === player.photoTargetId && q.alive);
        if (!target || Math.hypot(target.x - player.x, target.z - player.z) > NURSE_RANGE * 1.5) { player.photoChoices = null; return notice(player, "Le joueur n'est plus à portée : recommence en t'approchant d'un joueur vivant."); }
        player.photoUsed = (player.photoUsed || 0) + 1; player.photoChoices = null;
        target.photo = { icon: choice.icon, label: choice.label, color: choice.color, from: player.name, until: now + 20000 };
        notice(player, "📷 Objet « " + choice.label + " » envoyé à " + target.name + ".");
        notice(target, "📷 " + player.name + " (éliminé) t'envoie un objet : sa couleur est celle de son meurtrier !");
        broadcast(room);
        break;
      }

      case "influencecancel": // Échap : referme la liste d'objets
        if (player.photoChoices) { player.photoChoices = null; broadcast(room); }
        break;

      case "vote": {
        if (!room.started || room.gameOver || !player.alive || room.meetingPhase !== "vote") return;
        if (room.votes.has(player.id)) return;
        let targetId = d.pass ? null : Number(d.target);
        if (targetId!==null && !room.players.some(q=>q.id===targetId&&q.alive)) return;
        room.votes.set(player.id,targetId);
        notice(player,targetId===null?"Vote blanc enregistré.":"Vote enregistré.");
        const voters=room.players.filter(q=>q.alive);
        if(room.votes.size>=voters.length) finishVote(room);
        broadcast(room); break;
      }
      case "judgeNow": { // le juge, pendant la phase de vote, choisit de JUGER au lieu de voter : sa décision clôt la réunion
        if(!room.started||room.gameOver||!room.meetingActive||room.meetingPhase!=="vote"||player.id!==room.judgeId||!player.alive)return;
        if((player.judgeTasksDone||0)<room.settings.judgeTasks)return notice(player,"Ton pouvoir de juge n'est pas encore débloqué ("+(player.judgeTasksDone||0)+"/"+room.settings.judgeTasks+" tâches).");
        const target=room.players.find(q=>q.id===Number(d.target)&&q.alive&&q!==player);
        if(!target)return;
        if(isImp(target.role)){target.alive=false;verdict(room,target);noticeAll(room,"⚖ Le juge a tranché : "+target.name+" est démasqué ! Rôle : "+target.role+".");}
        else {player.alive=false;verdict(room,player);noticeAll(room,"❌ Mauvais verdict ! Le juge a accusé un innocent ("+target.name+") et est lui-même éliminé.");}
        endMeeting(room);finishIfNeeded(room);broadcast(room);break;
      }
      case "judge": {
        if(!room.meetingActive||room.meetingPhase!=="judge"||player.id!==room.judgeId||!player.alive)return;
        if((player.judgeTasksDone||0)<room.settings.judgeTasks)return notice(player,"Ton pouvoir de juge n'est pas encore débloqué.");
        if(d.pass){noticeAll(room,"Le juge a décidé de ne procéder à aucune élimination.");verdict(room,null);endMeeting(room);break;}
        const target=room.players.find(q=>q.id===Number(d.target)&&q.alive);
        if(!target||!room.judgeCandidates.includes(target.id))return;
        if(isImp(target.role)){target.alive=false;verdict(room,target);noticeAll(room,"⚖ Le juge a correctement démasqué "+target.name+" ! Rôle : "+target.role+".");}
        else {player.alive=false;verdict(room,player);noticeAll(room,"❌ Mauvais verdict ! Le juge a éliminé un innocent et est lui-même éliminé.");}
        endMeeting(room);finishIfNeeded(room);broadcast(room);break;
      }

      case "repairStart": {
        if (!room.started || room.gameOver || !room.powerOut || !player.alive || isImp(player.role)) return;
        if (Math.hypot(player.x-room.map.panel.x,player.z-room.map.panel.z)>2.8) return notice(player,"Approche-toi du tableau électrique.");
        player.repairStartedAt=now;
        notice(player,"🔧 Reste près du tableau pendant 3 secondes…");
        break;
      }

      case "taskStart": { // un joueur normal éliminé (fantôme) peut encore réparer des tâches
        if (!room.started || room.gameOver || isImp(player.role)) return;
        const task = (room.tasks || []).find(t => t.id === Number(d.id));
        if (!task || task.id === PANEL_TASK_ID || room.tasksDone.has(task.id)) return;
        if (Math.hypot(task.x-player.x, task.z-player.z) > 2.8) return notice(player, "Approche-toi de la tâche pour la réparer.");
        if (player.taskId === task.id) return;
        player.taskId = task.id; player.taskStartedAt = now;
        break;
      }

      case "task": {
        if (!room.started || room.gameOver || isImp(player.role)) return;
        const task = (room.tasks || []).find(t => t.id === Number(d.id));
        if (!task) return;
        if (Math.hypot(task.x-player.x, task.z-player.z) > 2.8) return notice(player, "Approche-toi de la tâche pour la réparer.");
        if (task.id === PANEL_TASK_ID) {
          if (!room.powerOut || !player.alive) return; // le tableau électrique reste réservé aux vivants
          if (!player.repairStartedAt || now-player.repairStartedAt<2900 || Math.hypot(player.x-room.map.panel.x,player.z-room.map.panel.z)>2.8) return notice(player,"La réparation doit durer 3 secondes près du tableau. Appuie sur R.");
          player.repairStartedAt=0;
          room.powerOut = false;
          noticeAll(room, "💡 " + player.name + " a réparé le tableau électrique ! Toute la lumière est rétablie.");
        } else {
          if (room.tasksDone.has(task.id)) return;
          if (player.taskId !== task.id || now - player.taskStartedAt < 2900) return notice(player, "La réparation doit durer 3 secondes. Reste près de la tâche.");
          player.taskId = 0; player.taskStartedAt = 0;
          room.tasksDone.add(task.id);
          player.judgeTasksDone = (player.judgeTasksDone || 0) + 1; // compte pour débloquer le pouvoir du Juge
          room.players.forEach(q => { if (q.taskId === task.id) { q.taskId = 0; q.taskStartedAt = 0; } });
          noticeAll(room, "🔧 " + player.name + " a terminé : " + task.name + " (" + room.tasksDone.size + "/" + room.taskGoal + ").");
        }
        finishIfNeeded(room); broadcast(room); break;
      }

      case "lights": { // un imposteur éliminé peut encore couper le courant
        if (!room.started || room.gameOver || !isImp(player.role)) return;
        if (room.powerOut) return notice(player, "Le courant est déjà coupé. Un joueur doit réparer le tableau électrique.");
        if (now < (player.cd.lights || 0)) return notice(player, "Sabotage électrique en recharge : " + Math.ceil((player.cd.lights-now)/1000) + " s");
        room.powerOut = true; player.cd.lights = now + room.settings.lightsCooldown * 1000;
        noticeAll(room, "⚡ Les imposteurs ont coupé le courant ! Allez réparer le tableau dans la " + panelRoomName(room) + "."); broadcast(room); break;
      }

      case "buzzer": { // Réunion d'urgence
        if (!room.started || !player.alive) return;
        if (now < room.meetingUntil) return notice(player, "Une réunion est déjà en cours.");
        if (roomAt(room, player.x, player.z)?.id !== room.map.meetingRoom) return notice(player, "Le buzzer se trouve dans la salle « " + meetingRoomOf(room).name + " » : rends-toi là-bas pour déclencher une réunion.");
        if (room.powerOut) return notice(player, "Impossible de buzzer : le courant est coupé. Réparez d'abord le tableau électrique.");
        if (room.doorsActive && now < room.doorsUntil || room.locks.length) return notice(player, "Impossible de buzzer : des portes sont encore fermées.");
        if (now < player.cd.buzzer) return notice(player, "Buzzer en recharge : " + Math.ceil((player.cd.buzzer - now) / 1000) + " s");
        player.cd.buzzer = now + room.settings.buzzerCooldown * 1000;
        startMeeting(room, "🔔 " + player.name + " a appuyé sur le buzzer !", now);
        broadcast(room);
        break;
      }

      case "testkill": // test : l'hôte se tue lui-même pour essayer corps / signalement
        if (room.players[0] !== player || !player.alive) return;
        player.alive = false;
        makeCorpse(room, player, now < room.doorsUntil, now);
        broadcast(room);
        break;

      case "report": { // Signaler un corps : convoque immédiatement la réunion (sans condition de salle, de courant ni de portes)
        if (!room.started || room.gameOver || !player.alive) return;
        if (now < room.meetingUntil) return;
        const c = room.corpses.find(c => Math.hypot(c.x - player.x, c.z - player.z) < REPORT_RANGE);
        if (!c) return notice(player, "Aucun corps à signaler à proximité.");
        startMeeting(room, "🚨 " + player.name + " a signalé le corps de " + c.name + " !", now);
        broadcast(room); break;
      }

      case "nurse": {
        if (player.role !== "Infirmier") return notice(player, "Seul l'infirmier peut intervenir.");
        if (!player.alive) return;
        const c = room.corpses.find(c => c.reporter && Math.hypot(c.x - player.x, c.z - player.z) < NURSE_RANGE && !c.conversation);
        if (c) {
          c.conversation = true; c.reviveUntil = now + room.settings.nurseContactDuration * 1000; c.vanishAt = 0;
          notice(player, "Contact privé avec " + c.name + " lancé : " + room.settings.nurseContactDuration + " secondes.\nMeurtrier : " + (room.players.find(p => p.id === c.killerId)?.name || "inconnu") + ". Appuie sur R pour arrêter.");
          room.players.forEach(p => { if (p !== player) notice(p, "L'infirmier parle avec " + c.name + " (risque d'être attaqué !)"); });
          broadcast(room);
        }
        break;
      }

      case "stopnurse": {
        const c = room.corpses.find(c => c.conversation);
        if (c) { c.conversation = false; c.reporter = null; c.vanishAt = now + room.settings.corpseVanish * 1000; notice(player, "Conversation arrêtée."); broadcast(room); }
        break;
      }

      case "chat": {
        const text = String(d.text || "").trim().slice(0, 180); if (!text) break;
        const channel = d.channel || "room";
        let recipients = [];
        if (channel === "room") { if (room.started) return notice(player, "Le chat du salon est fermé pendant la partie."); recipients = room.players; }
        else if (channel === "living") { if (!room.started || !player.alive || room.meetingUntil <= now) return notice(player, "Le chat des vivants est réservé aux réunions."); recipients = room.players.filter(p => p.alive); }
        else if (channel === "ghost") { if (!room.started || player.alive) return notice(player, "Le chat fantôme est réservé aux joueurs éliminés."); recipients = room.players.filter(p => !p.alive); }
        else if (channel === "nurse") { const c = room.corpses.find(c => c.conversation && now < c.reviveUntil); if (!c || (player.role !== "Infirmier" && player.id !== c.victimId)) return notice(player, "Aucun contact infirmier privé actif."); recipients = room.players.filter(p => p.role === "Infirmier" || p.id === c.victimId); }
        else return;
        recipients.forEach(p => send(p.ws, { type: "chat", channel, name: player.name, color: player.color, text }));
        break;
      }
    }
  });

  ws.on("close", () => {
    if (!room || !player) return;
    room.players = room.players.filter(p => p !== player);
    if (!room.players.length) { cancelCountdown(room); clearInterval(room.timer); rooms.delete(room.code); } else { cancelCountdown(room, player.name + " a quitté le salon."); finishIfNeeded(room); broadcast(room); } // un départ peut mettre fin à la partie
  });
});
server.listen(PORT, "0.0.0.0", () => console.log(`Imposteurs 3D server: http://localhost:${PORT}`));
