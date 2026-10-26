import { cp, mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

const root = fileURLToPath(new URL('../', import.meta.url));

const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[character]));

const escapeXml = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;'
}[character]));

const normalizeText = value => String(value).replace(/\s+/g, ' ').trim();

const truncate = (value, maximum = 160) => {
  const text = normalizeText(value);
  if (text.length <= maximum) return text;
  const shortened = text.slice(0, maximum - 1).replace(/\s+\S*$/, '');
  return `${shortened || text.slice(0, maximum - 1)}…`;
};

const safeJson = value => JSON.stringify(value).replace(/</g, '\\u003c');

const monthLabel = key => new Date(`${key}-01T12:00:00Z`).toLocaleDateString('en', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC'
});

const titleFromSlug = slug => slug
  .replace(/[-_]+/g, ' ')
  .replace(/\b\w/g, character => character.toUpperCase());

export async function loadPosts(directory) {
  const names = (await readdir(directory)).filter(name => /\.md$/i.test(name));

  return Promise.all(names.map(async name => {
    const match = /^(\d{4}-\d{2}-\d{2})--([a-zA-Z0-9][a-zA-Z0-9_-]*)\.md$/i.exec(name);
    if (!match) throw new Error(`Invalid post filename: ${name}. Use YYYY-MM-DD--file-name.md`);

    const [, date, slug] = match;
    const parsed = new Date(`${date}T12:00:00Z`);
    if (Number.isNaN(+parsed) || parsed.toISOString().slice(0, 10) !== date) {
      throw new Error(`Invalid date in ${name}`);
    }

    const markdown = await readFile(path.join(directory, name), 'utf8');
    const tokens = marked.lexer(markdown);
    const heading = tokens.find(token => token.type === 'heading');
    const title = heading
      ? normalizeText(sanitizeHtml(marked.parseInline(heading.text), { allowedTags: [], allowedAttributes: {} }))
      : titleFromSlug(slug);

    const html = sanitizeHtml(marked.parse(markdown), {
      allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img'],
      allowedAttributes: {
        ...sanitizeHtml.defaults.allowedAttributes,
        img: ['src', 'alt', 'title', 'width', 'height'],
        code: ['class']
      }
    });
    const contentHtml = heading
      ? html.replace(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>\s*/i, '')
      : html;
    const plain = normalizeText(sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }));
    const summarySource = plain.startsWith(title) ? plain.slice(title.length).trim() : plain;
    const description = truncate(summarySource || `${title}.`);
    const words = plain.split(/\s+/).filter(Boolean).length;

    return {
      date,
      slug,
      id: `${date}--${slug}`,
      month: date.slice(0, 7),
      title,
      description,
      html,
      contentHtml,
      words
    };
  })).then(posts => posts.sort((a, b) => b.id.localeCompare(a.id)));
}

