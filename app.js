/* =====================================================================
   DIAMOND FOIL — logique du prototype
   Aucun framework, aucun build. Chargé en script classique pour que la
   page fonctionne aussi en double-cliquant le fichier (file://).
   ===================================================================== */
(function () {
'use strict';

/* ---------------------------------------------------------------------
   1. Raretés, collections et catalogue
   RARITY, RKEYS, ORDER, PACK_SIZE, DAILY_PACKS, TAGS, buildCollections
   sont définis dans sets.js ; TEAMS et LEGACY_TEAMS dans teams.js.
   --------------------------------------------------------------------- */
const TABLE = RKEYS.map(k => ({ k, w: RARITY[k].w }));
const TOTAL = TABLE.reduce((n,r) => n + r.w, 0);
if (TOTAL !== 10000) throw new Error('Table de raretés incohérente : ' + TOTAL);

/* Valeur en jetons d'un doublon, et coût d'un booster.
   L'échelle suit l'inverse des probabilités : une Ultra vaut cher parce
   qu'elle est rare. Le coût d'un booster (120) est calé pour qu'environ
   dix doublons communs en paient un — assez pour que les doublons servent
   à quelque chose, pas assez pour contourner le tirage. */
const DUST = { common:12, rare:35, epic:90, holo:260, legend:700, ultra:1800 };
const PACK_COST = 120;

const ALL_TEAMS = TEAMS.concat(LEGACY_TEAMS);
const TEAM_BY_ABBR = new Map(ALL_TEAMS.map(t => [t.abbr, t]));

/* ---------------------------------------------------------------------
   2. Catalogue
   --------------------------------------------------------------------- */
/**
 * URL de la photo officielle.
 *
 * Deux transformations Cloudinary font tout le travail de cadrage, côté
 * serveur, plutôt que de laisser le CSS recadrer au hasard :
 *
 *   d_people:generic:headshot:67:current.png
 *       image par défaut. Sans elle, un joueur sans photo — les légendes
 *       d'avant-guerre, typiquement — renvoie une 404 et un trou dans la carte.
 *
 *   c_fill,g_north
 *       recadre au format demandé en conservant le HAUT de l'image. Sur un
 *       portrait, le haut c'est la tête : si quelque chose doit être coupé,
 *       ce sera le torse. C'est exactement l'inverse d'un recadrage centré,
 *       qui rogne le crâne et le menton.
 *
 * Le rapport 420×500 correspond à celui de la fenêtre d'illustration, donc
 * le navigateur n'a plus rien à rogner ensuite.
 */
const headshot = id =>
  'https://img.mlbstatic.com/mlb-photos/image/upload/' +
  'd_people:generic:headshot:67:current.png/' +
  `w_420,h_500,c_fill,g_north,q_auto:best/v1/people/${id}/headshot/67/current`;

/* ---------------------------------------------------------------------
   Statistiques en français.
   La terminologie du baseball francophone (usage québécois) :
     MOY  moyenne au bâton        CC   coups de circuit
     PP   points produits         BB   buts sur balles
     BV   buts volés              OPS  conservé (sigle international)
     MPM  moyenne de points mérités (ERA)
     RB   retraits au bâton (K)   V-D  victoires-défaites
     MJ   manches lancées         WHIP conservé
   --------------------------------------------------------------------- */
const POSITIONS = {
  P:   { fr:'Lanceur',        x:50, y:62 },
  C:   { fr:'Receveur',       x:50, y:88 },
  '1B':{ fr:'1er but',        x:74, y:56 },
  '2B':{ fr:'2e but',         x:62, y:40 },
  '3B':{ fr:'3e but',         x:26, y:56 },
  SS:  { fr:'Arrêt-court',    x:38, y:40 },
  LF:  { fr:'Champ gauche',   x:19, y:20 },
  CF:  { fr:'Champ centre',   x:50, y:12 },
  RF:  { fr:'Champ droit',    x:81, y:20 },
  DH:  { fr:'Frappeur désigné', x:50, y:96 },
  TWP: { fr:'Double rôle',    x:50, y:62 },
};

const HAND = { D:'Droitier', G:'Gaucher', A:'Ambidextre' };

/** Les quatre statistiques affichées sur la carte, selon le rôle. */
function cardStats(c) {
  const st = c.stats || {};
  if (c.pos === 'P') {
    return [
      { l:'MPM', v: st.era  != null ? st.era : '—', t:'Moyenne de points mérités' },
      { l:'RB',  v: st.k    != null ? st.k   : '—', t:'Retraits au bâton' },
      { l:'V-D', v: (st.w != null ? st.w : '—') + '-' + (st.l != null ? st.l : '—'), t:'Victoires-défaites' },
      { l:'MJ',  v: st.ip   != null ? st.ip  : '—', t:'Manches lancées' },
    ];
  }
  return [
    { l:'MOY', v: st.avg != null ? st.avg : '—', t:'Moyenne au bâton' },
    { l:'CC',  v: st.hr  != null ? st.hr  : '—', t:'Coups de circuit' },
    { l:'PP',  v: st.rbi != null ? st.rbi : '—', t:'Points produits' },
    { l:'OPS', v: st.ops != null ? st.ops : '—', t:'Présence + puissance' },
  ];
}

/* ---------------------------------------------------------------------
   NOTATION EN LETTRES
   Powerful Pro Yakyuu note chaque aptitude de S à G. C'est la meilleure
   idée du genre : un néophyte n'a aucune idée de ce que vaut un OPS de
   .812, mais tout le monde comprend « B ».

   Les seuils ci-dessous sont calés sur la distribution réelle de la MLB.
   Ce ne sont pas des données inventées : c'est une conversion visible
   d'une valeur mesurée en note lisible, comme une note sur 20.
   --------------------------------------------------------------------- */
const GRADES = [
  { g:'S', min:95, hex:'#ff5edb', label:'Exceptionnel' },
  { g:'A', min:82, hex:'#ff8f5e', label:'Excellent'    },
  { g:'B', min:68, hex:'#f5b942', label:'Très bon'     },
  { g:'C', min:50, hex:'#5fd39a', label:'Bon'          },
  { g:'D', min:32, hex:'#7fb4e2', label:'Correct'      },
  { g:'E', min:15, hex:'#8b98a8', label:'Faible'       },
  { g:'F', min:0,  hex:'#6b7684', label:'Débutant'     },
];

/** Convertit une valeur en score 0-100 par interpolation entre deux bornes. */
function scale(v, lo, hi) {
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, ((n - lo) / (hi - lo)) * 100));
}
/** Idem, mais où le plus PETIT est le meilleur (MPM, WHIP). */
function scaleInv(v, best, worst) {
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, ((worst - n) / (worst - best)) * 100));
}
function gradeOf(score) {
  return GRADES.find(g => score >= g.min) || GRADES[GRADES.length - 1];
}

/**
 * Les aptitudes d'un joueur, notées.
 * Chaque ligne porte : le nom en clair, la note, le score, la valeur
 * réelle d'où elle vient, et une phrase d'explication pour quelqu'un qui
 * ne connaît rien au baseball.
 */
function abilities(c) {
  const st = c.stats || {};
  const mk = (name, score, raw, why) => {
    const g = gradeOf(score);
    return { name, score: Math.round(score), grade: g.g, hex: g.hex,
             quality: g.label, raw: raw == null ? '—' : String(raw), why };
  };

  if (c.pos === 'P') {
    return [
      mk('Efficacité', scaleInv(st.era, 2.00, 6.00), st.era,
         "Points encaissés sur neuf manches. Plus c'est bas, mieux c'est."),
      mk('Domination', scale(st.k, 30, 240), st.k,
         'Frappeurs retirés sur trois prises, sans que la balle soit jouée.'),
      mk('Précision', scaleInv(st.whip, 0.90, 1.70), st.whip,
         'Adversaires laissés sur les buts par manche. Bas = peu de cadeaux.'),
      mk('Endurance', scale(st.ip, 20, 200), st.ip,
         'Manches lancées dans la saison. Élevé = lanceur partant fiable.'),
      mk('Victoires', scale(st.w, 0, 18), st.w,
         "Matchs gagnés en tant que lanceur. Dépend aussi de l'équipe."),
    ];
  }
  return [
    mk('Contact', scale(st.avg, 0.200, 0.340), st.avg,
       'Proportion de coups sûrs. .300 est le seuil des très bons frappeurs.'),
    mk('Puissance', scale(st.hr, 0, 50), st.hr,
       'Coups de circuit : la balle sort du terrain, un tour complet marqué.'),
    mk('Production', scale(st.rbi, 0, 130), st.rbi,
       'Coéquipiers ramenés au marbre. Mesure la capacité à faire marquer.'),
    mk('Complet', scale(st.ops, 0.600, 1.000), st.ops,
       "Présence sur les buts + puissance. La mesure la plus globale d'un frappeur."),
    mk('Vitesse', scale(st.sb, 0, 40), st.sb,
       'Buts volés : avancer sans que la balle soit frappée.'),
  ];
}

/** Note générale : la moyenne des aptitudes. */
function overall(c) {
  const a = abilities(c);
  const avg = a.reduce((n, x) => n + x.score, 0) / (a.length || 1);
  const g = gradeOf(avg);
  // `gradeOf` renvoie la clé `g`, pas `grade` : normaliser ici évite de
  // devoir s'en souvenir aux trois endroits qui consomment cette valeur.
  return { score: Math.round(avg), grade: g.g, hex: g.hex, quality: g.label };
}

/** Statistiques détaillées, pour la fiche agrandie. */
function fullStats(c) {
  const st = c.stats || {};
  if (c.pos === 'P') {
    return [['Moyenne de points mérités','MPM',st.era],['Retraits au bâton','RB',st.k],
            ['Victoires','V',st.w],['Défaites','D',st.l],['Manches lancées','MJ',st.ip],
            ['Sauvetages','SV',st.sv],['WHIP','WHIP',st.whip]];
  }
  return [['Moyenne au bâton','MOY',st.avg],['Coups de circuit','CC',st.hr],
          ['Points produits','PP',st.rbi],['OPS','OPS',st.ops],
          ['Buts sur balles','BB',st.bb],['Buts volés','BV',st.sb]];
}

function buildCards(rows) { return (rows || []).map(([id,name,pos,team,num,rarity,season,tags,bats,throws,stats]) => {
  const t = TEAM_BY_ABBR.get(team);
  const p = POSITIONS[pos] || { fr:pos, x:50, y:50 };
  return {
    uid: `${id}-${season}-${rarity}`,
    id, name, pos, team, num, rarity, season: season || null,
    tags: tags || [], bats, throws,
    posName: p.fr, posX: p.x, posY: p.y,
    teamName: t ? `${t.city} ${t.club}` : team,
    c1: t ? t.c1 : '#39424f', c2: t ? t.c2 : '#8b98a8',
    lg: t ? t.lg : null, div: t ? t.div : null, park: t ? t.park : null,
    stats: stats || {},
    img: headshot(id),
  };
}); }

/* Le catalogue est reconstructible : `data.js` fournit un socle de 221
   cartes qui fonctionne hors ligne, et la synchronisation le remplace par
   l'effectif complet tiré de l'API. Tout ce qui dépend du catalogue passe
   par refreshCatalog() pour rester cohérent. */
let CARDS = [];
let POOL = {};
let TEAM_ABBRS = [];
let catalogSource = 'local';   // 'local' | 'api'
let catalogAt = null;

function refreshCatalog() {
  POOL = RKEYS.reduce((a,k) => (a[k] = CARDS.filter(c => c.rarity === k), a), {});
  TEAM_ABBRS = [...new Set(CARDS.map(c => c.team))].sort();
  refreshCollections();
}

/**
 * Remplace le catalogue par celui de l'API.
 *
 * Les cartes Légende et Ultra ne sont PAS dans l'effectif actif — ce sont
 * des saisons historiques. On les conserve depuis data.js, sinon elles
 * disparaîtraient à la première synchronisation.
 */
function applyApiCatalog(rows) {
  const seen = new Set();
  const merged = [];
  rows.forEach(r => {
    const key = r[0] + '-' + r[6] + '-' + r[5];
    if (seen.has(key)) return;
    seen.add(key); merged.push(r);
  });
  CARDS = buildCards(merged);
  catalogSource = 'api';
  refreshCatalog();
}
let COLLECTIONS = buildCollections(TEAMS, []);

/**
 * Reconstruit la liste des collections en y ajoutant celles créées dans
 * le Créateur. Une collection personnelle regroupe des cartes perso par
 * leur champ `set`, et vit exactement comme les officielles : elle
 * apparaît dans la vue Collections, filtre le classeur et se complète.
 */
