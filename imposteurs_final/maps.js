// ---------- Terrains jouables ----------
// Chaque terrain est une grille de pièces (colonnes xs x rangées zs) dans un carré de 54 x 54 (de -27 à 27).
// Les portes sont percées au milieu de chaque cloison entre deux pièces voisines, sauf celles listées dans « noDoor ».
// Le serveur calcule tout (pièces, portes, tâches, canalisations, tableau électrique) et envoie le plan aux clients.
const DOOR_HALF = 1.1;
const TASK_GOAL = 200;         // nombre de tâches par défaut (réglable par l'hôte : 10 à 300, touche O)
const TASK_MIN = 10, TASK_MAX = 300;
const TASK_SPACING = 2.2;      // distance minimale entre deux objets à réparer
const TASK_ID_BASE = 100;
const PANEL_TASK_ID = 2;       // tâche spéciale : réparer le tableau électrique

// Tâches de réparation par type de pièce (3 noms possibles, 2 ou 3 sont utilisés selon le terrain).
const KIND_TASKS = {
  terrace: ["Réparer la rambarde", "Remplacer une dalle", "Réparer le salon de jardin"],
  kitchen: ["Réparer le robinet", "Réparer la cuisinière", "Réparer un placard"],
  electrical: ["Remplacer une ampoule", "Changer un fusible", "Recoller un câble"],
  living: ["Réparer le canapé", "Réparer la cheminée", "Réparer la lampe"],
  dining: ["Réparer la table", "Réparer une chaise", "Réparer le buffet"],
  bedroom_master: ["Réparer le lit", "Réparer l'armoire", "Réparer le miroir"],
  bedroom2: ["Réparer la fenêtre", "Réparer la commode", "Réparer le volet"],
  bathroom: ["Réparer la plomberie", "Réparer le lavabo", "Réparer la douche"],
  library: ["Remettre une étagère", "Réparer l'échelle", "Réparer la lampe de lecture"],
  office: ["Réparer le bureau", "Réparer le tiroir", "Réparer la lampe de bureau"],
  conference: ["Réparer le projecteur", "Réparer la table de conférence", "Réparer le tableau"],
  laundry: ["Réparer la machine à laver", "Réparer le séchoir", "Réparer le fer à repasser"],
  storage: ["Réparer une caisse", "Réparer l'étagère de stockage", "Réparer la serrure"],
  attic: ["Réparer la poutre", "Réparer la lucarne", "Réparer le coffre"],
  basement: ["Réparer la chaudière", "Réparer un tuyau", "Réparer la pompe"],
  veranda: ["Remplacer une vitre", "Réparer le store", "Réparer la porte-fenêtre"],
  hall: ["Réparer le lustre", "Réparer le portemanteau", "Réparer la console"],
  games: ["Réparer le billard", "Réparer le baby-foot", "Réparer la borne d'arcade"],
  airlock: ["Réparer le sas", "Remplacer un joint", "Réparer la douche de décontamination"],
  lab: ["Réparer le microscope", "Recalibrer la centrifugeuse", "Réparer la hotte"],
  server: ["Redémarrer un serveur", "Remplacer un ventilateur", "Rebrancher un câble réseau"],
  cryo: ["Réparer une cuve cryogénique", "Remplacer une valve", "Recalibrer le thermostat"],
  dormitory: ["Réparer une couchette", "Réparer un casier", "Remplacer une lampe"],
  medbay: ["Réparer le scanner", "Remplacer une perfusion", "Réparer le lit médical"],
  control: ["Réparer la console principale", "Réparer un écran", "Recalibrer le radar"],
  quarantine: ["Réparer la vitre blindée", "Réparer le sas de quarantaine", "Remplacer un filtre"],
  archives: ["Réparer le classeur", "Remettre un rayonnage", "Réparer le scanner de documents"],
  cafeteria: ["Réparer le distributeur", "Réparer une table", "Réparer la machine à café"],
  workshop: ["Réparer l'établi", "Affûter une scie", "Réparer la perceuse"],
  greenhouse: ["Réparer l'arrosage", "Remplacer une vitre", "Réparer la lampe de culture"],
  hangar: ["Réparer le treuil", "Réparer le chariot", "Réparer la porte du hangar"],
  armory: ["Réparer le râtelier", "Réparer le casier fort", "Réparer la serrure blindée"],
  comms: ["Réparer l'antenne", "Réparer la radio", "Rebrancher le routeur"],
  security: ["Réparer une caméra", "Réparer le moniteur", "Réparer le portique"],
  lounge: ["Réparer le canapé", "Réparer le distributeur de boissons", "Réparer la télévision"],
  engine: ["Réparer un piston", "Remplacer un injecteur", "Réparer le turbo"],
  navigation: ["Recalibrer le gyroscope", "Réparer la carte stellaire", "Réparer la console de pilotage"],
  cargo: ["Arrimer une caisse", "Réparer le chariot élévateur", "Réparer la rampe"],
  bridge: ["Réparer le gouvernail", "Réparer le hublot", "Réparer le siège du capitaine"],
  tower: ["Réparer l'escalier", "Réparer la meurtrière", "Réparer le drapeau"],
  vault: ["Réparer la serrure du coffre", "Réparer la porte blindée", "Remettre un lingot"],
  chapel: ["Réparer le vitrail", "Réparer l'autel", "Réparer la cloche"],
  dungeon: ["Réparer les barreaux", "Réparer une chaîne", "Réparer la porte du cachot"],
  forge: ["Réparer le soufflet", "Réparer l'enclume", "Réparer le four"],
  stables: ["Réparer une stalle", "Réparer l'abreuvoir", "Réparer la selle"],
  crypt: ["Réparer un sarcophage", "Rallumer une torche", "Réparer la dalle"],
  guardroom: ["Réparer la table des gardes", "Réparer le râtelier d'armes", "Réparer le lit de camp"],
  courtyard: ["Réparer la fontaine", "Réparer le puits", "Réparer le banc"],
  alchemy: ["Réparer l'alambic", "Réparer le chaudron", "Réparer l'étagère de potions"],
  throne: ["Réparer le trône", "Réparer la grande table", "Réparer le lustre"]
};

