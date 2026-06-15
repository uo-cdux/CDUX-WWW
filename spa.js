/*
 * Lightweight client-side router for the CDUX site.
 *
 * When a navigation tab is clicked, instead of doing a full page reload we
 * fetch the target page, pull out its <div class="content"> and swap it into
 * the current document. The shared header (banner + sticky nav) and footer
 * stay put, so only the content area updates.
 *
 * Scope: this only intercepts links that point to the top-level pages the nav
 * tabs use (all of which live at the site root). Everything else — in-content
 * links, external links, links on bio pages in subdirectories — falls back to
 * normal navigation, which keeps relative paths correct.
 */
(function () {
  // Pages reachable from the nav tabs (all root-level).
  var ROOT_TABS = ['index.html', 'news.html', 'research.html', 'publications.html', 'join.html'];

  function fileOf(url) {
    var path = (url || '').split('#')[0].split('?')[0];
    var f = path.split('/').pop();
    return f === '' ? 'index.html' : f;
  }
  function hashOf(url) {
    var i = (url || '').indexOf('#');
    return i >= 0 ? url.slice(i + 1) : '';
  }

  var currentFile = fileOf(location.href);

  /* ---- active tab highlighting ---- */
  function navTabs() {
    return Array.prototype.slice.call(document.querySelectorAll('.navigation a.item'));
  }
  function setActiveByUrl(url) {
    var file = fileOf(url), hash = hashOf(url);
    navTabs().forEach(function (a) {
      var href = a.getAttribute('href'), match;
      if (file === 'index.html') {
        match = hash === 'people' ? (href === 'index.html#people') : (href === 'index.html');
      } else {
        match = fileOf(href) === file;
      }
      a.classList.toggle('active', match);
    });
  }

  /* ---- (re-)execute a <script>: inline scripts don't run when inserted
          via innerHTML/adoptNode, so we clone them into live elements ---- */
  function materialize(old, parent) {
    var s = document.createElement('script');
    for (var i = 0; i < old.attributes.length; i++) {
      s.setAttribute(old.attributes[i].name, old.attributes[i].value);
    }
    s.textContent = old.textContent;
    if (parent) parent.appendChild(s);
    else old.parentNode.replaceChild(s, old);
  }
  function runScripts(container) {
    container.querySelectorAll('script').forEach(function (old) { materialize(old, null); });
  }
  // Run page-level scripts that live outside .content (e.g. the News filter UI),
  // skipping the router loader itself.
  function runPageScripts(doc) {
    if (!doc.body) return;
    doc.body.querySelectorAll('script').forEach(function (old) {
      if (old.src && /spa\.js(\?|$)/.test(old.src)) return;
      materialize(old, document.body);
    });
  }

  /* ---- scroll-spy: on the home page, switch Home <-> People as you scroll ---- */
  var spyHandler = null;
  function initScrollSpy() {
    if (spyHandler) {
      window.removeEventListener('scroll', spyHandler);
      window.removeEventListener('resize', spyHandler);
      spyHandler = null;
    }
    var homeTab = document.querySelector('.navigation a[href="index.html"]');
    var peopleTab = document.querySelector('.navigation a[href="index.html#people"]');
    var section = document.getElementById('people-section');
    var nav = document.querySelector('.navigation');
    if (!homeTab || !peopleTab || !section) return;

    spyHandler = function () {
      var navBottom = nav ? nav.getBoundingClientRect().bottom : 0;
      // Activate People once the section reaches just under the header. The margin
      // must exceed the gap between the header bottom and where an #people jump
      // lands (html { scroll-padding-top }), so clicking People highlights it
      // immediately instead of only after an extra nudge of scrolling.
      var inPeople = section.getBoundingClientRect().top <= navBottom + 45;
      peopleTab.classList.toggle('active', inPeople);
      homeTab.classList.toggle('active', !inPeople);
    };
    spyHandler();
    window.addEventListener('scroll', spyHandler, { passive: true });
    window.addEventListener('resize', spyHandler);
  }

  function afterLoad(url) {
    // Scroll first, so the scroll-spy below reads the final position and sets the
    // correct active tab immediately (scrollIntoView/scrollTo are synchronous).
    var hash = hashOf(url);
    var el = hash && (document.getElementById(hash) || document.querySelector('a[name="' + hash + '"]'));
    if (el) el.scrollIntoView();
    else window.scrollTo(0, 0);

    setActiveByUrl(url);
    initScrollSpy();
  }

  function load(url, push) {
    fetch(url).then(function (r) { return r.text(); }).then(function (html) {
      var doc = new DOMParser().parseFromString(html, 'text/html');
      var fresh = doc.querySelector('.content');
      var cur = document.querySelector('.content');
      if (!fresh || !cur) { window.location.href = url; return; }
      if (document.adoptNode) document.adoptNode(fresh);
      cur.parentNode.replaceChild(fresh, cur);
      if (doc.title) document.title = doc.title;
      runScripts(fresh);     // scripts inside the swapped-in content (e.g. the canvas viz)
      runPageScripts(doc);   // page-level scripts outside .content (e.g. News filter)
      currentFile = fileOf(url);
      if (push) history.pushState({ spa: true }, '', url);
      afterLoad(url);
    }).catch(function () { window.location.href = url; });
  }

  function eligible(href) {
    if (!href) return false;
    if (/^(https?:|mailto:|tel:|\/\/)/i.test(href)) return false;
    return ROOT_TABS.indexOf(fileOf(href)) >= 0;
  }

  document.addEventListener('click', function (e) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return;
    var a = e.target.closest && e.target.closest('.navigation a.item');
    if (!a) return;
    var href = a.getAttribute('href');
    if (!eligible(href)) return; // external / commented-out / non-tab links: normal nav
    e.preventDefault();
    if (fileOf(href) === currentFile) {
      // Same page already loaded — just update the hash/scroll (e.g. Home -> People).
      history.pushState({ spa: true }, '', href);
      afterLoad(href);
    } else {
      load(href, true);
    }
  });

  window.addEventListener('popstate', function () {
    var url = (location.pathname.split('/').pop() || 'index.html') + location.hash;
    if (fileOf(url) === currentFile) { afterLoad(url); }
    else { load(url, false); }
  });

  initScrollSpy();
})();
