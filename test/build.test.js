import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build, loadPosts } from '../scripts/build.js';

async function fixture(t) {
  const base = await mkdtemp(path.join(os.tmpdir(),'microblog-'));
  t.after(()=>rm(base,{recursive:true,force:true}));
  await mkdir(path.join(base,'posts'));
  await writeFile(path.join(base,'blog.config.json'),JSON.stringify({title:'Test <blog>',description:'Notes',siteUrl:'https://example.com/journal/',language:'en',author:'Me',initials:'ME',bio:'Writer',theme:'paper',collapseAfterWords:10}));
  return base;
}
test('groups months, sorts newest first, renders Markdown, and sanitizes HTML',async t=>{
  const base = await fixture(t);
  await writeFile(path.join(base,'posts/2026-10-01--first.md'),'# Hello\n\n**Strong** [unsafe](javascript:alert%281%29)\n\n<script>alert(1)</script>');
  await writeFile(path.join(base,'posts/2026-10-25--second.md'),'Newest');
  await writeFile(path.join(base,'posts/2026-09-30--older.md'),'Older');
  assert.deepEqual(await build({base}),{posts:3,months:2});
  const html = await readFile(path.join(base,'dist/2026-10.html'),'utf8');
  assert.ok(html.includes('<h2><a class="post-title-link" href="2026-10-01--first.html">Hello</a></h2>'));
  assert.ok(html.includes('<strong>Strong</strong>'));
  assert.ok(!html.includes('javascript:'));
  assert.ok(!html.includes('<script>alert'));
  assert.ok(html.indexOf('id="2026-10-25--second"')<html.indexOf('id="2026-10-01--first"'));
  assert.ok(html.includes('href="2026-09.html"'));
  assert.ok(html.includes('Test &lt;blog&gt;'));
  assert.ok(html.includes('rel="canonical" href="https://example.com/journal/2026-10.html"'));
  assert.ok(html.includes('application/ld+json'));
  assert.ok(html.includes('href="2026-10-25--second.html"'));
  const home = await readFile(path.join(base,'dist/index.html'),'utf8');
  assert.ok(!home.includes('id="2026-09-30--older"'));
  assert.ok(home.includes('property="og:title"'));
  const post = await readFile(path.join(base,'dist/2026-10-01--first.html'),'utf8');
  assert.ok(post.includes('<title>Hello · Test &lt;blog&gt;</title>'));
  assert.ok(post.includes('"@type":"BlogPosting"'));
  assert.equal((post.match(/<h1>/g) || []).length,1);
  assert.ok(!post.includes('<h1>Hello</h1>'));
  const sitemap = await readFile(path.join(base,'dist/sitemap.xml'),'utf8');
  assert.ok(sitemap.includes('<loc>https://example.com/journal/2026-10-01--first.html</loc>'));
  assert.ok((await readFile(path.join(base,'dist/robots.txt'),'utf8')).includes('Sitemap: https://example.com/journal/sitemap.xml'));
  assert.ok((await readFile(path.join(base,'dist/feed.xml'),'utf8')).includes('<title>Hello</title>'));
});
test('rejects invalid filenames and impossible calendar dates',async t=>{
  const base = await fixture(t);
  const file = path.join(base,'posts/invalid.md');
  await writeFile(file,'Note');
  await assert.rejects(loadPosts(path.join(base,'posts')),/Invalid post filename/);
  await rm(file);
  await writeFile(path.join(base,'posts/2026-02-30--invalid.md'),'Note');
  await assert.rejects(loadPosts(path.join(base,'posts')),/Invalid date/);
});
test('long posts have accessible expansion controls and full static content',async t=>{
  const base = await fixture(t);
  await writeFile(path.join(base,'posts/2026-10-01--long.md'),'A word '.repeat(40)+'THE END');
  await build({base});
  const html = await readFile(path.join(base,'dist/index.html'),'utf8');
  assert.ok(html.includes('aria-expanded="false"'));
  assert.ok(html.includes('aria-controls="body-2026-10-01--long"'));
  assert.ok(html.includes('THE END'));
  assert.ok(!html.includes('class="post-body is-collapsed"'));
});
test('empty blogs build and deleted posts remove obsolete archives',async t=>{
  const base = await fixture(t);
  await writeFile(path.join(base,'posts/2026-10-01--note.md'),'Note');
  await build({base});
  await rm(path.join(base,'posts/2026-10-01--note.md'));
  assert.deepEqual(await build({base}),{posts:0,months:0});
  assert.ok(!(await readdir(path.join(base,'dist'))).includes('2026-10.html'));
  assert.ok((await readFile(path.join(base,'dist/index.html'),'utf8')).includes('A fresh page.'));
});

test('requires an absolute HTTP site URL for SEO output',async t=>{
  const base = await fixture(t);
  const configPath = path.join(base,'blog.config.json');
  const config = JSON.parse(await readFile(configPath,'utf8'));
  config.siteUrl = 'relative/path';
  await writeFile(configPath,JSON.stringify(config));
  await assert.rejects(build({base}),/Invalid URL|absolute HTTP/);
});