// ---------- Définitions des 4 terrains ----------
// rooms : [nom, type] dans l'ordre ligne par ligne (gauche → droite, nord → sud).
// noDoor : paires de pièces voisines SANS porte. vents : paires de pièces voisines reliées par une canalisation.
const DEFS = [
  {
    id: "manoir", name: "Le Manoir", theme: "manor",
    desc: "Le manoir classique : 20 pièces, toutes reliées entre elles par des portes.",
    xs: [-27, -15, -5, 5, 15, 27], zs: [-27, -14, 0, 14, 27],
    rooms: [
      ["TERRASSE", "terrace"], ["CUISINE", "kitchen"], ["SALLE ÉLECTRIQUE", "electrical"], ["GRAND SALON", "living"], ["SALLE À MANGER", "dining"],
      ["CHAMBRE PRINCIPALE", "bedroom_master"], ["CHAMBRE 2", "bedroom2"], ["SALLE DE BAIN", "bathroom"], ["BIBLIOTHÈQUE", "library"], ["BUREAU", "office"],
      ["CONFÉRENCE", "conference"], ["BUANDERIE", "laundry"], ["STOCKAGE", "storage"], ["GRENIER", "attic"], ["SOUS-SOL", "basement"],
      ["VÉRANDA", "veranda"], ["GARAGE", "hangar"], ["HALL D'ENTRÉE", "hall"], ["SALLE DE JEUX", "games"], ["CHAMBRE 3", "bedroom2"]
    ],
    noDoor: [], entrance: { x: 0, half: 3 }, panelRoom: 2, meetingRoom: 10,
    vents: [[0, 1], [3, 4], [5, 10], [8, 13]]
  },
  {
    id: "laboratoire", name: "Le Laboratoire", theme: "lab",
    desc: "Un complexe de recherche : 18 pièces, plusieurs cloisons fermées et des couloirs à contourner.",
    xs: [-27, -18, -9, 0, 9, 18, 27], zs: [-27, -10, 10, 27],
    rooms: [
      ["SAS", "airlock"], ["LABORATOIRE A", "lab"], ["SERVEURS", "server"], ["GÉNÉRATEUR", "electrical"], ["CRYOGÉNIE", "cryo"], ["QUARANTAINE", "quarantine"],
      ["DORTOIR", "dormitory"], ["INFIRMERIE", "medbay"], ["SALLE DE CONTRÔLE", "control"], ["LABORATOIRE B", "lab"], ["ARCHIVES", "archives"], ["SERRE", "greenhouse"],
      ["HANGAR", "hangar"], ["ARMURERIE", "armory"], ["CAFÉTÉRIA", "cafeteria"], ["ATELIER", "workshop"], ["COMMUNICATIONS", "comms"], ["SÉCURITÉ", "security"]
    ],
    noDoor: [[1, 2], [4, 5], [9, 10], [0, 6], [3, 9], [16, 17], [7, 13], [10, 16]],
    entrance: { x: -22.5, half: 3 }, panelRoom: 3, meetingRoom: 8,
    vents: [[1, 7], [4, 10], [12, 13], [11, 17]]
  },
  {
    id: "vaisseau", name: "Le Vaisseau", theme: "ship",
    desc: "Un vaisseau spatial : 18 pièces reliées par peu de portes, des chemins étroits.",
    xs: [-27, -19, -12, 0, 12, 19, 27], zs: [-27, -9, 9, 27],
    rooms: [
      ["ARMURERIE", "armory"], ["MOTEURS", "engine"], ["RÉACTEUR", "electrical"], ["NAVIGATION", "navigation"], ["COMMUNICATIONS", "comms"], ["SÉCURITÉ", "security"],
      ["DORTOIRS", "dormitory"], ["LABORATOIRE", "lab"], ["CAFÉTÉRIA", "cafeteria"], ["PONT DE COMMANDE", "bridge"], ["INFIRMERIE", "medbay"], ["ADMINISTRATION", "office"],
      ["SAS", "airlock"], ["CARGAISON", "cargo"], ["STOCKAGE", "storage"], ["JARDIN HYDROPONIQUE", "greenhouse"], ["SALLE DE REPOS", "lounge"], ["ARCHIVES", "archives"]
    ],
    noDoor: [[1, 2], [3, 4], [13, 14], [15, 16], [0, 6], [4, 10], [6, 12], [10, 16]],
    entrance: { x: -23, half: 3 }, panelRoom: 2, meetingRoom: 8,
    vents: [[0, 1], [4, 5], [12, 13], [16, 17]]
  },
  {
    id: "chateau", name: "Le Château", theme: "castle",
    desc: "Un château médiéval : 20 pièces de pierre, cachots, crypte et salles fortifiées.",
    xs: [-27, -15, -1, 13, 27], zs: [-27, -18, -9, 0, 12, 27],
    rooms: [
      ["TOUR NORD", "tower"], ["TRÉSORERIE", "vault"], ["CHAPELLE", "chapel"], ["TOUR EST", "tower"],
      ["CACHOTS", "dungeon"], ["ARMURERIE", "armory"], ["GRANDE SALLE", "throne"], ["BIBLIOTHÈQUE", "library"],
      ["FORGE", "forge"], ["CUISINES", "kitchen"], ["SALLE DES MÉCANISMES", "electrical"], ["ALCHIMIE", "alchemy"],
      ["ÉCURIES", "stables"], ["SALLE DES GARDES", "guardroom"], ["CHAMBRE DU ROI", "bedroom_master"], ["CHAMBRE DE LA REINE", "bedroom2"],
      ["CRYPTE", "crypt"], ["PORTAIL", "hall"], ["CELLIER", "basement"], ["COUR INTÉRIEURE", "courtyard"]
    ],
    only: [[17, 13], [17, 18], [18, 19], [19, 15], [16, 12], [12, 13], [13, 14], [14, 15], [13, 9], [9, 10], [9, 5], [8, 9], [10, 6], [10, 11], [10, 14], [11, 15],
      [6, 5], [6, 7], [6, 2], [5, 4], [4, 0], [0, 1], [1, 2], [2, 3], [3, 7], [7, 11]],
    entrance: { x: -8, half: 3 }, panelRoom: 10, meetingRoom: 6,
    vents: [[0, 4], [3, 7], [12, 16], [15, 19]]
  }
];

