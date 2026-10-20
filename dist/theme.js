(()=>{
 const media=matchMedia('(prefers-color-scheme: dark)');let preference=null;
 try{const saved=localStorage.getItem('lexica-theme');if(saved==='light'||saved==='dark')preference=saved}catch{}
 function apply(){
  const dark=preference?preference==='dark':media.matches;document.documentElement.dataset.theme=dark?'dark':'light';
  const button=document.getElementById('theme-toggle');if(button){button.setAttribute('aria-pressed',String(dark));button.setAttribute('aria-label',dark?'Switch to light mode':'Switch to dark mode');button.title=dark?'Switch to light mode':'Switch to dark mode'}
 }
 apply();media.addEventListener('change',()=>{if(!preference)apply()});
 document.addEventListener('DOMContentLoaded',()=>{apply();document.getElementById('theme-toggle').onclick=()=>{preference=document.documentElement.dataset.theme==='dark'?'light':'dark';try{localStorage.setItem('lexica-theme',preference)}catch{}apply()}});
})();
