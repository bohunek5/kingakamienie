import './access.css';

// This is a presentation gate for static hosting, not server authentication.
const SESSION_KEY = 'kingakamienie-access-v1';
const PASSWORD_DIGEST = '20f3765880a5c269b747e1e906054a4b4a3a991259f1e16b5dde4742cec2319a';
let pendingUnlock;

function hasSession() {
  try { return sessionStorage.getItem(SESSION_KEY) === PASSWORD_DIGEST; }
  catch { return false; }
}

async function digest(value) {
  const bytes = new TextEncoder().encode(value);
  const result = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(result), byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Resolves after entry; the caller can then import and mount the 3D application. */
export function unlockAtelier() {
  if (hasSession()) return Promise.resolve();
  if (pendingUnlock) return pendingUnlock;
  pendingUnlock = new Promise(resolve => {
    document.body.classList.add('access-locked');
    const gate = document.createElement('section');
    gate.className = 'access-gate';
    gate.setAttribute('aria-labelledby', 'access-title');
    gate.innerHTML = `
      <div class="access-brand" aria-label="Kinga · kamienie">
        <span class="access-brand-name">Kinga<span aria-hidden="true">.</span></span>
        <span class="access-brand-detail">K A M I E N I E</span>
      </div>
      <div class="access-panel">
        <svg class="access-stone" width="64" height="82" viewBox="0 0 64 82" fill="none" aria-hidden="true">
          <path d="M14 2H50L62 14V68L50 80H14L2 68V14Z" fill="#f5f8f5" stroke="#b39a6d" stroke-width=".8"/>
          <path d="M19 10H45L54 19V63L45 72H19L10 63V19Z" fill="#e4eee6" stroke="#688473" stroke-width=".7"/>
          <path d="M23 19H41L45 23V59L41 63H23L19 59V23Z" fill="#355d49"/>
          <path d="M19 10 23 19M45 10 41 19M54 19 45 23M54 63 45 59M45 72 41 63M19 72 23 63M10 63 19 59M10 19 19 23" stroke="#8fa792" stroke-width=".65"/>
          <path d="M23 19H41L45 23 23 63H19V23Z" fill="#658c70" fill-opacity=".28"/>
        </svg>
        <p class="access-eyebrow">ATELIER BIŻUTERII</p>
        <h1 id="access-title">Wejdź do świata kamieni.</h1>
        <p class="access-intro">Podaj hasło, aby otworzyć atelier.</p>
        <form class="access-form" novalidate>
          <label class="access-label" for="access-password">Hasło</label>
          <div class="access-input-wrap">
            <input id="access-password" name="password" type="password" inputmode="numeric" autocomplete="current-password" autocapitalize="off" spellcheck="false" required aria-describedby="access-error" aria-invalid="false">
            <button class="access-reveal" type="button" aria-label="Pokaż hasło" aria-pressed="false" aria-controls="access-password">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35" aria-hidden="true"><path d="M2.5 12s3.3-6 9.5-6 9.5 6 9.5 6-3.3 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.8"/><path class="access-eye-slash" d="m4 3 16 18"/></svg>
            </button>
          </div>
          <p id="access-error" class="access-error" aria-live="polite" aria-atomic="true"></p>
          <button class="access-submit" type="submit"><span>Otwórz atelier</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6"/></svg></button>
        </form>
      </div>
      <p class="access-signature">Światło. Forma. Twój detal.</p>
    `;
    document.body.append(gate);
    const form = gate.querySelector('form');
    const input = gate.querySelector('input');
    const reveal = gate.querySelector('.access-reveal');
    const submit = gate.querySelector('.access-submit');
    const submitText = submit.querySelector('span');
    const error = gate.querySelector('.access-error');
    let checking = false;

    function showError(message) {
      error.textContent = message;
      input.setAttribute('aria-invalid', 'true');
      input.focus({preventScroll:false});
      input.select();
    }
    input.addEventListener('input', () => {
      error.textContent = '';
      input.setAttribute('aria-invalid', 'false');
    });
    reveal.addEventListener('click', () => {
      const showing = input.type === 'password';
      const start = input.selectionStart, end = input.selectionEnd;
      input.type = showing ? 'text' : 'password';
      reveal.setAttribute('aria-pressed', String(showing));
      reveal.setAttribute('aria-label', showing ? 'Ukryj hasło' : 'Pokaż hasło');
      input.focus({preventScroll:true});
      if (start !== null && end !== null) input.setSelectionRange(start, end);
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (checking) return;
      if (!input.value) { showError('Wpisz hasło, aby otworzyć atelier.'); return; }
      checking = true;
      submit.disabled = true;
      submitText.textContent = 'Otwieram…';
      form.setAttribute('aria-busy', 'true');
      try {
        if (await digest(input.value) !== PASSWORD_DIGEST) {
          showError('Nieprawidłowe hasło. Spróbuj ponownie.');
          return;
        }
        try { sessionStorage.setItem(SESSION_KEY, PASSWORD_DIGEST); } catch { /* Entry also works with blocked storage. */ }
        input.value = '';
        gate.remove();
        document.body.classList.remove('access-locked');
        resolve();
      } catch {
        showError('Nie udało się sprawdzić hasła. Odśwież stronę i spróbuj ponownie.');
      } finally {
        checking = false;
        submit.disabled = false;
        submitText.textContent = 'Otwórz atelier';
        form.removeAttribute('aria-busy');
      }
    });
    if(!window.matchMedia('(pointer: coarse)').matches)requestAnimationFrame(() => input.focus({preventScroll:true}));
  });
  return pendingUnlock;
}

/** Clear only this tab's entry marker and return to the password screen. */
export function lockAtelier() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* Storage may be blocked. */ }
  location.reload();
}
