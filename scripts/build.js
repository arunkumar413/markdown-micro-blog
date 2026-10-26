import { readFile, readdir, mkdir, writeFile, cp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

const root = fileURLToPath(new URL('../', import.meta.url));
const escape = (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const monthLabel = key => new Date(`${key}-01T12:00:00Z`).toLocaleDateString('en', {month:'long',year:'numeric',timeZone:'UTC'});

export async function loadPosts(directory) {
  const names = (await readdir(directory)).filter(name => /\.md$/i.test(name));
  return Promise.all(names.map(async name => {
    const match = /^(\d{4}-\d{2}-\d{2})--([a-zA-Z0-9][a-zA-Z0-9_-]*)\.md$/i.exec(name);
    if (!match) throw new Error(`Invalid post filename: ${name}. Use YYYY-MM-DD--file-name.md`);
    const [, date, slug] = match;
    const parsed = new Date(`${date}T12:00:00Z`);
    if (Number.isNaN(+parsed) || parsed.toISOString().slice(0,10) !== date) throw new Error(`Invalid date in ${name}`);
    const markdown = await readFile(path.join(directory, name), 'utf8');
    const html = sanitizeHtml(marked.parse(markdown), {
      allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img'],
      allowedAttributes: {...sanitizeHtml.defaults.allowedAttributes, img:['src','alt','title','width','height'], code:['class']}
    });
    const plain = sanitizeHtml(html, {allowedTags:[],allowedAttributes:{}});
    return {date, slug, id:`${date}--${slug}`, month:date.slice(0,7), html, words:plain.trim().split(/\s+/).filter(Boolean).length};
  })).then(posts => posts.sort((a,b) => b.id.localeCompare(a.id)));
}

export async function build({base = root, out = path.join(base,'dist')} = {}) {
  const config = JSON.parse(await readFile(path.join(base,'blog.config.json'),'utf8'));
  const posts = await loadPosts(path.join(base,'posts'));
  const months = [...new Set(posts.map(p => p.month))];
  if (!Number.isFinite(config.collapseAfterWords) || config.collapseAfterWords < 1) throw new Error('collapseAfterWords must be a positive number');
  if (!['paper','night','sage'].includes(config.theme)) throw new Error('Theme must be paper, night, or sage');
  await mkdir(path.join(out,'assets'), {recursive:true});
  await cp(path.join(root,'src'), path.join(out,'assets'), {recursive:true});
  const fontDirectory = path.join(out,'assets','fonts');
  const interDirectory = path.join(root,'node_modules','@fontsource-variable','inter','files');
  await mkdir(fontDirectory, {recursive:true});
  await Promise.all([
    cp(path.join(interDirectory,'inter-latin-wght-normal.woff2'), path.join(fontDirectory,'inter-latin.woff2')),
    cp(path.join(interDirectory,'inter-latin-wght-italic.woff2'), path.join(fontDirectory,'inter-latin-italic.woff2'))
  ]);
  const render = (selected, current, home = false) => {
    const heading = home ? 'The latest notes' : monthLabel(current);
    return `<!doctype html>
<html lang="en" data-theme="${escape(config.theme)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="${escape(config.description)}"><meta name="color-scheme" content="light dark"><title>${escape(home ? config.title : `${heading} · ${config.title}`)}</title><link rel="preload" href="assets/fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="assets/style.css"><script src="assets/client.js" defer></script></head>
<body><a class="skip-link" href="#content">Skip to posts</a><div class="layout">
<aside class="sidebar"><a class="brand" href="index.html"><span class="brand-mark">m<span>·</span></span>${escape(config.title)}<span class="brand-dot">/</span></a><p class="tagline">${escape(config.description)}</p><a class="home-link ${home?'active':''}" href="index.html" ${home?'aria-current="page"':''}><span>◈</span> Latest notes <span class="count">${posts.filter(p=>p.month===months[0]).length}</span></a><div class="archive-label">THE ARCHIVE <span>↓</span></div><nav aria-label="Monthly archives">${months.map(m=>`<a class="archive-link ${!home&&current===m?'active':''}" href="${m}.html" ${!home&&current===m?'aria-current="page"':''}>${monthLabel(m)}<span class="count">${posts.filter(p=>p.month===m).length}</span></a>`).join('')}</nav><div class="sidebar-bottom"><div class="small-label">MAKE YOURSELF AT HOME</div><label class="theme-label" for="theme">Appearance <select id="theme"><option value="paper" ${config.theme==='paper'?'selected':''}>Paper</option><option value="night" ${config.theme==='night'?'selected':''}>Night</option><option value="sage" ${config.theme==='sage'?'selected':''}>Sage</option></select></label><p>A small corner of the internet.<br>Written in Markdown. Made to last.</p></div></aside>
<main id="content"><header class="page-header"><div><div class="eyebrow">THE PERSONAL NOTEBOOK</div><h1>${escape(heading)}<span>↘</span></h1><p>Small observations. Longer thoughts. All in one place.</p></div><span class="header-number">${String(selected.length).padStart(2,'0')} NOTES</span></header><section class="profile"><span class="avatar">${escape(config.initials)}</span><div><strong>${escape(config.author)}</strong><p>${escape(config.bio)}</p></div><span class="profile-badge"><i></i> A work in progress</span></section><section aria-label="Posts" class="feed">${selected.length ? selected.map(p=>{
      const date = new Date(`${p.date}T12:00:00Z`);
      const long = p.words > config.collapseAfterWords;
      return `<article class="post" id="${p.id}"><div class="post-meta"><time datetime="${p.date}">${date.toLocaleDateString('en',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'})}</time><span>·</span><span>${Math.max(1,Math.ceil(p.words/200))} min read</span><a class="permalink" href="${p.month}.html#${p.id}" aria-label="Permanent link to ${escape(p.slug)}">↗</a></div><div class="post-body ${long?'collapsible':''}" id="body-${p.id}">${p.html}</div>${long?`<button class="read-more" aria-expanded="false" aria-controls="body-${p.id}" hidden>Read more <span aria-hidden="true">↓</span></button>`:''}<div class="post-foot"><span class="post-signature">${escape(config.initials)}</span><span>${escape(config.author)}</span><span class="post-category">a note from the margins</span></div></article>`;
    }).join('') : '<div class="empty"><h2>A fresh page.</h2><p>Add your first Markdown post to the posts folder, then run the build.</p></div>'}</section><footer class="page-footer"><span>YOU’RE ALL CAUGHT UP</span><span class="footer-flower">✳</span><p>A few thoughts, left here for you.</p><a href="#content">Back to top ↑</a></footer></main></div></body></html>`;
  };
  // Validate all posts before replacing any generated HTML. Remove obsolete archive pages only.
  for (const name of await readdir(out)) if (/^(\d{4}-\d{2}|index)\.html$/.test(name)) {
    const { unlink } = await import('node:fs/promises'); await unlink(path.join(out,name));
  }
  await writeFile(path.join(out,'index.html'),render(posts.filter(p=>p.month===months[0]),months[0],true));
  for (const month of months) await writeFile(path.join(out,`${month}.html`),render(posts.filter(p=>p.month===month),month));
  return {posts:posts.length, months:months.length};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  build().then(result=>console.log(`Built ${result.posts} posts across ${result.months} monthly archives → dist/`)).catch(error=>{console.error(error.message); process.exitCode=1;});
}
