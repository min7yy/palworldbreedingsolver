/* Pal Route Solver — BFS over the exact game breeding table (data/data.js)
 *
 * data/data.js defines four globals this file depends on:
 *   NAMES   — pal names, indexed by a numeric pal id (e.g. NAMES[217] === "Wixen")
 *   PAIRS   — { "i,j": childId } map of every parent-species pair -> child species.
 *             Unordered: breeding i with j is the same as breeding j with i.
 *   GLOCK   — gender-locked exceptions, each as [parentAId, parentAGender, parentBId,
 *             parentBGender, childId]. This is the one case in the game where which
 *             parent is male vs female changes the resulting child (Wixen x Katress).
 *   VERSION — identifies which game patch the data was generated from.
 */

const ICON = 'assets/pals/';

// Small avatar <img> markup used everywhere a pal needs to be shown.
// `cls` adds a size modifier class (e.g. 'sm', 'lg') on top of the base .av style.
function avatarHTML(i, cls) {
  return `<span class="av ${cls || ''}"><img src="${ICON}${encodeURIComponent(NAMES[i])}.png" alt="${NAMES[i]}" loading="lazy"></span>`;
}

/* --- Build the breeding graph ---
 * ADJ[parentId][childId] = [partnerId, partnerId, ...]
 * Read as: "breeding parentId with any of these partners produces childId."
 * The graph is undirected (either parent can be treated as the starting
 * species), so every pair below is recorded in both directions.
 */
const ADJ = NAMES.map(() => ({}));

function addPartner(parent, child, partner) {
  (ADJ[parent][child] = ADJ[parent][child] || []).push(partner);
}

for (const key in PAIRS) {
  const [i, j] = key.split(',').map(Number);
  const child = PAIRS[key];
  addPartner(i, child, j);
  if (i !== j) addPartner(j, child, i);
}

// Gender-locked pairs sit outside the regular PAIRS table (since a pair can't
// map to two different children there), so they're layered on top here.
GLOCK.forEach(([parentA, , parentB, , child]) => {
  addPartner(parentA, child, parentB);
  addPartner(parentB, child, parentA);
});

// Pals only obtainable by catching in the wild at level 60 or from a raid
// battle — never by breeding them yourself. Hand-maintained: data/data.js is
// regenerated from game files and carries no rarity/acquisition info, so this
// list needs a manual check after any game patch that adds new pals.
const LEGENDARY_NAMES = [
  'Frostallion', 'Frostallion Noct', 'Jetragon', 'Neptilius',
  'Paladius', 'Necromus', 'Bellanoir', 'Bellanoir Libero', 'Xenolord',
  'Shadowbeak', 'Blazamut', 'Blazamut Ryu', 'Suzaku', 'Suzaku Aqua',
];
const LEGENDARY = new Set(LEGENDARY_NAMES.map(n => NAMES.indexOf(n)));

// True when every partner offered for a step is Legendary — i.e. there's no
// ordinary, breedable pal that works here, only ones you'd have to catch or raid.
function isLegendaryOnly(partners) {
  return partners.length > 0 && partners.every(p => LEGENDARY.has(p));
}

// A legendary-free view of the breeding graph: same shape as ADJ, but with
// Legendary partners stripped from every partner list, and edges dropped
// once that leaves them with no partners at all. Used to search for an
// alternate route when the normal shortest path forces a legendary partner.
const ADJ_FREE = NAMES.map(() => ({}));
for (let parent = 0; parent < NAMES.length; parent++) {
  for (const child in ADJ[parent]) {
    const free = ADJ[parent][child].filter(p => !LEGENDARY.has(p));
    if (free.length) ADJ_FREE[parent][child] = free;
  }
}

let selS = null, selT = null; // currently selected start/target pal ids

// All pal ids, sorted alphabetically by name — the order the picker lists render in.
const order = [...NAMES.keys()].sort((a, b) => NAMES[a].localeCompare(NAMES[b]));