function pairKey(a, b) { return a < b ? a + "-" + b : b + "-" + a; }

function buildMap(def) {
  const { xs, zs } = def;
  const cols = xs.length - 1, nRows = zs.length - 1;
  if (def.rooms.length !== cols * nRows) throw new Error(def.id + " : " + def.rooms.length + " pièces pour une grille " + cols + "x" + nRows);
  if (def.rooms.length < 17) throw new Error(def.id + " : au moins 17 pièces sont demandées");
  const rooms = def.rooms.map(([name, kind], i) => {
    if (!KIND_TASKS[kind]) throw new Error(def.id + " : type de pièce inconnu « " + kind + " »");
    const c = i % cols, r = Math.floor(i / cols);
    return { id: i, name, kind, x1: xs[c], x2: xs[c + 1], z1: zs[r], z2: zs[r + 1], c, r };
  });
  const adjacent = (a, b) => { const A = rooms[a], B = rooms[b]; return A && B && Math.abs(A.c - B.c) + Math.abs(A.r - B.r) === 1; };
  const noDoor = new Set();
  if (def.only) { // liste explicite des portes : toutes les autres cloisons sont fermées
    const keep = new Set(def.only.map(([a, b]) => { if (!adjacent(a, b)) throw new Error(def.id + " : cloison inexistante " + a + "-" + b); return pairKey(a, b); }));
    for (let a = 0; a < rooms.length; a++) for (let b = a + 1; b < rooms.length; b++) if (adjacent(a, b) && !keep.has(pairKey(a, b))) noDoor.add(pairKey(a, b));
  }
  (def.noDoor || []).forEach(([a, b]) => { if (!adjacent(a, b)) throw new Error(def.id + " : cloison inexistante " + a + "-" + b); noDoor.add(pairKey(a, b)); });
  // Portes : au milieu de chaque cloison entre deux pièces voisines.
  const doors = [];
  for (let r = 0; r < nRows; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c;
    if (c < cols - 1 && !noDoor.has(pairKey(i, i + 1))) doors.push({ x: xs[c + 1], z: (zs[r] + zs[r + 1]) / 2, a: i, b: i + 1, vertical: true });
    if (r < nRows - 1 && !noDoor.has(pairKey(i, i + cols))) doors.push({ x: (xs[c] + xs[c + 1]) / 2, z: zs[r + 1], a: i, b: i + cols, vertical: false });
  }
  // Toutes les pièces doivent être accessibles depuis le point de départ.
  const seen = new Set([def.meetingRoom]), queue = [def.meetingRoom];
  while (queue.length) { const u = queue.shift(); doors.forEach(d => { const v = d.a === u ? d.b : d.b === u ? d.a : -1; if (v >= 0 && !seen.has(v)) { seen.add(v); queue.push(v); } }); }
  if (seen.size !== rooms.length) throw new Error(def.id + " : des pièces sont inaccessibles (" + (rooms.length - seen.size) + ")");
  // Canalisations : une paire = deux pièces voisines.
  const vents = [];
  def.vents.forEach(([a, b]) => {
    if (!adjacent(a, b)) throw new Error(def.id + " : canalisation entre pièces non voisines " + a + "-" + b);
    const mk = (ri, id, partner) => { const rm = rooms[ri]; return { id, partner, x: (rm.x1 + rm.x2) / 2 - Math.min(3.6, (rm.x2 - rm.x1) * .3), z: (rm.z1 + rm.z2) / 2 + 1 }; };
    const i = vents.length; vents.push(mk(a, i, i + 1), mk(b, i + 1, i));
  });
  // Tableau électrique
  const pr = rooms[def.panelRoom];
  const panel = { x: (pr.x1 + pr.x2) / 2 + 1, z: (pr.z1 + pr.z2) / 2 + .5 };
  const map = {
    id: def.id, name: def.name, desc: def.desc, theme: def.theme, xs, zs, cols, nRows, rooms, doors, vents, panel,
    entrance: def.entrance, panelRoom: def.panelRoom, meetingRoom: def.meetingRoom, bound: 26
  };
  map.slots = computeTaskSlots(map);
  map.taskCapacity = map.slots.reduce((n, s) => n + s.length, 0);
  if (map.taskCapacity < TASK_MIN) throw new Error(def.id + " : pas assez de place pour les tâches");
  map.tasks = generateTasks(map, Math.min(TASK_GOAL, map.taskCapacity));
  return map;
}

