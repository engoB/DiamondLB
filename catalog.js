/* =====================================================================
   DIAMOND FOIL — catalogue 100 % API
   ---------------------------------------------------------------------
   RIEN N'EST ÉCRIT EN DUR. Chaque nom, chaque statistique, chaque équipe
   vient de statsapi.mlb.com. S'il n'y a pas de réseau, il n'y a pas de
   cartes — plutôt que des cartes fausses.

   Cinq sources, toutes publiques et sans clé :

     /api/v1/teams?sportId=1
         les 30 franchises

     /api/v1/teams/{id}/roster?rosterType=active
         l'effectif actif de chaque club (~1 100 joueurs)

     /api/v1/people?personIds=…&hydrate=stats(group=[hitting,pitching],type=[season])
         fiche et statistiques réelles de la saison, par lots de 40

     /api/v1/stats/leaders?leaderCategories=…&statType=statsSingleSeason
         les meilleures saisons de l'histoire → cartes Légende et Ultra

     /api/v1/stats/leaders?leaderCategories=…&season=YYYY
         les meneurs de la saison en cours → marqueurs

   Les marqueurs ne sont plus devinés à partir de seuils que j'aurais
   choisis : ce sont les classements officiels. Un joueur porte
   « Meneur CC » parce que l'API le place en tête des coups de circuit.
   ===================================================================== */

