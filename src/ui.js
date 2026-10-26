import * as CONFIG from './config.js';

const { STONES, METALS, CUTS, SETTINGS, FINISHES = { standard: 'Standard', metalized: 'Metalizowana', glass: 'Shine / Glass', highend: 'High-end' } } = CONFIG;

const cutIcons = {
  emerald: '<path d="M8 3h8l4 4v10l-4 4H8l-4-4V7l4-4Z"/><path d="M9 6h6l2 2v8l-2 2H9l-2-2V8l2-2Z"/>',
  oval: '<ellipse cx="12" cy="12" rx="7" ry="10"/><ellipse cx="12" cy="12" rx="4" ry="7"/>',
  round: '<circle cx="12" cy="12" r="9"/><path d="m12 3 6 5v8l-6 5-6-5V8l6-5Zm-6 5h12M6 16h12M12 3v18"/>',
  cushion: '<rect x="3" y="3" width="18" height="18" rx="6"/><rect x="6.5" y="6.5" width="11" height="11" rx="3"/>',
  cabochon: '<ellipse cx="12" cy="12" rx="7" ry="10"/><path d="M8 12c0-3.5 1.5-6 4-7"/><path d="M6.5 18c3 2 8 2 11 0"/>',
  rough: '<path d="m9 2 9 3 3 9-5 7-10-2-4-9 7-8Z"/><path d="m9 2-2 9 9-5-2 10 7-2M7 11l-1 8m1-8 7 5 2 5"/>'
};
const settingIcons = {
  prong: '<rect x="7" y="4" width="10" height="14" rx="3"/><path d="m5 4 3 3m11-3-3 3M5 18l3-3m11 3-3-3M7 18v3h10v-3"/>',
  bezel: '<rect x="4" y="2" width="16" height="19" rx="6"/><rect x="7" y="5" width="10" height="13" rx="3"/>',
  halo: '<rect x="7" y="5" width="10" height="14" rx="4"/><path stroke-dasharray=".1 4.1" stroke-width="2.8" stroke-linecap="round" d="M9 2h6a7 7 0 0 1 7 7v6a7 7 0 0 1-7 7H9a7 7 0 0 1-7-7V9a7 7 0 0 1 7-7Z"/>'
};
const icon = (content) => `<svg viewBox="0 0 24 24" aria-hidden="true">${content}</svg>`;
const section = (number, name, selectedId, body) => `<section class="config-section"><div class="section-title"><h3><span>${number}</span>${name}</h3><span class="selection-label" id="${selectedId}"></span></div>${body}</section>`;
const FAVORITES = ['emerald', 'sapphire', 'ruby', 'diamond', 'amethyst', 'aquamarine'];
const STONE_GROUPS = { all: 'Wszystkie', gem: 'Kamienie szlachetne', quartz: 'Kwarce', mineral: 'Minerały', organic: 'Organiczne', cosmic: 'Kosmos' };
const normalizeSearch = (value) => value.toLocaleLowerCase('pl-PL').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l');
const escapeHTML = (value) => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
const swatch = (id, stone, large = false) => `<span class="gem-swatch gem-${id} ${large ? 'library-swatch' : ''} ${stone.kind && stone.kind !== 'optical' ? `mineral-swatch kind-${stone.kind}` : ''}" style="--gem-color:${stone.color};--gem-secondary:${stone.secondary || stone.color2 || '#dae2c9'}" aria-hidden="true"><i></i></span>`;

