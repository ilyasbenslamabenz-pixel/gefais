/* GE-FAIS — animations du site public.
   Chaque effet est lié au contenu : le logo qui se rassemble (« Ensemble, faisons qu'un »),
   la photo qui s'éclaire, les mots qui s'allument, le bulletin qui s'imprime…
   Rien ne bouge pour les personnes qui ont demandé à réduire les animations. */
(function () {
  'use strict';
  if (!window.matchMedia || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!('IntersectionObserver' in window) || !Element.prototype.animate) return;

  var EASE = 'cubic-bezier(.2,.7,.1,1)';
  var SPRING = 'cubic-bezier(.3,1.35,.5,1)';
  var root = document.documentElement;
  root.classList.add('anim');

  var css = [
    /* titres : mots qui sortent d'une ligne invisible */
    '.anim .mw{display:inline-block;overflow:hidden;vertical-align:top;padding:.14em .02em .1em;margin:-.14em -.02em -.1em}',
    '.anim .mw>span{display:inline-block;transform:translateY(108%);transition:transform .95s ' + EASE + ';transition-delay:calc(var(--i,0)*45ms + var(--d0,0ms))}',
    '.anim .mt.in .mw>span{transform:none}',
    /* mots qui s\'allument au défilement */
    '.anim .lw{transition:color .45s ease,opacity .45s ease}',
    '.anim .carry-words .lw{opacity:.16}',
    '.anim .carry-words .lw.on{opacity:1}',
    /* jauges */
    '.anim .meter .bar i{transform:scaleX(0)}',
    '.anim .meter.in .bar i{transform:none}',
    /* étapes de l\'adhésion */
    '.anim .flow::after{content:"";position:absolute;left:22px;right:22px;top:22px;height:2px;margin-top:-.5px;background:var(--red,#d52b1e);transform-origin:left;transform:scaleX(var(--f,0));pointer-events:none}',
    '.anim .flow li{z-index:1}.anim .flow::after{z-index:0}.anim .flow::before,.anim .flow::after{right:var(--fr,22px)}',
    '.anim .flow .dot{transition:background .45s ease,color .45s ease,border-color .45s ease,transform .5s ' + SPRING + '}',
    '.anim .flow li.on .dot{transform:scale(1.08)}',
    '.anim .flow li:not(:first-child):not(:last-child).on .dot{background:var(--ink,#141414);color:#fff}',
    '@media (max-width:640px){.anim .flow::after{display:none}.anim .flow li:not(:last-child)::after{content:"";position:absolute;left:22px;top:45px;bottom:0;width:2px;margin-left:-.5px;background:var(--red,#d52b1e);transform-origin:top;transform:scaleY(0);transition:transform .8s ' + EASE + '}.anim .flow li.on:not(:last-child)::after{transform:none}}',
    /* parallaxe de l\'ouverture */
    '.anim .hero-media{will-change:transform}',
    '.anim .hero-inner{will-change:transform,opacity}'
  ].join('\n');
  var st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  function onVisible(el, fn, margin) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting || e.boundingClientRect.top < 0) { io.unobserve(e.target); fn(e.target); } });
    }, { rootMargin: margin || '0px 0px -12% 0px', threshold: 0.01 });
    io.observe(el);
  }

  /* ── Découpe d'un titre en mots masqués (garde <em>, <br>, liens…) ── */
  function splitWords(el, delay) {
    var i = 0;
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          var parts = n.nodeValue.split(/(\s+)/);
          var frag = document.createDocumentFragment();
          parts.forEach(function (p) {
            if (!p) return;
            if (/^\s+$/.test(p)) { frag.appendChild(document.createTextNode(p)); return; }
            var w = document.createElement('span'); w.className = 'mw';
            var inner = document.createElement('span'); inner.textContent = p;
            w.style.setProperty('--i', i++);
            w.appendChild(inner); frag.appendChild(w);
          });
          node.replaceChild(frag, n);
        } else if (n.nodeType === 1 && n.tagName !== 'BR') { walk(n); }
      });
    })(el);
    el.classList.add('mt');
    if (delay) el.style.setProperty('--d0', delay + 'ms');
  }

  /* ── 1. Le logo qui se rassemble : les 12 points arrivent en orbite ── */
  function gatherLogo(svg, delay) {
    var dots = svg.querySelectorAll('circle');
    if (dots.length !== 12) return;
    Array.prototype.forEach.call(dots, function (c, k) {
      c.style.transformBox = 'view-box';
      c.style.transformOrigin = '20px 20px';
      var from = 'rotate(' + (-110 - k * 6) + 'deg) scale(.2)';
      c.animate([
        { transform: from, opacity: 0 },
        { transform: 'rotate(8deg) scale(1.08)', opacity: 1, offset: .75 },
        { transform: 'rotate(0) scale(1)', opacity: 1 }
      ], { duration: 1100, delay: (delay || 0) + k * 55, easing: EASE, fill: 'backwards' });
    });
  }
  function logos() {
    var header = document.querySelector('.site-header .brand svg, .brand svg, header svg');
    if (header) gatherLogo(header, 150);
    var foot = document.querySelector('.foot-slogan svg');
    if (foot) onVisible(foot, function (s) { gatherLogo(s, 0); }, '0px 0px -20% 0px');
  }

  /* ── 2. Lever de rideau sur la photo + titre mot à mot ── */
  function heroIntro() {
    var media = document.querySelector('.hero-media') || document.querySelector('.page > .bg');
    var title = document.querySelector('.hero h1, .content h1');
    if (media) {
      media.animate([
        { scale: '1.14', filter: 'brightness(.45) saturate(.8)' },
        { scale: '1', filter: 'brightness(1) saturate(1)' }
      ], { duration: 2600, easing: 'cubic-bezier(.25,.6,.15,1)', fill: 'backwards' });
    }
    if (title) {
      title.style.animation = 'none';
      title.style.opacity = '1';
      splitWords(title, 380);
      requestAnimationFrame(function () { requestAnimationFrame(function () { title.classList.add('in'); }); });
    }
    var bits = document.querySelectorAll('.hero .hero-kicker, .hero .hero-lead, .hero .hero-actions, .hero-foot, .content > .kicker, .content > .lead, .content > div');
    Array.prototype.forEach.call(bits, function (b, k) {
      var late = b.matches('.hero-kicker, .kicker') ? 200 : 900 + k * 120;
      b.style.animation = 'none';
      b.animate([{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }],
        { duration: 900, delay: late, easing: EASE, fill: 'backwards' });
    });
  }

  /* ── 3. Profondeur au défilement (photo plus lente que le texte) ── */
  function heroParallax() {
    var hero = document.querySelector('.hero');
    if (!hero) return;
    var media = hero.querySelector('.hero-media'), inner = hero.querySelector('.hero-inner'), shade = hero.querySelector('.hero-shade');
    var ticking = false;
    function upd() {
      ticking = false;
      var h = hero.offsetHeight || 1, y = Math.min(Math.max(scrollY, 0), h);
      var p = y / h;
      if (media) media.style.transform = 'translate3d(0,' + (y * 0.32).toFixed(1) + 'px,0)';
      if (inner) { inner.style.transform = 'translate3d(0,' + (-y * 0.12).toFixed(1) + 'px,0)'; inner.style.opacity = String(Math.max(0, 1 - p * 1.25).toFixed(3)); }
      if (shade) shade.style.opacity = String((1 + p * 0.6).toFixed(3));
    }
    addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(upd); } }, { passive: true });
    upd();
  }

  /* ── 4. Mots qui s'allument au rythme du défilement ── */
  function litWords() {
    var el = document.querySelector('.carry-words');
    if (!el) return;
    el.classList.remove('reveal');
    var words = [];
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          var frag = document.createDocumentFragment();
          n.nodeValue.split(/(\s+)/).forEach(function (p) {
            if (!p) return;
            if (/^\s+$/.test(p)) { frag.appendChild(document.createTextNode(p)); return; }
            var s = document.createElement('span'); s.className = 'lw'; s.textContent = p; words.push(s); frag.appendChild(s);
          });
          node.replaceChild(frag, n);
        } else if (n.nodeType === 1 && n.tagName !== 'BR') { walk(n); }
      });
    })(el);
    var ticking = false;
    function upd() {
      ticking = false;
      var r = el.getBoundingClientRect(), vh = innerHeight;
      var p = (vh * 0.88 - r.top) / (vh * 0.5);            // 0 quand le bloc entre, 1 au milieu de l'écran
      var n = Math.round(Math.max(0, Math.min(1, p)) * words.length);
      words.forEach(function (w, k) { w.classList.toggle('on', k < n); });
    }
    addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(upd); } }, { passive: true });
    addEventListener('resize', upd);
    upd();
  }

  /* ── 5. Titres de section ── */
  function sectionTitles() {
    var hs = document.querySelectorAll('main h2, section h2, .vet h3');
    Array.prototype.forEach.call(hs, function (h) {
      if (h.closest('.hero') || h.closest('.scene') || h.closest('[role="dialog"]')) return;
      var r = h.getBoundingClientRect();
      splitWords(h, 0);
      if (r.top < innerHeight * 0.9 && r.bottom > 0) { requestAnimationFrame(function () { h.classList.add('in'); }); return; }
      onVisible(h, function (t) { t.classList.add('in'); });
    });
  }

  /* ── 6. Jauges + compteurs ── */
  function meters() {
    Array.prototype.forEach.call(document.querySelectorAll('.meter'), function (m) {
      onVisible(m, function () {
        m.classList.add('in');
        var b = m.querySelector('b'), mt = b && b.textContent.match(/^(\d+)(.*)$/);
        if (!mt) return;
        var target = +mt[1], suffix = mt[2], t0 = performance.now();
        (function step(t) {
          var k = Math.min(1, (t - t0) / 1300), e = 1 - Math.pow(1 - k, 3);
          b.textContent = Math.round(target * e) + suffix;
          if (k < 1) requestAnimationFrame(step);
        })(t0);
      });
    });
  }

  /* ── 7. Étapes de l'adhésion qui s'allument ── */
  function flowSteps() {
    var flow = document.querySelector('.flow');
    if (!flow) return;
    var lis = flow.querySelectorAll('li');
    var ticking = false;
    function upd() {
      ticking = false;
      var r = flow.getBoundingClientRect(), vh = innerHeight, mobile = innerWidth <= 640;
      var last = flow.querySelector('li:last-child .dot');
      if (last && !mobile) { var lr = last.getBoundingClientRect(); flow.style.setProperty('--fr', Math.max(0, r.right - (lr.left + lr.width / 2)).toFixed(1) + 'px'); }
      if (mobile) {
        Array.prototype.forEach.call(lis, function (li) { li.classList.toggle('on', li.getBoundingClientRect().top < vh * 0.72); });
      } else {
        var p = Math.max(0, Math.min(1, (vh * 0.85 - r.top) / (vh * 0.45)));
        flow.style.setProperty('--f', p.toFixed(3));
        Array.prototype.forEach.call(lis, function (li, k) { li.classList.toggle('on', p >= k / (lis.length - 1) - 0.02); });
      }
    }
    addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(upd); } }, { passive: true });
    addEventListener('resize', upd);
    upd();
  }

  /* ── 8. Bulletin qui s'imprime, ciseaux sur le pointillé ── */
  function slip() {
    var s = document.querySelector('.slip.qrb');
    if (!s) return;
    onVisible(s, function () {
      s.animate([
        { clipPath: 'inset(0 0 100% 0)', transform: 'translateY(-26px)' },
        { clipPath: 'inset(0 0 0% 0)', transform: 'translateY(0)' }
      ], { duration: 1400, easing: EASE, fill: 'backwards' });
      var sc = s.querySelector('.stub svg');
      if (sc) {
        var mobile = innerWidth <= 920;
        var len = mobile ? s.querySelector('.stub').offsetWidth - 60 : s.querySelector('.stub').offsetHeight - 50;
        var base = mobile ? 'rotate(90deg)' : '';
        var mv = mobile ? function (d) { return 'translateX(' + (-d) + 'px) ' + base; } : function (d) { return 'translateY(' + d + 'px)'; };
        sc.animate([
          { transform: mv(mobile ? len : 0) },
          { transform: mv(mobile ? 0 : len), offset: .7 },
          { transform: mv(mobile ? 0 : len) + ' rotate(-14deg)', offset: .8 },
          { transform: mv(mobile ? 0 : len) + ' rotate(8deg)', offset: .9 },
          { transform: base || 'none' }
        ], { duration: 2200, delay: 1100, easing: 'cubic-bezier(.45,0,.2,1)' });
      }
    }, '0px 0px -18% 0px');
  }

  /* ── 9. Estampe qui tombe et se pose ── */
  function estampe() {
    var f = document.querySelector('.vet-estampe');
    if (!f) return;
    onVisible(f, function () {
      f.animate([
        { transform: 'translateY(-46px) rotate(-11deg)', opacity: 0 },
        { transform: 'translateY(4px) rotate(1.2deg)', opacity: 1, offset: .62 },
        { transform: 'translateY(0) rotate(-2.4deg)', offset: .82 },
        { transform: 'rotate(-1.6deg)' }
      ], { duration: 1500, easing: EASE, fill: 'backwards' });
    }, '0px 0px -15% 0px');
  }

  function start() {
    logos();
    heroIntro();
    heroParallax();
    litWords();
    sectionTitles();
    meters();
    flowSteps();
    slip();
    estampe();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
