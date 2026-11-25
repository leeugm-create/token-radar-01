// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and renders
// three views from it: the ranked pre-token board, a detail view for every protocol on it, and the
// live-token table whose market values anchor the model's multiples. Sortable, filterable, and
// rendered entirely from data.js: no fetch, no network, nothing leaves the page.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var rows = DATA.rows;
  var bySlug = {};
  rows.forEach(function (r) { bySlug[r.slug] = r; });

  var state = { view: 'board', q: '', category: 'all', chain: 'all', status: 'all', sort: 'rank', dir: 1, slug: null };

  /* ---------- formatting ---------- */
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtFull(n) {
    return '$' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return '<span class="faint">n/a</span>';
    var cls = n > 0 ? 'pos' : n < 0 ? 'neg' : '';
    return '<span class="' + cls + '">' + (n > 0 ? '+' : '') + n.toFixed(2) + '%</span>';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + ' yrs';
    return Math.round(days) + ' days';
  }
  function fmtMult(x) { return '×' + Number(x).toFixed(3); }
  function fmtX(x) { return '×' + Number(x).toFixed(2); }
  function fmtShare(x) { return Math.round(Number(x) * 100) + '%'; }

  /* ---------- shared chrome ---------- */
  function masthead() {
    return '<header class="masthead"><div class="scope" aria-hidden="true"></div><div>' +
      '<h1>TOKEN <span class="thin">RADAR</span></h1>' +
      '<p class="tagline">Protocols that record no token yet, ranked by what a token would be worth if ' +
      'their record stayed as it is — priced from the market\u2019s own multiples for their kind, and ' +
      'paired with the steps to farm each one before it launches.</p>' +
      '<p class="meta">snapshot <b>' + esc(DATA.as_of) + '</b> · DefiLlama protocols · model <b>' +
      esc(DATA.model_version) + '</b> · board <b>' + DATA.board_size + '</b> = watchlist <b>' +
      DATA.watchlist_size + '</b> + early finds <b>' + DATA.early_size + '</b> · live tokens tracked apart: <b>' +
      DATA.live_size + '</b></p></div></header>';
  }
  function footer() {
    return '<footer>Implied value is this radar\u2019s own estimate, built only from the snapshot\u2019s ' +
      'figures (TVL, seven-day change, age, category, chains). It is not a prediction that any protocol ' +
      'will issue a token, or when. A protocol listed here records no token in the snapshot; that is a ' +
      'statement about the record, not proof none exists. Farm plans are planning estimates: gas and ' +
      'prices move, and a position can lose money.</footer>';
  }
  function modelPanel() {
    var chips = DATA.multiples.map(function (m) {
      return '<span><b>' + esc(m.category) + '</b> ' + fmtMult(m.multiple) + ' <span class="n">n=' + m.comparables + '</span></span>';
    }).join('');
    return '<section class="model"><h2>How the radar prices a launch</h2>' +
      '<p>Each category is priced at <b>the market\u2019s own median market-cap / TVL</b> for that category, ' +
      'taken from the snapshot\u2019s live-token protocols and shrunk toward the market-wide median ' +
      '(<b>' + fmtMult(DATA.global_multiple) + '</b>) in proportion to how few comparables stand behind it, ' +
      'so one rich outlier cannot carry a category. Seven-day growth and the protocol\u2019s age with no ' +
      'token then adjust the price; nothing else enters, and no protocol is named or special-cased.</p>' +
      '<span class="formula">implied = TVL \u00d7 category multiple \u00d7 (1 + clamped 7d change \u00d7 0.45) \u00d7 (0.65 + 0.35 \u00d7 age/3y)</span>' +
      '<div class="mults">' + chips + '</div></section>';
  }
  function validationPanel() {
    var v = DATA.validation;
    if (!v) return '';
    return '<section class="model valid"><h2>Checked against the market, not just asserted</h2>' +
      '<p>The multiples are the only fitted part of this model, so they were tested on the snapshot\u2019s own ' +
      '<b>' + v.live_n + ' live-token protocols</b> — the ones whose market caps are known — before being trusted ' +
      'with the board. Three tests, all deterministic: <b>leave-one-out</b> (each live protocol priced by a market ' +
      'fitted without it), a <b>split-half</b> dealt by slug hash, and a <b>walk-forward</b> fitted on the ' +
      v.wf_train_n + ' protocols listed by ' + esc(v.wf_cutoff) + ' and tested on the ' + v.wf_test_n +
      ' listed after. The misses are wide and are stated as computed: pricing a future token from TVL is a ' +
      'factor-of-several game, which is why every row carries the 80% range its category\u2019s held-out residuals draw ' +
      '(market-wide: ' + fmtX(v.band_low_x) + ' to ' + fmtX(v.band_high_x) + ' of the point estimate).</p>' +
      '<div class="mults">' +
      '<span>leave-one-out median miss <b>' + fmtX(v.loo_median_error_x) + '</b></span>' +
      '<span>split-half median miss <b>' + fmtX(v.split_median_error_x) + '</b></span>' +
      '<span>walk-forward median miss <b>' + fmtX(v.wf_median_error_x) + '</b></span>' +
      '<span>80% range held <b>' + fmtShare(v.wf_coverage80) + '</b> walk-forward</span>' +
      '<span><b>' + fmtShare(v.loo_coverage80) + '</b> leave-one-out</span></div></section>';
  }

  /* ---------- board view ---------- */
  function optionList(values, allLabel, current) {
    var out = '<option value="all">' + allLabel + '</option>';
    values.forEach(function (v) {
      out += '<option value="' + esc(v) + '"' + (v === current ? ' selected' : '') + '>' + esc(v) + '</option>';
    });
    return out;
  }
  function controls() {
    var cats = [], chains = [], seenC = {}, seenH = {};
    rows.forEach(function (r) {
      if (r.category && !seenC[r.category]) { seenC[r.category] = 1; cats.push(r.category); }
      r.chains.forEach(function (c) { if (!seenH[c]) { seenH[c] = 1; chains.push(c); } });
    });
    cats.sort(); chains.sort();
    return '<div class="controls">' +
      '<input type="search" id="q" placeholder="Search protocols\u2026" value="' + esc(state.q) + '" aria-label="Search protocols">' +
      '<select id="fcat" aria-label="Filter by category">' + optionList(cats, 'All categories', state.category) + '</select>' +
      '<select id="fchain" aria-label="Filter by chain">' + optionList(chains, 'All chains', state.chain) + '</select>' +
      '<select id="fstatus" aria-label="Filter by board status">' +
      '<option value="all"' + (state.status === 'all' ? ' selected' : '') + '>Watchlist + early</option>' +
      '<option value="watchlist"' + (state.status === 'watchlist' ? ' selected' : '') + '>Watchlist only</option>' +
      '<option value="early"' + (state.status === 'early' ? ' selected' : '') + '>Early finds only</option></select>' +
      '<span class="count" id="count"></span>' +
      '<div class="tabs" role="group" aria-label="Views">' +
      '<button id="tab-board" aria-pressed="' + (state.view === 'board') + '">Pre-token board</button>' +
      '<button id="tab-live" aria-pressed="' + (state.view === 'live') + '">Live tokens</button></div></div>';
  }
  var SORTS = {
    rank: { label: '#', num: true, get: function (r) { return r.rank; } },
    name: { label: 'Protocol', num: false, get: function (r) { return r.name.toLowerCase(); } },
    tvl: { label: 'TVL', num: true, get: function (r) { return r.tvl_usd; } },
    change: { label: '7d', num: true, get: function (r) { return r.change_7d === null ? -Infinity : r.change_7d; } },
    age: { label: 'Age', num: true, get: function (r) { return r.age_days === null ? -1 : r.age_days; } },
    mult: { label: 'Cat. \u00d7', num: true, get: function (r) { return r.base_multiple; } },
    implied: { label: 'Implied value', num: true, get: function (r) { return r.implied_value_usd; } }
  };
  function visibleRows() {
    var q = state.q.trim().toLowerCase();
    var list = rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) === -1) return false;
      if (state.status === 'watchlist' && !r.watchlist) return false;
      if (state.status === 'early' && r.watchlist) return false;
      if (q && (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    var get = SORTS[state.sort].get;
    list.sort(function (a, b) {
      var x = get(a), y = get(b);
      var d = x < y ? -1 : x > y ? 1 : (a.rank - b.rank);
      return d * state.dir;
    });
    return list;
  }
  function boardView() {
    var list = visibleRows();
    var maxLog = Math.log10(rows[0].implied_value_usd);
    var head = Object.keys(SORTS).map(function (key) {
      var s = SORTS[key];
      var dir = state.sort === key ? ' <span class="dir">' + (state.dir === 1 ? '\u25b2' : '\u25bc') + '</span>' : '';
      var hide = key === 'age' || key === 'mult' ? ' class="num hideS"' : s.num ? ' class="num"' : '';
      return '<th' + hide + '><button data-sort="' + key + '">' + s.label + dir + '</button></th>';
    }).join('') + '<th>Chains</th>';
    var body;
    if (list.length === 0) {
      body = '<p class="empty">No protocol on the board matches these filters. Loosen one and sweep again.</p>';
    } else {
      body = '<table><caption>' + list.length + ' of ' + rows.length + ' pre-token protocols · click a row for its detail and farm plan · click a heading to sort</caption>' +
        '<thead><tr>' + head + '</tr></thead><tbody>' +
        list.map(function (r) {
          var w = Math.max(6, Math.round(100 * Math.log10(Math.max(r.implied_value_usd, 10)) / maxLog));
          return '<tr data-slug="' + esc(r.slug) + '">' +
            '<td class="rank">' + r.rank + '</td>' +
            '<td><span class="pname">' + esc(r.name) + '</span>' +
            (r.watchlist ? '<span class="badge wl">WATCHLIST</span>' : '<span class="badge early">EARLY</span>') +
            '<span class="pcat">' + esc(r.category || 'Uncategorised') + '</span></td>' +
            '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
            '<td class="num">' + fmtPct(r.change_7d) + '</td>' +
            '<td class="num hideS">' + fmtAge(r.age_days) + '</td>' +
            '<td class="num hideS">' + fmtMult(r.base_multiple) + '</td>' +
            '<td class="num">' + fmtUsd(r.implied_value_usd) + '<span class="bar"><i style="width:' + w + '%"></i></span></td>' +
            '<td class="chains">' + esc(r.chains.slice(0, 3).join(', ')) + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</td></tr>';
        }).join('') + '</tbody></table>';
    }
    app.innerHTML = masthead() + modelPanel() + validationPanel() + controls() + '<div id="list">' + body + '</div>' + footer();
    wireControls();
    var c = document.getElementById('count');
    if (c) c.textContent = list.length + ' shown';
  }

  /* ---------- live view ---------- */
  function liveView() {
    var body = '<table><caption>The market\u2019s own values for the largest live-token protocols in the snapshot. ' +
      'These are not ranked and not modelled: their market-cap / TVL ratios are the comparables behind the board\u2019s category multiples.</caption>' +
      '<thead><tr><th>Protocol</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">MCap / TVL</th><th class="num">7d</th><th>Chains</th></tr></thead><tbody>' +
      DATA.live.map(function (r) {
        return '<tr><td><span class="pname">' + esc(r.name) + '</span><span class="pcat">' + esc(r.category || 'Uncategorised') +
          (r.symbol ? ' · $' + esc(r.symbol) : '') + '</span></td>' +
          '<td class="num">' + fmtUsd(r.tvl_usd) + '</td><td class="num">' + fmtUsd(r.mcap_usd) + '</td>' +
          '<td class="num">' + (r.mcap_tvl === null ? 'n/a' : fmtMult(r.mcap_tvl)) + '</td>' +
          '<td class="num">' + fmtPct(r.change_7d) + '</td>' +
          '<td class="chains">' + esc(r.chains.slice(0, 3).join(', ')) + '</td></tr>';
      }).join('') + '</tbody></table>';
    app.innerHTML = masthead() + modelPanel() + validationPanel() + controls() + body + footer();
    wireControls();
    var c = document.getElementById('count');
    if (c) c.textContent = DATA.live.length + ' live shown';
  }

  /* ---------- detail view ---------- */
  function detailView(r) {
    var prev = bySlug[rows[r.rank - 2] ? rows[r.rank - 2].slug : ''];
    var next = bySlug[rows[r.rank] ? rows[r.rank].slug : ''];
    var breakdown =
      '<table class="breakdown"><tbody>' +
      '<tr><td>Total value locked</td><td>' + fmtFull(r.tvl_usd) + '</td></tr>' +
      '<tr><td>Category multiple (' + esc(r.category || 'uncategorised') + ', median of ' + r.comparables + ' live comparable' + (r.comparables === 1 ? '' : 's') + ', shrunk)</td><td>' + fmtMult(r.base_multiple) + '</td></tr>' +
      '<tr><td>Growth multiplier (7d change ' + (r.change_7d === null ? 'unreported, taken as 0' : r.change_7d.toFixed(2) + '%') + ', clamped)</td><td>' + fmtMult(r.growth_multiplier) + '</td></tr>' +
      '<tr><td>Maturity multiplier (age ' + fmtAge(r.age_days) + ' with no token)</td><td>' + fmtMult(r.maturity_multiplier) + '</td></tr>' +
      '<tr class="total"><td>Implied token value</td><td>' + fmtFull(r.implied_value_usd) + '</td></tr>' +
      '<tr><td>80% held-out range (where comparable launches actually landed)</td><td>' + fmtFull(r.implied_low_usd) + ' \u2013 ' + fmtFull(r.implied_high_usd) + '</td></tr></tbody></table>';
    var plan = '<ol class="plan">' + r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>';
    app.innerHTML = masthead() +
      '<div class="detail"><button class="back" id="back">\u2190 Back to the board</button>' +
      '<h2>' + esc(r.name) + (r.watchlist ? '<span class="badge wl">WATCHLIST</span>' : '<span class="badge early">EARLY FIND</span>') + '</h2>' +
      '<p class="sub">' + esc(r.category || 'Uncategorised') + ' · on ' + esc(r.chains.join(', ') || 'no chain recorded') +
      ' · records no token in the snapshot · first tracked ' + esc(r.listed_at || 'on an unknown date') + '</p>' +
      '<div class="cards">' +
      '<div class="card"><div class="k">Board rank</div><div class="v">#' + r.rank + '</div><div class="s">of ' + rows.length + ' pre-token protocols</div></div>' +
      '<div class="card"><div class="k">Implied value</div><div class="v">' + fmtUsd(r.implied_value_usd) + '</div><div class="s">' + fmtFull(r.implied_value_usd) + ' · 80% range ' + fmtUsd(r.implied_low_usd) + '\u2013' + fmtUsd(r.implied_high_usd) + '</div></div>' +
      '<div class="card"><div class="k">TVL</div><div class="v">' + fmtUsd(r.tvl_usd) + '</div><div class="s">7d change ' + (r.change_7d === null ? 'n/a' : r.change_7d.toFixed(2) + '%') + '</div></div>' +
      '<div class="card"><div class="k">Age with no token</div><div class="v">' + fmtAge(r.age_days) + '</div><div class="s">since ' + esc(r.listed_at || 'unknown') + '</div></div>' +
      '</div>' +
      '<h3>The model, on this protocol</h3>' + breakdown +
      '<h3>Farm plan — before any token</h3>' + plan +
      '<div class="navrow"><button id="prev"' + (prev ? '' : ' disabled') + '>\u2190 #' + (r.rank - 1) + ' ' + (prev ? esc(prev.name) : '') + '</button>' +
      '<button id="next"' + (next ? '' : ' disabled') + '>' + (next ? esc(next.name) : '') + ' #' + (r.rank + 1) + ' \u2192</button></div></div>' + footer();
    document.getElementById('back').addEventListener('click', function () { location.hash = ''; });
    if (prev) document.getElementById('prev').addEventListener('click', function () { location.hash = 'p/' + prev.slug; });
    if (next) document.getElementById('next').addEventListener('click', function () { location.hash = 'p/' + next.slug; });
    window.scrollTo(0, 0);
  }

  /* ---------- wiring & routing ---------- */
  function wireControls() {
    var q = document.getElementById('q');
    if (q) q.addEventListener('input', function () { state.q = q.value; refreshList(); });
    var fc = document.getElementById('fcat');
    if (fc) fc.addEventListener('change', function () { state.category = fc.value; refreshList(); });
    var fh = document.getElementById('fchain');
    if (fh) fh.addEventListener('change', function () { state.chain = fh.value; refreshList(); });
    var fs = document.getElementById('fstatus');
    if (fs) fs.addEventListener('change', function () { state.status = fs.value; refreshList(); });
    var tb = document.getElementById('tab-board');
    if (tb) tb.addEventListener('click', function () { state.view = 'board'; render(); });
    var tl = document.getElementById('tab-live');
    if (tl) tl.addEventListener('click', function () { state.view = 'live'; render(); });
    wireTable();
  }
  function wireTable() {
    app.querySelectorAll('th button[data-sort]').forEach(function (b) {
      b.addEventListener('click', function () {
        var key = b.getAttribute('data-sort');
        if (state.sort === key) state.dir = -state.dir;
        else { state.sort = key; state.dir = key === 'name' ? 1 : -1; if (key === 'rank') state.dir = 1; }
        render();
      });
    });
    app.querySelectorAll('tbody tr[data-slug]').forEach(function (tr) {
      tr.addEventListener('click', function () { location.hash = 'p/' + tr.getAttribute('data-slug'); });
    });
  }
  function refreshList() {
    if (state.view !== 'board') { render(); return; }
    var keepQ = document.activeElement && document.activeElement.id === 'q';
    boardView();
    if (keepQ) { var q = document.getElementById('q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
  }
  function render() {
    if (state.view === 'detail' && state.slug && bySlug[state.slug]) detailView(bySlug[state.slug]);
    else if (state.view === 'live') liveView();
    else boardView();
    app.setAttribute('aria-busy', 'false');
  }
  function route() {
    var h = location.hash.replace(/^#/, '');
    if (h.indexOf('p/') === 0) {
      var slug = decodeURIComponent(h.slice(2));
      if (bySlug[slug]) { state.view = 'detail'; state.slug = slug; render(); return; }
    }
    if (h.indexOf('f/') === 0) {
      state.category = decodeURIComponent(h.slice(2));
      state.view = 'board'; state.slug = null; render(); return;
    }
    if (h === 'live') { state.view = 'live'; state.slug = null; render(); return; }
    state.view = state.view === 'detail' ? 'board' : state.view;
    state.slug = null;
    render();
  }
  window.addEventListener('hashchange', route);
  route();
})();
