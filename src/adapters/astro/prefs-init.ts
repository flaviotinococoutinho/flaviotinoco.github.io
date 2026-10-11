/**
 * Pre-paint preference application (imperative shell, runs in <head>).
 *
 * Reads the reader's stored preferences and sets data-* attributes on <html>
 * BEFORE first paint, so there is no flash of the wrong theme. It must be an
 * inline classic script; its SHA-256 is registered with the CSP by BaseLayout.
 * Keep it tiny, dependency-free and total (every failure path is a no-op).
 *
 * Also sets data-daypart (dawn | day | dusk | night) from the local clock:
 * only decorative layers react to it (ambient hero), never text colours.
 */
import { createHash } from 'node:crypto';

export const PREFS_STORAGE_KEY = 'ft:prefs';

export const PREFS_KEYS = ['theme', 'contrast', 'motion', 'hyphens', 'texture', 'text', 'face'] as const;

export const PREFS_INIT_SCRIPT = `(()=>{var d=document.documentElement,k=${JSON.stringify(PREFS_KEYS)};try{var p=JSON.parse(localStorage.getItem(${JSON.stringify(PREFS_STORAGE_KEY)})||"{}");for(var i=0;i<k.length;i++){var v=p[k[i]];if(typeof v==="string"&&/^[a-z-]{1,16}$/.test(v)&&v!=="auto")d.setAttribute("data-"+k[i],v)}}catch(e){}var h=new Date().getHours();d.setAttribute("data-daypart",h<6?"night":h<10?"dawn":h<17?"day":h<21?"dusk":"night");d.setAttribute("data-js","")})();`;

export const PREFS_INIT_HASH = `sha256-${createHash('sha256').update(PREFS_INIT_SCRIPT).digest('base64')}` as const;
