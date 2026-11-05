// Habillage visuel « vaisseau » de la map (inspiré d'Among Us) : murs en acier, sols à plaques,
// ombres d'angle, portes coulissantes, marquages au sol, coque extérieure.
// Aucune collision ni logique de jeu ici : c'est purement du rendu, appelé depuis game.js.
export function createSkeld(THREE, scene) {
  const SRGB = THREE.SRGBColorSpace;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const cvs = (w, h, draw) => { const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); return c; };
  const mkTex = (c, rx = 1, ry = 1) => { const t = new THREE.CanvasTexture(c); t.colorSpace = SRGB; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 8; return t; };
  const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ roughness: .6, metalness: .12 }, o));
  const basic = (o) => new THREE.MeshBasicMaterial(Object.assign({ transparent: true, depthWrite: false }, o));
  const add = (m) => { scene.add(m); return m; };

  // ---------- Textures ----------
  // Plaques d'acier boulonnées (sol)
  const plateCanvas = (h, s, l, grid) => cvs(256, 256, (g, w) => {
    const n = grid, sz = w / n;
    g.fillStyle = `hsl(${h},${s}%,${Math.max(4, l - 14)}%)`; g.fillRect(0, 0, w, w);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const px = x * sz + 2, py = y * sz + 2, pw = sz - 4;
      g.fillStyle = `hsl(${h},${s}%,${l + rnd(-3, 3)}%)`; g.fillRect(px, py, pw, pw);
      g.fillStyle = `hsla(${h},${s}%,${Math.min(96, l + 16)}%,.55)`; g.fillRect(px, py, pw, 2); g.fillRect(px, py, 2, pw);
      g.fillStyle = `hsla(${h},${s}%,${Math.max(2, l - 20)}%,.7)`; g.fillRect(px, py + pw - 2, pw, 2); g.fillRect(px + pw - 2, py, 2, pw);
      if (sz >= 100) [[9, 9], [pw - 9, 9], [9, pw - 9], [pw - 9, pw - 9]].forEach(([ox, oy]) => {
        g.fillStyle = "rgba(0,0,0,.4)"; g.beginPath(); g.arc(px + ox + .8, py + oy + .8, 3, 0, 7); g.fill();
        g.fillStyle = `hsl(${h},${s}%,${Math.min(90, l + 24)}%)`; g.beginPath(); g.arc(px + ox, py + oy, 2.6, 0, 7); g.fill();
      });
    }
    for (let i = 0; i < 160; i++) { g.fillStyle = Math.random() < .5 ? "rgba(255,255,255,.045)" : "rgba(0,0,0,.07)"; g.fillRect(rnd(0, w), rnd(0, w), rnd(6, 34), 1.2); }
    for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(${Math.random() < .5 ? 255 : 0},${Math.random() < .5 ? 255 : 0},${Math.random() < .5 ? 255 : 0},.035)`; g.fillRect(rnd(0, w), rnd(0, w), 2, 2); }
  });
  const steel = {
    metal: plateCanvas(222, 14, 33, 2),
    white: plateCanvas(210, 16, 78, 2),
    conc: plateCanvas(218, 7, 43, 4)
  };
  const floorTex = (kind) => mkTex(steel[kind] || steel.metal);

  // Mur : face (visible depuis la caméra), dessus et bouts
  const wallSideC = cvs(256, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, "#9aa8c0"); gr.addColorStop(.12, "#8795ae"); gr.addColorStop(.6, "#65728c"); gr.addColorStop(1, "#46526a");
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(255,255,255,.35)"; g.fillRect(0, 0, w, 3);
    g.fillStyle = "rgba(10,14,24,.55)"; g.fillRect(0, h * .8, w, h * .2); // plinthe sombre
    g.fillStyle = "rgba(143,180,255,.55)"; g.fillRect(0, h * .8 - 2, w, 3);  // liseré lumineux
    g.fillStyle = "rgba(10,14,24,.5)"; g.fillRect(0, 0, 3, h); g.fillRect(w - 3, 0, 3, h); g.fillRect(w / 2 - 1, h * .12, 2, h * .66);
    [[14, 22], [w / 2 - 12, 22], [w / 2 + 12, 22], [w - 14, 22], [14, h * .66], [w - 14, h * .66]].forEach(([x, y]) => { g.fillStyle = "rgba(0,0,0,.4)"; g.beginPath(); g.arc(x + .8, y + .8, 3, 0, 7); g.fill(); g.fillStyle = "#b5c2d8"; g.beginPath(); g.arc(x, y, 2.6, 0, 7); g.fill(); });
  });
  // Dessus de mur : liseré sombre sur les grands côtés, joint fin tous les 2,4 m (deux orientations)
  const wallTopC = (horiz) => cvs(horiz ? 128 : 32, horiz ? 32 : 128, (g, w, h) => {
    g.fillStyle = "#0f1524"; g.fillRect(0, 0, w, h);
    const e = 5, j = 2; // épaisseur du liseré / du joint
    const x0 = horiz ? j : e, y0 = horiz ? e : j, x1 = horiz ? w - j : w - e, y1 = horiz ? h - e : h - j;
    const gr = horiz ? g.createLinearGradient(0, y0, 0, y1) : g.createLinearGradient(x0, 0, x1, 0);
    gr.addColorStop(0, "#dbe3f0"); gr.addColorStop(1, "#b0bcd0");
    g.fillStyle = gr; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    g.fillStyle = "rgba(255,255,255,.55)";
    if (horiz) g.fillRect(x0, y0 + 1, x1 - x0, 2); else g.fillRect(x0 + 1, y0, 2, y1 - y0);
  });
  const wallSide = mkTex(wallSideC), wallTopH = mkTex(wallTopC(true)), wallTopV = mkTex(wallTopC(false));
  const mSide = std({ map: wallSide, roughness: .7, metalness: .1 });
  const mTopH = std({ map: wallTopH, roughness: .55, metalness: .1 }), mTopV = std({ map: wallTopV, roughness: .55, metalness: .1 });
  const mEnd = std({ color: "#3b465d", roughness: .8 });
  const wallMatsH = [mEnd, mEnd, mTopH, mEnd, mSide, mEnd]; // +x, -x, +y, -y, +z (sud, vers la caméra), -z
  const wallMatsV = [mSide, mSide, mTopV, mEnd, mEnd, mEnd];

  function scaleUV(geo, faceFrom, faceTo, ku, kv) {
    const uv = geo.attributes.uv;
    for (let i = faceFrom * 4; i < (faceTo + 1) * 4; i++) { uv.setX(i, uv.getX(i) * ku); uv.setY(i, uv.getY(i) * kv); }
    uv.needsUpdate = true;
  }
  // Mur : retourne le mesh (le rectangle de collision reste géré par game.js)
  function wall(x, z, len, alongX, h, thick) {
    const sx = alongX ? len : thick, sz = alongX ? thick : len;
    const geo = new THREE.BoxGeometry(sx, h, sz);
    if (alongX) { scaleUV(geo, 4, 5, len / 3, 1); scaleUV(geo, 2, 2, len / 2.4, 1); }
    else { scaleUV(geo, 0, 1, len / 3, 1); scaleUV(geo, 2, 2, 1, len / 2.4); }
    const m = new THREE.Mesh(geo, alongX ? wallMatsH : wallMatsV);
    m.position.set(x, h / 2, z); m.castShadow = false; m.receiveShadow = true; scene.add(m); return m;
  }

  // ---------- Ombres douces ----------
  const aoC = cvs(8, 64, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "rgba(4,8,18,.62)"); gr.addColorStop(.35, "rgba(4,8,18,.28)"); gr.addColorStop(1, "rgba(4,8,18,0)"); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  const aoMat = basic({ map: mkTex(aoC) });
  aoMat.map.wrapS = aoMat.map.wrapT = THREE.ClampToEdgeWrapping;
  // Ombre portée au pied de chaque cloison, côté intérieur uniquement.
  function wallShadows(rects, b) {
    const W = .95;
    rects.forEach(r => {
      const sx = r.x2 - r.x1, sz = r.z2 - r.z1, alongX = sx > sz, len = alongX ? sx : sz, th = alongX ? sz : sx;
      const cx = (r.x1 + r.x2) / 2, cz = (r.z1 + r.z2) / 2;
      [-1, 1].forEach(s => {
        const off = th / 2 + W / 2 - .02;
        const px = alongX ? cx : cx + s * off, pz = alongX ? cz + s * off : cz;
        if (px < b.x0 - .01 || px > b.x1 + .01 || pz < b.z0 - .01 || pz > b.z1 + .01) return; // extérieur : pas d'ombre sur le sol
        const m = new THREE.Mesh(new THREE.PlaneGeometry(len + .3, W), aoMat);
        m.rotation.order = "YXZ"; m.rotation.x = -Math.PI / 2;
        m.rotation.y = alongX ? (s > 0 ? 0 : Math.PI) : (s > 0 ? Math.PI / 2 : -Math.PI / 2);
        m.position.set(px, .03, pz); m.renderOrder = 1; scene.add(m);
      });
    });
  }
  // Ombre d'appui sous les meubles (rectangle flou)
  const softC = cvs(64, 64, (g, w, h) => { for (let i = 0; i < 10; i++) { g.fillStyle = "rgba(0,0,0,.075)"; const p = i * 2.6; g.fillRect(p, p, w - 2 * p, h - 2 * p); } });
  const softMat = basic({ map: mkTex(softC), opacity: .9 });
  softMat.map.wrapS = softMat.map.wrapT = THREE.ClampToEdgeWrapping;
  function contactShadow(x, z, sx, sz) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(sx + .55, sz + .55), softMat);
    m.rotation.x = -Math.PI / 2; m.position.set(x + .1, .034, z + .14); m.renderOrder = 2; scene.add(m);
  }

  // ---------- Marquages de pièce : halo de lumière, coins, nom peint au sol ----------
  const ACC = {
    electrical: "#ffd23f", medbay: "#4fd8e8", security: "#ff6a6a", engine: "#ff9340", control: "#5aa8ff", conference: "#5aa8ff", cafeteria: "#ffb04a",
    bridge: "#5aa8ff", navigation: "#5ad0ff", comms: "#7aa0ff", lab: "#6be0ff", server: "#4cff9a", cryo: "#8fe8ff", armory: "#ff7a5a", greenhouse: "#6bff8a",
    courtyard: "#6bff8a", airlock: "#ffd23f", quarantine: "#ff7a7a", hangar: "#ffb04a", cargo: "#ffb04a", workshop: "#ff9340", forge: "#ff8a3a", throne: "#ffd23f",
    vault: "#ffd23f", chapel: "#d8b8ff", alchemy: "#b18cff", dungeon: "#ff7a5a", crypt: "#b8c4d8", library: "#ffcf80", office: "#9fc4ff", kitchen: "#ffb04a", bathroom: "#6be0ff"
  };
  const PX = 64;
  function roomDecal(rm) {
    const w = rm.x2 - rm.x1 - .5, d = rm.z2 - rm.z1 - .5, cw = Math.round(w * PX), ch = Math.round(d * PX);
    const acc = ACC[rm.kind] || "#9fb4d8";
    const c = cvs(cw, ch, (g) => {
      // halo de lumière (plafonnier)
      const R = Math.max(cw, ch) * .62, rg = g.createRadialGradient(cw / 2, ch / 2, 0, cw / 2, ch / 2, R);
      rg.addColorStop(0, "rgba(255,248,228,.20)"); rg.addColorStop(.6, "rgba(255,248,228,.07)"); rg.addColorStop(1, "rgba(255,248,228,0)");
      g.fillStyle = rg; g.fillRect(0, 0, cw, ch);
      // équerres de coin
      const ins = .85 * PX, L = 2 * PX; g.lineWidth = 6; g.lineCap = "square"; g.strokeStyle = acc; g.globalAlpha = .75;
      [[ins, ins, 1, 1], [cw - ins, ins, -1, 1], [ins, ch - ins, 1, -1], [cw - ins, ch - ins, -1, -1]].forEach(([x, y, sx, sy]) => {
        g.beginPath(); g.moveTo(x + sx * L, y); g.lineTo(x, y); g.lineTo(x, y + sy * L); g.stroke();
        g.fillStyle = acc; g.fillRect(x + sx * 12 - 4, y + sy * 12 - 4, 8, 8);
      });
      // nom de la pièce peint au sol
      g.globalAlpha = 1; g.textAlign = "center"; g.textBaseline = "middle";
      let size = Math.min(cw * .05, 40), words = rm.name.split(" "), lines = [rm.name];
      g.font = `900 ${size}px Arial, Helvetica, sans-serif`; if (g.letterSpacing !== undefined) g.letterSpacing = "4px";
      if (g.measureText(rm.name).width > cw * .78 && words.length > 1) { const h2 = Math.ceil(words.length / 2); lines = [words.slice(0, h2).join(" "), words.slice(h2).join(" ")]; }
      while (size > 14 && Math.max(...lines.map(t => g.measureText(t).width)) > cw * .8) { size -= 2; g.font = `900 ${size}px Arial, Helvetica, sans-serif`; }
      lines.forEach((t, i) => {
        const y = ch * .5 + (i - (lines.length - 1) / 2) * size * 1.15;
        g.fillStyle = "rgba(0,0,0,.35)"; g.fillText(t, cw / 2 + 2, y + 2);
        g.fillStyle = acc; g.globalAlpha = .55; g.fillText(t, cw / 2, y); g.globalAlpha = 1;
      });
    });
    const t = mkTex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), basic({ map: t }));
    m.rotation.x = -Math.PI / 2; m.position.set((rm.x1 + rm.x2) / 2, .04, (rm.z1 + rm.z2) / 2); m.renderOrder = 3; scene.add(m);
  }

  // ---------- Portes coulissantes ----------
  const hazC = cvs(128, 64, (g, w, h) => {
    g.fillStyle = "#e8b72a"; g.fillRect(0, 0, w, h); g.fillStyle = "#14161c";
    for (let i = -h; i < w + h; i += 22) { g.beginPath(); g.moveTo(i, h); g.lineTo(i + 11, h); g.lineTo(i + 11 + h, 0); g.lineTo(i + h, 0); g.closePath(); g.fill(); }
  });
  const sillC = cvs(256, 128, (g, w, h) => {
    g.fillStyle = "#2a3142"; g.fillRect(0, 0, w, h);
    const hz = 26; g.drawImage(hazC, 0, 0, hz, h); g.drawImage(hazC, w - hz, 0, hz, h);
    g.fillStyle = "#12161f"; g.fillRect(w / 2 - 3, 0, 6, h); g.fillStyle = "rgba(143,180,255,.35)"; g.fillRect(w / 2 - 5, 0, 2, h); g.fillRect(w / 2 + 3, 0, 2, h);
    g.fillStyle = "rgba(255,255,255,.1)"; g.fillRect(hz, 0, w - 2 * hz, 3); g.fillStyle = "rgba(0,0,0,.35)"; g.fillRect(hz, h - 3, w - 2 * hz, 3);
  });
  const sillMat = basic({ map: mkTex(sillC), transparent: false, depthWrite: true });
  const pillarMat = std({ color: "#76839c", roughness: .45, metalness: .35 });
  const pillarDark = std({ color: "#1a2030", roughness: .7 });
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xffd45a });
  function pillar(x, z, sx, sz, h, face) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(sx, h, sz), pillarMat); p.position.set(x, h / 2, z); p.receiveShadow = true; scene.add(p);
    const base = new THREE.Mesh(new THREE.BoxGeometry(sx + .06, .34, sz + .06), pillarDark); base.position.set(x, .17, z); scene.add(base);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(sx * .55, .05, sz * .22), lightMat); cap.position.set(x, h + .03, z); scene.add(cap);
    const st = new THREE.Mesh(new THREE.BoxGeometry(face === "z" ? sx * .35 : .03, h * .5, face === "z" ? .03 : sz * .35), lightMat);
    st.position.set(x, h * .55, z + (face === "z" ? sz / 2 + .01 : 0)); scene.add(st);
  }
  function door(d, h) {
    const sill = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.15), sillMat);
    sill.rotation.order = "YXZ"; sill.rotation.x = -Math.PI / 2; sill.rotation.y = d.vertical ? Math.PI / 2 : 0;
    sill.position.set(d.x, .045, d.z); sill.renderOrder = 4; scene.add(sill);
    if (!d.vertical) { pillar(d.x - 1.22, d.z, .3, .62, h, "z"); pillar(d.x + 1.22, d.z, .3, .62, h, "z"); }
    else { pillar(d.x, d.z - 1.22, .62, .3, h, "x"); pillar(d.x, d.z + 1.22, .62, .3, h, "x"); }
  }

  // ---------- Bouche d'aération (canalisation) ----------
  function vent(v) {
    const g = new THREE.Group();
    const hole = new THREE.Mesh(new THREE.BoxGeometry(2.1, .06, 1.4), new THREE.MeshBasicMaterial({ color: 0x05070b })); hole.position.y = .06; g.add(hole);
    const fm = std({ color: "#7d8aa3", roughness: .4, metalness: .5 });
    [[0, -.75, 2.4, .16], [0, .75, 2.4, .16], [-1.12, 0, .16, 1.5], [1.12, 0, .16, 1.5]].forEach(([x, z, sx, sz]) => { const b = new THREE.Mesh(new THREE.BoxGeometry(sx, .14, sz), fm); b.position.set(x, .09, z); g.add(b); });
    const sm = std({ color: "#4a566d", roughness: .5, metalness: .4 });
    for (let i = -2; i <= 2; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(1.95, .05, .1), sm); b.position.set(0, .12, i * .26); b.rotation.x = .35; g.add(b); }
    g.position.set(v.x, 0, v.z); scene.add(g);
  }

  // ---------- Coque / socle autour du bâtiment ----------
  function hull(b, entrance, base) {
    const t = 1.5, h = .34;
    const mk = (cx, cz, sx, sz) => {
      const geo = new THREE.BoxGeometry(sx, h, sz);
      const tex = mkTex(steel.metal, Math.max(1, sx / 4), Math.max(1, sz / 4));
      const m = new THREE.Mesh(geo, [pillarDark, pillarDark, std({ map: tex, color: base, roughness: .7 }), pillarDark, pillarDark, pillarDark]);
      m.position.set(cx, h / 2 - .02, cz); m.receiveShadow = true; scene.add(m);
    };
    const w = b.x1 - b.x0;
    mk((b.x0 + b.x1) / 2, b.z0 - t / 2, w + 2 * t, t);
    mk(b.x0 - t / 2, (b.z0 + b.z1) / 2, t, b.z1 - b.z0);
    mk(b.x1 + t / 2, (b.z0 + b.z1) / 2, t, b.z1 - b.z0);
    const L = entrance.x - entrance.half - b.x0 + t, R = b.x1 + t - (entrance.x + entrance.half);
    mk(b.x0 - t + L / 2, b.z1 + t / 2, L, t);
    mk(b.x1 + t - R / 2, b.z1 + t / 2, R, t);
  }

  return { floorTex, wall, wallShadows, contactShadow, roomDecal, door, vent, hull, mkTex, cvs };
}