// Re-renders one picker column ('s' for start, 't' for target): filters the
// pal list by that column's search box, redraws the buttons, and updates the
// small "currently selected" label above the list.
function renderList(w) {
  const query = document.getElementById('q' + w).value.trim().toLowerCase();
  const box = document.getElementById('l' + w);
  const selected = w === 's' ? selS : selT;

  box.innerHTML = '';
  order
    .filter(i => !query || NAMES[i].toLowerCase().includes(query))
    .forEach(i => {
      const btn = document.createElement('button');
      if (i === selected) btn.classList.add('sel');
      btn.innerHTML = `${avatarHTML(i)}<span>${NAMES[i]}</span>`;
      btn.onclick = () => { if (w === 's') selS = i; else selT = i; refresh(); };
      box.appendChild(btn);
    });

  document.getElementById('ss').innerHTML = selS !== null ? avatarHTML(selS, 'sm') + NAMES[selS] : '';
  document.getElementById('st').innerHTML = selT !== null ? avatarHTML(selT, 'sm') + NAMES[selT] : '';
}

function refresh() { renderList('s'); renderList('t'); solve(); }
function swap() { [selS, selT] = [selT, selS]; refresh(); }

// Generic breadth-first shortest path over a graph shaped like ADJ. Returns
// the ordered list of ids from just after `start` through `target`
// (inclusive), or null if target isn't reachable from start.
//
// prev[id] is the pal id we bred *from* to first reach id, or -1 if not
// reached yet. Because BFS expands in order of distance, the first time
// target is dequeued its path is guaranteed to be the shortest one available.
function shortestPath(adj, start, target) {
  const prev = new Array(NAMES.length).fill(-1);
  prev[start] = start;
  const queue = [start];
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi];
    if (cur === target) break; // shortest path already found — stop early
    for (const c in adj[cur]) {
      const ci = +c;
      if (prev[ci] === -1) {
        prev[ci] = cur;
        queue.push(ci);
      }
    }
  }
  if (prev[target] === -1) return null;
  const chain = [];
  for (let n = target; n !== start; n = prev[n]) chain.push(n);
  chain.reverse();
  return chain;
}

// Builds the per-generation data for a chain (which partners work, whether
// it's gender-locked or legendary-only), reading partner lists from `adj`
// (defaults to the full graph; pass ADJ_FREE for a legendary-free chain).
function buildSteps(chain, start, adj = ADJ) {
  let cur = start;
  return chain.map(child => {
    const partners = adj[cur][child] || [];
    const genderLocked = GLOCK.filter(e => e[4] === child && (e[0] === cur || e[2] === cur));
    const step = { from: cur, to: child, partners, genderLocked, legendaryOnly: isLegendaryOnly(partners) };
    cur = child;
    return step;
  });
}

// Renders a chain of pal nodes with generation links between them. Pass
// interactive: true to make each link clickable (drives toggleStep) — the
// legendary-free alternate route is rendered non-interactively instead.
function chainHTML(chain, start, target, steps, interactive) {
  let html = `<div class="node start"><span class="pic"><img src="${ICON}${encodeURIComponent(NAMES[start])}.png" alt=""></span><span class="nm">${NAMES[start]}</span></div>`;

  chain.forEach((child, i) => {
    const { partners, genderLocked, legendaryOnly } = steps[i];
    const minis = partners.slice(0, 3).map(p => avatarHTML(p, 'sm')).join('');
    const more = partners.length > 3 ? `<span class="more">+${partners.length - 3}</span>` : '';
    const flags = (genderLocked.length ? ' · ⚥' : '') + (legendaryOnly ? ' · ⚠' : '');
    const tag = interactive ? 'button' : 'div';
    const attrs = interactive
      ? `class="link" data-step="${i}" onclick="toggleStep(${i})" title="Show all partners"`
      : 'class="link static"';

    html += `<${tag} ${attrs}>
      <span class="arrowline"><span class="gen">Gen ${i + 1}</span></span>
      <span class="minis">${minis}${more}</span>
      <span class="plabel">${partners.length} partner${partners.length === 1 ? '' : 's'}${flags}</span>
    </${tag}>`;
    html += `<div class="node${child === target ? ' target' : ''}"><span class="pic"><img src="${ICON}${encodeURIComponent(NAMES[child])}.png" alt=""></span><span class="nm">${NAMES[child]}</span></div>`;
  });

  return html;
}