function refreshCollections() {
  const mine = (state.mySets || []).map(ms => ({
    id: 'my-' + ms.id,
    group: 'Mes collections',
    name: ms.name,
    short: ms.short || ms.name.slice(0,4).toUpperCase(),
    accent: ms.accent || '#f5b942',
    mine: true,
    filter: c => c.custom && c.set === ms.id,
    reward: { type:'none', label: ms.goal ? `${ms.goal} cartes visées` : 'Collection perso' },
    goal: ms.goal || 0,
  }));
  COLLECTIONS = buildCollections(TEAMS, CARDS).concat(mine);
}


/* ---------------------------------------------------------------------
   3. Sauvegarde
   localStorage avec repli en mémoire : en navigation privée verrouillée
   l'accès lève une exception, et le prototype doit rester utilisable.
   --------------------------------------------------------------------- */
const KEY = 'diamond-foil:v2';
const DEFAULTS = { boosters:6, tokens:0, owned:{}, customs:[], lastDaily:null,
  packArt:{ _default:'batter' },
  videos:[], claimed:[], filterSet:'all',
  // Collections personnelles créées depuis le Créateur
  mySets: [],
  // Le Créateur est une zone privée : un code le verrouille. Il n'y a
  // aucune sécurité réelle ici — c'est un prototype local, tout est
  // lisible dans localStorage. Voir la note du README.
  studioPin: null, studioOpen: false };
let state;
try {
  const raw = localStorage.getItem(KEY);
  state = raw ? Object.assign({}, DEFAULTS, JSON.parse(raw)) : Object.assign({}, DEFAULTS);
} catch { state = Object.assign({}, DEFAULTS); }

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch { toast('Espace de sauvegarde plein. Supprimez une carte personnalisée.'); }
}

/* ---------------------------------------------------------------------
   4. Tirage
   crypto.getRandomValues avec rejection sampling : un simple % sur
   2^32 introduirait un biais, faible mais réel, en faveur des premières
   raretés de la table.
   --------------------------------------------------------------------- */
function randBelow(max) {
  const limit = Math.floor(0xFFFFFFFF / max) * max;
  const buf = new Uint32Array(1);
  let v;
  do { crypto.getRandomValues(buf); v = buf[0]; } while (v >= limit);
  return v % max;
}
function rollRarity() {
  const roll = randBelow(TOTAL);
  let cur = 0;
  for (const e of TABLE) { cur += e.w; if (roll < cur) return e.k; }
  return 'common';
}
/**
 * Tire un booster. `setId` restreint le tirage à une collection.
 *
 * Les probabilités par rareté restent EXACTEMENT les mêmes : seul le
 * vivier change. Si une collection n'a aucune carte d'une rareté tirée,
 * on redescend d'un cran plutôt que d'échouer — sinon un booster
 * « Marlins » planterait dès qu'il tire une Légende.
 */
function drawPack(n = PACK_SIZE, setId) {
  const set = setId ? COLLECTIONS.filter(x => x.id === setId)[0] : null;
  const source = set ? CARDS.filter(set.filter) : CARDS;
  const pools = RKEYS.reduce((a,k) => (a[k] = source.filter(c => c.rarity === k), a), {});
  const ladder = ['ultra','legend','holo','epic','rare','common'];

  return Array.from({ length: n }, () => {
    const want = rollRarity();
    let i = ladder.indexOf(want);
    while (i < ladder.length && !pools[ladder[i]].length) i += 1;
    // Si même les communes manquent, on remonte vers le haut.
    if (i >= ladder.length) {
      i = ladder.length - 1;
      while (i >= 0 && !pools[ladder[i]].length) i -= 1;
    }
    const pool = pools[ladder[i]] || source;
    return pool[randBelow(pool.length)];
  }).sort((a,b) => ORDER[a.rarity] - ORDER[b.rarity]);
}

/** Collections proposables en booster thématique (assez de cartes dedans). */
function packableSets() {
  return COLLECTIONS.filter(x => !x.mine
    && ['Franchises','Séries','Divisions'].indexOf(x.group) !== -1
    && CARDS.filter(x.filter).length >= 8);
}

/* ---------------------------------------------------------------------
   5. Effet holographique
   Écriture directe des variables CSS sur le nœud, jamais de re-rendu.
   Calé sur requestAnimationFrame : pointermove peut tirer plus vite que
   le rafraîchissement de l'écran, on calculerait des frames jamais vues.
   --------------------------------------------------------------------- */
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let raf = null, pending = null, pendingEl = null;

function paint() {
  raf = null;
  if (!pendingEl || !pending) return;
  const { x, y } = pending, el = pendingEl;
  el.style.setProperty('--px', ((x + .5) * 100).toFixed(2) + '%');
  el.style.setProperty('--py', ((y + .5) * 100).toFixed(2) + '%');
  // --pxn / --pyn : la même position en nombre pur (0 → 1). Les fonctions
  // hsl() ne peuvent pas consommer un pourcentage comme angle de teinte,
  // il leur faut un scalaire. C'est ce qui permet à la couleur du foil de
  // CHANGER avec le mouvement, et pas seulement de glisser.
  el.style.setProperty('--pxn', (x + .5).toFixed(3));
  el.style.setProperty('--pyn', (y + .5).toFixed(3));
  el.style.setProperty('--rx', (-y * 16).toFixed(2) + 'deg');
  el.style.setProperty('--ry', (x * 16).toFixed(2) + 'deg');
  const d = Math.min(1, Math.hypot(x, y) * 2);
  el.style.setProperty('--dist', d.toFixed(3));
  el.style.setProperty('--glare', (.16 + d * .44).toFixed(3));
}
function rest(el) {
  el.dataset.resting = 'true';
  el.style.setProperty('--rx','0deg'); el.style.setProperty('--ry','0deg');
  el.style.setProperty('--px','50%');  el.style.setProperty('--py','50%');
  el.style.setProperty('--pxn','0.5'); el.style.setProperty('--pyn','0.5');
  el.style.setProperty('--dist','0');  el.style.setProperty('--glare','0');
}
document.addEventListener('pointermove', e => {
  if (reduced) return;
  const el = e.target.closest && e.target.closest('.tcg');
  if (!el || el.classList.contains('tcg--locked')) return;
  const r = el.getBoundingClientRect();
  pendingEl = el;
  pending = { x:(e.clientX - r.left)/r.width - .5, y:(e.clientY - r.top)/r.height - .5 };
  el.dataset.resting = 'false';
  if (raf === null) raf = requestAnimationFrame(paint);
}, { passive:true });

document.addEventListener('pointerout', e => {
  const el = e.target.closest && e.target.closest('.tcg');
  if (!el || el.contains(e.relatedTarget)) return;
  rest(el);
}, { passive:true });

/* ---------------------------------------------------------------------
   6. Rendu d'une carte
   --------------------------------------------------------------------- */
const LAB = ['AVG','HR','RBI','OPS'];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
  c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const initials = n => String(n).split(' ').slice(0,2).map(w => w[0] || '').join('').toUpperCase();
const teamLogo = team => `https://www.mlbstatic.com/team-logos/team-cap-on-light/${team}.svg`;

/** Mini-terrain avec la position du joueur allumée. */
function fieldSVG(c) {
  return `<svg class="tcg__field" viewBox="0 0 100 100" aria-hidden="true">
    <path d="M50 96 L8 54 A60 60 0 0 1 92 54 Z" fill="var(--fld-grass)"/>
    <path d="M50 96 L26 72 A34 34 0 0 1 74 72 Z" fill="var(--fld-dirt)"/>
    <circle cx="50" cy="62" r="7" fill="var(--fld-dirt)"/>
    <circle cx="50" cy="88" r="6" fill="var(--fld-dirt)"/>
    <path d="M50 96 L8 54" stroke="#fff" stroke-width="1.4" opacity=".85" fill="none"/>
    <path d="M50 96 L92 54" stroke="#fff" stroke-width="1.4" opacity=".85" fill="none"/>
    <circle cx="${c.posX}" cy="${c.posY}" r="9" fill="var(--pos-glow)" opacity=".85"/>
    <circle cx="${c.posX}" cy="${c.posY}" r="9" fill="none" stroke="#fff" stroke-width="1.6"/>
    <text x="${c.posX}" y="${c.posY + 3.4}" text-anchor="middle" fill="#fff"
      font-size="8" font-weight="700" font-family="system-ui,sans-serif"
      textLength="${String(c.pos).length > 2 ? 15 : 11}" lengthAdjust="spacingAndGlyphs"
    >${esc(c.pos)}</text>
  </svg>`;
}

function cardHTML(c, locked) {
  const r = RARITY[c.rarity] || RARITY.common;
  const st = cardStats(c);
  const ovr = overall(c);
  const longClass = c.name.length > 15 ? 2 : c.name.length > 11 ? 1 : 0;

  const tagChips = (c.tags || []).slice(0,2).map(t => {
    const meta = TAGS[t]; if (!meta) return '';
    return `<span class="tcg__tag" style="background:${meta.hex}">${meta.label}</span>`;
  }).join('');

  // Une carte verrouillée reste LISIBLE : nom, poste, équipe, terrain.
  // La version précédente la noircissait au point qu'on ne voyait plus
  // rien — or c'est justement en voyant ce qui manque qu'on a envie de
  // compléter un classeur. Seuls la photo et le foil sont masqués.
  return `<div class="tcg ${locked ? 'tcg--locked' : ''}" data-rarity="${c.rarity}"
    style="--t1:${esc(c.c1 || '#39424f')};--t2:${esc(c.c2 || '#8b98a8')}"
    data-resting="true" role="img"
    aria-label="${esc(c.name)}, ${esc(c.posName)}, ${esc(c.teamName || c.team)}, ${r.label}${
      locked ? ', non débloquée' : ''}">
    <div class="tcg__tilt">
      <div class="tcg__frame"><div class="tcg__inner">

        <div class="tcg__head">
          <span class="tcg__pos">${esc(c.pos)}</span>
          <h3 class="tcg__name" data-long="${longClass}">${esc(c.name)}</h3>
          ${c.num ? `<span class="tcg__num">${esc(c.num)}</span>` : ''}
        </div>

        <div class="tcg__art">
          ${locked
            ? `<span class="tcg__silh" aria-hidden="true">?</span>`
            : `<span class="tcg__ini">${esc(initials(c.name))}</span>
               ${c.img ? `<img src="${esc(c.img)}" alt="" loading="lazy" onerror="this.remove()">` : ''}`}
          ${c.team && !c.custom
            ? `<img class="tcg__logo" src="${esc(teamLogo(c.team))}" alt=""
                 loading="lazy" onerror="this.remove()">` : ''}
          ${tagChips && !locked ? `<div class="tcg__tags">${tagChips}</div>` : ''}
          ${fieldSVG(c)}
          ${c.rarity === 'ultra' && !locked ? '<span class="tcg__play"></span>' : ''}
        </div>

        <div class="tcg__banner">
          <span>${esc(c.teamName || c.team || '—')}</span>
          <span class="tcg__hand">${c.pos === 'P' ? 'L' : 'F'}${esc(c.bats || 'D')}</span>
        </div>

        <div class="tcg__stats">
          ${st.map(x => `<div class="tcg__stat" title="${esc(x.t)}">
            <span class="l">${x.l}</span><span class="v">${esc(x.v)}</span></div>`).join('')}
        </div>

        <div class="tcg__foot">
          <span class="tcg__gem"><i></i>${r.label}</span>
          ${locked ? `<span>${c.season ? esc(c.season) : ''}</span>`
            : `<span class="tcg__ovr" style="--g:${ovr.hex}">${ovr.grade}</span>`}
        </div>

      </div></div>
      <div class="tcg__foil"></div>
      <div class="tcg__glitter"></div>
      <div class="tcg__glare"></div>
    </div>
  </div>`;
}

/* ---------------------------------------------------------------------
   MOTIFS DE SACHET
   Chaque série a son visuel. Ils sont dessinés en SVG plutôt qu'importés
   en image : ça reste net à toute taille, ça pèse quelques kilo-octets, et
   surtout la couleur s'adapte à la collection choisie.
   Un visuel personnalisé (photo importée) peut remplacer le motif depuis
   les Réglages.
   --------------------------------------------------------------------- */
