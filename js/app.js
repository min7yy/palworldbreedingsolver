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

  // Breadth-first search over ADJ: prev[id] is the pal id we bred *from* to
  // first reach id, or -1 if id hasn't been reached yet. Because BFS expands
  // in order of distance, the first time selT is dequeued its path is
  // guaranteed to be the shortest one available.
  const prev = new Array(NAMES.length).fill(-1);
  prev[selS] = selS;
  const queue = [selS];
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi];
    if (cur === selT) break; // shortest path already found — stop early
    for (const c in ADJ[cur]) {
      const ci = +c;
      if (prev[ci] === -1) {
        prev[ci] = cur;
        queue.push(ci);
      }
    }
  }

  if (prev[selT] === -1) {
    out.innerHTML = `<div class="msg err"><b>${NAMES[selT]}</b> can never hatch from an egg — it is catch-only. Capture it directly.</div>`;
    return;
  }

  // Walk prev[] back from the target to the start to recover the route,
  // then reverse it into start -> ... -> target order.
  const chain = [];
  for (let n = selT; n !== selS; n = prev[n]) chain.push(n);
  chain.reverse();

  let html = `<div class="summary"><span class="path">${avatarHTML(selS, 'lg')}${NAMES[selS]}<span class="arr">→</span>${avatarHTML(selT, 'lg')}${NAMES[selT]}<span class="gens">· ${chain.length} generation${chain.length === 1 ? '' : 's'}</span></span><span class="pill">Solved</span></div>`;

  html += '<div class="chain-wrap"><div class="chain">';
  html += `<div class="node start"><span class="pic"><img src="${ICON}${encodeURIComponent(NAMES[selS])}.png" alt=""></span><span class="nm">${NAMES[selS]}</span></div>`;

  // stepData holds, per generation, everything the click-to-expand detail
  // panel (toggleStep, below) needs: the valid partners and any gender-locked note.
  let cur = selS;
  const stepData = [];
  chain.forEach((child, i) => {
    const partners = ADJ[cur][child] || [];
    const genderLocked = GLOCK.filter(e => e[4] === child && (e[0] === cur || e[2] === cur));
    stepData.push({ from: cur, to: child, partners, genderLocked });

    const minis = partners.slice(0, 3).map(p => avatarHTML(p, 'sm')).join('');
    const more = partners.length > 3 ? `<span class="more">+${partners.length - 3}</span>` : '';

    html += `<button class="link" data-step="${i}" onclick="toggleStep(${i})" title="Show all partners">
      <span class="arrowline"><span class="gen">Gen ${i + 1}</span></span>
      <span class="minis">${minis}${more}</span>
      <span class="plabel">${partners.length} partner${partners.length === 1 ? '' : 's'}${genderLocked.length ? ' · ⚥' : ''}</span>
    </button>`;
    html += `<div class="node${child === selT ? ' target' : ''}"><span class="pic"><img src="${ICON}${encodeURIComponent(NAMES[child])}.png" alt=""></span><span class="nm">${NAMES[child]}</span></div>`;

    cur = child;
  });
  html += '</div><div class="linkdetail" id="ld"></div></div>';

  out.innerHTML = html;
  window._steps = stepData;
  window._openStep = -1;
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
  ld.innerHTML = h;
  ld.classList.add('show');
}

// Initial paint: show the data version, then render the (empty) pickers + idle message.
document.getElementById('dbv').textContent = `DB ${VERSION}`;
refresh();