export function setupUI(initialState, { onChange, onAction }) {
  let state = { finish: 'standard', alive: false, ...initialState };
  let toastTimeout;
  let activeGroup = 'all';
  let libraryOpener;
  let previousOverflow = '';
  let lockedScrollY = 0;
  let previousBodyPosition;
  const isTouchLayout = () => window.matchMedia('(max-width: 800px), (pointer: coarse) and (max-width: 1024px)').matches;
  const stoneEntries = Object.entries(STONES);
  const container = document.querySelector('#configuration-controls');
  container.innerHTML = [
    section('01', 'Kamień', 'selected-stone', `<div class="stone-options" role="group" aria-label="Ulubione kamienie">${FAVORITES.filter(id => STONES[id]).map(id => { const stone = STONES[id]; return `<button type="button" class="stone-option" data-key="stone" data-value="${id}" aria-pressed="false" title="${escapeHTML(stone.name)} — ${escapeHTML(stone.subtitle)}">${swatch(id, stone)}<span>${escapeHTML(stone.name)}</span></button>`; }).join('')}</div><button type="button" class="library-open" id="open-stone-library" aria-haspopup="dialog" aria-controls="stone-library"><span>Wszystkie kamienie <span class="library-total">· ${stoneEntries.length}</span></span>${icon('<path d="M4 12h16m-5-5 5 5-5 5"/>')}</button><p class="selected-stone-description" id="selected-stone-description"></p><button type="button" class="cosmic-open" id="open-cosmic-library" aria-haspopup="dialog" aria-controls="stone-library"><span class="cosmic-mark" aria-hidden="true">✧</span><span>Kolekcja kosmiczna<small>Materiały artystyczne</small></span>${icon('<path d="M4 12h16m-5-5 5 5-5 5"/>')}</button>`),
    section('02', 'Szlif', 'selected-cut', `<div class="cut-options" role="group" aria-label="Wybierz szlif">${Object.entries(CUTS).map(([id, name]) => `<button type="button" class="shape-option" data-key="cut" data-value="${id}" aria-pressed="false">${icon(cutIcons[id])}<span>${name}</span></button>`).join('')}</div>`),
    section('03', 'Oprawa', 'selected-setting', `<div class="setting-options" role="group" aria-label="Wybierz oprawę">${Object.entries(SETTINGS).map(([id, name]) => `<button type="button" class="setting-option" data-key="setting" data-value="${id}" aria-pressed="false">${icon(settingIcons[id])}<span>${name}</span></button>`).join('')}</div>`),
    section('04', 'Metal', 'selected-metal', `<div class="metal-options" role="group" aria-label="Wybierz metal">${Object.entries(METALS).map(([id, metal]) => `<button type="button" class="metal-option" data-key="metal" data-value="${id}" aria-pressed="false"><span class="metal-swatch metal-${id}" style="--metal-color:${metal.color}"></span><span>${metal.name}<small>${metal.detail}</small></span></button>`).join('')}</div>`),
    section('05', 'Wielkość kamienia', 'selected-size', '<div class="size-control"><label for="stone-size" class="sr-only">Wysokość kamienia w milimetrach</label><input type="range" id="stone-size" min="7" max="14" step="0.5" value="10"/><div class="range-labels"><span>7 mm</span><span>14 mm</span></div></div>'),
    section('06', 'Wykończenie', 'selected-finish', `<div class="finish-options" role="group" aria-label="Wybierz wykończenie kamienia">${Object.entries(FINISHES).map(([id, name]) => `<button type="button" class="finish-option" data-key="finish" data-value="${id}" aria-pressed="false"><span class="finish-preview finish-${id}" aria-hidden="true"></span><span>${name}</span></button>`).join('')}</div><div class="alive-control" id="alive-control" hidden><div><span>Żywy kamień</span><small id="alive-description">Delikatny ruch wewnątrz kamienia</small></div><button type="button" class="alive-toggle" data-toggle="alive" aria-pressed="false" aria-label="Żywy kamień: animacja materiału"><span></span></button></div>`),
    '<div class="lighting-control"><span>Światło</span><div role="group" aria-label="Wybierz światło"><button type="button" data-key="lighting" data-value="studio" aria-pressed="true">Studyjne</button><button type="button" data-key="lighting" data-value="daylight" aria-pressed="false">Dzienne</button></div></div>'
  ].join('');

  const library = document.createElement('dialog');
  library.id = 'stone-library';
  library.className = 'stone-library';
  library.setAttribute('aria-labelledby', 'library-title');
  library.setAttribute('aria-describedby', 'library-description');
  library.innerHTML = `<div class="library-shell"><div class="library-header"><div><span class="eyebrow">BIBLIOTEKA ATELIER / MATERIAŁÓW: ${stoneEntries.length}</span><h2 id="library-title">Kamienie <em>i minerały</em></h2><p id="library-description">Kamienie, minerały i materiały inspirowane kosmosem.</p></div><button type="button" class="library-close" aria-label="Zamknij bibliotekę kamieni">${icon('<path d="m6 6 12 12M18 6 6 18"/>')}</button></div><div class="library-filters"><label class="library-search">${icon('<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>')}<span class="sr-only">Szukaj kamienia lub minerału</span><input id="stone-search" type="search" placeholder="Nazwa, kolor lub wzór…" autocomplete="off" autofocus /></label><div class="library-categories" role="group" aria-label="Kategorie kamieni">${Object.entries(STONE_GROUPS).map(([id, name]) => `<button type="button" data-group="${id}" aria-pressed="${id === 'all'}">${name}</button>`).join('')}</div><div class="library-count"><span id="library-result-count" role="status" aria-live="polite"></span><span>WYBIERZ SWÓJ KAMIEŃ</span></div></div><div class="library-results"><div id="library-grid" class="library-grid" role="group" aria-label="Dostępne kamienie i minerały"></div><p class="library-empty" hidden>Nie znaleziono kamienia.<br /><span>Spróbuj innej nazwy, koloru lub kategorii.</span></p></div><div class="library-footer"><span class="library-footer-mark">✧</span><span>Wzorzyste kamienie prezentujemy w gładkim kaboszonie.<br />Kolekcja kosmiczna obejmuje materiały artystyczne.</span></div></div>`;
  document.body.append(library);
  library.querySelector('#stone-search').removeAttribute('autofocus');
  library.querySelector('#stone-search').setAttribute('enterkeyhint', 'search');
  library.querySelector('#stone-search').setAttribute('autocapitalize', 'none');
  const mobileConfigLink = document.createElement('a');
  mobileConfigLink.className = 'mobile-config-link';
  mobileConfigLink.href = '#configuration';
  mobileConfigLink.innerHTML = `Wybierz kamień i oprawę ${icon('<path d="M12 4v16m-5-5 5 5 5-5"/>')}`;
  document.querySelector('.gallery-bottom').append(mobileConfigLink);
  const mobileModelReturn = document.createElement('button');
  mobileModelReturn.type = 'button';
  mobileModelReturn.className = 'mobile-model-return';
  mobileModelReturn.hidden = true;
  mobileModelReturn.innerHTML = `Zobacz kolczyk ${icon('<path d="M12 20V4m-5 5 5-5 5 5"/>')}`;
  (document.querySelector('#atelier-app') || document.body).append(mobileModelReturn);
  const gallery = document.querySelector('.gallery');
  let galleryInView = true;
  function updateModelReturn() {
    mobileModelReturn.hidden = !isTouchLayout() || galleryInView || library.open;
  }
  mobileModelReturn.addEventListener('click', () => gallery.scrollIntoView({ block: 'start', behavior: 'instant' }));
  new IntersectionObserver(([entry]) => { galleryInView = entry.isIntersecting && entry.intersectionRect.height > 48; updateModelReturn(); }, { threshold: [0, 0.1] }).observe(document.querySelector('#viewport'));
  const sceneHelp = document.querySelector('.scene-help');
  const updateTouchHelp = () => {
    sceneHelp.innerHTML = isTouchLayout()
      ? '<span>Przewiń palcem · obróć lub przybliż dwoma</span>'
      : '<span>Przeciągnij, aby obrócić</span><i></i><span>Przybliż i odkryj detale</span>';
    updateModelReturn();
  };
  updateTouchHelp();
  window.matchMedia('(max-width: 800px), (pointer: coarse) and (max-width: 1024px)').addEventListener('change', updateTouchHelp);
  function syncLibraryViewport() {
    if (!library.open) return;
    const viewport = window.visualViewport;
    const height = viewport?.height || window.innerHeight;
    library.style.setProperty('--library-viewport-height', `${height}px`);
    library.style.setProperty('--library-viewport-top', `${viewport?.offsetTop || 0}px`);
    library.classList.toggle('is-compact', isTouchLayout() && height < 530);
  }
  window.visualViewport?.addEventListener('resize', syncLibraryViewport);
  window.visualViewport?.addEventListener('scroll', syncLibraryViewport);
  window.addEventListener('resize', syncLibraryViewport);

  const setPatch = (patch) => {
    state = { ...state, ...patch };
    update(state);
    onChange(patch);
  };
  document.querySelectorAll('[data-key]').forEach(button => button.addEventListener('click', () => button.dataset.key === 'stone' ? selectStone(button.dataset.value) : setPatch({ [button.dataset.key]: button.dataset.value })));
  document.querySelectorAll('[data-toggle]').forEach(button => button.addEventListener('click', () => setPatch({ [button.dataset.toggle]: !state[button.dataset.toggle] })));
  document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => onAction(button.dataset.action)));
  document.querySelector('#stone-size').addEventListener('input', event => setPatch({ size: Number(event.target.value) }));
  document.querySelector('#open-stone-library').addEventListener('click', () => openLibrary('all'));
  document.querySelector('#open-cosmic-library').addEventListener('click', () => openLibrary('cosmic'));
  library.querySelector('.library-close').addEventListener('click', closeLibrary);
  library.querySelector('#stone-search').addEventListener('input', renderLibrary);
  library.querySelectorAll('[data-group]').forEach(button => button.addEventListener('click', () => {
    activeGroup = button.dataset.group;
    library.querySelectorAll('[data-group]').forEach(item => item.setAttribute('aria-pressed', String(item.dataset.group === activeGroup)));
    renderLibrary();
  }));
  library.addEventListener('cancel', event => { event.preventDefault(); closeLibrary(); });
  library.addEventListener('click', event => {
    if (event.target !== library) return;
    const bounds = library.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeLibrary();
  });
  library.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); closeLibrary(); return; }
    if (event.key !== 'Tab') return;
    const focusable = [...library.querySelectorAll('button:not([disabled]),input:not([disabled]),[tabindex="0"]')].filter(element => element.getClientRects().length);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });

  function selectStone(id) {
    const stone = STONES[id];
    if (!stone) return;
    const patch = { stone: id };
    if (stone.preferredCut && CUTS[stone.preferredCut]) patch.cut = stone.preferredCut;
    else if (stone.kind && stone.kind !== 'optical' && CUTS.cabochon) patch.cut = 'cabochon';
    patch.alive = stone.group === 'cosmic' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setPatch(patch);
  }

  function openLibrary(group = 'all') {
    if (library.open) return;
    libraryOpener = document.activeElement;
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (isTouchLayout()) {
      lockedScrollY = window.scrollY;
      previousBodyPosition = { position: document.body.style.position, top: document.body.style.top, width: document.body.style.width };
      document.body.style.position = 'fixed';
      document.body.style.top = `-${lockedScrollY}px`;
      document.body.style.width = '100%';
    }
    activeGroup = group;
    library.querySelector('#stone-search').value = '';
    library.querySelectorAll('[data-group]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.group === activeGroup)));
    renderLibrary();
    library.showModal();
    updateModelReturn();
    syncLibraryViewport();
    library.querySelector(isTouchLayout() ? '.library-close' : '#stone-search').focus({ preventScroll: true });
  }

  function closeLibrary() {
    if (!library.open) return;
    library.close();
    updateModelReturn();
    document.body.style.overflow = previousOverflow;
    if (previousBodyPosition) {
      Object.assign(document.body.style, previousBodyPosition);
      window.scrollTo({ top: lockedScrollY, behavior: 'instant' });
      previousBodyPosition = undefined;
    }
    libraryOpener?.focus({ preventScroll: true });
  }

  function renderLibrary() {
    const query = normalizeSearch(library.querySelector('#stone-search').value.trim());
    const visibleStones = stoneEntries.filter(([id, stone]) => (activeGroup === 'all' || (stone.group || 'gem') === activeGroup) && normalizeSearch(`${stone.name} ${stone.subtitle} ${id} ${STONE_GROUPS[stone.group] || ''}`).includes(query));
    library.querySelector('#library-result-count').textContent = `Wyniki: ${visibleStones.length} / ${stoneEntries.length}`;
    library.querySelector('.library-empty').hidden = visibleStones.length > 0;
    const grid = library.querySelector('#library-grid');
    grid.innerHTML = visibleStones.map(([id, stone]) => `<button type="button" class="library-stone" data-stone="${id}" aria-pressed="${state.stone === id}">${swatch(id, stone, true)}<span class="library-stone-name">${escapeHTML(stone.name)}</span><span class="library-stone-description">${escapeHTML(stone.subtitle)}</span><span class="library-stone-check" aria-hidden="true">${icon('<path d="m5 12 4 4L19 6"/>')}</span></button>`).join('');
    grid.querySelectorAll('[data-stone]').forEach(button => button.addEventListener('click', () => {
      closeLibrary();
      selectStone(button.dataset.stone);
    }));
  }

  function update(nextState) {
    state = { ...state, ...nextState };
    document.querySelectorAll('[data-key]').forEach(button => button.setAttribute('aria-pressed', String(state[button.dataset.key] === button.dataset.value)));
    document.querySelectorAll('[data-toggle]').forEach(button => button.setAttribute('aria-pressed', String(!!state[button.dataset.toggle])));
    const selectedStone = STONES[state.stone] || STONES.emerald;
    const selectedMetal = METALS[state.metal] || METALS.gold;
    document.querySelector('#selected-stone').textContent = selectedStone.name;
    document.querySelector('#selected-stone-description').textContent = selectedStone.subtitle;
    document.querySelector('#selected-finish').textContent = FINISHES[state.finish || 'standard'];
    document.querySelector('#alive-control').hidden = selectedStone.group !== 'cosmic';
    document.querySelector('#alive-description').textContent = selectedStone.subtitle;
    document.querySelector('#open-cosmic-library').classList.toggle('is-selected', selectedStone.group === 'cosmic');
    document.querySelector('#open-stone-library').classList.toggle('has-library-selection', !FAVORITES.includes(state.stone));
    document.querySelector('#open-stone-library').setAttribute('aria-label', `Wszystkie kamienie: ${stoneEntries.length}. Wybrano: ${selectedStone.name}`);
    library.querySelectorAll('[data-stone]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.stone === state.stone)));
    document.querySelector('#selected-cut').textContent = CUTS[state.cut];
    document.querySelector('#selected-setting').textContent = SETTINGS[state.setting];
    document.querySelector('#selected-metal').textContent = selectedMetal.detail;
    document.querySelector('#selected-size').textContent = `${formatNumber(state.size)} mm`;
    document.querySelector('#stone-size').value = state.size;
    document.querySelector('#stone-size').style.setProperty('--range-progress', `${((state.size - 7) / 7) * 100}%`);
    document.querySelector('#model-summary').textContent = `${selectedStone.name} · ${selectedMetal.name.toLocaleLowerCase('pl')}`;
    document.querySelector('.caption-index').textContent = `${String(Object.keys(STONES).indexOf(state.stone) + 1).padStart(2, '0')} / ${String(stoneEntries.length).padStart(2, '0')}`;
    document.querySelector('#detail-cut').textContent = CUTS[state.cut];
    document.querySelector('#viewport').setAttribute('aria-label', `Kolczyk 3D: ${selectedStone.name}, ${selectedMetal.name.toLowerCase()}, szlif ${CUTS[state.cut]?.toLowerCase()}, ${SETTINGS[state.setting]?.toLowerCase()}. Przeciągnij, aby obrócić; użyj kółka myszy, aby przybliżyć.`);
  }

  function toast(message) {
    const element = document.querySelector('#toast');
    clearTimeout(toastTimeout);
    element.textContent = message;
    element.classList.add('is-visible');
    toastTimeout = setTimeout(() => element.classList.remove('is-visible'), 4000);
  }

  function setReady() {
    document.querySelector('#scene-loader').classList.add('is-ready');
    document.querySelector('#scene-status-text').textContent = 'PODGLĄD NA ŻYWO';
    document.querySelector('.scene-status').classList.add('is-ready');
  }

  function setMetrics(metrics = {}) {
    if (metrics.dimensions) document.querySelector('#detail-dimensions').textContent = typeof metrics.dimensions === 'string' ? metrics.dimensions : `${metrics.dimensions.join(' × ')} mm`;
    if (metrics.gemLength && metrics.gemWidth) document.querySelector('#detail-dimensions').textContent = `${formatNumber(metrics.gemLength)} × ${formatNumber(metrics.gemWidth)} mm`;
  }

  update(state);
  return { update, toast, setReady, setMetrics };
}

function formatNumber(value) {
  return Number(value).toLocaleString('pl-PL', { maximumFractionDigits: 1 });
}