const PACK_ART = {
  batter: { name:'Batteur', draw: () => `
    <g transform="translate(100,132) scale(.95)" fill="#fff" opacity=".95">
      <circle cx="6" cy="-40" r="8.5"/>
      <path d="M-2 -31 q10 -3 17 4 l10 12 q3 4 -1 7 q-4 3 -7 -1 l-8 -9 l-3 22
               l12 20 q3 5 -2 8 q-5 3 -8 -2 l-14 -22 l-11 20 q-3 5 -8 2
               q-5 -3 -2 -8 l12 -22 l4 -25 q1 -6 9 -6 z"/>
      <path d="M14 -28 l34 -20 q4 -2 6 2 q2 4 -2 6 l-34 20 z"/>
    </g>` },

  pitcher: { name:'Lanceur', draw: () => `
    <g transform="translate(100,132) scale(.95)" fill="#fff" opacity=".95">
      <circle cx="0" cy="-42" r="8.5"/>
      <path d="M-6 -33 q9 -4 15 3 l4 16 l14 -6 q5 -2 7 3 q2 5 -3 7 l-20 8
               l-2 16 l14 22 q3 5 -2 8 q-5 3 -8 -2 l-15 -24 l-12 18
               q-3 5 -8 2 q-5 -3 -2 -8 l13 -20 l3 -30 q1 -7 8 -8 z"/>
      <circle cx="-24" cy="-20" r="6" fill="#fff"/>
    </g>` },

  glove: { name:'Gant', draw: () => `
    <g transform="translate(100,130)" fill="#fff" opacity=".95">
      <path d="M-30 6 q-6 -30 6 -44 q6 -7 12 -2 l3 18 l4 -24 q2 -8 9 -7
               q7 1 6 9 l-2 22 l6 -20 q3 -8 10 -5 q6 3 4 11 l-5 19 l7 -12
               q4 -7 10 -3 q5 4 1 11 l-10 20 q-6 12 -20 14 l-18 2
               q-14 1 -23 -9 z"/>
      <circle cx="0" cy="34" r="13" fill="none" stroke="#fff" stroke-width="3"/>
      <path d="M-9 24 q9 10 0 20" fill="none" stroke="#fff" stroke-width="2"/>
      <path d="M9 24 q-9 10 0 20" fill="none" stroke="#fff" stroke-width="2"/>
    </g>` },

  ball: { name:'Balle', draw: () => `
    <g transform="translate(100,128)">
      <circle r="44" fill="#fff" opacity=".95"/>
      <path d="M-27 -33 q-14 33 0 66" fill="none" stroke="#BF0D3E" stroke-width="3.4"
        stroke-dasharray="5 6" stroke-linecap="round"/>
      <path d="M27 -33 q14 33 0 66" fill="none" stroke="#BF0D3E" stroke-width="3.4"
        stroke-dasharray="5 6" stroke-linecap="round"/>
    </g>` },

  diamond: { name:'Terrain', draw: () => `
    <g transform="translate(100,128)" opacity=".95">
      <path d="M0 42 L-42 0 A60 60 0 0 1 42 0 Z" fill="#fff" opacity=".22"/>
      <path d="M0 42 L-42 0 A60 60 0 0 1 42 0 Z" fill="none" stroke="#fff" stroke-width="2.4"/>
      <path d="M0 42 L-24 18 A34 34 0 0 1 24 18 Z" fill="#fff" opacity=".5"/>
      <circle cx="0" cy="8" r="7" fill="#fff"/>
      <rect x="-5" y="37" width="10" height="10" fill="#fff" transform="rotate(45 0 42)"/>
    </g>` },
};
const PACK_ART_KEYS = Object.keys(PACK_ART);

/** Motif choisi pour une collection : réglage perso, sinon par défaut. */
function packArtFor(setId) {
  const custom = (state.packArt || {})[setId || '_default'];
  if (custom && custom.indexOf('data:') === 0) return { photo: custom };
  const key = custom || (state.packArt || {})._default || 'batter';
  return PACK_ART[key] ? { draw: PACK_ART[key].draw } : { draw: PACK_ART.batter.draw };
}

/* --- Le sachet ------------------------------------------------------- */
function sachetSVG(set) {
  const ac = (set && set.accent) || '#BF0D3E';
  const label = set ? set.name.toUpperCase().slice(0,26) : 'SÉRIE 1 · ÉDITION LIMITÉE';
  const art = packArtFor(set && set.id);
  const artSVG = art.photo
    ? `<image href="${esc(art.photo)}" x="24" y="86" width="152" height="112"
         preserveAspectRatio="xMidYMid slice" opacity=".92"/>`
    : art.draw();
  /* Pochette façon MLB/NBA : marine profond, bande rouge, silhouette de
     batteur en réserve, bandeau holographique, encoche de déchirure.
     La silhouette est le codage visuel des ligues américaines — c'est
     elle qui fait « produit officiel » plutôt que « sachet générique ». */
  return `<svg viewBox="0 0 200 300" width="100%" height="100%" aria-hidden="true"><defs>
   <linearGradient id="pkBg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#0a2c56"/><stop offset="42%" stop-color="#041E42"/>
    <stop offset="100%" stop-color="#010c1c"/></linearGradient>
   <linearGradient id="pkFoil" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%" stop-color="#8ad8ff" stop-opacity=".0"/>
    <stop offset="22%" stop-color="#ffd6f5" stop-opacity=".55"/>
    <stop offset="40%" stop-color="#c9ffe8" stop-opacity=".35"/>
    <stop offset="60%" stop-color="#ffe9a3" stop-opacity=".5"/>
    <stop offset="80%" stop-color="#b9a3ff" stop-opacity=".4"/>
    <stop offset="100%" stop-color="#8ad8ff" stop-opacity=".0"/></linearGradient>
   <linearGradient id="pkSteel" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%" stop-color="#8c96a4"/><stop offset="30%" stop-color="#e8eef5"/>
    <stop offset="55%" stop-color="#7d8896"/><stop offset="78%" stop-color="#dfe6ee"/>
    <stop offset="100%" stop-color="#8c96a4"/></linearGradient>
   <filter id="pkGrain"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="3"/>
    <feColorMatrix type="saturate" values="0"/>
    <feComponentTransfer><feFuncA type="linear" slope=".06"/></feComponentTransfer>
    <feComposite operator="in" in2="SourceGraphic"/></filter>
   <clipPath id="pkClip"><rect x="3" y="3" width="194" height="294" rx="10"/></clipPath></defs>

   <rect x="3" y="3" width="194" height="294" rx="10" fill="url(#pkBg)"/>
   <g clip-path="url(#pkClip)">
     <!-- bande rouge diagonale -->
     <path d="M-30 214 L230 150 L230 196 L-30 260 Z" fill="${ac}" opacity=".92"/>
     <path d="M-30 208 L230 144 L230 150 L-30 214 Z" fill="#ffffff" opacity=".85"/>
     ${artSVG}
     <!-- bandeau holographique -->
     <rect x="3" y="242" width="194" height="17" fill="url(#pkFoil)"/>
     <rect x="3" y="3" width="194" height="294" filter="url(#pkGrain)"/>
   </g>

   <rect x="3" y="3" width="194" height="294" rx="10" fill="none"
     stroke="url(#pkSteel)" stroke-width="1.6" opacity=".75"/>

   <text x="100" y="42" text-anchor="middle" fill="#ffffff" font-size="30" letter-spacing="4"
     textLength="150" lengthAdjust="spacingAndGlyphs"
     font-family="Bebas Neue,Arial Narrow,sans-serif">DIAMOND</text>
   <text x="100" y="66" text-anchor="middle" fill="${ac}" font-size="24" letter-spacing="11"
     textLength="120" lengthAdjust="spacingAndGlyphs" style="paint-order:stroke"
     font-family="Bebas Neue,Arial Narrow,sans-serif"
     stroke="#ffffff" stroke-width="1.1">FOIL</text>
   <text x="100" y="82" text-anchor="middle" fill="#9fb2c8" font-size="6.5" letter-spacing="3"
     textLength="130" lengthAdjust="spacingAndGlyphs"
     font-family="monospace">${label}</text>

   <text x="100" y="192" text-anchor="middle" fill="#ffffff" font-size="15" letter-spacing="2.5"
     textLength="140" lengthAdjust="spacingAndGlyphs"
     font-family="Bebas Neue,Arial Narrow,sans-serif">5 CARTES PAR SACHET</text>
   <text x="100" y="236" text-anchor="middle" fill="#dbe6f2" font-size="6" letter-spacing="2.4"
     textLength="150" lengthAdjust="spacingAndGlyphs"
     font-family="monospace">1 RARE OU MIEUX GARANTIE</text>

   <!-- encoche de déchirure -->
   <line x1="3" y1="272" x2="197" y2="272" stroke="#01070f" stroke-width="3.2" opacity=".8"/>
   <line x1="14" y1="272" x2="186" y2="272" stroke="#ffffff" stroke-width=".9"
     stroke-dasharray="3 5" opacity=".45"/>
   <path d="M3 266 l11 6 l-11 6 z" fill="#ffffff" opacity=".65"/>
   <path d="M197 266 l-11 6 l11 6 z" fill="#ffffff" opacity=".65"/>
   <text x="100" y="288" text-anchor="middle" fill="#7f8fa3" font-size="5.5" letter-spacing="2"
     textLength="60" lengthAdjust="spacingAndGlyphs"
     font-family="monospace">DÉCHIRER ICI</text></svg>`;
}

function backArt() {
  return `<svg viewBox="0 0 100 140" width="100%" height="100%" aria-hidden="true"
    style="display:block"><defs>
   <linearGradient id="pb" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#1c2740"/><stop offset="50%" stop-color="#0c121c"/>
    <stop offset="100%" stop-color="#05080d"/></linearGradient>
   <linearGradient id="pg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#ffe9a3"/><stop offset="100%" stop-color="#a8760f"/></linearGradient></defs>
   <rect width="100" height="140" fill="url(#pb)"/>
   <rect x="4" y="4" width="92" height="132" rx="5" fill="none"
     stroke="url(#pg)" stroke-width=".8" opacity=".5"/>
   <rect x="7.5" y="7.5" width="85" height="125" rx="3.5" fill="none"
     stroke="#f5b942" stroke-width=".3" opacity=".25"/>
   <circle cx="50" cy="66" r="27" fill="none" stroke="url(#pg)" stroke-width=".7" opacity=".7"/>
   <circle cx="50" cy="66" r="22" fill="none" stroke="#f2f5f0" stroke-width=".3" opacity=".28"/>
   <path d="M33 47 Q50 66 33 85" fill="none" stroke="#b4573a" stroke-width="1"
     stroke-dasharray="2 2.6" opacity=".85"/>
   <path d="M67 47 Q50 66 67 85" fill="none" stroke="#b4573a" stroke-width="1"
     stroke-dasharray="2 2.6" opacity=".85"/>
   <text x="50" y="112" text-anchor="middle" fill="#f2f5f0" font-size="8" letter-spacing="2.2"
     font-family="Bebas Neue,Arial Narrow,sans-serif">DIAMOND FOIL</text>
   <text x="50" y="121" text-anchor="middle" fill="#8b97a6" font-size="4" letter-spacing="1.8"
     font-family="monospace">SÉRIE 1</text></svg>`;
}

/* ---------------------------------------------------------------------
   7. Utilitaires d'interface
   --------------------------------------------------------------------- */
let toastTimer = null;
function toast(msg) {
  const old = document.querySelector('.toast');
  if (old) old.remove();
  const el = document.createElement('div');
  el.className = 'toast'; el.setAttribute('role','status'); el.textContent = msg;
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 3200);
}
const $ = s => document.querySelector(s);
function syncPurse() {
  $('#purse').textContent = state.boosters;
  const t = $('#tokens'); if (t) t.textContent = state.tokens || 0;
}

/**
 * Convertit tous les doublons en jetons.
 * On garde toujours UN exemplaire de chaque carte : le classeur ne doit
 * jamais se vider par accident, seuls les surplus partent.
 */
function meltDuplicates() {
  let gained = 0, count = 0;
  Object.keys(state.owned).forEach(uid => {
    const extra = state.owned[uid] - 1;
    if (extra <= 0) return;
    const card = CARDS.filter(c => c.uid === uid)[0];
    if (!card) return;
    gained += extra * (DUST[card.rarity] || 10);
    count += extra;
    state.owned[uid] = 1;
  });
  if (!count) { toast('Aucun doublon à convertir.'); return; }
  state.tokens = (state.tokens || 0) + gained;
  save(); syncPurse();
  toast(`${count} doublon${count>1?'s':''} converti${count>1?'s':''} · +${gained} jetons`);
  renderBinder();
}

/** Nombre total de doublons et leur valeur. */
function duplicateSummary() {
  let n = 0, value = 0;
  Object.keys(state.owned).forEach(uid => {
    const extra = state.owned[uid] - 1;
    if (extra <= 0) return;
    const card = CARDS.filter(c => c.uid === uid)[0];
    if (!card) return;
    n += extra; value += extra * (DUST[card.rarity] || 10);
  });
  return { n, value };
}
function ownedCount() { return Object.keys(state.owned).filter(k => state.owned[k] > 0).length; }
function owns(card) { return (state.owned[card.uid] || 0) > 0; }
function copies(card) { return state.owned[card.uid] || 0; }

/**
 * Parcourt les collections et attribue les récompenses de complétion.
 * Appelée après chaque ouverture. `state.claimed` empêche de récompenser
 * deux fois la même collection.
 */
function checkCollections() {
  state.claimed = state.claimed || [];
  COLLECTIONS.forEach(set => {
    if (set.mine) return;                      // pas d'auto-récompense
    if (state.claimed.indexOf(set.id) !== -1) return;
    const members = CARDS.filter(set.filter);
    if (!members.length) return;
    if (!members.every(owns)) return;

    state.claimed.push(set.id);
    if (set.reward.type === 'boosters') state.boosters += set.reward.amount;
    if (set.reward.type === 'video') {
      state.videos = state.videos || [];
      if (state.videos.indexOf('set:' + set.id) === -1) state.videos.push('set:' + set.id);
    }
    pendingRewards.push(set);
  });
}
let pendingRewards = [];

