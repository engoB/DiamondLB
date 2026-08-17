/* =====================================================================
   DIAMOND FOIL — connexion aux API MLB
   ---------------------------------------------------------------------
   Endpoints publics de statsapi.mlb.com, sans clé :

     /api/v1/schedule?sportId=1&date=…&hydrate=team,linescore,probablePitcher
         → matchs du jour, score, manche en cours, lanceurs annoncés
     /api/v1.1/game/{gamePk}/feed/live
         → détail temps réel d'un match : coureurs, compte, dernière action
     /api/v1/standings?leagueId=103,104
         → classements
     /api/v1/people/{id}?hydrate=stats(group=[hitting],type=[season])
         → fiche joueur et statistiques de saison

   Trois précautions, parce que cette API est gratuite et sans SLA :

   1. TOUT échec est absorbé. Une panne de l'API ne doit jamais empêcher
      d'ouvrir un booster ou de consulter son classeur — ces parties-là
      n'en dépendent pas.
   2. Cache mémoire avec durée de vie. Un match en direct bouge toutes
      les quelques secondes, un classement une fois par jour : les deux
      n'ont pas besoin du même rafraîchissement.
   3. Un seul appel en vol par ressource. Sans ce verrou, un composant
      monté deux fois déclenche deux requêtes identiques.

   ⚠️ En production, ces appels devraient passer par votre propre serveur :
   côté navigateur, le CORS n'est pas garanti et vous exposez vos usagers
   à la disponibilité d'un tiers. L'application complète a déjà
   src/lib/mlb/client.js pour ça.
   ===================================================================== */

const MLB = (() => {
  const V1 = 'https://statsapi.mlb.com/api/v1';
  const V11 = 'https://statsapi.mlb.com/api/v1.1';

  const cache = new Map();   // url → { at, data }
  const inflight = new Map(); // url → Promise

  /**
   * GET avec cache et déduplication.
   * @param {string} url
   * @param {number} ttl durée de vie du cache, en millisecondes
   */
  async function get(url, ttl) {
    const hit = cache.get(url);
    if (hit && Date.now() - hit.at < ttl) return hit.data;
    if (inflight.has(url)) return inflight.get(url);

    const p = (async () => {
      // 8 secondes : au-delà, mieux vaut afficher un état dégradé que
      // laisser l'interface bloquée sur un chargement sans fin.
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      try {
        const res = await fetch(url, {
          signal: ctrl.signal,
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        cache.set(url, { at: Date.now(), data });
        return data;
      } finally {
        clearTimeout(timer);
        inflight.delete(url);
      }
    })();

    inflight.set(url, p);
    return p;
  }

  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };

  return {
    /** Matchs du jour. TTL court : un score bouge en permanence. */
    schedule(date) {
      const hydrate = encodeURIComponent('team,linescore,probablePitcher,flags');
      return get(`${V1}/schedule?sportId=1&date=${date || today()}&hydrate=${hydrate}`, 20000);
    },

    /** Détail d'un match en direct. */
    liveGame(gamePk) {
      return get(`${V11}/game/${gamePk}/feed/live`, 15000);
    },

    /** Classements des deux ligues. TTL long : ça ne bouge qu'après les matchs. */
    standings() {
      return get(`${V1}/standings?leagueId=103,104&season=${new Date().getFullYear()}`, 600000);
    },

    /** Fiche joueur et statistiques de saison. */
    player(personId) {
      const hydrate = encodeURIComponent('stats(group=[hitting],type=[season])');
      return get(`${V1}/people/${personId}?hydrate=${hydrate}`, 3600000);
    },

    /** Effectif d'une équipe — sert à étendre le catalogue. */
    roster(teamId) {
      return get(`${V1}/teams/${teamId}/roster?rosterType=active`, 3600000);
    },

    today,
  };
})();

/* ---------------------------------------------------------------------
   Mise en forme d'un match, quel que soit son état.
   L'API distingue Preview / Live / Final ; l'affichage doit dire la même
   chose dans les trois cas sans code conditionnel dans la vue.
   --------------------------------------------------------------------- */
function normaliseGame(g) {
  const ls = g.linescore || {};
  const st = g.status || {};
  const state = st.abstractGameState || 'Preview';

  const side = k => {
    const t = (g.teams && g.teams[k]) || {};
    const team = t.team || {};
    return {
      id: team.id,
      name: team.teamName || team.name || '—',
      abbr: team.abbreviation || '',
      runs: (ls.teams && ls.teams[k] && ls.teams[k].runs),
      hits: (ls.teams && ls.teams[k] && ls.teams[k].hits),
      record: t.leagueRecord ? `${t.leagueRecord.wins}-${t.leagueRecord.losses}` : '',
      pitcher: t.probablePitcher ? t.probablePitcher.fullName : null,
    };
  };

  let phase = '';
  if (state === 'Live') {
    const half = ls.inningState === 'Top' ? '▲' : ls.inningState === 'Bottom' ? '▼' : '';
    phase = `${half} ${ls.currentInningOrdinal || ''}`.trim();
  } else if (state === 'Final') {
    phase = 'Terminé';
  } else {
    const d = new Date(g.gameDate);
    phase = d.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
  }

  return {
    pk: g.gamePk,
    state,
    detailed: st.detailedState || '',
    phase,
    venue: (g.venue && g.venue.name) || '',
    away: side('away'),
    home: side('home'),
    outs: ls.outs,
    balls: ls.balls,
    strikes: ls.strikes,
    onBase: {
      first:  !!(ls.offense && ls.offense.first),
      second: !!(ls.offense && ls.offense.second),
      third:  !!(ls.offense && ls.offense.third),
    },
  };
}