export async function build({ base = root, out = path.join(base, 'dist') } = {}) {
  const config = JSON.parse(await readFile(path.join(base, 'blog.config.json'), 'utf8'));
  const posts = await loadPosts(path.join(base, 'posts'));
  const months = [...new Set(posts.map(post => post.month))];

  if (!Number.isFinite(config.collapseAfterWords) || config.collapseAfterWords < 1) {
    throw new Error('collapseAfterWords must be a positive number');
  }
  if (!['paper', 'night', 'sage'].includes(config.theme)) {
    throw new Error('Theme must be paper, night, or sage');
  }
  if (!config.siteUrl) throw new Error('siteUrl is required for canonical URLs and the sitemap');

  const parsedSiteUrl = new URL(config.siteUrl);
  if (!['http:', 'https:'].includes(parsedSiteUrl.protocol)) {
    throw new Error('siteUrl must be an absolute HTTP or HTTPS URL');
  }
  parsedSiteUrl.hash = '';
  parsedSiteUrl.search = '';
  if (!parsedSiteUrl.pathname.endsWith('/')) parsedSiteUrl.pathname += '/';
  const siteUrl = parsedSiteUrl.href;
  const pageUrl = file => new URL(file || './', siteUrl).href;
  const language = config.language || 'en';

  await mkdir(path.join(out, 'assets'), { recursive: true });
  await cp(path.join(root, 'src'), path.join(out, 'assets'), { recursive: true });

  const fontDirectory = path.join(out, 'assets', 'fonts');
  const interDirectory = path.join(root, 'node_modules', '@fontsource-variable', 'inter', 'files');
  await mkdir(fontDirectory, { recursive: true });
  await Promise.all([
    cp(path.join(interDirectory, 'inter-latin-wght-normal.woff2'), path.join(fontDirectory, 'inter-latin.woff2')),
    cp(path.join(interDirectory, 'inter-latin-wght-italic.woff2'), path.join(fontDirectory, 'inter-latin-italic.woff2'))
  ]);

  const structuredCollection = ({ canonical, pageTitle, pageDescription, selected, home }) => ({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${siteUrl}#website`,
        url: siteUrl,
        name: config.title,
        description: config.description,
        inLanguage: language,
        author: {
          '@type': 'Person',
          name: config.author
        }
      },
      {
        '@type': home ? 'Blog' : 'CollectionPage',
        '@id': `${canonical}#page`,
        url: canonical,
        name: pageTitle,
        description: pageDescription,
        inLanguage: language,
        isPartOf: { '@id': `${siteUrl}#website` },
        mainEntity: {
          '@type': 'ItemList',
          itemListElement: selected.map((post, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            url: pageUrl(`${post.id}.html`),
            name: post.title
          }))
        }
      }
    ]
  });

  const structuredPost = (post, canonical) => ({
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    '@id': `${canonical}#article`,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': canonical
    },
    url: canonical,
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    inLanguage: language,
    wordCount: post.words,
    author: {
      '@type': 'Person',
      name: config.author,
      url: siteUrl
    },
    publisher: {
      '@type': 'Person',
      name: config.author,
      url: siteUrl
    },
    isPartOf: {
      '@type': 'Blog',
      '@id': `${siteUrl}#website`,
      name: config.title
    }
  });

  const render = (selected, current, { home = false, postPage = null } = {}) => {
    const heading = postPage ? postPage.title : home ? 'The latest notes' : monthLabel(current);
    const pageTitle = postPage
      ? `${postPage.title} · ${config.title}`
      : home
        ? config.title
        : `${heading} · ${config.title}`;
    const pageDescription = postPage
      ? postPage.description
      : home
        ? config.description
        : truncate(`${heading} posts by ${config.author}. ${config.description}`);
    const outputFile = postPage ? `${postPage.id}.html` : home ? '' : `${current}.html`;
    const canonical = pageUrl(outputFile);
    const structuredData = postPage
      ? structuredPost(postPage, canonical)
      : structuredCollection({ canonical, pageTitle, pageDescription, selected, home });
    const headerDescription = postPage ? postPage.description : 'Small observations. Longer thoughts. All in one place.';
    const headerStat = postPage
      ? `${Math.max(1, Math.ceil(postPage.words / 200))} MIN READ`
      : `${String(selected.length).padStart(2, '0')} NOTES`;

    const cards = selected.length
      ? selected.map(post => {
        const date = new Date(`${post.date}T12:00:00Z`);
        const long = !postPage && post.words > config.collapseAfterWords;
        const linkedTitle = `<h2><a class="post-title-link" href="${post.id}.html">${escapeHtml(post.title)}</a></h2>`;
        const body = postPage
          ? post.contentHtml
          : post.html.match(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/i)
            ? post.html.replace(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/i, linkedTitle)
            : `${linkedTitle}\n${post.html}`;
        const postUrl = pageUrl(`${post.id}.html`);
        return `<article class="post" id="${post.id}"><div class="post-meta"><time datetime="${post.date}">Published ${date.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}</time><span>·</span><span>${Math.max(1, Math.ceil(post.words / 200))} min read</span><a class="permalink" href="${post.id}.html" aria-label="Read ${escapeHtml(post.title)}">↗</a></div><div class="post-body ${long ? 'collapsible' : ''}" id="body-${post.id}">${body}</div>${long ? `<button class="read-more" aria-expanded="false" aria-controls="body-${post.id}" hidden>Read more <span aria-hidden="true">↓</span></button>` : ''}<div class="post-foot"><span class="post-signature">${escapeHtml(config.initials)}</span><span>${escapeHtml(config.author)}</span><span class="post-category">a note from the margins</span><div class="post-actions"><button class="post-action copy-link" type="button" data-post-url="${escapeHtml(postUrl)}" aria-label="Copy link to ${escapeHtml(post.title)}"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M9 15l6-6m-4-3 1.4-1.4a4 4 0 0 1 5.7 5.7L16.5 12m-3.5 6-1.4 1.4a4 4 0 0 1-5.7-5.7L7.5 12"/></svg><span>Copy link</span></button><button class="post-action share-link" type="button" data-post-url="${escapeHtml(postUrl)}" data-post-title="${escapeHtml(post.title)}" aria-label="Share ${escapeHtml(post.title)}"><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5"/></svg><span>Share</span></button></div><span class="share-status" role="status" aria-live="polite"></span></div></article>`;
      }).join('')
      : '<div class="empty"><h2>A fresh page.</h2><p>Add your first Markdown post to the posts folder, then run the build.</p></div>';

    return `<!doctype html>
<html lang="${escapeHtml(language)}" data-theme="${escapeHtml(config.theme)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(pageTitle)}</title><meta name="description" content="${escapeHtml(pageDescription)}"><meta name="author" content="${escapeHtml(config.author)}"><meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"><meta name="color-scheme" content="light dark"><meta name="theme-color" content="#f5f6f8"><link rel="icon" href="assets/favicon.svg" type="image/svg+xml"><link rel="canonical" href="${escapeHtml(canonical)}"><link rel="alternate" type="application/rss+xml" title="${escapeHtml(config.title)} RSS feed" href="${escapeHtml(pageUrl('feed.xml'))}"><meta property="og:type" content="${postPage ? 'article' : 'website'}"><meta property="og:site_name" content="${escapeHtml(config.title)}"><meta property="og:title" content="${escapeHtml(pageTitle)}"><meta property="og:description" content="${escapeHtml(pageDescription)}"><meta property="og:url" content="${escapeHtml(canonical)}">${postPage ? `<meta property="article:published_time" content="${postPage.date}"><meta property="article:author" content="${escapeHtml(config.author)}">` : ''}<meta name="twitter:card" content="summary"><meta name="twitter:title" content="${escapeHtml(pageTitle)}"><meta name="twitter:description" content="${escapeHtml(pageDescription)}"><script type="application/ld+json">${safeJson(structuredData)}</script><link rel="preload" href="assets/fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="assets/style.css"><script src="assets/client.js" defer></script></head>
<body><a class="skip-link" href="#content">Skip to posts</a><div class="layout">
<aside class="sidebar"><a class="brand" href="index.html"><span class="brand-mark">m<span>·</span></span>${escapeHtml(config.title)}<span class="brand-dot">/</span></a><p class="tagline">${escapeHtml(config.description)}</p><a class="home-link ${home ? 'active' : ''}" href="index.html" ${home ? 'aria-current="page"' : ''}><span>◈</span> Latest notes <span class="count">${posts.filter(post => post.month === months[0]).length}</span></a><div class="archive-label">THE ARCHIVE <span>↓</span></div><nav aria-label="Monthly archives">${months.map(month => `<a class="archive-link ${!home && current === month ? 'active' : ''}" href="${month}.html" ${!home && current === month ? 'aria-current="page"' : ''}>${monthLabel(month)}<span class="count">${posts.filter(post => post.month === month).length}</span></a>`).join('')}</nav><div class="sidebar-bottom"><div class="small-label">MAKE YOURSELF AT HOME</div><label class="theme-label" for="theme">Appearance <select id="theme"><option value="paper" ${config.theme === 'paper' ? 'selected' : ''}>Paper</option><option value="night" ${config.theme === 'night' ? 'selected' : ''}>Night</option><option value="sage" ${config.theme === 'sage' ? 'selected' : ''}>Sage</option></select></label><p>A small corner of the internet.<br>Written in Markdown. Made to last.</p></div></aside>
<main id="content"><header class="page-header"><div><div class="eyebrow">${postPage ? 'A NOTE FROM THE MARGINS' : 'THE PERSONAL NOTEBOOK'}</div><h1>${escapeHtml(heading)}<span>↘</span></h1><p>${escapeHtml(headerDescription)}</p></div><span class="header-number">${headerStat}</span></header><section class="profile"><span class="avatar">${escapeHtml(config.initials)}</span><div><strong>${escapeHtml(config.author)}</strong><p>${escapeHtml(config.bio)}</p></div><span class="profile-badge"><i></i> A work in progress</span></section><section aria-label="Posts" class="feed">${cards}</section><footer class="page-footer"><span>YOU’RE ALL CAUGHT UP</span><span class="footer-flower">✳</span><p>A few thoughts, left here for you.</p><a href="#content">Back to top ↑</a></footer></main></div></body></html>`;
  };

  for (const name of await readdir(out)) {
    if (/^(?:\d{4}-\d{2}|\d{4}-\d{2}-\d{2}--[a-zA-Z0-9_-]+|index)\.html$/.test(name)) {
      await unlink(path.join(out, name));
    }
  }

  await writeFile(path.join(out, 'index.html'), render(posts.filter(post => post.month === months[0]), months[0], { home: true }));
  await Promise.all([
    ...months.map(month => writeFile(
      path.join(out, `${month}.html`),
      render(posts.filter(post => post.month === month), month)
    )),
    ...posts.map(post => writeFile(
      path.join(out, `${post.id}.html`),
      render([post], post.month, { postPage: post })
    ))
  ]);

  const sitemapEntries = [
    { location: siteUrl, modified: posts[0]?.date },
    ...months.map(month => ({
      location: pageUrl(`${month}.html`),
      modified: posts.find(post => post.month === month)?.date
    })),
    ...posts.map(post => ({ location: pageUrl(`${post.id}.html`), modified: post.date }))
  ];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapEntries.map(entry => `  <url><loc>${escapeXml(entry.location)}</loc>${entry.modified ? `<lastmod>${entry.modified}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`;

  const feedItems = posts.slice(0, 20).map(post => {
    const url = pageUrl(`${post.id}.html`);
    return `    <item>\n      <title>${escapeXml(post.title)}</title>\n      <link>${escapeXml(url)}</link>\n      <guid isPermaLink="true">${escapeXml(url)}</guid>\n      <pubDate>${new Date(`${post.date}T12:00:00Z`).toUTCString()}</pubDate>\n      <description>${escapeXml(post.description)}</description>\n    </item>`;
  }).join('\n');
  const feed = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n  <channel>\n    <title>${escapeXml(config.title)}</title>\n    <link>${escapeXml(siteUrl)}</link>\n    <description>${escapeXml(config.description)}</description>\n    <language>${escapeXml(language)}</language>\n    <atom:link href="${escapeXml(pageUrl('feed.xml'))}" rel="self" type="application/rss+xml"/>\n${feedItems}\n  </channel>\n</rss>\n`;
  const robots = `User-agent: *\nAllow: /\n\nSitemap: ${pageUrl('sitemap.xml')}\n`;

  await Promise.all([
    writeFile(path.join(out, 'sitemap.xml'), sitemap),
    writeFile(path.join(out, 'feed.xml'), feed),
    writeFile(path.join(out, 'robots.txt'), robots)
  ]);

  return { posts: posts.length, months: months.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  build()
    .then(result => console.log(`Built ${result.posts} posts across ${result.months} monthly archives → dist/`))
    .catch(error => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