/** Progression d'une collection. */
function setProgress(set) {
  if (set.mine) {
    // Une collection perso se mesure aux cartes créées, toutes possédées
    // par définition. L'objectif fixé par l'utilisateur sert de total.
    const got = (state.customs || []).filter(set.filter).length;
    const total = set.goal || Math.max(got, 1);
    return { got, total, pct: Math.min(1, got / total) };
  }
  const members = CARDS.filter(set.filter);
  const got = members.filter(owns).length;
  return { got, total: members.length, pct: members.length ? got / members.length : 0 };
}

/* ---------------------------------------------------------------------
   8. Vue — Boosters
   --------------------------------------------------------------------- */
const vOpen = $('#view-open');
let keyHandler = null;

function dailyAvailable() {
  if (!state.lastDaily) return true;
  const start = new Date(); start.setHours(0,0,0,0);
  return new Date(state.lastDaily) < start;
}

function renderOpen() {
  const gift = dailyAvailable() ? `
    <div class="gift">
      <div><div style="font-size:14px">${DAILY_PACKS} boosters du jour disponibles</div>
        <div style="font-size:12px;color:var(--chalk-dim);margin-top:2px">Se rechargent chaque jour</div></div>
      <button class="btn sm" id="claim">Récupérer</button>
    </div>` : '';

  vOpen.innerHTML = `
    <p class="eyebrow">Série 1 · ${CARDS.length} cartes</p>
    <h1>Boosters</h1>
    <p class="sub">${PACK_SIZE} cartes par sachet, ${DAILY_PACKS} sachets offerts chaque jour.
      Chaque carte est tirée indépendamment.</p>
    <div class="odds">${RKEYS.slice().reverse().map(k =>
      `<span style="color:${RARITY[k].hex};border-color:${RARITY[k].hex}55">
        ${RARITY[k].label} ${RARITY[k].odds}</span>`).join('')}</div>
    ${gift}
    <div class="stage" id="stage"></div>`;

  const claim = $('#claim');
  if (claim) claim.addEventListener('click', () => {
    state.boosters += DAILY_PACKS; state.lastDaily = new Date().toISOString(); save();
    syncPurse(); toast(`${DAILY_PACKS} boosters du jour récupérés`); renderOpen();
  });
  sealed();
}

let packSet = '';   // collection choisie pour le prochain booster

function sealed() {
  const stage = $('#stage');
  const none = state.boosters <= 0;
  const sets = packableSets();
  const chosen = sets.filter(x => x.id === packSet)[0];
  const dup = duplicateSummary();

  stage.innerHTML = `
    <div class="packpick">
      <label class="eyebrow" for="packSet">Type de sachet</label>
      <select class="field" id="packSet">
        <option value="">Série 1 — toutes les cartes</option>
        ${['Séries','Divisions','Franchises'].map(g => `<optgroup label="${g}">
          ${sets.filter(x => x.group === g).map(x =>
            `<option value="${esc(x.id)}" ${packSet === x.id ? 'selected' : ''}
             >${esc(x.name)} (${CARDS.filter(x.filter).length})</option>`).join('')}
        </optgroup>`).join('')}
      </select>
    </div>

    <button class="sachet-btn" id="tearBtn" ${none ? 'disabled' : ''}
      aria-label="Ouvrir le booster">${sachetSVG(chosen)}</button>

    <div>
      <div style="font-family:var(--font-display);font-size:23px;letter-spacing:.05em">
        ${none ? 'Plus de booster'
               : state.boosters + ' booster' + (state.boosters > 1 ? 's' : '') + ' en réserve'}</div>
      <div style="font-size:13px;color:var(--chalk-dim);margin-top:5px">
        ${none ? 'Convertissez vos doublons ou revenez demain.'
               : "Cliquez sur le sachet pour l'ouvrir"}</div>
    </div>

    <div class="shop">
      <div class="shop__row">
        <span>Jetons</span>
        <b class="mono">${state.tokens || 0}</b>
        <button class="btn ghost sm" id="buyPack"
          ${(state.tokens || 0) < PACK_COST ? 'disabled' : ''}>
          Acheter un booster · ${PACK_COST}</button>
      </div>
      ${dup.n ? `<div class="shop__row">
        <span>${dup.n} doublon${dup.n>1?'s':''}</span>
        <b class="mono">+${dup.value}</b>
        <button class="btn ghost sm" id="melt">Convertir en jetons</button>
      </div>` : `<p class="hint" style="margin:0">
        Les doublons se convertissent en jetons, et les jetons en boosters.</p>`}
    </div>`;

  $('#packSet').addEventListener('change', e => { packSet = e.target.value; sealed(); });
  $('#tearBtn').addEventListener('click', () => startTear(packSet));
  const buy = $('#buyPack');
  if (buy) buy.addEventListener('click', () => {
    if ((state.tokens || 0) < PACK_COST) return;
    state.tokens -= PACK_COST; state.boosters += 1; save(); syncPurse();
    toast('Booster acheté'); sealed();
  });
  const melt = $('#melt');
  if (melt) melt.addEventListener('click', meltDuplicates);
}

function startTear(setId) {
  if (state.boosters <= 0) return;
  if (!CARDS.length) { toast("Chargez d'abord les données MLB (onglet Classeur)."); return; }
  state.boosters -= 1; save(); syncPurse();
  const cards = drawPack(PACK_SIZE, setId);
  const before = new Set(Object.keys(state.owned));
  cards.forEach(c => { state.owned[c.uid] = (state.owned[c.uid] || 0) + 1; });
  // Une carte Ultra nouvellement obtenue débloque son film.
  cards.forEach(c => {
    if (c.rarity === 'ultra' && !before.has(c.uid)) {
      state.videos = state.videos || [];
      if (state.videos.indexOf(c.uid) === -1) state.videos.push(c.uid);
    }
  });
  checkCollections();
  save();

  // Déchirure : les deux moitiés partent en sens opposés avec un bord
  // dentelé (masque en zigzag), la scène tremble une fraction de seconde,
  // et des éclats d'aluminium se dispersent. Un simple fondu ne « lit »
  // pas comme un sachet qu'on ouvre.
  const set = packSet ? COLLECTIONS.filter(x => x.id === packSet)[0] : null;
  const shards = Array.from({ length: 14 }, (_, i) => {
    const a = (i / 14) * Math.PI * 2 + Math.random() * .5;
    const d = 90 + Math.random() * 130;
    return `<i class="shard" style="--dx:${(Math.cos(a)*d).toFixed(0)}px;
      --dy:${(Math.sin(a)*d).toFixed(0)}px;--sd:${(Math.random()*.2).toFixed(2)}s"></i>`;
  }).join('');

  $('#stage').innerHTML = `<div class="tear${reduced ? '' : ' is-shake'}">
    <div class="tear-h t">${sachetSVG(set)}</div>
    <div class="tear-h b">${sachetSVG(set)}</div>
    <div class="flash"></div>
    <div class="rip"></div>
    ${reduced ? '' : shards}
  </div>`;
  setTimeout(() => reveal(cards), reduced ? 10 : 780);
}

/** Position d'une carte selon sa profondeur dans la pile. Formule unique,
 *  utilisée au rendu initial ET au re-empilement : la dupliquer la ferait
 *  diverger à la première retouche. */
const stackTransform = d =>
  `translateY(${d * 16}px) scale(${1 - d * .04}) rotate(${d === 0 ? 0 : d === 1 ? 3.5 : -3}deg)`;

function reveal(cards) {
  const stage = $('#stage');
  let idx = 0;

  /**
   * Une carte à la fois, en grand format, et surtout SANS MINUTEUR.
   *
   * La version précédente enchaînait automatiquement après un délai fixe :
   * on n'avait pas le temps de regarder la carte qu'elle partait déjà.
   * Ici rien n'avance tant qu'on ne le demande pas — c'est le joueur qui
   * décide combien de temps il contemple sa carte, ce qui est exactement
   * le geste d'une ouverture de booster physique.
   */
  function paint() {
    const c = cards[idx];
    const last = idx === cards.length - 1;
    const meta = RARITY[c.rarity];

    stage.innerHTML = `
      <div class="reveal">
        <div class="reveal__pips" aria-hidden="true">
          ${cards.map((x,i) => `<span class="${i < idx ? 'is-done' : i === idx ? 'is-now' : ''}"
            style="--pc:${RARITY[x.rarity].hex}"></span>`).join('')}
        </div>
        <p class="eyebrow">Carte ${idx + 1} sur ${cards.length}</p>

        <div class="reveal__stack" id="revealStack">
          ${idx < cards.length - 1 ? `
            <div class="reveal__behind" style="--d:2"></div>
            <div class="reveal__behind" style="--d:1"></div>` : ''}
          <button class="flip-btn" id="flipBtn" aria-label="Retourner la carte">
            <div class="flipper" id="flipper">
              <div class="face back">${backArt()}</div>
              <div class="face front">${cardHTML(c, false)}</div>
            </div>
          </button>
        </div>

        <div class="reveal__foot" id="revealFoot">
          <p class="hint">Cliquez sur la carte pour la retourner</p>
        </div>
      </div>`;

    const flipper = $('#flipper');
    const btn = $('#flipBtn');
    const foot = $('#revealFoot');
    const stack = $('#revealStack');
    let flipped = false;

    function flip() {
      if (flipped) return;
      flipped = true;
      flipper.classList.add('flipped');
      btn.disabled = true;
      if (!reduced) burst(stack, c.rarity);

      // Le bouton « suivant » n'apparaît qu'après le retournement, jamais
      // avant : sinon on peut passer une carte sans l'avoir vue.
      setTimeout(() => {
        foot.innerHTML = `
          <div class="reveal__got" style="--ac:${meta.hex}">
            <span class="eyebrow" style="color:${meta.hex}">${meta.label}</span>
            <span class="reveal__name">${esc(c.name)}</span>
            ${copies(c) > 1 ? '<span class="reveal__dupe">Doublon</span>'
                            : '<span class="reveal__new">Nouvelle</span>'}
          </div>
          <div class="reveal__actions">
            <button class="btn ghost sm" id="zoomBtn">Voir en grand</button>
            <button class="btn" id="nextBtn">${last ? 'Voir les 5 cartes' : 'Carte suivante'}</button>
          </div>
          <p class="hint">Espace ou Entrée pour continuer</p>`;

        $('#zoomBtn').addEventListener('click', () => openCard(c));
        $('#nextBtn').addEventListener('click', next);
      }, reduced ? 10 : 620);

      if (c.rarity === 'ultra') {
        setTimeout(() => openVideo(c), reduced ? 20 : 1500);
      }
    }

    function next() {
      if (idx === cards.length - 1) { summary(cards); return; }
      stack.classList.add('is-leaving');
      setTimeout(() => { idx += 1; paint(); }, reduced ? 10 : 280);
    }

    btn.addEventListener('click', flip);

    detachKeys();
    keyHandler = e => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      // Ne pas voler la barre d'espace à un bouton ou un champ ciblé.
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      if (!flipped) flip(); else next();
    };
    window.addEventListener('keydown', keyHandler);
  }

  paint();
}

function detachKeys() {
  if (keyHandler) { window.removeEventListener('keydown', keyHandler); keyHandler = null; }
}

/**
 * Mise en scène de la révélation. L'intensité monte par palier : une
 * Commune ne reçoit qu'un halo discret, une Légende déclenche rayons,
 * onde, particules et flash plein écran. Sans cette gradation, toutes
 * les cartes se valent visuellement et la rareté ne se ressent pas.
 */
function burst(host, rarity) {
  const hex = RARITY[rarity].hex;
  const add = cls => {
    const el = document.createElement('div');
    el.className = 'fx ' + cls;
    el.style.setProperty('--fx', hex);
    host.appendChild(el);
    setTimeout(() => el.remove(), 2000);
    return el;
  };

  add('fx-glow');
  if (rarity === 'common') return;

  add('fx-wave');
  if (rarity === 'rare') return;

  add('fx-rays');

  // Particules : direction et distance propres à chacune.
  const count = rarity === 'legend' ? 26 : rarity === 'holo' ? 18 : 10;
  for (let i = 0; i < count; i += 1) {
    const s = document.createElement('div');
    s.className = 'spark';
    const angle = (i / count) * Math.PI * 2 + Math.random() * .4;
    const dist = 110 + Math.random() * 120;
    s.style.setProperty('--fx', hex);
    s.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
    s.style.setProperty('--dy', Math.sin(angle) * dist + 'px');
    s.style.animationDelay = (Math.random() * .18) + 's';
    host.appendChild(s);
    setTimeout(() => s.remove(), 1800);
  }

  if (rarity === 'legend') {
    const f = document.createElement('div');
    f.className = 'screenflash';
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 1200);
  }
}

