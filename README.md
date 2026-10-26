# Margin · Markdown microblog

A small, readable blog built from Markdown. Node.js generates standalone HTML pages for every month, with a monthly archive sidebar, expandable long posts, and three themes. No database or browser framework is required.

## Generate the site

Requires Node.js 20 or newer.

```sh
npm install
npm start
```

`npm start` generates the complete static site in `dist/`. Open `dist/index.html` directly in a browser to preview it; no server is needed. Run the command again after editing posts.

```sh
npm run build  # Generate dist/
npm test       # Verify the generator
```

## Write a post

Add a UTF-8 Markdown file directly inside `posts/` using this filename format:

```text
YYYY-MM-DD--file-name.md
```

For example, `2026-10-26--my-first-note.md`:

```md
## A good day to begin

A short thought with **emphasis**, a [link](https://example.com),
and room to write something longer.
```

The date must be a real calendar date. Slugs can contain letters, numbers, underscores, and hyphens. Invalid filenames stop the build with a helpful error. Posts are ordered newest first; posts on the same day use descending filename order. All dated posts are published, including future dates.

Headings are optional. Standard Markdown, fenced code, tables, lists, links, images, and blockquotes are supported. HTML is sanitized before publishing. Image URLs must be accessible from the published site; remote HTTPS URLs are simplest. Front matter is not used.

The homepage shows the most recent month. Each month also gets a page such as `2026-10.html`. Every post has a permanent link to its monthly page and an anchor derived from its filename. Keep filenames stable to preserve links.

## Customize

Edit `blog.config.json` to set the site title, description, author, initials, biography, default theme, and the word count that enables “Read more.” Long posts are visually collapsed to 250 pixels when JavaScript is available; without JavaScript their full content remains visible. Opening a post's permanent link expands it automatically.

Choose **Paper**, **Night**, or **Sage** in the sidebar. The choice is saved in the visitor's browser when storage is available. Themes use CSS variables at the top of `src/style.css`; adjust those tokens to change colors throughout the site. The Inter variable font is copied into `dist/assets/fonts/` during each build, so published pages do not rely on an external font service. Layout and Markdown typography are also in that file. `src/client.js` handles appearance and expansion; `scripts/build.js` owns the HTML template and archive generation.

## Publish

Run `npm run build` and publish the contents of `dist/` to GitHub Pages. Links and assets use relative paths, so the blog also works when the repository is published under a project subdirectory. Deploy the entire generated directory each time so removed archive pages disappear from your Pages site.

Example posts are included to demonstrate the layout. Replace them with your own before publishing.
