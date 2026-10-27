import {SPRING_DEFAULTS,springSettings} from './spring-settings.js';
export function setupSpringControls(){
 const $=id=>document.getElementById(id),keys=Object.keys(SPRING_DEFAULTS);
 let saved;try{saved=JSON.parse(localStorage.getItem('lexica-spring-forces'))}catch{}
 const read=()=>springSettings(Object.fromEntries(keys.map(key=>[key,Number($('spring-'+key).value)])));
 const outputs=()=>{for(const key of keys)$('spring-'+key+'-value').textContent=$('spring-'+key).value};
 function set(value){for(const key of keys)$('spring-'+key).value=String(value[key]);outputs()}
 function save(){try{localStorage.setItem('lexica-spring-forces',JSON.stringify(read()))}catch{}}
 function visibility(){
  $('spring-forces').hidden=$('layout-mode').value!=='spring';const menu=$('layout-menu');
  if(menu.matches(':popover-open')){const box=menu.getBoundingClientRect();if(box.bottom>window.innerHeight-12)menu.style.top=Math.max(12,window.innerHeight-box.height-12)+'px'}
 }
 set(springSettings(saved));for(const key of keys){$('spring-'+key).oninput=outputs;$('spring-'+key).onchange=save}
 $('spring-reset').onclick=()=>{set(SPRING_DEFAULTS);save()};$('layout-mode').addEventListener('change',visibility);visibility();
 return {read};
}