function summary(cards) {
  detachKeys();
  const best = cards.slice().sort((a,b) => ORDER[a.rarity] - ORDER[b.rarity]).pop();
  const title = best.rarity === 'common'
    ? `${cards.length} cartes ajoutées`
    : `${RARITY[best.rarity].label} obtenue`;

  const rewards = pendingRewards.slice();
  pendingRewards = [];
  const rewardHTML = rewards.length ? `
    <div class="rewards">${rewards.map(r => `
      <div class="reward" style="--ac:${r.accent || 'var(--sodium)'}">
        <span class="eyebrow" style="color:${r.accent || 'var(--sodium)'}">Collection complétée</span>
        <div style="font-family:var(--font-display);font-size:20px;letter-spacing:.04em;margin-top:4px">
          ${esc(r.name)}</div>
        <div style="font-size:12px;color:var(--chalk-dim);margin-top:3px">
          Récompense : ${esc(r.reward.label)}</div>
      </div>`).join('')}</div>` : '';
  syncPurse();

  $('#stage').innerHTML = `
    <div><p class="eyebrow">Booster ouvert</p>
      <h2 style="margin-top:8px;color:${RARITY[best.rarity].hex}">${title}</h2></div>
    ${rewardHTML}
    <div class="res-row">${cards.map((c,i) =>
      `<div class="res-item" data-card="${esc(c.uid)}" role="button" tabindex="0"
        style="animation-delay:${i * 100}ms">${cardHTML(c,false)}</div>`).join('')}</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center">
      <button class="btn" id="again" ${state.boosters <= 0 ? 'disabled' : ''}>Ouvrir un autre booster</button>
      <button class="btn ghost" data-go="binder">Voir le classeur</button>
    </div>`;
  $('#again').addEventListener('click', sealed);
  $('#stage').querySelectorAll('[data-card]').forEach(el => {
    const open = () => {
      const c = cards.filter(x => x.uid === el.dataset.card)[0];
      if (c) openCard(c);
    };
    el.addEventListener('click', open);
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  });
}

/* ---------------------------------------------------------------------
   8a. Carte en grand
   Une carte de 150 px dans le classeur ne se regarde pas : le foil ne
   s'exprime pas, les stats se lisent mal. Un clic ouvre le plein format.
   --------------------------------------------------------------------- */
function openCard(card, locked) {
  const prev = document.querySelector('.zoom');
  if (prev) prev.remove();

  // Correction : la fiche affichait toujours la carte débloquée, donc un
  // clic sur un emplacement vide révélait la photo. L'état verrouillé se
  // déduit maintenant de la collection, et se propage au rendu.
  const isLocked = locked != null ? locked
    : (card.custom ? false : copies(card) === 0);

  const meta = RARITY[card.rarity];
  const ov = overall(card);
  const ab = abilities(card);
  const inSets = COLLECTIONS.filter(x => x.filter(card));

  const el = document.createElement('div');
  el.className = 'zoom';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', card.name);
  el.innerHTML = `
    <div class="zoom__inner">
      <div class="zoom__card">${cardHTML(card, isLocked)}</div>

      <div class="zoom__side">
        <div class="zoom__top">
          <div>
            <p class="eyebrow" style="color:${meta.hex}">${meta.label} · ${meta.odds}</p>
            <h2 class="zoom__name">${esc(card.name)}</h2>
            <p class="zoom__sub">${esc(card.posName || '')} ·
              ${esc(card.teamName || card.team || '')}${card.season ? ' · ' + esc(card.season) : ''}</p>
          </div>
          ${isLocked ? '' : `<div class="ovr" style="--g:${ov.hex}">
            <span class="ovr__g">${ov.grade}</span>
            <span class="ovr__l">Note</span>
          </div>`}
        </div>

        ${isLocked ? `
          <div class="zoom__locked">
            <p><b>Carte non débloquée.</b> Ouvrez des boosters pour l'obtenir —
              elle peut sortir d'un sachet « ${esc(card.teamName || card.team)} ».</p>
            <p class="hint">Les statistiques réelles s'afficheront une fois la carte en main.</p>
          </div>`
        : `
          <p class="zoom__hint">Chaque aptitude est notée de F à S, calculée à partir
            des statistiques réelles de la saison.</p>

          <div class="abil">
            ${ab.map(a => `
              <div class="abil__row">
                <span class="abil__name">${a.name}</span>
                <span class="abil__bar"><i style="width:${a.score}%;background:${a.hex}"></i></span>
                <span class="abil__g" style="color:${a.hex}">${a.grade}</span>
                <span class="abil__raw mono">${esc(a.raw)}</span>
                <p class="abil__why">${a.why}</p>
              </div>`).join('')}
          </div>

          <div class="zoom__facts">
            <p class="zoom__line"><span>${card.pos === 'P' ? 'Lance' : 'Frappe'}</span>${
              esc(HAND[card.bats] || '—')}</p>
            ${card.pos !== 'P' ? `<p class="zoom__line"><span>Lance</span>${
              esc(HAND[card.throws] || '—')}</p>` : ''}
            ${card.park ? `<p class="zoom__line"><span>Stade</span>${esc(card.park)}</p>` : ''}
            <p class="zoom__line"><span>Exemplaires</span>${card.custom ? 1 : copies(card)}</p>
          </div>`}

        ${inSets.length ? `<div class="zoom__sets">
          <p class="eyebrow" style="margin-bottom:8px">Compte pour</p>
          ${inSets.slice(0,6).map(x => `<span class="zoom__chip"
            style="--ac:${x.accent || 'var(--sodium)'}">${esc(x.name)}</span>`).join('')}
        </div>` : ''}

        <div class="zoom__actions">
          ${card.rarity === 'ultra' && !isLocked
            ? '<button class="btn" id="zoomVideo">▶ Voir le film</button>' : ''}
          <button class="btn ghost" id="zoomClose">Fermer</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(el);

  const close = () => { el.remove(); window.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  el.querySelector('#zoomClose').addEventListener('click', close);
  el.addEventListener('click', e => { if (e.target === el) close(); });
  const vb = el.querySelector('#zoomVideo');
  if (vb) vb.addEventListener('click', () => { close(); openVideo(card); });
  window.addEventListener('keydown', onKey);
  el.querySelector('#zoomClose').focus();
}

/* ---------------------------------------------------------------------
   8b. Lecteur « film »
   Dans l'application réelle, une carte Ultra ouvrirait une archive vidéo
   du joueur. Ici on met en scène le principe sans embarquer de média :
   pellicule animée, titre, et la carte elle-même en vedette.
   --------------------------------------------------------------------- */
function openVideo(card) {
  const old = document.querySelector('.cinema');
  if (old) old.remove();

  const wrap = document.createElement('div');
  wrap.className = 'cinema';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.setAttribute('aria-label', `Film débloqué : ${card.name}`);
  wrap.innerHTML = `
    <div class="cinema__box">
      <div class="cinema__screen">
        <div class="cinema__reel"></div>
        <div class="cinema__card">${cardHTML(card, false)}</div>
        <div class="cinema__scan"></div>
      </div>
      <div class="cinema__meta">
        <p class="eyebrow" style="color:${RARITY[card.rarity].hex}">Film débloqué</p>
        <h2 style="margin-top:6px">${esc(card.name)}</h2>
        <p style="font-size:13px;color:var(--chalk-dim);margin:8px 0 0;line-height:1.6">
          ${esc(card.season || '')} · ${esc(card.teamName || card.team)}<br>
          ${esc(card.park || '')}
        </p>
        <button class="btn" id="cinema-close" style="margin-top:20px">Continuer</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);

  const close = () => { wrap.remove(); window.removeEventListener('keydown', onEsc); };
  const onEsc = e => { if (e.key === 'Escape') close(); };
  wrap.querySelector('#cinema-close').addEventListener('click', close);
  wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
  window.addEventListener('keydown', onEsc);
  // Le focus part sur le bouton : sans ça, la tabulation reste piégée
  // derrière la fenêtre pour qui navigue au clavier.
  wrap.querySelector('#cinema-close').focus();
}

/* ---------------------------------------------------------------------
   9. Vue — Classeur
   --------------------------------------------------------------------- */
const vBinder = $('#view-binder');
const filters = { rarity:'all', team:'all', owned:false, q:'', set:'all' };

function renderBinder() {
  const owned = ownedCount(), total = CARDS.length;
  const pct = total ? Math.round(owned / total * 100) : 0;

  const perRarity = RKEYS.map(k => {
    const all = POOL[k].length;
    const got = POOL[k].filter(c => state.owned[c.id]).length;
    return `<span style="color:${RARITY[k].hex}">${RARITY[k].label}
      <b>${got}/${all}</b></span>`;
  }).reverse().join('');

  vBinder.innerHTML = `
    <p class="eyebrow">Classeur · Série 1</p>
    <div style="display:flex;flex-wrap:wrap;align-items:baseline;gap:8px 18px;margin-top:8px">
      <div class="mono" style="font-size:46px;line-height:1">${owned}<span
        style="color:var(--chalk-dim)">/${total}</span></div>
      <div style="font-family:var(--font-display);font-size:23px;letter-spacing:.05em;
        color:var(--sodium)">${pct}% complété</div>
    </div>
    <div class="meter"><i style="width:${pct}%"></i></div>
    <div class="tally">${perRarity}</div>
    ${catalogBanner()}
    ${(() => { const d = duplicateSummary(); return d.n ? `
      <div class="dupbar">
        <span><b class="mono">${d.n}</b> doublon${d.n>1?'s':''} en réserve</span>
        <span class="mono" style="color:var(--sodium)">+${d.value} jetons</span>
        <button class="btn ghost sm" id="meltBtn">Convertir</button>
      </div>` : ''; })()}

    <div class="filters">
      <input class="field" id="q" type="search" placeholder="Chercher un joueur"
        aria-label="Chercher un joueur" value="${esc(filters.q)}" style="width:214px">
      <div style="display:flex;gap:6px;flex-wrap:wrap" role="group" aria-label="Filtrer par rareté">
        <button class="chip" data-r="all">Toutes</button>
        ${RKEYS.slice().reverse().map(k =>
          `<button class="chip" data-r="${k}">${RARITY[k].label}</button>`).join('')}
      </div>
      <select class="field" id="team" aria-label="Filtrer par équipe">
        <option value="all">Toutes les équipes</option>
        ${['AL','NL'].map(lg => `<optgroup label="Ligue ${lg === 'AL' ? 'américaine' : 'nationale'}">
          ${TEAMS.filter(t => t.lg === lg).map(t =>
            `<option value="${t.abbr}">${esc(t.city)} ${esc(t.club)}</option>`).join('')}
        </optgroup>`).join('')}
        <optgroup label="Historique">
          ${LEGACY_TEAMS.map(t => `<option value="${t.abbr}">${esc(t.city)} ${esc(t.club)}</option>`).join('')}
        </optgroup>
      </select>
      <select class="field" id="setSel" aria-label="Filtrer par collection">
        <option value="all">Toutes les collections</option>
        ${['Séries','Saisons','Divisions'].map(g => `<optgroup label="${g}">
          ${COLLECTIONS.filter(x => x.group === g).map(x =>
            `<option value="${x.id}">${esc(x.name)}</option>`).join('')}
        </optgroup>`).join('')}
      </select>
      <label style="display:flex;align-items:center;gap:7px;font-size:13px;
        color:var(--chalk-dim);cursor:pointer">
        <input type="checkbox" id="onlyOwned" style="accent-color:var(--sodium)">
        Possédées uniquement
      </label>
      <button class="chip" id="clearF" style="display:none">Réinitialiser</button>
    </div>

    <div id="binderGrid"></div>
    <div id="customsBlock"></div>`;

  vBinder.querySelectorAll('[data-r]').forEach(b => {
    const k = b.dataset.r, on = k === filters.rarity;
    const hex = k === 'all' ? 'var(--sodium)' : RARITY[k].hex;
    if (on) {
      b.style.borderColor = hex; b.style.color = hex;
      b.style.background = `color-mix(in srgb, ${hex} 16%, transparent)`;
    }
    b.setAttribute('aria-pressed', on);
    b.addEventListener('click', () => { filters.rarity = k; renderBinder(); });
  });

  const teamSel = $('#team'); teamSel.value = filters.team;
  teamSel.addEventListener('change', () => { filters.team = teamSel.value; renderBinder(); });

  const setSel = $('#setSel'); setSel.value = filters.set;
  setSel.addEventListener('change', () => { filters.set = setSel.value; renderBinder(); });

  const oo = $('#onlyOwned'); oo.checked = filters.owned;
  oo.addEventListener('change', () => { filters.owned = oo.checked; renderBinder(); });

  const q = $('#q');
  q.addEventListener('input', () => { filters.q = q.value; paintGrid(); toggleClear(); });

  const clr = $('#clearF');
  clr.addEventListener('click', () => {
    filters.rarity = 'all'; filters.team = 'all'; filters.owned = false;
    filters.q = ''; filters.set = 'all';
    renderBinder();
  });

  function toggleClear() {
    const active = filters.rarity !== 'all' || filters.team !== 'all'
      || filters.owned || filters.q !== '' || filters.set !== 'all';
    clr.style.display = active ? '' : 'none';
  }

  function paintGrid() {
    const needle = filters.q.trim().toLowerCase();
    const activeSet = filters.set === 'all'
      ? null : COLLECTIONS.filter(x => x.id === filters.set)[0];

    const list = CARDS.filter(c => {
      if (filters.rarity !== 'all' && c.rarity !== filters.rarity) return false;
      if (filters.team !== 'all' && c.team !== filters.team) return false;
      if (filters.owned && !owns(c)) return false;
      if (needle && c.name.toLowerCase().indexOf(needle) === -1) return false;
      if (activeSet && !activeSet.filter(c)) return false;
      return true;
    }).sort((a,b) => ORDER[b.rarity] - ORDER[a.rarity] || a.name.localeCompare(b.name));

    const grid = $('#binderGrid');
    if (!list.length) {
      const empty = !CARDS.length;
      grid.innerHTML = `<div class="empty">
        <div style="font-family:var(--font-display);font-size:23px;letter-spacing:.05em">
          ${empty ? 'Aucune donnée chargée' : 'Aucune carte ne correspond'}</div>
        <div style="font-size:13px;color:var(--chalk-dim);margin-top:6px;
          max-width:44ch;margin-inline:auto;line-height:1.6">
          ${empty
            ? "Toutes les cartes viennent de l'API MLB. Rien n'est écrit en dur : sans connexion, il n'y a pas de cartes plutôt que de fausses cartes."
            : 'Élargissez les filtres pour voir plus de cartes.'}</div></div>`;
      return;
    }
    grid.innerHTML = `<div class="grid">${list.map(c => {
      const n = copies(c);
      return `<div class="slot" data-card="${esc(c.uid)}" role="button" tabindex="0"
        aria-label="${esc(c.name)}${n > 1 ? `, ${n} exemplaires` : n ? '' : ', non débloquée'}">${
        cardHTML(c, n === 0)}${n > 1
          ? `<span class="badge" title="${n} exemplaires · ${(n-1)*(DUST[c.rarity]||10)} jetons si converti">
             ×${n}</span>` : ''}</div>`;
    }).join('')}</div>`;

    // N'importe quelle carte s'ouvre en grand, possédée ou non : voir ce
    // qu'on n'a pas encore fait partie du plaisir d'un classeur.
    const openSlot = el => {
      const c = CARDS.filter(x => x.uid === el.dataset.card)[0];
      if (c) openCard(c, copies(c) === 0);
    };
    grid.querySelectorAll('[data-card]').forEach(el => {
      el.addEventListener('click', () => openSlot(el));
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSlot(el); }
      });
    });
  }

  function paintCustoms() {
    const box = $('#customsBlock');
    if (!state.customs.length) { box.innerHTML = ''; return; }
    box.innerHTML = `
      <section style="margin-top:58px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;
          border-top:1px solid var(--panel-hi);padding-top:18px">
          <h2>Mon équipe locale</h2>
          <span class="eyebrow">${state.customs.length} carte${state.customs.length > 1 ? 's' : ''}</span>
        </div>
        <div class="grid" style="margin-top:22px">${state.customs.map(c => `
          <div class="slot" data-custom="${esc(c.uid)}" role="button" tabindex="0">${cardHTML(c,false)}
            <span class="badge custom">Perso</span>
            <button class="chip" data-del="${esc(c.uid)}"
              style="width:100%;margin-top:10px">Supprimer</button>
          </div>`).join('')}</div>
      </section>`;
    box.querySelectorAll('[data-custom]').forEach(el => el.addEventListener('click', e => {
      if (e.target.closest('[data-del]')) return;   // le bouton Supprimer d'abord
      const c = state.customs.filter(x => x.uid === el.dataset.custom)[0];
      if (c) openCard(c);
    }));
    box.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
      state.customs = state.customs.filter(c => c.uid !== b.dataset.del);
      save(); renderBinder(); toast('Carte supprimée');
    }));
  }

  const sb = $('#syncBtn');
  if (sb) sb.addEventListener('click', runSync);
  const mb = $('#meltBtn');
  if (mb) mb.addEventListener('click', meltDuplicates);
  toggleClear(); paintGrid(); paintCustoms();
}

