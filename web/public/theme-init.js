/* Applies the saved appearance before the first paint, so a dark-mode user never sees a white flash.
   Loaded as a plain (blocking) script from index.html. Presenters and participants keep separate preferences;
   the projector never follows the computer's operating-system setting (the presenter chooses its look). */
(function () {
  var root = document.documentElement;
  try {
    var path = location.pathname;
    var scope = /^\/project(\/|$)/.test(path) ? 'projector' : /^\/(studio|session|results|remote|login|learners|settings)(\/|$)/.test(path) ? 'studio' : 'participant';
    root.setAttribute('data-scope', scope);
    if (scope === 'projector') {
      root.setAttribute('data-theme', 'light');
      root.style.background = '#0d1124';
      return;
    }
    var raw = null;
    try { raw = localStorage.getItem('ci:appearance:' + scope); } catch (e) { /* storage blocked */ }
    var pref = raw ? JSON.parse(raw) : 'system';
    var dark = pref === 'dark' || (pref !== 'light' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    root.style.background = dark ? '#0f1222' : '#f5f6fa';
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#0f1222' : '#f5f6fa');
  } catch (e) {
    root.setAttribute('data-theme', 'light');
  }
})();