// Finds the shortest breeding route from selS to selT and renders the result.
function solve() {
  const out = document.getElementById('out');

  if (selS === null || selT === null) {
    out.innerHTML = '<div class="msg idle">Select a <span class="kbd">start</span> and <span class="kbd">target</span> pal to solve the fastest route.</div>';
    return;
  }
  if (selS === selT) {
    out.innerHTML = `<div class="summary"><span class="path">${avatarHTML(selS, 'lg')}${NAMES[selS]}</span><span class="pill zero">Same species — breed with itself to work on passives</span></div>`;
    return;
  }

  const chain = shortestPath(ADJ, selS, selT);
  if (!chain) {
    out.innerHTML = `<div class="msg err"><b>${NAMES[selT]}</b> can never hatch from an egg — it is catch-only. Capture it directly.</div>`;
    return;
  }

  const stepData = buildSteps(chain, selS);

  let html = `<div class="summary"><span class="path">${avatarHTML(selS, 'lg')}${NAMES[selS]}<span class="arr">→</span>${avatarHTML(selT, 'lg')}${NAMES[selT]}<span class="gens">· ${chain.length} generation${chain.length === 1 ? '' : 's'}</span></span><span class="pill">Solved</span></div>`;
  html += `<div class="chain-wrap"><div class="chain">${chainHTML(chain, selS, selT, stepData, true)}</div><div class="linkdetail" id="ld"></div></div>`;

  // The first and last generation are the two steps the user can't route
  // around — breeding straight off the pal they already own, or breeding the
  // final child. If either has no non-legendary partner option, flag it and
  // look for a route that never needs a legendary as a partner at all.
  const forcesLegendary = stepData[0].legendaryOnly || stepData[stepData.length - 1].legendaryOnly;
  if (forcesLegendary) {
    const altChain = shortestPath(ADJ_FREE, selS, selT);
    if (altChain) {
      const altSteps = buildSteps(altChain, selS, ADJ_FREE);
      html += `<div class="alt">
        <button class="alt-toggle" onclick="toggleAlt()">⚠ This route needs a Legendary Pal you can't breed yourself. A legendary-free alternative exists (${altChain.length} generation${altChain.length === 1 ? '' : 's'}) — show it</button>
        <div class="chain-wrap alt-chain-wrap" id="altWrap"><div class="chain">${chainHTML(altChain, selS, selT, altSteps, false)}</div></div>
      </div>`;
    } else {
      html += `<div class="alt"><div class="alt-toggle static">⚠ Every route to <b>${NAMES[selT]}</b> needs a Legendary Pal as a breeding partner at some unavoidable step — no legendary-free alternative exists.</div></div>`;
    }
  }

  out.innerHTML = html;
  window._steps = stepData;
  window._openStep = -1;
}

// Expands/collapses the legendary-free alternate route panel below the main result.
function toggleAlt() {
  document.getElementById('altWrap').classList.toggle('show');
}

// Expands/collapses the partner-detail panel below a given generation's link.
// Clicking the already-open step's link closes it; clicking another switches to it.
function toggleStep(i) {
  const ld = document.getElementById('ld');
  const links = document.querySelectorAll('.link');

  if (window._openStep === i) {
    window._openStep = -1;
    ld.classList.remove('show');
    links.forEach(l => l.classList.remove('open'));
    return;
  }

  window._openStep = i;
  links.forEach(l => l.classList.toggle('open', +l.getAttribute('data-step') === i));

  const s = window._steps[i];
  let h = `<div class="ttl">Gen ${i + 1} — breed <b>${NAMES[s.from]}</b> with any of these to get <b>${NAMES[s.to]}</b>:</div>`;
  h += `<div class="grid">${s.partners.map(p => `<span class="chip">${avatarHTML(p, 'sm')}${NAMES[p]}</span>`).join('')}</div>`;
  if (s.genderLocked.length) {
    h += `<div class="gw">Gender-locked: ${s.genderLocked
      .map(e => `${NAMES[e[0]]}${e[1] === 'FEMALE' ? '♀' : '♂'} + ${NAMES[e[2]]}${e[3] === 'FEMALE' ? '♀' : '♂'}`)
      .join(' · ')}</div>`;
  }
  if (s.legendaryOnly) {
    h += `<div class="gw">Every partner for this step is a Legendary Pal — catch at level 60 or win it from a raid, not breedable.</div>`;
  }
  ld.innerHTML = h;
  ld.classList.add('show');
}

// Initial paint: render the (empty) pickers + idle message.
refresh();