/* ---------------------------------------------------------------------
   9a-bis. Synchronisation du catalogue
   --------------------------------------------------------------------- */
let syncing = false;

function catalogBanner() {
  const n = CARDS.length;
  if (catalogSource === 'api' && n) {
    const when = catalogAt
      ? new Date(catalogAt).toLocaleString('fr-FR',
          { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })
      : '';
    return `<div class="syncbar is-on">
      <span class="livedot is-on"></span>
      <span><b class="mono">${n}</b> cartes · données MLB${when ? ' du ' + when : ''}</span>
      <button class="btn ghost sm" id="syncBtn">Actualiser</button>
    </div>`;
  }
  return `<div class="syncbar">
    <span class="livedot is-off"></span>
    <span>Aucune donnée chargée</span>
    <button class="btn sm" id="syncBtn">Charger depuis l'API MLB</button>
  </div>`;
}

async function runSync(quiet) {
  if (syncing) return;
  syncing = true;
  const bar = quiet ? null : document.querySelector('.syncbar');
  if (bar) bar.innerHTML = `
    <span class="livedot is-on"></span>
    <span id="syncMsg">Connexion à l'API MLB…</span>
    <span class="syncprog"><i id="syncBar" style="width:0%"></i></span>`;

  try {
    const rows = await Catalog.sync(({ step, done, total }) => {
      const msg = $('#syncMsg'), pb = $('#syncBar');
      if (msg) msg.textContent = `${step} — ${done} / ${total}`;
      if (pb) pb.style.width = (total ? (done / total) * 100 : 0).toFixed(1) + '%';
    });

    if (!rows.length) throw new Error('Aucun joueur reçu');
    applyApiCatalog(rows);
    Catalog.writeCache(rows);
    catalogAt = Date.now();
    if (!quiet) toast(`${CARDS.length} cartes chargées depuis l'API MLB`);
  } catch (err) {
    if (quiet) { syncing = false; return; }   // échec silencieux en fond
    console.error(err);
    const bar2 = document.querySelector('.syncbar');
    if (bar2) bar2.innerHTML = `
      <span class="livedot is-off"></span>
      <span>Synchronisation impossible — ${esc(err.message)}</span>
      <button class="btn ghost sm" id="syncBtn">Réessayer</button>`;
    const rb = $('#syncBtn'); if (rb) rb.addEventListener('click', runSync);
    syncing = false;
    return;
  }
  syncing = false;
  if (vBinder.classList.contains('on')) renderBinder();
  if (vOpen.classList.contains('on')) renderOpen();
}

/**
 * Démarrage.
 * Cache d'abord pour un affichage immédiat, puis synchronisation
 * automatique si le cache est absent ou périmé. L'application ne
 * contient AUCUNE carte en dur : tant que l'API n'a pas répondu, le
 * classeur est vide et le dit.
 */
function bootCatalog() {
  const c = Catalog.readCache();
  if (c && c.cards && c.cards.length) {
    applyApiCatalog(c.cards);
    catalogAt = c.at;
    if (c.stale) setTimeout(() => runSync(true), 1200);   // rafraîchit en fond
    return true;
  }
  return false;
}

/* ---------------------------------------------------------------------
   9b. Vue — Collections
   Une carte appartient à plusieurs collections à la fois : la vue les
   présente par groupe, avec l'avancement et la récompense.
   --------------------------------------------------------------------- */
const vSets = $('#view-sets');

function renderSets() {
  // Une collection sans aucune carte au catalogue (une saison pas encore
  // publiée, par exemple) s'afficherait « 0/0 » et paraîtrait complétable.
  // On ne montre que celles qui ont au moins une carte.
  const live = COLLECTIONS.filter(x => x.mine || setProgress(x).total > 0);
  const groups = ['Mes collections','Séries','Saisons','Divisions','Franchises'];
  const done = live.filter(x => setProgress(x).pct === 1).length;

  vSets.innerHTML = `
    <p class="eyebrow">Collections</p>
    <div style="display:flex;flex-wrap:wrap;align-items:baseline;gap:8px 18px;margin-top:8px">
      <div class="mono" style="font-size:44px;line-height:1">${done}<span
        style="color:var(--chalk-dim)">/${live.length}</span></div>
      <div style="font-family:var(--font-display);font-size:22px;letter-spacing:.05em;
        color:var(--sodium)">complétées</div>
    </div>
    <p class="sub" style="margin-top:14px">Chaque collection complétée débloque une
      récompense : des boosters, ou un film d'archive.</p>

    ${groups.map(g => {
      const list = live.filter(x => x.group === g);
      if (!list.length) return '';
      return `<section class="blk">
        <h2 style="margin-bottom:14px">${g}</h2>
        <div class="setgrid">${list.map(set => {
          const p = setProgress(set);
          const full = p.pct === 1;
          const ac = set.accent || 'var(--sodium)';
          return `<button class="setcard ${full ? 'is-done' : ''}"
            data-set="${esc(set.id)}" style="--ac:${esc(ac)}">
            <div class="setcard__top">
              <span class="setcard__badge">${esc(set.short)}</span>
              ${full ? '<span class="setcard__check">✓</span>' : ''}
            </div>
            <div class="setcard__name">${esc(set.name)}</div>
            <div class="setcard__bar"><i style="width:${(p.pct*100).toFixed(1)}%"></i></div>
            <div class="setcard__foot">
              <span class="mono">${p.got}/${p.total}</span>
              <span>${full ? esc(set.reward.label) : '→ ' + esc(set.reward.label)}</span>
            </div>
          </button>`;
        }).join('')}</div>
      </section>`;
    }).join('')}`;

  // Cliquer une collection filtre le classeur dessus.
  vSets.querySelectorAll('[data-set]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.set;
    const set = COLLECTIONS.filter(x => x.id === id)[0];
    filters.rarity = 'all'; filters.owned = false; filters.q = '';
    if (set && set.group === 'Franchises') { filters.team = set.short; filters.set = 'all'; }
    else { filters.set = id; filters.team = 'all'; }
    go('binder');
  }));
}

/* ---------------------------------------------------------------------
   9c. Vue — En direct
   Branchée sur statsapi.mlb.com. Trois états à gérer, et le troisième est
   celui qu'on oublie toujours : l'API muette. Un tableau vide n'est pas
   une erreur — hors saison, il n'y a simplement aucun match.
   --------------------------------------------------------------------- */
const vLive = $('#view-live');
let liveTimer = null;

function stopLive() { if (liveTimer) { clearInterval(liveTimer); liveTimer = null; } }

function renderLive() {
  vLive.innerHTML = `
    <p class="eyebrow">En direct · statsapi.mlb.com</p>
    <h1>Matchs du jour</h1>
    <p class="sub">Scores, manche en cours, coureurs sur les buts et lanceurs annoncés,
      rafraîchis toutes les 30 secondes.</p>
    <div class="livehead">
      <span class="livedot" id="liveDot"></span>
      <span id="liveStamp" class="mono">Connexion…</span>
      <button class="btn ghost sm" id="liveRefresh">Rafraîchir</button>
    </div>
    <div id="liveBody"><div class="skel">${'<div></div>'.repeat(6)}</div></div>`;

  $('#liveRefresh').addEventListener('click', () => loadLive(true));
  loadLive();

  stopLive();
  liveTimer = setInterval(() => {
    if (!vLive.classList.contains('on')) { stopLive(); return; }
    loadLive();
  }, 30000);
}