// ---------- Tâches : générées au lancement de chaque partie (nombre réglable par l'hôte) ----------
// Emplacements possibles : grille régulière dans chaque pièce, à distance des murs, des portes, des canalisations et du tableau.
function computeTaskSlots(map) {
  return map.rooms.map(rm => {
    const w = rm.x2 - rm.x1, d = rm.z2 - rm.z1, cx = (rm.x1 + rm.x2) / 2, cz = (rm.z1 + rm.z2) / 2;
    const nx = Math.floor((w - 3) / TASK_SPACING) + 1, nz = Math.floor((d - 3) / TASK_SPACING) + 1, out = [];
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const x = +(cx + (i - (nx - 1) / 2) * TASK_SPACING).toFixed(2), z = +(cz + (j - (nz - 1) / 2) * TASK_SPACING).toFixed(2);
      if (Math.hypot(x - map.panel.x, z - map.panel.z) < 2.2) continue;
      if (map.vents.some(v => Math.hypot(x - v.x, z - v.z) < 2)) continue;
      if (map.doors.some(dr => Math.hypot(x - dr.x, z - dr.z) < 2.4)) continue;
      out.push({ x, z });
    }
    return out;
  });
}
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
// count objets répartis entre les pièces proportionnellement à leur nombre d'emplacements ; le tableau électrique est ajouté en dernier (id PANEL_TASK_ID).
function generateTasks(map, count) {
  const caps = map.slots.map(s => s.length), total = caps.reduce((a, b) => a + b, 0);
  count = Math.max(0, Math.min(Math.round(Number(count) || 0), total));
  const quota = caps.map(c => Math.floor(count * c / total));
  let rest = count - quota.reduce((a, b) => a + b, 0);
  const order = caps.map((c, i) => ({ i, frac: count * c / total - quota[i] })).sort((a, b) => b.frac - a.frac);
  for (const o of order) { if (rest <= 0) break; if (quota[o.i] < caps[o.i]) { quota[o.i]++; rest--; } }
  for (let i = 0; rest > 0 && i < caps.length; i = (i + 1) % caps.length) { if (quota[i] < caps[i]) { quota[i]++; rest--; } else if (quota.every((q, k) => q >= caps[k])) break; }
  const tasks = [];
  map.rooms.forEach((rm, i) => {
    const names = KIND_TASKS[rm.kind];
    shuffle(map.slots[i].slice()).slice(0, quota[i]).forEach((p, k) => {
      const cycle = Math.floor(k / names.length);
      tasks.push({ id: TASK_ID_BASE + tasks.length, name: names[k % names.length] + (cycle ? " n°" + (cycle + 1) : ""), x: p.x, z: p.z });
    });
  });
  tasks.push({ id: PANEL_TASK_ID, name: "Recâbler le tableau électrique", x: map.panel.x, z: map.panel.z });
  return tasks;
}

const MAPS = DEFS.map(buildMap);
const inRect = (r, x, z) => x >= r.x1 && x < r.x2 && z >= r.z1 && z < r.z2;
const roomAt = (map, x, z) => map.rooms.find(r => inRect(r, x, z));
// Ce qui est envoyé aux clients (les tâches arrivent séparément, dans l'état de la partie).
const clientMap = m => ({ id: m.id, name: m.name, desc: m.desc, theme: m.theme, xs: m.xs, zs: m.zs, cols: m.cols, nRows: m.nRows, rooms: m.rooms, doors: m.doors, vents: m.vents, panel: m.panel, entrance: m.entrance, panelRoom: m.panelRoom, meetingRoom: m.meetingRoom, bound: m.bound });
const mapList = () => MAPS.map(m => ({ id: m.id, name: m.name, desc: m.desc, rooms: m.rooms.length }));

module.exports = { MAPS, TASK_GOAL, TASK_MIN, TASK_MAX, generateTasks, PANEL_TASK_ID, inRect, roomAt, clientMap, mapList };
