/* =====================================================================
   DIAMOND FOIL — les 30 franchises MLB
   ---------------------------------------------------------------------
   Identifiants, abréviations, divisions et stades relevés le jour de
   l'écriture sur https://statsapi.mlb.com/api/v1/teams?sportId=1
   Ces champs-là sont donc exacts, y compris les changements récents :
   les Athletics jouent à Sacramento sous l'abréviation ATH, le stade de
   Houston s'appelle Daikin Park et celui des White Sox Rate Field.

   Les couleurs, en revanche, ne viennent PAS de l'API : elle n'en
   fournit pas. Elles sont approchées d'après les chartes des clubs.
   C'est le seul champ de ce fichier à considérer comme indicatif.

   Format : id, abr, ville, club, ligue, division, stade, [c1, c2]
   ===================================================================== */

const TEAMS = [
  // ---------------- Ligue américaine · Est ----------------
  { id:110, abbr:'BAL', city:'Baltimore',    club:'Orioles',    lg:'AL', div:'E', park:'Oriole Park at Camden Yards', c1:'#DF4601', c2:'#000000' },
  { id:111, abbr:'BOS', city:'Boston',       club:'Red Sox',    lg:'AL', div:'E', park:'Fenway Park',                 c1:'#BD3039', c2:'#0C2340' },
  { id:147, abbr:'NYY', city:'New York',     club:'Yankees',    lg:'AL', div:'E', park:'Yankee Stadium',              c1:'#0C2340', c2:'#C4CED4' },
  { id:139, abbr:'TB',  city:'Tampa Bay',    club:'Rays',       lg:'AL', div:'E', park:'Tropicana Field',             c1:'#092C5C', c2:'#8FBCE6' },
  { id:141, abbr:'TOR', city:'Toronto',      club:'Blue Jays',  lg:'AL', div:'E', park:'Rogers Centre',               c1:'#134A8E', c2:'#1D2D5C' },

  // ---------------- Ligue américaine · Centre ----------------
  { id:145, abbr:'CWS', city:'Chicago',      club:'White Sox',  lg:'AL', div:'C', park:'Rate Field',                  c1:'#27251F', c2:'#C4CED4' },
  { id:114, abbr:'CLE', city:'Cleveland',    club:'Guardians',  lg:'AL', div:'C', park:'Progressive Field',           c1:'#00385D', c2:'#E50022' },
  { id:116, abbr:'DET', city:'Detroit',      club:'Tigers',     lg:'AL', div:'C', park:'Comerica Park',               c1:'#0C2340', c2:'#FA4616' },
  { id:118, abbr:'KC',  city:'Kansas City',  club:'Royals',     lg:'AL', div:'C', park:'Kauffman Stadium',            c1:'#004687', c2:'#BD9B60' },
  { id:142, abbr:'MIN', city:'Minnesota',    club:'Twins',      lg:'AL', div:'C', park:'Target Field',                c1:'#002B5C', c2:'#D31145' },

  // ---------------- Ligue américaine · Ouest ----------------
  { id:117, abbr:'HOU', city:'Houston',      club:'Astros',     lg:'AL', div:'W', park:'Daikin Park',                 c1:'#002D62', c2:'#EB6E1F' },
  { id:108, abbr:'LAA', city:'Los Angeles',  club:'Angels',     lg:'AL', div:'W', park:'Angel Stadium',               c1:'#BA0021', c2:'#003263' },
  { id:133, abbr:'ATH', city:'Sacramento',   club:'Athletics',  lg:'AL', div:'W', park:'Sutter Health Park',          c1:'#003831', c2:'#EFB21E' },
  { id:136, abbr:'SEA', city:'Seattle',      club:'Mariners',   lg:'AL', div:'W', park:'T-Mobile Park',               c1:'#0C2C56', c2:'#005C5C' },
  { id:140, abbr:'TEX', city:'Texas',        club:'Rangers',    lg:'AL', div:'W', park:'Globe Life Field',            c1:'#003278', c2:'#C0111F' },

  // ---------------- Ligue nationale · Est ----------------
  { id:144, abbr:'ATL', city:'Atlanta',      club:'Braves',     lg:'NL', div:'E', park:'Truist Park',                 c1:'#CE1141', c2:'#13274F' },
  { id:146, abbr:'MIA', city:'Miami',        club:'Marlins',    lg:'NL', div:'E', park:'loanDepot park',              c1:'#00A3E0', c2:'#EF3340' },
  { id:121, abbr:'NYM', city:'New York',     club:'Mets',       lg:'NL', div:'E', park:'Citi Field',                  c1:'#002D72', c2:'#FF5910' },
  { id:143, abbr:'PHI', city:'Philadelphia', club:'Phillies',   lg:'NL', div:'E', park:'Citizens Bank Park',          c1:'#E81828', c2:'#002D72' },
  { id:120, abbr:'WSH', city:'Washington',   club:'Nationals',  lg:'NL', div:'E', park:'Nationals Park',              c1:'#AB0003', c2:'#14225A' },

  // ---------------- Ligue nationale · Centre ----------------
  { id:112, abbr:'CHC', city:'Chicago',      club:'Cubs',       lg:'NL', div:'C', park:'Wrigley Field',               c1:'#0E3386', c2:'#CC3433' },
  { id:113, abbr:'CIN', city:'Cincinnati',   club:'Reds',       lg:'NL', div:'C', park:'Great American Ball Park',    c1:'#C6011F', c2:'#000000' },
  { id:158, abbr:'MIL', city:'Milwaukee',    club:'Brewers',    lg:'NL', div:'C', park:'American Family Field',       c1:'#12284B', c2:'#FFC52F' },
  { id:134, abbr:'PIT', city:'Pittsburgh',   club:'Pirates',    lg:'NL', div:'C', park:'PNC Park',                    c1:'#27251F', c2:'#FDB827' },
  { id:138, abbr:'STL', city:'St. Louis',    club:'Cardinals',  lg:'NL', div:'C', park:'Busch Stadium',               c1:'#C41E3A', c2:'#0C2340' },

  // ---------------- Ligue nationale · Ouest ----------------
  { id:109, abbr:'AZ',  city:'Arizona',      club:'D-backs',    lg:'NL', div:'W', park:'Chase Field',                 c1:'#A71930', c2:'#E3D4AD' },
  { id:115, abbr:'COL', city:'Colorado',     club:'Rockies',    lg:'NL', div:'W', park:'Coors Field',                 c1:'#333366', c2:'#C4CED4' },
  { id:119, abbr:'LAD', city:'Los Angeles',  club:'Dodgers',    lg:'NL', div:'W', park:'Dodger Stadium',              c1:'#005A9C', c2:'#EF3E42' },
  { id:135, abbr:'SD',  city:'San Diego',    club:'Padres',     lg:'NL', div:'W', park:'Petco Park',                  c1:'#2F241D', c2:'#FFC425' },
  { id:137, abbr:'SF',  city:'San Francisco',club:'Giants',     lg:'NL', div:'W', park:'Oracle Park',                 c1:'#FD5A1E', c2:'#27251F' },
];

/* Franchises historiques, pour les cartes Légende. Les identifiants des
   équipes des Negro Leagues viennent également de l'API MLB. */
const LEGACY_TEAMS = [
  { id:1513, abbr:'HOM', city:'Homestead',   club:'Grays',        lg:'NNL', div:'—', park:'Forbes Field',      c1:'#4A4A4A', c2:'#C9A227' },
  { id:1541, abbr:'SLS', city:'St. Louis',   club:'Stars',        lg:'NNL', div:'—', park:'Stars Park',        c1:'#1B3A6B', c2:'#C9A227' },
  { id:6150, abbr:'HBG', city:'Harrisburg',  club:'Giants',       lg:'ECL', div:'—', park:'Island Park',       c1:'#2E4A3D', c2:'#C9A227' },
];

const DIVISIONS = {
  'AL-E':'Am. Est',   'AL-C':'Am. Centre',  'AL-W':'Am. Ouest',
  'NL-E':'Nat. Est',  'NL-C':'Nat. Centre', 'NL-W':'Nat. Ouest',
  'NNL-—':'Negro Leagues', 'ECL-—':'Negro Leagues',
};