async function loadLive(force) {
  const body = $('#liveBody'), stamp = $('#liveStamp'), dot = $('#liveDot');
  if (!body) return;
  try {
    const data = await MLB.schedule();
    const games = ((data.dates || [])[0] || {}).games || [];
    const list = games.map(normaliseGame);

    if (dot) dot.className = 'livedot is-on';
    if (stamp) stamp.textContent = 'Mis à jour ' +
      new Date().toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit', second:'2-digit' });

    if (!list.length) {
      body.innerHTML = `<div class="empty">
        <div style="font-family:var(--font-display);font-size:23px;letter-spacing:.05em">
          Aucun match aujourd'hui</div>
        <div style="font-size:13px;color:var(--chalk-dim);margin-top:6px">
          Hors saison ou journée de repos. Les scores reviendront au prochain match.</div>
      </div>`;
      return;
    }

    // Les matchs en cours d'abord : c'est ce qu'on vient voir.
    const rank = g => g.state === 'Live' ? 0 : g.state === 'Preview' ? 1 : 2;
    list.sort((a,b) => rank(a) - rank(b));

    body.innerHTML = `<div class="gamegrid">${list.map(gameCard).join('')}</div>`;
    body.querySelectorAll('[data-team]').forEach(el => el.addEventListener('click', () => {
      filters.team = el.dataset.team; filters.rarity = 'all';
      filters.set = 'all'; filters.q = ''; filters.owned = false;
      go('binder');
    }));
  } catch (err) {
    if (dot) dot.className = 'livedot is-off';
    if (stamp) stamp.textContent = 'Hors ligne';
    body.innerHTML = `<div class="empty">
      <div style="font-family:var(--font-display);font-size:23px;letter-spacing:.05em">
        Données indisponibles</div>
      <div style="font-size:13px;color:var(--chalk-dim);margin-top:6px;max-width:46ch;margin-inline:auto">
        L'API MLB n'a pas répondu. Depuis un fichier local, le navigateur peut aussi
        bloquer la requête (CORS) — en ligne, sur GitHub Pages, elle passe normalement.</div>
      <button class="btn ghost sm" style="margin-top:16px" onclick="loadLive(true)">Réessayer</button>
    </div>`;
  }
}

/** Une carte de match. Le losange des buts est le repère visuel du baseball. */
function gameCard(g) {
  const live = g.state === 'Live';
  const t = abbr => TEAM_BY_ABBR.get(abbr);
  const ha = t(g.home.abbr), aw = t(g.away.abbr);

  const line = (side, team) => `
    <div class="gc__row ${live && side.runs != null ? '' : 'is-dim'}"
      ${team ? `data-team="${esc(side.abbr)}" role="button" tabindex="0"` : ''}>
      <span class="gc__dot" style="background:${team ? team.c1 : '#39424f'}"></span>
      <span class="gc__team">${esc(side.abbr || side.name)}</span>
      <span class="gc__rec mono">${esc(side.record)}</span>
      <span class="gc__runs mono">${side.runs != null ? side.runs : '–'}</span>
    </div>`;

  const bases = live ? `
    <div class="diamond" aria-hidden="true">
      <i class="b2 ${g.onBase.second ? 'on' : ''}"></i>
      <i class="b3 ${g.onBase.third ? 'on' : ''}"></i>
      <i class="b1 ${g.onBase.first ? 'on' : ''}"></i>
    </div>
    <div class="gc__count mono">${g.balls != null ? g.balls : 0}-${g.strikes != null ? g.strikes : 0}
      · ${g.outs != null ? g.outs : 0} out</div>` : '';

  const pitchers = (!live && g.state === 'Preview' && (g.away.pitcher || g.home.pitcher))
    ? `<div class="gc__pitchers">${esc(g.away.pitcher || '—')} vs ${esc(g.home.pitcher || '—')}</div>` : '';

  return `<article class="gc ${live ? 'is-live' : ''}">
    <header class="gc__head">
      <span class="gc__state">${live ? '<i class="pulse"></i>EN DIRECT' : esc(g.detailed)}</span>
      <span class="gc__phase mono">${esc(g.phase)}</span>
    </header>
    <div class="gc__body">
      <div class="gc__lines">${line(g.away, aw)}${line(g.home, ha)}</div>
      <div class="gc__side">${bases}</div>
    </div>
    ${pitchers}
    <footer class="gc__foot">${esc(g.venue)}</footer>
  </article>`;
}

/* ---------------------------------------------------------------------
   9d. Vue — Réglages
   Le visuel de chaque série de boosters s'y choisit. Un motif fourni, ou
   une photo à vous.
   --------------------------------------------------------------------- */
const vSettings = $('#view-settings');

