(() => {
  const picker = document.querySelector('#theme');
  try {
    const saved = localStorage.getItem('margin-theme');
    if (['paper','night','sage'].includes(saved)) document.documentElement.dataset.theme = picker.value = saved;
  } catch {}
  picker.addEventListener('change', () => {
    document.documentElement.dataset.theme = picker.value;
    try { localStorage.setItem('margin-theme',picker.value); } catch {}
  });
  for (const button of document.querySelectorAll('.read-more')) {
    const body = document.getElementById(button.getAttribute('aria-controls'));
    button.hidden = false;
    body.classList.add('is-collapsed');
    button.addEventListener('click', () => {
      const expanded = button.getAttribute('aria-expanded') !== 'true';
      button.setAttribute('aria-expanded', String(expanded));
      body.classList.toggle('is-collapsed', !expanded);
      button.innerHTML = expanded ? 'Show less <span aria-hidden="true">↑</span>' : 'Read more <span aria-hidden="true">↓</span>';
    });
  }

  const statusTimers = new WeakMap();

  function setShareStatus(button, message) {
    const status = button.closest('.post')?.querySelector('.share-status');
    if (!status) return;
    clearTimeout(statusTimers.get(status));
    status.textContent = message;
    statusTimers.set(status, setTimeout(() => { status.textContent = ''; }, 3000));
  }

  async function copyText(text) {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const input = document.createElement('textarea');
    input.value = text;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.append(input);
    input.select();
    const copied = document.execCommand('copy');
    input.remove();
    if (!copied) throw new Error('Copy failed');
  }

  for (const button of document.querySelectorAll('.copy-link')) {
    button.addEventListener('click', async () => {
      try {
        await copyText(button.dataset.postUrl);
        setShareStatus(button, 'Link copied.');
      } catch {
        setShareStatus(button, 'Could not copy the link.');
      }
    });
  }

  for (const button of document.querySelectorAll('.share-link')) {
    button.addEventListener('click', async () => {
      const title = button.dataset.postTitle;
      const url = button.dataset.postUrl;
      if (navigator.share) {
        try {
          await navigator.share({ title, url });
          setShareStatus(button, 'Post shared.');
          return;
        } catch (error) {
          if (error?.name === 'AbortError') return;
        }
      }

      try {
        await copyText(url);
        setShareStatus(button, 'Sharing is unavailable, so the link was copied.');
      } catch {
        setShareStatus(button, 'Could not share the post.');
      }
    });
  }

  function revealLinkedPost() {
    let id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
    const post = document.getElementById(id);
    const button = post?.querySelector('.read-more');
    if (button?.getAttribute('aria-expanded') === 'false') button.click();
  }
  revealLinkedPost();
  window.addEventListener('hashchange',revealLinkedPost);
})();
