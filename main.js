// Main menu background: the client's Voronoi mosaic (ui/mainmenu/VoronoiBackground),
// tinted with the default HUD colour. Cells under the cursor light up with their neighbours.
(() => {
  const canvas = document.getElementById('bg');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const HUE = 230.3 / 360;
  const SATURATION = 0.34;
  const BRIGHTNESS = 0.312;
  const PAD = 40;

  let cells = [];
  let width = 0;
  let height = 0;
  let dpr = 1;
  let raf = 0;
  let offsetX = 0;
  let offsetY = 0;
  let targetX = 0;
  let targetY = 0;

  function random(seed) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Keeps the side of the polygon where nx * x + ny * y <= d. Every vertex carries
  // the index of the site behind the edge that starts at it.
  function clip(polygon, nx, ny, d, site) {
    const out = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      const da = nx * a.x + ny * a.y - d;
      const db = nx * b.x + ny * b.y - d;
      if (da <= 0) {
        out.push(a);
        if (db > 0) {
          const t = da / (da - db);
          out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, site });
        }
      } else if (db <= 0) {
        const t = da / (da - db);
        out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, site: a.site });
      }
    }
    return out;
  }

  function build() {
    width = window.innerWidth;
    height = window.innerHeight + 120;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.height = height + 'px';

    const rand = random(96);
    const count = Math.max(40, Math.min(170, Math.round((width * height) / 15000)));
    const sites = [];
    for (let i = 0; i < count; i++) {
      sites.push({ x: rand() * (width + PAD * 2) - PAD, y: rand() * (height + PAD * 2) - PAD });
    }

    cells = sites.map((s, i) => {
      let polygon = [
        { x: -PAD, y: -PAD, site: -1 },
        { x: width + PAD, y: -PAD, site: -1 },
        { x: width + PAD, y: height + PAD, site: -1 },
        { x: -PAD, y: height + PAD, site: -1 },
      ];
      for (let j = 0; j < sites.length && polygon.length; j++) {
        if (j === i) continue;
        const nx = sites[j].x - s.x;
        const ny = sites[j].y - s.y;
        polygon = clip(polygon, nx, ny, (nx * (s.x + sites[j].x) + ny * (s.y + sites[j].y)) / 2, j);
      }
      return {
        x: s.x,
        y: s.y,
        polygon,
        neighbours: [...new Set(polygon.map((p) => p.site).filter((n) => n >= 0))],
        shade: 0.8 + rand() * 0.17,
        glow: 0,
        target: 0,
      };
    });
    draw();
  }

  function colour(cell) {
    const v = BRIGHTNESS * (cell.shade + cell.glow * 0.13) * 255;
    const p = v * (1 - SATURATION);
    const f = HUE * 6 - 3; // hue sits between cyan and blue
    const q = v * (1 - SATURATION * f);
    return `rgb(${p | 0},${q | 0},${v | 0})`;
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, offsetX * dpr, offsetY * dpr);
    ctx.lineWidth = 1;
    for (const cell of cells) {
      if (!cell.polygon.length) continue;
      ctx.beginPath();
      ctx.moveTo(cell.polygon[0].x, cell.polygon[0].y);
      for (let i = 1; i < cell.polygon.length; i++) ctx.lineTo(cell.polygon[i].x, cell.polygon[i].y);
      ctx.closePath();
      ctx.fillStyle = ctx.strokeStyle = colour(cell);
      ctx.fill();
      ctx.stroke();
    }
  }

  function frame() {
    raf = 0;
    let moving = false;
    offsetX += (targetX - offsetX) * 0.12;
    offsetY += (targetY - offsetY) * 0.12;
    if (Math.abs(targetX - offsetX) + Math.abs(targetY - offsetY) > 0.05) moving = true;
    for (const cell of cells) {
      const delta = cell.target - cell.glow;
      if (Math.abs(delta) < 0.004) {
        cell.glow = cell.target;
      } else {
        cell.glow += delta * (delta > 0 ? 0.2 : 0.06);
        moving = true;
      }
    }
    draw();
    if (moving) raf = requestAnimationFrame(frame);
  }

  function hover(x, y) {
    let nearest = null;
    let best = Infinity;
    for (const cell of cells) {
      cell.target = 0;
      const distance = (cell.x - x) ** 2 + (cell.y - y) ** 2;
      if (distance < best) {
        best = distance;
        nearest = cell;
      }
    }
    if (nearest) {
      nearest.target = 1;
      for (const n of nearest.neighbours) cells[n].target = 0.78;
    }
  }

  window.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse') return;
    if (!reduceMotion) {
      targetX = -(event.clientX - width / 2) / 60;
      targetY = -(event.clientY - window.innerHeight / 2) / 60;
    }
    hover(event.clientX - offsetX, event.clientY - offsetY);
    if (!raf) raf = requestAnimationFrame(frame);
  });

  document.documentElement.addEventListener('pointerleave', () => {
    for (const cell of cells) cell.target = 0;
    if (!raf) raf = requestAnimationFrame(frame);
  });

  // Mobile browsers resize the viewport while scrolling; only rebuild when the layout really changed.
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (window.innerWidth !== width || window.innerHeight > height) build();
    }, 120);
  });

  build();
})();

// ClickGUI: toggle modules and filter them with the search bar.
(() => {
  const gui = document.getElementById('gui');
  const search = document.getElementById('module-search');
  const count = document.getElementById('module-count');
  if (!gui || !search || !count) return;

  const modules = [...gui.querySelectorAll('li')];

  for (const button of gui.querySelectorAll('button')) {
    button.setAttribute('aria-pressed', button.classList.contains('on'));
  }

  gui.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    button.setAttribute('aria-pressed', button.classList.toggle('on'));
  });

  search.addEventListener('input', () => {
    const query = search.value.trim().toLowerCase().replace(/[\s-]+/g, '');
    let shown = 0;
    for (const item of modules) {
      const match = item.textContent.toLowerCase().replace(/[\s-]+/g, '').includes(query);
      item.hidden = !match;
      if (match) shown++;
    }
    for (const tab of gui.children) {
      tab.classList.toggle('empty', !tab.querySelector('li:not([hidden])'));
    }
    count.textContent = shown === 1 ? '1 module' : shown ? `${shown} modules` : 'No modules match';
  });
})();

// Copy buttons next to the build commands.
(() => {
  for (const button of document.querySelectorAll('.copy')) {
    button.addEventListener('click', async () => {
      const text = button.previousElementSibling.textContent;
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const range = document.createRange();
        range.selectNodeContents(button.previousElementSibling);
        const selection = getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        return;
      }
      button.textContent = 'Copied';
      setTimeout(() => (button.textContent = 'Copy'), 1400);
    });
  }
})();