function renderSettings() {
  const sets = [{ id:'_default', name:'Série 1 — sachet par défaut', accent:'#BF0D3E' }]
    .concat(packableSets());

  vSettings.innerHTML = `
    <p class="eyebrow">Réglages</p>
    <h1>Visuels des sachets</h1>
    <p class="sub">Chaque série peut avoir son propre visuel. Choisissez un motif,
      ou importez votre image — elle remplacera le dessin sur le sachet.</p>

    <div class="artgrid">
      ${sets.map(st => {
        const cur = (state.packArt || {})[st.id] || (st.id === '_default' ? 'batter' : '');
        const isPhoto = cur.indexOf('data:') === 0;
        return `<div class="artcard" style="--ac:${esc(st.accent || 'var(--sodium)')}">
          <div class="artcard__pack">
            <svg viewBox="0 0 200 300" width="100%" height="100%" aria-hidden="true">
              ${sachetInner(st)}
            </svg>
          </div>
          <div class="artcard__body">
            <div class="artcard__name">${esc(st.name)}</div>
            <div class="artcard__opts">
              ${PACK_ART_KEYS.map(k => `<button class="artchip ${
                (!isPhoto && (cur || 'batter') === k) ? 'is-on' : ''}"
                data-set="${esc(st.id)}" data-art="${k}">${PACK_ART[k].name}</button>`).join('')}
              <label class="artchip artchip--file ${isPhoto ? 'is-on' : ''}">
                Ma photo
                <input type="file" accept="image/png,image/jpeg,image/webp" hidden
                  data-upload="${esc(st.id)}">
              </label>
              ${isPhoto ? `<button class="artchip artchip--del"
                data-clear="${esc(st.id)}">Retirer</button>` : ''}
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>

    <section class="blk">
      <h2 class="eyebrow" style="margin-bottom:12px">Données</h2>
      <div class="setrow">
        <div><b>Catalogue</b><br><span class="hint">${CARDS.length} cartes ·
          ${catalogSource === 'api' ? 'API MLB' : 'non chargé'}</span></div>
        <button class="btn ghost sm" id="setSync">Recharger depuis l'API</button>
      </div>
      <div class="setrow">
        <div><b>Tout réinitialiser</b><br><span class="hint">Collection, jetons,
          cartes créées et réglages</span></div>
        <button class="btn ghost sm" id="setReset">Réinitialiser</button>
      </div>
    </section>`;

  vSettings.querySelectorAll('[data-art]').forEach(b => b.addEventListener('click', () => {
    state.packArt = state.packArt || {};
    state.packArt[b.dataset.set] = b.dataset.art;
    save(); renderSettings(); toast('Visuel mis à jour');
  }));

  vSettings.querySelectorAll('[data-upload]').forEach(inp =>
    inp.addEventListener('change', () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      if (!/^image\/(png|jpeg|webp)$/.test(f.type)) {
        toast('Format non accepté. PNG, JPEG ou WebP.'); return;
      }
      // Même réduction que pour les cartes perso : une photo brute
      // saturerait le quota de localStorage en deux ou trois sachets.
      downscale(f, 340).then(url => {
        state.packArt = state.packArt || {};
        state.packArt[inp.dataset.upload] = url;
        save(); renderSettings(); toast('Visuel importé');
      }).catch(() => toast('Image illisible.'));
    }));

  vSettings.querySelectorAll('[data-clear]').forEach(b => b.addEventListener('click', () => {
    delete state.packArt[b.dataset.clear];
    save(); renderSettings(); toast('Visuel retiré');
  }));

  $('#setSync').addEventListener('click', () => { go('binder'); runSync(); });
  $('#setReset').addEventListener('click', () => {
    if (!confirm('Tout effacer et repartir de zéro ?')) return;
    state = Object.assign({}, DEFAULTS, { owned:{}, customs:[], videos:[],
      claimed:[], mySets:[], packArt:{ _default:'batter' } });
    save(); syncPurse(); toast('Réinitialisé'); go('open');
  });
}

/** Le sachet réduit, pour la vignette de réglages. */
function sachetInner(set) {
  const full = sachetSVG(set);
  const open = full.indexOf('>', full.indexOf('<svg')) + 1;
  return full.slice(open, full.lastIndexOf('</svg>'));
}

/* ---------------------------------------------------------------------
   10. Vue — Créateur
   --------------------------------------------------------------------- */
const vStudio = $('#view-studio');
const form = { firstName:'', lastName:'', num:'', pos:'', team:'',
  rarity:'holo', avg:'', hr:'', rbi:'', ops:'', photo:null,
  set:'', c1:'#12284B', c2:'#f5b942' };

function previewCard() {
  return {
    name: [form.firstName, form.lastName].filter(Boolean).join(' ') || 'Nom du joueur',
    pos: form.pos || '', team: form.team || '', num: form.num || '',
    rarity: form.rarity, img: form.photo, custom: true, serial: '001',
    set: form.set || null, c1: form.c1, c2: form.c2,
    teamName: form.team || 'Équipe locale',
    posName: (POSITIONS[form.pos] || {}).fr || form.pos || '—',
    posX: (POSITIONS[form.pos] || {x:50}).x, posY: (POSITIONS[form.pos] || {y:50}).y,
    bats: form.bats || 'D', throws: form.throws || 'D', tags: [],
    stats: { avg: form.avg || '.000', hr: form.hr || 0,
             rbi: form.rbi || 0, ops: form.ops || '.000' },
  };
}

function renderStudio() {
  // ---- Zone privée : verrou -------------------------------------------
  if (state.studioPin && !state.studioOpen) { renderStudioLock(); return; }
  if (!state.studioPin && !state.studioOpen) { renderStudioSetup(); return; }

  const mySets = state.mySets || [];

  vStudio.innerHTML = `
    <div class="studio">
      <div>
        <div class="studio__head">
          <div>
            <p class="eyebrow">Créateur · zone privée</p>
            <h1>Mon atelier</h1>
          </div>
          <button class="btn ghost sm" id="lockStudio">Verrouiller</button>
        </div>
        <p class="sub">Créez vos cartes et rangez-les dans vos propres
          collections. Elles apparaissent dans le classeur et dans l'onglet
          Collections, au même titre que les officielles.</p>

        <!-- ---------- Mes collections ---------- -->
        <section class="blk">
          <div class="studio__rowhead">
            <h2 class="eyebrow">Mes collections</h2>
            <button class="btn ghost sm" id="newSet">+ Nouvelle</button>
          </div>
          <div class="mysets" id="mysets">
            ${mySets.length ? mySets.map(ms => {
              const count = (state.customs||[]).filter(c => c.set === ms.id).length;
              return `<div class="myset" style="--ac:${esc(ms.accent||'#f5b942')}">
                <div class="myset__top">
                  <span class="myset__badge">${esc(ms.short||'—')}</span>
                  <button class="myset__del" data-delset="${esc(ms.id)}"
                    aria-label="Supprimer la collection">×</button>
                </div>
                <div class="myset__name">${esc(ms.name)}</div>
                <div class="myset__foot mono">${count}${ms.goal ? ' / ' + ms.goal : ''} cartes</div>
              </div>`;
            }).join('') : `<p class="hint" style="grid-column:1/-1">
              Aucune collection. Créez-en une pour ranger vos cartes.</p>`}
          </div>
        </section>

        <!-- ---------- Nouvelle carte ---------- -->
        <section class="blk">
          <h2 class="eyebrow" style="margin-bottom:10px">Photo</h2>
          <div class="drop" id="drop">
            <input type="file" id="file" accept="image/png,image/jpeg,image/webp" hidden>
            <div style="font-size:13px" id="dropLabel">Déposez une photo ou cliquez pour parcourir</div>
            <div style="font-size:12px;color:var(--chalk-dim);margin-top:6px">
              PNG, JPEG ou WebP · portrait vertical, visage dans le tiers supérieur</div>
          </div>
        </section>

        <section class="blk">
          <h2 class="eyebrow" style="margin-bottom:10px">Identité</h2>
          <div class="row2">
            <div><label class="lb eyebrow" for="f-firstName">Prénom</label>
              <input class="inp" id="f-firstName" maxlength="40" value="${esc(form.firstName)}"></div>
            <div><label class="lb eyebrow" for="f-lastName">Nom</label>
              <input class="inp" id="f-lastName" maxlength="40" value="${esc(form.lastName)}"></div>
            <div><label class="lb eyebrow" for="f-num">Numéro</label>
              <input class="inp" id="f-num" maxlength="3" inputmode="numeric"
                placeholder="24" value="${esc(form.num)}"></div>
            <div><label class="lb eyebrow" for="f-pos">Poste</label>
              <input class="inp" id="f-pos" maxlength="4" placeholder="SS, RF, P…"
                value="${esc(form.pos)}"></div>
          </div>
          <div class="row2" style="margin-top:14px">
            <div><label class="lb eyebrow" for="f-team">Club</label>
              <input class="inp" id="f-team" maxlength="12" placeholder="BORDEAUX"
                value="${esc(form.team)}"></div>
            <div><label class="lb eyebrow" for="f-set">Collection</label>
              <select class="inp" id="f-set">
                <option value="">Aucune</option>
                ${mySets.map(ms => `<option value="${esc(ms.id)}"
                  ${form.set === ms.id ? 'selected' : ''}>${esc(ms.name)}</option>`).join('')}
              </select></div>
          </div>
          <div class="row2" style="margin-top:14px">
            <div><label class="lb eyebrow" for="f-c1">Couleur 1</label>
              <input class="inp inp--color" id="f-c1" type="color" value="${esc(form.c1)}"></div>
            <div><label class="lb eyebrow" for="f-c2">Couleur 2</label>
              <input class="inp inp--color" id="f-c2" type="color" value="${esc(form.c2)}"></div>
          </div>
        </section>

        <section class="blk">
          <h2 class="eyebrow" style="margin-bottom:10px">Statistiques</h2>
          <div class="row4">
            ${[['avg','AVG','.312'],['hr','HR','12'],['rbi','RBI','41'],['ops','OPS','.854']]
              .map(([k,l,ph]) => `<div><label class="lb eyebrow" for="f-${k}">${l}</label>
                <input class="inp mono" id="f-${k}" maxlength="5" placeholder="${ph}"
                  value="${esc(form[k])}"></div>`).join('')}
          </div>
        </section>

        <section class="blk">
          <h2 class="eyebrow" style="margin-bottom:10px">Cadre</h2>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${RKEYS.slice().reverse().map(k =>
              `<button class="chip" data-fr="${k}">${RARITY[k].label}</button>`).join('')}
          </div>
        </section>

        <button class="btn" id="addCard" style="margin-top:32px">Ajouter au classeur</button>
      </div>

      <aside class="sticky">
        <p class="eyebrow" style="margin-bottom:12px">Aperçu</p>
        <div id="preview"></div>
        <button class="btn ghost sm" id="previewZoom" style="width:100%;margin-top:12px">
          Voir en grand</button>
      </aside>
    </div>`;

  const pv = $('#preview');
  const repaint = () => { pv.innerHTML = cardHTML(previewCard(), false); };
  repaint();

  $('#previewZoom').addEventListener('click', () => openCard(previewCard()));
  $('#lockStudio').addEventListener('click', () => {
    state.studioOpen = false; save(); toast('Atelier verrouillé'); renderStudio();
  });

  [['firstName','f-firstName'],['lastName','f-lastName'],['num','f-num'],
   ['pos','f-pos'],['team','f-team'],['avg','f-avg'],['hr','f-hr'],
   ['rbi','f-rbi'],['ops','f-ops'],['c1','f-c1'],['c2','f-c2']].forEach(([key,id]) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => { form[key] = el.value; repaint(); });
  });
  const setSel = $('#f-set');
  if (setSel) setSel.addEventListener('change', () => { form.set = setSel.value; });

  vStudio.querySelectorAll('[data-fr]').forEach(b => {
    const k = b.dataset.fr, on = form.rarity === k;
    if (on) {
      b.style.borderColor = RARITY[k].hex; b.style.color = RARITY[k].hex;
      b.style.background = `color-mix(in srgb, ${RARITY[k].hex} 16%, transparent)`;
    }
    b.setAttribute('aria-pressed', on);
    b.addEventListener('click', () => { form.rarity = k; renderStudio(); });
  });

  // ---- Collections perso ----
  $('#newSet').addEventListener('click', createSet);
  vStudio.querySelectorAll('[data-delset]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.delset;
    const used = (state.customs||[]).filter(c => c.set === id).length;
    if (!confirm(used ? `Supprimer cette collection ? Les ${used} cartes seront conservées, mais sans collection.`
                      : 'Supprimer cette collection ?')) return;
    state.mySets = state.mySets.filter(x => x.id !== id);
    (state.customs||[]).forEach(c => { if (c.set === id) c.set = null; });
    if (form.set === id) form.set = '';
    refreshCollections(); save(); renderStudio(); toast('Collection supprimée');
  }));

  // ---- Photo ----
  const drop = $('#drop'), file = $('#file'), label = $('#dropLabel');
  drop.addEventListener('click', () => file.click());
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => {
    e.preventDefault(); drop.classList.remove('over');
    handlePhoto(e.dataTransfer.files && e.dataTransfer.files[0]);
  });
  file.addEventListener('change', () => handlePhoto(file.files && file.files[0]));

  function handlePhoto(f) {
    if (!f) return;
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) {
      toast('Format non accepté. Utilisez PNG, JPEG ou WebP.'); return;
    }
    label.textContent = 'Traitement…';
    downscale(f, 460).then(url => {
      form.photo = url; label.textContent = f.name; repaint();
    }).catch(() => { label.textContent = 'Lecture impossible. Essayez une autre photo.'; });
  }

  $('#addCard').addEventListener('click', () => {
    if (!form.lastName.trim()) { toast('Le nom est obligatoire.'); return; }
    const c = previewCard();
    c.uid = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
    state.customs.unshift(c);
    refreshCollections(); save();
    const setName = (state.mySets.filter(x => x.id === form.set)[0] || {}).name;
    toast(setName ? `Ajoutée à « ${setName} »` : 'Carte ajoutée au classeur');
    const keep = { rarity: form.rarity, team: form.team, set: form.set,
                   c1: form.c1, c2: form.c2 };
    Object.assign(form, { firstName:'', lastName:'', num:'', pos:'', avg:'', hr:'',
      rbi:'', ops:'', photo:null }, keep);
    renderStudio();
  });
}

/** Création d'une collection personnelle. */
function createSet() {
  const name = prompt('Nom de la collection\n(ex. « Bordeaux Cardinals 2026 », « Mes juniors »)');
  if (!name || !name.trim()) return;
  const goalRaw = prompt('Combien de cartes visez-vous ? (laisser vide si vous ne savez pas)');
  const goal = parseInt(goalRaw, 10);

  state.mySets = state.mySets || [];
  state.mySets.push({
    id: 's' + Date.now().toString(36),
    name: name.trim().slice(0, 40),
    short: name.trim().slice(0, 4).toUpperCase(),
    goal: Number.isFinite(goal) && goal > 0 ? Math.min(goal, 500) : 0,
    accent: '#f5b942',
  });
  refreshCollections(); save(); renderStudio();
  toast('Collection créée');
}

/** Premier passage : proposer de protéger l'atelier. */
function renderStudioSetup() {
  vStudio.innerHTML = `
    <div class="gate">
      <p class="eyebrow">Créateur</p>
      <h1>Zone privée</h1>
      <p class="sub" style="margin:14px auto 0">L'atelier est votre espace : vos cartes,
        vos collections. Vous pouvez le protéger par un code pour que personne d'autre
        n'y touche sur cet appareil.</p>
      <div class="gate__row">
        <input class="inp" id="pin1" type="password" inputmode="numeric" maxlength="8"
          placeholder="Code (4 à 8 chiffres)" style="width:220px">
        <button class="btn" id="setPin">Protéger</button>
      </div>
      <button class="btn ghost sm" id="skipPin" style="margin-top:12px">
        Continuer sans code</button>
      <p class="gate__warn">Ce code n'est pas un mot de passe : il vit dans le
        navigateur, en clair. Il empêche un curieux d'ouvrir l'atelier, rien de plus.</p>
    </div>`;

  $('#setPin').addEventListener('click', () => {
    const v = $('#pin1').value.trim();
    if (v.length < 4) { toast('Le code doit faire au moins 4 caractères.'); return; }
    state.studioPin = v; state.studioOpen = true; save();
    toast('Atelier protégé'); renderStudio();
  });
  $('#skipPin').addEventListener('click', () => {
    state.studioOpen = true; save(); renderStudio();
  });
  $('#pin1').addEventListener('keydown', e => { if (e.key === 'Enter') $('#setPin').click(); });
}

/** Atelier verrouillé : demander le code. */
function renderStudioLock() {
  vStudio.innerHTML = `
    <div class="gate">
      <div class="gate__lock" aria-hidden="true">⬤</div>
      <p class="eyebrow">Créateur</p>
      <h1>Atelier verrouillé</h1>
      <div class="gate__row">
        <input class="inp" id="pin2" type="password" inputmode="numeric" maxlength="8"
          placeholder="Code" style="width:200px" autocomplete="off">
        <button class="btn" id="unlock">Ouvrir</button>
      </div>
      <button class="btn ghost sm" id="forgot" style="margin-top:12px">Code oublié</button>
    </div>`;

  const tryOpen = () => {
    if ($('#pin2').value.trim() === state.studioPin) {
      state.studioOpen = true; save(); renderStudio();
    } else { toast('Code incorrect.'); $('#pin2').value = ''; }
  };
  $('#unlock').addEventListener('click', tryOpen);
  $('#pin2').addEventListener('keydown', e => { if (e.key === 'Enter') tryOpen(); });
  $('#forgot').addEventListener('click', () => {
    if (!confirm('Retirer le code ? Vos cartes et collections sont conservées.')) return;
    state.studioPin = null; state.studioOpen = true; save(); renderStudio();
  });
  $('#pin2').focus();
}

/**
 * Réduit une image avant stockage.
 * Une photo de téléphone en base64 pèse 3 à 5 Mo et le quota de
 * localStorage tourne autour de 5 Mo au total : sans cette étape, la
 * deuxième carte créée ferait échouer la sauvegarde. Après réduction à
 * 460 px de large en JPEG 0.85, on tombe vers 40 à 70 Ko.
 */
function downscale(file, maxWidth) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('decode'));
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(cv.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ---------------------------------------------------------------------
   11. Navigation
   --------------------------------------------------------------------- */
const VIEWS = {
  open:   { el:vOpen,   render:renderOpen },
  binder: { el:vBinder, render:renderBinder },
  sets:   { el:vSets,   render:renderSets },
  live:   { el:vLive,   render:renderLive },
  settings: { el:vSettings, render:renderSettings },
  studio: { el:vStudio, render:renderStudio },
};

function go(name) {
  if (!VIEWS[name]) name = 'open';
  detachKeys();
  if (name !== 'live') stopLive();
  Object.keys(VIEWS).forEach(k => VIEWS[k].el.classList.toggle('on', k === name));
  document.querySelectorAll('.tab').forEach(t =>
    t.setAttribute('aria-current', t.dataset.go === name ? 'page' : 'false'));
  VIEWS[name].render();
  if (location.hash.slice(1) !== name) history.replaceState(null, '', '#' + name);
  window.scrollTo({ top:0, behavior: reduced ? 'auto' : 'smooth' });
}

document.addEventListener('click', e => {
  const t = e.target.closest('[data-go]');
  if (t) { e.preventDefault(); go(t.dataset.go); }
});
window.addEventListener('hashchange', () => go(location.hash.slice(1)));

/* --- Panneau prototype ---------------------------------------------- */
$('#dev-boosters').addEventListener('click', () => {
  state.boosters += 10; save(); syncPurse(); toast('10 boosters ajoutés');
  if (vOpen.classList.contains('on')) renderOpen();
});
$('#dev-fill').addEventListener('click', () => {
  const locked = CARDS.filter(c => !owns(c));
  if (!locked.length) { toast('Le classeur est déjà complet.'); return; }
  for (let i = locked.length - 1; i > 0; i -= 1) {
    const j = randBelow(i + 1);
    const t = locked[i]; locked[i] = locked[j]; locked[j] = t;
  }
  locked.slice(0, 60).forEach(c => { state.owned[c.uid] = (state.owned[c.uid] || 0) + 1; });
  checkCollections(); pendingRewards = [];
  save(); syncPurse(); toast(Math.min(60, locked.length) + ' cartes débloquées'); go('binder');
});
const devUltra = $('#dev-ultra');
if (devUltra) devUltra.addEventListener('click', () => {
  // À 0,1 %, une Ultra n'arrive jamais en test. Ce raccourci existe pour
  // que la mécanique de film soit atteignable sans ouvrir mille boosters.
  const pool = POOL.ultra;
  const c = pool[randBelow(pool.length)];
  state.owned[c.uid] = (state.owned[c.uid] || 0) + 1;
  save(); openVideo(c);
});

$('#dev-reset').addEventListener('click', () => {
  if (!confirm('Effacer la collection, les cartes créées et remettre 5 boosters ?')) return;
  state = Object.assign({}, DEFAULTS, { owned:{}, customs:[], videos:[], claimed:[], mySets:[] });
  refreshCollections();
  save(); syncPurse(); toast('Collection réinitialisée'); go('open');
});

const hadCache = bootCatalog();
refreshCatalog();
syncPurse();
if (!hadCache) {
  // Premier lancement : on va chercher les données tout de suite.
  setTimeout(() => { go('binder'); runSync(); }, 200);
}

/* Point d'entrée de débogage. Tout le reste du fichier est encapsulé dans
   une IIFE : rien n'est exposé globalement par accident. Ce petit objet
   sert aux tests automatisés et à l'inspection en console. */
window.DF = { get CARDS(){return CARDS;}, get COLLECTIONS(){return COLLECTIONS;}, runSync, Catalog, RARITY, DUST, PACK_COST, cardStats, fullStats,
              drawPack, state, save, openCard, openVideo, meltDuplicates,
              duplicateSummary, refreshCatalog, applyApiCatalog };
go(location.hash.slice(1) || 'open');

})();
