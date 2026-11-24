/* Kept outside the "use client" Motion module: a constant exported from a client module is not readable in a server layout. */
/**
 * Runs before first paint: turns motion on (not with reduced motion), and on the first home visit of a session also the preloader.
 * If the app never boots, both are switched off again after 4 s, so content can never stay hidden. A hidden tab gets no preloader.
 */
export const MOTION_BOOT =
  "(function(){try{if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;var d=document.documentElement;d.classList.add('motion');try{if(location.pathname==='/'&&!document.hidden&&!sessionStorage.getItem('gp1.pre')){d.classList.add('pre-on')}}catch(e){}setTimeout(function(){if(!window.__gpMotion){d.classList.remove('motion');d.classList.remove('pre-on')}},4000)}catch(e){}})();";
