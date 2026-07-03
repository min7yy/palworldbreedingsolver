/* Pal Route Solver — BFS over the exact game breeding table (data/data.js) */

const ICON = 'assets/pals/';

function avatarHTML(i, cls) {
  return '<span class="av ' + (cls || '') + '"><img src="' + ICON + encodeURIComponent(NAMES[i]) + '.png" alt="' + NAMES[i] + '" loading="lazy"></span>';
}

/* adjacency: ADJ[pal][child] = [partners…] */
const ADJ = NAMES.map(() => ({}));
for (const k in PAIRS) {
  const [i, j] = k.split(',').map(Number), c = PAIRS[k];
  (ADJ[i][c] = ADJ[i][c] || []).push(j);
  if (i !== j) (ADJ[j][c] = ADJ[j][c] || []).push(i);
}
GLOCK.forEach(e => {
  (ADJ[e[0]][e[4]] = ADJ[e[0]][e[4]] || []).push(e[2]);
  (ADJ[e[2]][e[4]] = ADJ[e[2]][e[4]] || []).push(e[0]);
});

let selS = null, selT = null;
const order = [...NAMES.keys()].sort((a, b) => NAMES[a].localeCompare(NAMES[b]));

function renderList(w) {
  const q = document.getElementById('q' + w).value.trim().toLowerCase();
  const box = document.getElementById('l' + w);
  const sel = w === 's' ? selS : selT;
  box.innerHTML = '';
  order.filter(i => !q || NAMES[i].toLowerCase().includes(q)).forEach(i => {
    const b = document.createElement('button');
    if (i === sel) b.classList.add('sel');
    b.innerHTML = avatarHTML(i) + '<span>' + NAMES[i] + '</span>';
    b.onclick = () => { if (w === 's') selS = i; else selT = i; refresh(); };
    box.appendChild(b);
  });
  document.getElementById('ss').innerHTML = selS !== null ? avatarHTML(selS, 'sm') + NAMES[selS] : '';
  document.getElementById('st').innerHTML = selT !== null ? avatarHTML(selT, 'sm') + NAMES[selT] : '';
}

function refresh() { renderList('s'); renderList('t'); solve(); }
function swap() { [selS, selT] = [selT, selS]; refresh(); }

function solve() {
  const out = document.getElementById('out');
  if (selS === null || selT === null) {
    out.innerHTML = '<div class="msg idle">Select a <span class="kbd">start</span> and <span class="kbd">target</span> pal to solve the fastest route.</div>';
    return;
  }
  if (selS === selT) {
    out.innerHTML = '<div class="summary"><span class="path">' + avatarHTML(selS, 'lg') + NAMES[selS] + '</span><span class="pill zero">Same species — breed with itself to work on passives</span></div>';
    return;
  }
  const prev = new Array(NAMES.length).fill(-1);
  prev[selS] = selS;
  let q = [selS], found = false;
  while (q.length && !found) {
    const nq = [];
    for (const cur of q) {
      for (const c in ADJ[cur]) {
        const ci = +c;
        if (prev[ci] === -1) {
          prev[ci] = cur;
          if (ci === selT) { found = true; break; }
          nq.push(ci);
        }
      }
      if (found) break;
    }
    q = nq;
  }
  if (prev[selT] === -1) {
    out.innerHTML = '<div class="msg err"><b>' + NAMES[selT] + '</b> can never hatch from an egg — it is catch-only. Capture it directly.</div>';
    return;
  }
  const chain = [];
  let n = selT;
  while (n !== selS) { chain.push(n); n = prev[n]; }
  chain.reverse();

  let html = '<div class="summary"><span class="path">'
    + avatarHTML(selS, 'lg') + NAMES[selS]
    + '<span class="arr">→</span>'
    + avatarHTML(selT, 'lg') + NAMES[selT]
    + '<span class="gens">· ' + chain.length + ' generation' + (chain.length === 1 ? '' : 's') + '</span></span>'
    + '<span class="pill">Solved</span></div>';

  html += '<div class="chain-wrap"><div class="chain">';
  html += '<div class="node start"><span class="pic"><img src="' + ICON + encodeURIComponent(NAMES[selS]) + '.png" alt=""></span><span class="nm">' + NAMES[selS] + '</span></div>';
  let cur = selS;
  const stepData = [];
  chain.forEach((child, i) => {
    const ps = ADJ[cur][child] || [];
    const gl = GLOCK.filter(e => (e[0] === cur && e[4] === child) || (e[2] === cur && e[4] === child));
    stepData.push({ from: cur, to: child, ps, gl });
    const minis = ps.slice(0, 3).map(p => avatarHTML(p, 'sm')).join('');
    const more = ps.length > 3 ? '<span class="more">+' + (ps.length - 3) + '</span>' : '';
    html += '<button class="link" data-step="' + i + '" onclick="toggleStep(' + i + ')" title="Show all partners">'
      + '<span class="arrowline"><span class="gen">Gen ' + (i + 1) + '</span></span>'
      + '<span class="minis">' + minis + more + '</span>'
      + '<span class="plabel">' + ps.length + ' partner' + (ps.length === 1 ? '' : 's') + (gl.length ? ' · ⚥' : '') + '</span>'
      + '</button>';
    html += '<div class="node' + (child === selT ? ' target' : '') + '"><span class="pic"><img src="' + ICON + encodeURIComponent(NAMES[child]) + '.png" alt=""></span><span class="nm">' + NAMES[child] + '</span></div>';
    cur = child;
  });
  html += '</div><div class="linkdetail" id="ld"></div></div>';
  out.innerHTML = html;
  window._steps = stepData;
  window._openStep = -1;
}

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
  let h = '<div class="ttl">Gen ' + (i + 1) + ' — breed <b>' + NAMES[s.from] + '</b> with any of these to get <b>' + NAMES[s.to] + '</b>:</div>';
  h += '<div class="grid">' + s.ps.map(p => '<span class="chip">' + avatarHTML(p, 'sm') + NAMES[p] + '</span>').join('') + '</div>';
  if (s.gl.length) {
    h += '<div class="gw">Gender-locked: ' + s.gl.map(e => NAMES[e[0]] + (e[1] === 'FEMALE' ? '♀' : '♂') + ' + ' + NAMES[e[2]] + (e[3] === 'FEMALE' ? '♀' : '♂')).join(' · ') + '</div>';
  }
  ld.innerHTML = h;
  ld.classList.add('show');
}

document.getElementById('dbv').textContent = 'DB ' + VERSION;
refresh();