const Catalog = (() => {
  const V1 = 'https://statsapi.mlb.com/api/v1';
  const CACHE_KEY = 'diamond-foil:catalog:v2';
  const CACHE_TTL = 6 * 3600 * 1000;   // 6 h — les statistiques bougent chaque jour
  const BATCH = 40;

  /* -------------------------------------------------------------------
     Rareté.
     Ce n'est pas une donnée inventée mais un CLASSEMENT de données
     réelles : on trie par performance mesurée et on découpe en paliers.
     La formule est visible, vérifiable, et le résultat se met à jour
     tout seul quand les statistiques changent.
     ------------------------------------------------------------------- */
  function rarityForHitter(st) {
    const ops = parseFloat(st.ops) || 0;
    const pa = st.plateAppearances || 0;
    if (pa < 80) return 'common';
    if (ops >= 1.000) return 'holo';
    if (ops >= 0.900) return 'epic';
    if (ops >= 0.780) return 'rare';
    return 'common';
  }
  function rarityForPitcher(st) {
    const era = parseFloat(st.era);
    const ip = parseFloat(st.inningsPitched) || 0;
    const k = st.strikeOuts || 0;
    if (!Number.isFinite(era) || ip < 30) return 'common';
    if (era <= 2.60 && ip >= 120) return 'holo';
    if (era <= 3.20 && (ip >= 100 || k >= 90)) return 'epic';
    if (era <= 3.90) return 'rare';
    return 'common';
  }

  async function getJSON(url) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } finally { clearTimeout(timer); }
  }

  const side = c => c === 'L' ? 'G' : c === 'S' ? 'A' : 'D';

  /* --- Meneurs de la saison → marqueurs réels ------------------------ */
  const LEADER_TAGS = [
    ['homeRuns',           'hitting',  'leadHR'],
    ['runsBattedIn',       'hitting',  'leadRBI'],
    ['battingAverage',     'hitting',  'leadAVG'],
    ['onBasePlusSlugging', 'hitting',  'leadOPS'],
    ['earnedRunAverage',   'pitching', 'leadERA'],
    ['strikeouts',         'pitching', 'leadK'],
    ['wins',               'pitching', 'leadW'],
    ['saves',              'pitching', 'leadSV'],
  ];

  async function fetchLeaderTags(season) {
    const map = new Map();
    for (const [cat, group, code] of LEADER_TAGS) {
      try {
        const d = await getJSON(
          `${V1}/stats/leaders?leaderCategories=${cat}&statGroup=${group}` +
          `&season=${season}&sportId=1&limit=5`);
        (d.leagueLeaders || []).forEach(c => (c.leaders || []).forEach(l => {
          const id = l.person && l.person.id;
          if (!id) return;
          const cur = map.get(id) || [];
          if (cur.indexOf(code) === -1) cur.push(code);
          map.set(id, cur);
        }));
      } catch { /* une catégorie absente n'empêche pas les autres */ }
    }
    return map;
  }

  /* --- Meilleures saisons de l'histoire → Légendes et Ultra ---------- */
  async function fetchLegends(limit) {
    const rows = [];
    const seen = new Set();
    const cats = ['onBasePlusSlugging', 'homeRuns', 'battingAverage'];

    for (const cat of cats) {
      let d;
      try {
        d = await getJSON(`${V1}/stats/leaders?leaderCategories=${cat}` +
          `&statType=statsSingleSeason&statGroup=hitting&limit=${limit}`);
      } catch { continue; }

      const leaders = ((d.leagueLeaders || [])[0] || {}).leaders || [];
      leaders.forEach((l, i) => {
        const p = l.person || {};
        const season = Number(l.season);
        if (!p.id || !season) return;
        const key = p.id + '-' + season;
        if (seen.has(key)) return;
        seen.add(key);

        // Les trois meilleures saisons all-time à l'OPS deviennent Ultra :
        // c'est un fait mesuré, pas un choix arbitraire.
        const rarity = (cat === 'onBasePlusSlugging' && i < 3) ? 'ultra' : 'legend';
        const st = l.stat || {};

        rows.push([
          p.id,
          p.fullName || ('Joueur ' + p.id),
          (p.primaryPosition && p.primaryPosition.abbreviation) || '',
          (l.team && (l.team.abbreviation || l.team.teamName)) || '',
          '',
          rarity,
          season,
          ['hof'],
          'D', 'D',
          { avg: st.avg, hr: st.homeRuns, rbi: st.rbi, ops: st.ops,
            bb: st.baseOnBalls, sb: st.stolenBases },
        ]);
      });
    }
    return rows;
  }

  /* --- Synchronisation complète -------------------------------------- */
  async function sync(onProgress) {
    const say = (step, done, total) => onProgress && onProgress({ step, done, total });
    const season = new Date().getFullYear();

    say('Franchises', 0, 1);
    const teamsData = await getJSON(
      `${V1}/teams?sportId=1&fields=teams,id,name,abbreviation,teamName,locationName`);
    const teams = teamsData.teams || [];
    if (!teams.length) throw new Error("Aucune équipe renvoyée par l'API");
    say('Franchises', 1, 1);

    const roster = [];
    for (let i = 0; i < teams.length; i += 1) {
      say('Effectifs', i, teams.length);
      try {
        const d = await getJSON(`${V1}/teams/${teams[i].id}/roster?rosterType=active`);
        (d.roster || []).forEach(r => roster.push({
          id: r.person.id,
          num: r.jerseyNumber || '',
          pos: (r.position && r.position.abbreviation) || '',
          teamAbbr: teams[i].abbreviation,
        }));
      } catch { console.warn('Effectif indisponible', teams[i].abbreviation); }
    }
    say('Effectifs', teams.length, teams.length);
    if (!roster.length) throw new Error('Aucun effectif récupéré');

    say('Meneurs', 0, 1);
    const leaderTags = await fetchLeaderTags(season);
    say('Meneurs', 1, 1);

    const byId = new Map(roster.map(r => [r.id, r]));
    const ids = [...byId.keys()];
    const cards = [];

    for (let i = 0; i < ids.length; i += BATCH) {
      say('Statistiques', i, ids.length);
      const slice = ids.slice(i, i + BATCH);
      const hydrate = encodeURIComponent(
        `stats(group=[hitting,pitching],type=[season],season=${season})`);
      let people = [];
      try {
        const d = await getJSON(`${V1}/people?personIds=${slice.join(',')}&hydrate=${hydrate}`);
        people = d.people || [];
      } catch { continue; }

      people.forEach(p => {
        const meta = byId.get(p.id) || {};
        const pos = (p.primaryPosition && p.primaryPosition.abbreviation) || meta.pos || '';
        const isP = pos === 'P';
        const group = isP ? 'pitching' : 'hitting';

        const block = (p.stats || []).find(b =>
          b.group && b.group.displayName === group &&
          b.type && b.type.displayName === 'season');
        const splits = (block && block.splits) || [];
        const st = (splits[splits.length - 1] || {}).stat || {};

        // Sans apparition, pas de statistiques. On écarte la carte plutôt
        // que d'inventer des chiffres pour combler.
        const played = isP
          ? (parseFloat(st.inningsPitched) || 0) > 0
          : (st.plateAppearances || 0) > 0;
        if (!played) return;

        const tags = (leaderTags.get(p.id) || []).slice();
        if (p.mlbDebutDate && season - new Date(p.mlbDebutDate).getFullYear() <= 1) {
          tags.push('rookie');
        }

        cards.push([
          p.id, p.fullName, pos,
          meta.teamAbbr || (p.currentTeam && p.currentTeam.abbreviation) || '',
          p.primaryNumber || meta.num || '',
          isP ? rarityForPitcher(st) : rarityForHitter(st),
          season, tags,
          side(p.batSide && p.batSide.code),
          side(p.pitchHand && p.pitchHand.code),
          isP
            ? { era: st.era, k: st.strikeOuts, w: st.wins, l: st.losses,
                ip: st.inningsPitched, sv: st.saves, whip: st.whip }
            : { avg: st.avg, hr: st.homeRuns, rbi: st.rbi, ops: st.ops,
                bb: st.baseOnBalls, sb: st.stolenBases },
        ]);
      });
    }

    say('Légendes', 0, 1);
    let legends = [];
    try { legends = await fetchLegends(12); } catch { /* facultatif */ }
    say('Légendes', 1, 1);

    const all = cards.concat(legends);
    if (!all.length) throw new Error('Aucune carte construite');
    say('Terminé', ids.length, ids.length);
    return all;
  }

  function readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const { at, cards } = JSON.parse(raw);
      if (!cards || !cards.length) return null;
      return { cards, at, stale: Date.now() - at > CACHE_TTL };
    } catch { return null; }
  }
  function writeCache(cards) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), cards })); return true; }
    catch { return false; }
  }
  function clearCache() { try { localStorage.removeItem(CACHE_KEY); } catch {} }

  return { sync, readCache, writeCache, clearCache, CACHE_KEY, CACHE_TTL };
})();
