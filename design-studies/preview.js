/* 参考稿共用的视图切换、提示与目录行为 */
(function () {
  const DEMO = window.DEMO;

  const pad = (n) => String(n).padStart(2, '0');

  const helpers = {
    pad,
    dateDot(date) {
      return date.replace(/-/g, '.');
    },
    dateCn(date) {
      const [y, m, d] = date.split('-');
      return `${y} 年 ${Number(m)} 月 ${Number(d)} 日`;
    },
    dateShort(date) {
      const [y, m, d] = date.split('-');
      return `${y}.${m}.${d}`;
    },
    byCategory(category) {
      return DEMO.posts.filter((p) => p.category === category);
    },
    escape(value) {
      return String(value).replace(/[&<>"']/g, (ch) => {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
      });
    },
  };

  let toastTimer = null;
  function toast(message) {
    let node = document.querySelector('.demo-toast');
    if (!node) {
      node = document.createElement('div');
      node.className = 'demo-toast';
      node.setAttribute('role', 'status');
      node.setAttribute('aria-live', 'polite');
      document.body.appendChild(node);
    }
    node.textContent = message;
    requestAnimationFrame(() => node.classList.add('is-visible'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('is-visible'), 2200);
  }

  let currentView = null;

  function showView(name, options = {}) {
    const panels = document.querySelectorAll('section[data-view]');
    if (!panels.length) return;
    const exists = [...panels].some((panel) => panel.dataset.view === name);
    const target = exists ? name : panels[0].dataset.view;

    panels.forEach((panel) => {
      panel.hidden = panel.dataset.view !== target;
    });
    document.querySelectorAll('[data-view-target]').forEach((button) => {
      const active = button.dataset.viewTarget === target;
      button.classList.toggle('is-active', active);
      if (button.getAttribute('role') === 'tab' || button.dataset.viewTarget) {
        button.setAttribute('aria-selected', String(active));
      }
    });
    if (currentView !== target && !options.keepScroll) {
      window.scrollTo(0, 0);
    }
    currentView = target;
    if (!options.silent) {
      history.replaceState(null, '', '#' + target);
    }
    document.documentElement.dataset.studyView = target;
    if (target === 'article') {
      refreshToc();
    }
  }

  function refreshToc() {
    document.querySelectorAll('[data-toc]').forEach((toc) => {
      const scope = document.querySelector(toc.dataset.toc || '.article-body');
      if (!scope) return;
      const headings = [...scope.querySelectorAll('h2')];
      toc.innerHTML = headings
        .map((h, index) => {
          const num = h.querySelector('.secnum')?.textContent?.trim() || pad(index + 1);
          const label = h.textContent.replace(h.querySelector('.secnum')?.textContent || '', '').trim();
          return `<li><a href="#${h.id}" data-toc-link><span class="toc-num">${num}</span><span>${helpers.escape(label)}</span></a></li>`;
        })
        .join('');
    });
    observeHeadings();
  }

  let observer = null;
  function observeHeadings() {
    observer?.disconnect();
    const headings = [...document.querySelectorAll('.article-body h2')];
    if (!headings.length || !('IntersectionObserver' in window)) return;
    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          document.querySelectorAll('[data-toc-link]').forEach((link) => {
            link.classList.toggle('is-current', link.getAttribute('href') === '#' + entry.target.id);
          });
        });
      },
      { rootMargin: '-15% 0px -70% 0px' },
    );
    headings.forEach((h) => observer.observe(h));
  }

  function bindGlobal() {
    document.addEventListener('click', (event) => {
      const viewButton = event.target.closest('[data-view-target]');
      if (viewButton) {
        event.preventDefault();
        showView(viewButton.dataset.viewTarget);
        return;
      }
      const opener = event.target.closest('[data-open-article]');
      if (opener) {
        event.preventDefault();
        showView('article');
        window.scrollTo({ top: 0, behavior: 'auto' });
        return;
      }
      const tocLink = event.target.closest('[data-toc-link]');
      if (tocLink) {
        event.preventDefault();
        const id = tocLink.getAttribute('href').slice(1);
        const heading = document.getElementById(id);
        if (heading) {
          heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
          history.replaceState(null, '', '#' + id);
        }
        return;
      }
      const dummy = event.target.closest('[data-dummy]');
      if (dummy) {
        event.preventDefault();
        toast('参考稿：这个入口没有实现，只展示视觉方向');
      }
    });

    const initial = location.hash.replace('#', '');
    showView(initial === 'article' ? 'article' : 'index', { silent: true });
    window.addEventListener('hashchange', () => {
      const name = location.hash.replace('#', '');
      if (name === 'article' || name === 'index') showView(name, { silent: true });
    });
  }

  document.addEventListener('DOMContentLoaded', bindGlobal);

  window.Preview = { helpers, toast, showView, refreshToc };
  window.DEMO_POSTS = DEMO.posts;
})();
