/* =====================================================================
   DIAMOND FOIL — collections et progression
   ---------------------------------------------------------------------
   Une carte n'appartient pas à une seule collection : Shohei Ohtani est
   à la fois dans « Dodgers », « Ligue nationale », « All-Star 2025 » et
   « MVP ». Les collections sont donc des FILTRES sur le catalogue, pas
   des listes figées — ajouter une carte remplit automatiquement toutes
   les collections auxquelles elle appartient.
   ===================================================================== */

/* ---------------------------------------------------------------------
   Six paliers. L'Ultra (0,1 %) est la carte dont on parle : une par
   millier de cartes tirées environ. C'est elle qui débloque une vidéo.
   --------------------------------------------------------------------- */
const RARITY = {
  common: { label:'Commune',    short:'C',  w:6300, odds:'63 %',    hex:'#8b98a8', ms:420  },
  rare:   { label:'Rare',       short:'R',  w:2400, odds:'24 %',    hex:'#7fb4e2', ms:620  },
  epic:   { label:'Épique',     short:'E',  w:900,  odds:'9 %',     hex:'#e8a765', ms:920  },
  holo:   { label:'Hologramme', short:'H',  w:350,  odds:'3,5 %',   hex:'#c9a3ff', ms:1300 },
  legend: { label:'Légende',    short:'L',  w:40,   odds:'0,4 %',   hex:'#ffe9a3', ms:1800 },
  ultra:  { label:'Ultra',      short:'U',  w:10,   odds:'0,1 %',   hex:'#7dfff0', ms:2400 },
};
const RKEYS = ['common','rare','epic','holo','legend','ultra'];
const ORDER = { common:0, rare:1, epic:2, holo:3, legend:4, ultra:5 };

const PACK_SIZE = 5;          // cartes par booster
const DAILY_PACKS = 3;        // boosters offerts par jour

/* ---------------------------------------------------------------------
   Types de cartes — une carte peut porter plusieurs marqueurs.
   --------------------------------------------------------------------- */
/* Marqueurs. Chacun correspond à un fait renvoyé par l'API, pas à un
   seuil que j'aurais choisi : les « Meneur … » viennent des classements
   officiels /stats/leaders, « Recrue » de la date de début en MLB, et
   « Saison d'anthologie » du classement all-time. */
const TAGS = {
  leadHR:  { label:'Meneur CC',  hex:'#ff8f5e' },
  leadRBI: { label:'Meneur PP',  hex:'#ffa96b' },
  leadAVG: { label:'Meneur MOY', hex:'#f5b942' },
  leadOPS: { label:'Meneur OPS', hex:'#ffd06a' },
  leadERA: { label:'Meneur MPM', hex:'#8fb8ff' },
  leadK:   { label:'Meneur RB',  hex:'#7dc4ff' },
  leadW:   { label:'Meneur V',   hex:'#9ad4ff' },
  leadSV:  { label:'Meneur SV',  hex:'#a8e0ff' },
  rookie:  { label:'Recrue',     hex:'#5fd39a' },
  hof:     { label:"Saison d'anthologie", hex:'#e0c56a' },
};

/* ---------------------------------------------------------------------
   Collections. `filter` reçoit une carte et renvoie vrai si elle en fait
   partie. `reward` décrit ce que la complétion débloque.
   --------------------------------------------------------------------- */
function buildCollections(teams, cards) {
  const sets = [];
  const seasons = [...new Set((cards || []).map(c => c.season).filter(Boolean))]
    .sort((a,b) => b - a);

  // --- Une collection par franchise -----------------------------------
  teams.forEach(t => sets.push({
    id: 'team-' + t.abbr,
    group: 'Franchises',
    name: `${t.city} ${t.club}`,
    short: t.abbr,
    accent: t.c1,
    accent2: t.c2,
    filter: c => c.team === t.abbr,
    reward: { type:'frame', label:`Cadre ${t.abbr}` },
  }));

  // --- Divisions -------------------------------------------------------
  const divs = [
    ['AL','E','Américaine Est'], ['AL','C','Américaine Centre'], ['AL','W','Américaine Ouest'],
    ['NL','E','Nationale Est'],  ['NL','C','Nationale Centre'],  ['NL','W','Nationale Ouest'],
  ];
  divs.forEach(([lg,div,name]) => {
    const abbrs = teams.filter(t => t.lg === lg && t.div === div).map(t => t.abbr);
    sets.push({
      id: `div-${lg}-${div}`,
      group: 'Divisions',
      name,
      short: `${lg} ${div}`,
      accent: lg === 'AL' ? '#c0111f' : '#0e3386',
      filter: c => abbrs.indexOf(c.team) !== -1,
      reward: { type:'boosters', amount:3, label:'3 boosters' },
    });
  });

  // --- Saisons ---------------------------------------------------------
  // Les années viennent des cartes réellement présentes, pas d'une liste
  // écrite à la main qui deviendrait fausse d'une saison à l'autre.
  seasons.forEach(year => sets.push({
    id: 'season-' + year,
    group: 'Saisons',
    name: `Saison ${year}`,
    short: String(year),
    accent: '#f5b942',
    filter: c => c.season === year,
    reward: { type:'boosters', amount:5, label:'5 boosters' },
  }));

  // --- Séries thématiques ----------------------------------------------
  const has = t => c => (c.tags || []).indexOf(t) !== -1;

  sets.push(
    { id:'set-leaders-bat', group:'Séries', name:'Meneurs au bâton', short:'BAT',
      accent:'#f5b942',
      filter: c => ['leadHR','leadRBI','leadAVG','leadOPS']
        .some(t => (c.tags||[]).indexOf(t) !== -1),
      reward:{ type:'boosters', amount:4, label:'4 boosters' } },

    { id:'set-leaders-pit', group:'Séries', name:'Meneurs au monticule', short:'PIT',
      accent:'#8fb8ff',
      filter: c => ['leadERA','leadK','leadW','leadSV']
        .some(t => (c.tags||[]).indexOf(t) !== -1),
      reward:{ type:'boosters', amount:4, label:'4 boosters' } },

    { id:'set-rookie', group:'Séries', name:'Recrues', short:'RC',
      accent:'#5fd39a',
      filter: has('rookie'),
      reward:{ type:'boosters', amount:4, label:'4 boosters' } },

    { id:'set-legends', group:'Séries', name:'Panthéon', short:'HOF',
      accent:'#e0c56a',
      filter: c => c.rarity === 'legend' || (c.tags||[]).indexOf('hof') !== -1,
      reward:{ type:'video', label:'Film Panthéon' } },

    { id:'set-ultra', group:'Séries', name:'Cartes Ultra', short:'ULTRA',
      accent:'#7dfff0',
      filter: c => c.rarity === 'ultra',
      reward:{ type:'video', label:'Film Ultra' } },
  );

  return sets;
}

/* ---------------------------------------------------------------------
   Vidéos débloquées. En production, `src` pointerait vers une vidéo
   hébergée ; dans le prototype on affiche une carte-film animée, pour
   montrer le principe sans embarquer 50 Mo de média.
   --------------------------------------------------------------------- */
const VIDEO_UNLOCKS = {
  ultra: {
    title: 'Le moment',
    caption: "Chaque carte Ultra ouvre un film d'archive du joueur.",
  },
};
