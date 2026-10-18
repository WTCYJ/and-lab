// AND-LAB 사이트 스크립트 — 테마 전환, 글 목차·진행바, 코드 복사, 블로그 필터
(function () {
  var root = document.documentElement;

  // 테마: 저장값 > 시스템 설정
  var toggle = document.querySelector('.theme-toggle');
  if (toggle) toggle.addEventListener('click', function () {
    var cur = root.dataset.theme || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    var next = cur === 'light' ? 'dark' : 'light';
    root.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch (e) {}
  });

  var prose = document.querySelector('.post .prose');
  if (prose) {
    // 표는 가로 스크롤 래퍼로 감싼다(모바일에서 페이지가 옆으로 밀리지 않게)
    prose.querySelectorAll('table').forEach(function (t) {
      var w = document.createElement('div');
      w.className = 'table-wrap';
      t.parentNode.insertBefore(w, t);
      w.appendChild(t);
    });

    // 코드 블록: 언어 표시 + 복사 버튼
    prose.querySelectorAll('div.highlighter-rouge').forEach(function (block) {
      var m = block.className.match(/language-(\w+)/);
      if (m && m[1] !== 'plaintext') {
        var lang = document.createElement('span');
        lang.className = 'code-lang';
        lang.textContent = m[1];
        block.appendChild(lang);
      }
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'copy-btn';
      btn.textContent = '복사';
      btn.addEventListener('click', function () {
        var code = block.querySelector('pre code') || block.querySelector('pre');
        navigator.clipboard.writeText(code.innerText.replace(/\n$/, '')).then(function () {
          btn.textContent = '복사됨';
          btn.classList.add('done');
          setTimeout(function () { btn.textContent = '복사'; btn.classList.remove('done'); }, 1600);
        });
      });
      block.appendChild(btn);
    });

    // 목차: h2/h3 가 3개 이상일 때만
    var heads = prose.querySelectorAll('h2, h3');
    var toc = document.querySelector('.toc');
    if (toc && heads.length >= 3) {
      var nav = toc.querySelector('nav');
      var links = [];
      heads.forEach(function (h, i) {
        if (!h.id) h.id = 'sec-' + (i + 1);
        var a = document.createElement('a');
        a.href = '#' + encodeURIComponent(h.id);
        a.textContent = h.textContent;
        a.className = h.tagName.toLowerCase();
        nav.appendChild(a);
        links.push(a);
      });
      toc.hidden = false;
      var setActive = function () {
        var idx = 0;
        heads.forEach(function (h, i) { if (h.getBoundingClientRect().top < 120) idx = i; });
        links.forEach(function (a, i) { a.classList.toggle('active', i === idx); });
      };
      addEventListener('scroll', setActive, { passive: true });
      setActive();
    }

    // 읽기 진행바
    var bar = document.querySelector('.progress span');
    if (bar) {
      var onScroll = function () {
        var r = prose.getBoundingClientRect();
        var total = r.height - innerHeight * 0.6;
        var p = Math.min(1, Math.max(0, -r.top / total));
        bar.style.transform = 'scaleX(' + p + ')';
      };
      addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }
  }

  // 블로그 분야 필터 (?c=app 처럼 주소로도 열린다)
  var filter = document.querySelector('.filter');
  if (filter) {
    var buttons = filter.querySelectorAll('button');
    var apply = function (cat) {
      buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.filter === cat)); });
      var shown = 0;
      document.querySelectorAll('.year-group').forEach(function (g) {
        var n = 0;
        g.querySelectorAll('.post-item').forEach(function (li) {
          var ok = !cat || li.dataset.cat === cat;
          li.hidden = !ok;
          if (ok) n++;
        });
        g.hidden = n === 0;
        shown += n;
      });
      document.querySelector('.empty').hidden = shown > 0;
    };
    filter.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      apply(b.dataset.filter);
      var url = new URL(location.href);
      if (b.dataset.filter) url.searchParams.set('c', b.dataset.filter); else url.searchParams.delete('c');
      history.replaceState(null, '', url);
    });
    apply(new URLSearchParams(location.search).get('c') || '');
  }
})();
