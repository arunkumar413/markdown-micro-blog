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
