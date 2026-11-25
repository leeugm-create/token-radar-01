// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and renders
// six views from it: the ranked pre-token board, a detail view for every protocol on it, the
// live-token table whose market values anchor the model's multiples, a full ledger accounting
// for every protocol in the snapshot, a proof panel that charts the model's held-out tests, and
// a verdict view that gives the board's top pick and its farm verdict a screen of their own.
// Sortable, filterable, and rendered entirely from data.js: no fetch, no network, nothing leaves
// the page.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var rows = DATA.rows;
  var bySlug = {};
  rows.forEach(function (r) { bySlug[r.slug] = r; });

  var state = { view: 'board', q: '', category: 'all', chain: 'all', status: 'all', lclass: 'all', sort: 'rank', dir: 1, slug: null };

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
  function fmtOdds(x) { return Math.round(Number(x) * 100) + '%'; }
  function barWord(r) {
    return r.implied_value_usd >= r.farm_breakeven_usd * 3 ? 'clears its bar by a wide margin'
      : r.implied_value_usd >= r.farm_breakeven_usd ? 'clears its bar' : 'does not clear its bar at these odds';
  }

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
  var LEDGER_LABELS = {
    'live-token': 'live token', 'ranked': 'ranked', 'version-pool': 'version pools',
    'derivative-class': 'wrapped/staked class', 'derivative-name': 'wrapped/staked name',
    'exchange-name': 'exchange products', 'above-floor': 'above floor, unlisted', 'below-cut': 'below the early cut'
  };
  function integrityStrip() {
    var g = DATA.integrity;
    if (!g) return '';
    var counts = DATA.ledger_counts.map(function (c) { return LEDGER_LABELS[c.class] + ' ' + c.n; }).join(' · ');
    return '<div class="integrity"><span class="ok">\u2713</span> <b>' + g.protocols_accounted + ' of ' + g.protocols_total +
      ' protocols accounted for</b> (' + counts + ') · <span class="ok">\u2713</span> watchlist <b>' + g.watchlist_covered +
      ' of ' + g.watchlist_total + '</b> on the board · <span class="ok">\u2713</span> <b>' + g.rows_recomputed +
      ' board rows repriced</b> from the snapshot at run time · <span class="ok">\u2713</span> <b>' + g.mismatches +
      ' mismatches</b></div>';
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
      '<div class="mults">' + chips + '</div>' +
      '<p class="oddsline"><b>Launch odds</b> come from the peers\u2019 record: across the snapshot\u2019s ' +
      DATA.odds.protocols_n + ' protocols, ' + fmtShare(DATA.odds.global_rate) + ' already record a token. A row\u2019s odds are ' +
      'the token share of its own category, smoothed toward that market share, tilted by its age cohort\u2019s share. ' +
      'That is a cross-sectional share at one moment \u2014 what fraction of its peers have a token \u2014 not a prediction ' +
      'that this protocol will launch. <b>Expected value</b> is the two figures multiplied, and the board can be sorted by it. ' +
      'Each farm plan ends in a verdict summed from the plan\u2019s own stated times and gas, at a stated farmer capture of ' +
      (DATA.farm_capture * 100).toFixed(2) + '% of a launch\u2019s implied value \u2014 the position\u2019s capital is the farmer\u2019s ' +
      'to keep and is never counted as a cost.</p>' +
      '<span class="formula">expected = implied \u00d7 launch odds</span></section>';
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
      '(market-wide: ' + fmtX(v.band_low_x) + ' to ' + fmtX(v.band_high_x) + ' of the point estimate). ' +
      'The Proof tab charts the same tests, with an independent cross-check model beside them.</p>' +
      '<div class="mults">' +
      '<span>leave-one-out median miss <b>' + fmtX(v.loo_median_error_x) + '</b></span>' +
      '<span>split-half median miss <b>' + fmtX(v.split_median_error_x) + '</b></span>' +
      '<span>walk-forward median miss <b>' + fmtX(v.wf_median_error_x) + '</b></span>' +
      '<span>80% range held <b>' + fmtShare(v.wf_coverage80) + '</b> walk-forward</span>' +
      '<span><b>' + fmtShare(v.loo_coverage80) + '</b> leave-one-out</span></div></section>';
  }

  /* ---------- hero: the board's top pick, at full size ---------- */
  function hero() {
    var r = rows[0];
    if (!r) return '';
    return '<section class="hero" data-slug="' + esc(r.slug) + '" title="Open the top pick\u2019s detail and farm plan">' +
      '<div class="hero-k">#1 on the board — the radar\u2019s top pick</div>' +
      '<div class="hero-grid"><div class="hero-main">' +
      '<div class="hero-name">' + esc(r.name) +
      (r.watchlist ? '<span class="badge wl">WATCHLIST</span>' : '<span class="badge early">EARLY FIND</span>') + '</div>' +
      '<div class="hero-cat">' + esc(r.category || 'Uncategorised') + ' · TVL ' + fmtUsd(r.tvl_usd) + ' · ' + fmtAge(r.age_days) + ' with no token</div>' +
      '<div class="hero-val">' + fmtUsd(r.implied_value_usd) + '</div>' +
      '<div class="hero-full">implied token value ' + fmtFull(r.implied_value_usd) + ' · 80% held-out range ' +
      fmtUsd(r.implied_low_usd) + ' \u2013 ' + fmtUsd(r.implied_high_usd) + '</div></div>' +
      '<div class="hero-side">' +
      '<div class="hero-odds"><span>Launch odds <b>' + fmtOdds(r.launch_odds) + '</b></span>' +
      '<span class="obar big"><i style="width:' + Math.round(r.launch_odds * 100) + '%"></i></span>' +
      '<span class="hero-ev">expected value <b>' + fmtUsd(r.expected_value_usd) + '</b></span></div>' +
      '<div class="mults">' +
      '<span><b>' + r.farm_hours + ' h</b> of work</span>' +
      '<span>sunk cost <b>' + (r.farm_sunk_cost_usd < 10 ? '$' + r.farm_sunk_cost_usd.toFixed(2) : fmtUsd(r.farm_sunk_cost_usd)) + '</b></span>' +
      '<span>capital kept <b>' + fmtUsd(r.farm_capital_usd) + '</b></span>' +
      '<span>break-even launch <b>' + fmtUsd(r.farm_breakeven_usd) + '</b></span>' +
      '<span>expected capture <b>' + fmtUsd(r.farm_ev_usd) + '</b></span></div>' +
      '<div class="hero-verdict">Farm verdict: the implied value ' + barWord(r) + '.</div>' +
      '</div></div></section>';
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
      '<button id="tab-verdict" aria-pressed="' + (state.view === 'verdict') + '">Verdict</button>' +
      '<button id="tab-live" aria-pressed="' + (state.view === 'live') + '">Live tokens</button>' +
      '<button id="tab-ledger" aria-pressed="' + (state.view === 'ledger') + '">Full ledger</button>' +
      '<button id="tab-proof" aria-pressed="' + (state.view === 'proof') + '">Proof</button></div></div>';
  }
  var SORTS = {
    rank: { label: '#', num: true, get: function (r) { return r.rank; } },
    name: { label: 'Protocol', num: false, get: function (r) { return r.name.toLowerCase(); } },
    tvl: { label: 'TVL', num: true, get: function (r) { return r.tvl_usd; } },
    change: { label: '7d', num: true, get: function (r) { return r.change_7d === null ? -Infinity : r.change_7d; } },
    age: { label: 'Age', num: true, get: function (r) { return r.age_days === null ? -1 : r.age_days; } },
    mult: { label: 'Cat. \u00d7', num: true, get: function (r) { return r.base_multiple; } },
    implied: { label: 'Implied value', num: true, get: function (r) { return r.implied_value_usd; } },
    odds: { label: 'Odds', num: true, get: function (r) { return r.launch_odds; } },
    expected: { label: 'Expected', num: true, get: function (r) { return r.expected_value_usd; } }
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
      var hide = key === 'age' || key === 'mult' || key === 'odds' ? ' class="num hideS"' : s.num ? ' class="num"' : '';
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
          return '<tr data-slug="' + esc(r.slug) + '"' + (r.rank === 1 ? ' class="top"' : '') + '>' +
            '<td class="rank">' + r.rank + '</td>' +
            '<td><span class="pname">' + esc(r.name) + '</span>' +
            (r.watchlist ? '<span class="badge wl">WATCHLIST</span>' : '<span class="badge early">EARLY</span>') +
            '<span class="pcat">' + esc(r.category || 'Uncategorised') + '</span></td>' +
            '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
            '<td class="num">' + fmtPct(r.change_7d) + '</td>' +
            '<td class="num hideS">' + fmtAge(r.age_days) + '</td>' +
            '<td class="num hideS">' + fmtMult(r.base_multiple) + '</td>' +
            '<td class="num">' + fmtUsd(r.implied_value_usd) + '<span class="bar"><i style="width:' + w + '%"></i></span></td>' +
            '<td class="num hideS"><span class="obar"><i style="width:' + Math.round(r.launch_odds * 100) + '%"></i></span>' + fmtOdds(r.launch_odds) + '</td>' +
            '<td class="num">' + fmtUsd(r.expected_value_usd) + '</td>' +
            '<td class="chains">' + esc(r.chains.slice(0, 3).join(', ')) + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</td></tr>';
        }).join('') + '</tbody></table>';
    }
    app.innerHTML = masthead() + integrityStrip() + hero() + controls() + '<div id="list">' + body + '</div>' +
      modelPanel() + validationPanel() + footer();
    wireControls();
    var h = app.querySelector('.hero');
    if (h) h.addEventListener('click', function () { location.hash = 'p/' + h.getAttribute('data-slug'); });
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
    app.innerHTML = masthead() + integrityStrip() + controls() + body + footer();
    wireControls();
    var c = document.getElementById('count');
    if (c) c.textContent = DATA.live.length + ' live shown';
  }

  /* ---------- ledger view: every protocol, accounted for ---------- */
  function ledgerView() {
    var q = state.q.trim().toLowerCase();
    var list = DATA.ledger.filter(function (e) {
      if (state.lclass !== 'all' && e.class !== state.lclass) return false;
      if (q && (e.name + ' ' + e.slug + ' ' + (e.category || '')).toLowerCase().indexOf(q) === -1) return false;
      return true;
    }).slice().sort(function (a, b) { return b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1); });
    var classOpts = '<option value="all">All classes</option>' + DATA.ledger_counts.map(function (c) {
      return '<option value="' + esc(c.class) + '"' + (state.lclass === c.class ? ' selected' : '') + '>' +
        esc(LEDGER_LABELS[c.class]) + ' (' + c.n + ')</option>';
    }).join('');
    var chips = DATA.ledger_counts.map(function (c) {
      return '<span><b>' + c.n + '</b> ' + esc(LEDGER_LABELS[c.class]) + '</span>';
    }).join('');
    var badge = function (cls) {
      if (cls === 'live-token') return '<span class="badge live">LIVE TOKEN</span>';
      if (cls === 'ranked') return '<span class="badge onb">ON THE BOARD</span>';
      return '<span class="badge aside">SET ASIDE</span>';
    };
    var liveN = 0;
    DATA.ledger_counts.forEach(function (c) { if (c.class === 'live-token') liveN = c.n; });
    var body = '<div class="lbar"><label>Class <select id="lclass" aria-label="Filter the ledger by class">' + classOpts +
      '</select></label><div class="mults">' + chips + '</div></div>' +
      '<table class="ledger"><caption>Every protocol in the snapshot, one line each, in TVL order: ' + list.length + ' of ' +
      DATA.ledger.length + ' shown. Nothing is silently dropped \u2014 a protocol is ranked, records a token, or ' +
      'is set aside with the reason stated. The ' + liveN + ' that already record a token are priced ' +
      'by the market and carry no implied value here or anywhere on this page.</caption>' +
      '<thead><tr><th>Protocol</th><th class="num">TVL</th><th>Status</th><th>Why</th></tr></thead><tbody>' +
      list.map(function (e) {
        return '<tr><td><span class="pname">' + esc(e.name) + '</span><span class="pcat">' +
          esc(e.category || 'Uncategorised') + '</span></td>' +
          '<td class="num">' + fmtUsd(e.tvl_usd) + '</td>' +
          '<td>' + badge(e.class) + '</td>' +
          '<td class="why">' + esc(e.reason) + '</td></tr>';
      }).join('') + '</tbody></table>';
    app.innerHTML = masthead() + integrityStrip() + controls() + body + footer();
    wireControls();
    var lc = document.getElementById('lclass');
    if (lc) lc.addEventListener('change', function () { state.lclass = lc.value; render(); });
    var c = document.getElementById('count');
    if (c) c.textContent = list.length + ' in the ledger';
  }

  /* ---------- proof view: the held-out tests, charted ---------- */
  function proofView() {
    var v = DATA.validation;
    var x = DATA.crosscheck;
    function prow(label, sub, err, cov, cls) {
      var w = Math.max(4, Math.min(100, Math.round(err / 6 * 100)));
      return '<div class="prow ' + (cls || '') + '"><div class="plabel">' + label + '<span>' + sub + '</span></div>' +
        '<div class="pbar"><i style="width:' + w + '%"></i></div>' +
        '<div class="pval">' + fmtX(err) + '<span>typical miss</span></div>' +
        '<div class="pcov">' + (cov === null ? 'held out both ways' : '80% range held <b>' + fmtShare(cov) + '</b>') + '</div></div>';
    }
    var body = '<section class="model proof"><h2>The proof — tested on protocols the model never priced</h2>' +
      '<p>The board\u2019s multiples were refitted on subsets of the snapshot\u2019s <b>' + v.live_n + ' live-token ' +
      'protocols</b> — the ones whose market caps are known — and made to price the ones left out. A bar is the ' +
      '<b>median multiplicative miss</b>: \u00d75 means the typical held-out price landed within a factor of five of ' +
      'the market\u2019s own value, in either direction. The misses are wide, and they are the reason every row on ' +
      'the board carries an 80% range (market-wide ' + fmtX(v.band_low_x) + ' to ' + fmtX(v.band_high_x) +
      ' of the point estimate) instead of a bare number.</p>' +
      '<div class="prows">' +
      prow('Leave-one-out', 'each of the ' + v.live_n + ' priced by a market fitted without it', v.loo_median_error_x, v.loo_coverage80, '') +
      prow('Split-half', 'slug hash deals two halves; each prices the other', v.split_median_error_x, null, '') +
      prow('Walk-forward', 'fitted on the ' + v.wf_train_n + ' listed by ' + esc(v.wf_cutoff) + ', tested on the ' + v.wf_test_n + ' after', v.wf_median_error_x, v.wf_coverage80, '') +
      '</div>' +
      '<p class="crosshead">And a second, independent estimator — built a different way, held to the same test:</p>' +
      '<div class="prows">' +
      prow('Cross-check: log-fit model', 'ln value on ln TVL + category effect + momentum \u00b7 leave-one-out, same ' + x.live_n + ' protocols', x.loo_median_error_x, null, 'cross') +
      '</div>' +
      '<p>The cross-check prices nothing on the board. It stands here so the board\u2019s model is not the only ' +
      'witness: two differently built estimators, tested the same way, land in the same factor-of-several ' +
      'country \u2014 which is what the ranges on every row are honest about.</p></section>';
    app.innerHTML = masthead() + integrityStrip() + controls() + body + footer();
    wireControls();
    var c = document.getElementById('count');
    if (c) c.textContent = 'held-out proof';
  }

  /* ---------- verdict view: the top pick's farm verdict, on its own screen ---------- */
  function verdictView() {
    var r = rows[0];
    if (!r) { boardView(); return; }
    var sunk = r.farm_sunk_cost_usd < 10 ? '$' + r.farm_sunk_cost_usd.toFixed(2) : fmtUsd(r.farm_sunk_cost_usd);
    var clears = r.implied_value_usd >= r.farm_breakeven_usd;
    var body = '<section class="vhero">' +
      '<div class="hero-k">The farm verdict \u2014 board #1 of ' + rows.length + ', on its own screen</div>' +
      '<div class="vname">' + esc(r.name) +
      (r.watchlist ? '<span class="badge wl">WATCHLIST</span>' : '<span class="badge early">EARLY FIND</span>') + '</div>' +
      '<div class="hero-cat">' + esc(r.category || 'Uncategorised') + ' \u00b7 TVL ' + fmtUsd(r.tvl_usd) + ' \u00b7 ' +
      fmtAge(r.age_days) + ' with no token \u00b7 on ' + esc(r.chains.join(', ') || 'no chain recorded') + '</div>' +
      '<div class="vstatement">The implied value <span class="' + (clears ? 'pos' : 'neg') + '">' + barWord(r) + '</span>.</div>' +
      '<div class="hero-grid"><div class="hero-main">' +
      '<div class="hero-val">' + fmtUsd(r.implied_value_usd) + '</div>' +
      '<div class="hero-full">implied token value ' + fmtFull(r.implied_value_usd) + ' \u00b7 80% held-out range ' +
      fmtUsd(r.implied_low_usd) + ' \u2013 ' + fmtUsd(r.implied_high_usd) + '</div></div>' +
      '<div class="hero-side">' +
      '<div class="hero-odds"><span>Launch odds <b>' + fmtOdds(r.launch_odds) + '</b></span>' +
      '<span class="obar big"><i style="width:' + Math.round(r.launch_odds * 100) + '%"></i></span>' +
      '<span class="hero-ev">expected value <b>' + fmtUsd(r.expected_value_usd) + '</b></span></div>' +
      '<div class="hero-full">expected value ' + fmtFull(r.expected_value_usd) + ' = implied \u00d7 odds \u00b7 the position\u2019s ' +
      'capital is the farmer\u2019s to keep and is never counted as a cost</div>' +
      '</div></div>' +
      '<div class="cards vcards">' +
      '<div class="card"><div class="k">Hours of work</div><div class="v">' + r.farm_hours + ' h</div><div class="s">spread over the plan below</div></div>' +
      '<div class="card"><div class="k">Sunk cost</div><div class="v">' + sunk + '</div><div class="s">gas and fees \u2014 all that is gone if nothing launches</div></div>' +
      '<div class="card"><div class="k">Capital kept</div><div class="v">' + fmtUsd(r.farm_capital_usd) + '</div><div class="s">principal in the position, yours to withdraw</div></div>' +
      '<div class="card"><div class="k">Break-even launch</div><div class="v">' + fmtUsd(r.farm_breakeven_usd) + '</div><div class="s">the launch value at which the plan breaks even</div></div>' +
      '<div class="card"><div class="k">Expected capture</div><div class="v">' + fmtUsd(r.farm_ev_usd) + '</div><div class="s">at a ' + (DATA.farm_capture * 100).toFixed(2) + '% farmer capture, odds-weighted</div></div>' +
      '<div class="card"><div class="k">Per hour expected</div><div class="v">' + fmtUsd(r.farm_ev_per_hour) + '</div><div class="s">expected capture over ' + r.farm_hours + ' h of work</div></div>' +
      '</div>' +
      '<p class="vcaveat">The likeliest single outcome is still no launch at all: the position stays yours ' +
      'to withdraw, and only the sunk cost is gone.</p>' +
      '</section>' +
      '<h3 class="vplan-h">The plan, step by step</h3>' +
      '<ol class="plan vplan">' + r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      '<p class="vmore"><button class="back" id="vdetail">Open the full detail \u2014 model breakdown and ranges \u2192</button></p>';
    app.innerHTML = masthead() + integrityStrip() + controls() + body + footer();
    wireControls();
    document.getElementById('vdetail').addEventListener('click', function () { location.hash = 'p/' + r.slug; });
    var c = document.getElementById('count');
    if (c) c.textContent = 'the #1 verdict';
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
      '<tr><td>80% held-out range (where comparable launches actually landed)</td><td>' + fmtFull(r.implied_low_usd) + ' \u2013 ' + fmtFull(r.implied_high_usd) + '</td></tr>' +
      '<tr><td>Launch odds (peers\u2019 record: category token share, age-tilted)</td><td>' + fmtOdds(r.launch_odds) + '</td></tr>' +
      '<tr class="total"><td>Expected value (implied \u00d7 odds)</td><td>' + fmtFull(r.expected_value_usd) + '</td></tr></tbody></table>';
    var verdict = '<div class="verdict"><div class="mults">' +
      '<span><b>' + r.farm_hours + ' h</b> of work</span>' +
      '<span>sunk cost <b>' + (r.farm_sunk_cost_usd < 10 ? '$' + r.farm_sunk_cost_usd.toFixed(2) : fmtUsd(r.farm_sunk_cost_usd)) + '</b></span>' +
      '<span>capital kept <b>' + fmtUsd(r.farm_capital_usd) + '</b></span>' +
      '<span>break-even launch <b>' + fmtUsd(r.farm_breakeven_usd) + '</b></span>' +
      '<span>expected capture <b>' + fmtUsd(r.farm_ev_usd) + '</b></span>' +
      '<span><b>' + fmtUsd(r.farm_ev_per_hour) + '</b> per hour expected</span></div>' +
      '<p>The implied value ' + barWord(r) + '. The likeliest single outcome is still no launch at all: ' +
      'the position stays yours to withdraw, and only the sunk cost is gone.</p></div>';
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
      '<h3>Farm plan — before any token</h3>' + verdict + plan +
      '<div class="navrow"><button id="prev"' + (prev ? '' : ' disabled') + '>\u2190 #' + (r.rank - 1) + ' ' + (prev ? esc(prev.name) : '') + '</button>' +
      '<button id="next"' + (next ? '' : ' disabled') + '>' + (next ? esc(next.name) : '') + ' #' + (r.rank + 1) + ' \u2192</button></div></div>' + footer();
    document.getElementById('back').addEventListener('click', function () { location.hash = ''; });
    if (prev) document.getElementById('prev').addEventListener('click', function () { location.hash = 'p/' + prev.slug; });
    if (next) document.getElementById('next').addEventListener('click', function () { location.hash = 'p/' + next.slug; });
    window.scrollTo(0, 0);
  }

  /* ---------- wiring & routing ---------- */
  // The live, ledger, proof and verdict views show their whole set, never a board filter:
  // switching to one clears the board's filters, so a filter set on the board can never leak.
  function resetBoardFilters() {
    state.q = ''; state.category = 'all'; state.chain = 'all'; state.status = 'all';
  }
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
    if (tb) tb.addEventListener('click', function () { state.view = 'board'; window.scrollTo(0, 0); render(); });
    var tv = document.getElementById('tab-verdict');
    if (tv) tv.addEventListener('click', function () { resetBoardFilters(); state.view = 'verdict'; window.scrollTo(0, 0); render(); });
    var tl = document.getElementById('tab-live');
    if (tl) tl.addEventListener('click', function () { resetBoardFilters(); state.view = 'live'; window.scrollTo(0, 0); render(); });
    var tg = document.getElementById('tab-ledger');
    if (tg) tg.addEventListener('click', function () { resetBoardFilters(); state.view = 'ledger'; window.scrollTo(0, 0); render(); });
    var tp = document.getElementById('tab-proof');
    if (tp) tp.addEventListener('click', function () { resetBoardFilters(); state.view = 'proof'; window.scrollTo(0, 0); render(); });
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
    var keepQ = document.activeElement && document.activeElement.id === 'q';
    render();
    if (keepQ) { var q = document.getElementById('q'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }
  }
  function render() {
    if (state.view === 'detail' && state.slug && bySlug[state.slug]) detailView(bySlug[state.slug]);
    else if (state.view === 'live') liveView();
    else if (state.view === 'ledger') ledgerView();
    else if (state.view === 'proof') proofView();
    else if (state.view === 'verdict') verdictView();
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
    if (h === 'verdict') { resetBoardFilters(); state.view = 'verdict'; state.slug = null; window.scrollTo(0, 0); render(); return; }
    if (h === 'live') { resetBoardFilters(); state.view = 'live'; state.slug = null; window.scrollTo(0, 0); render(); return; }
    if (h === 'ledger') { resetBoardFilters(); state.view = 'ledger'; state.slug = null; window.scrollTo(0, 0); render(); return; }
    if (h === 'proof') { resetBoardFilters(); state.view = 'proof'; state.slug = null; window.scrollTo(0, 0); render(); return; }
    state.view = state.view === 'detail' ? 'board' : state.view;
    state.slug = null;
    render();
  }
  window.addEventListener('hashchange', route);
  route();
})();
