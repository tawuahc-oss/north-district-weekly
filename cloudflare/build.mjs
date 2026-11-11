import {mkdir,copyFile,readFile,writeFile} from 'node:fs/promises';
import {Script} from 'node:vm';
const root=new URL('./',import.meta.url);
await mkdir(new URL('public/vendor/',root),{recursive:true});
const html=await readFile(new URL('index.html',root),'utf8');
for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new Script(match[1]);
for(const name of ['index.html','manifest.webmanifest','weekly-icon-48.png','weekly-icon-180.png','vendor/Sortable.min.js'])await copyFile(new URL(name,root),new URL('public/'+name,root));
await writeFile(new URL('public/_headers',root),`/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'
/
  Cache-Control: no-cache
/index.html
  Cache-Control: no-cache
`);
console.log('Weekly public assets built; inline JavaScript syntax checked.');
