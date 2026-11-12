import {mkdir,copyFile,cp,readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url),out=new URL('pages-dist/',root);
await mkdir(out,{recursive:true});
// Explicit allowlist: never upload Cloudflare source, credentials, tests or private backups.
await copyFile(new URL('index.html',root),new URL('index.html',out));
await cp(new URL('calendar-backup/',root),new URL('calendar-backup/',out),{recursive:true});
await copyFile(new URL('weekly-icon-48.png',root),new URL('weekly-icon-48.png',out));
console.log('Pages package contains weekly redirect and public calendar backup only.');
