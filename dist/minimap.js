export function setupMinimap(map,{getMachine,routeEdges,commentLayout}){
 let bounds=null,viewport=null,lastBox='',lastView='';
 function update(view){
  if(!viewport){rebuild(view);return}
  const left=bounds?.left??view.x+view.width/2,right=bounds?.right??left,top=bounds?.top??view.y+view.height/2,bottom=bounds?.bottom??top;
  let x=Math.min(left,view.x)-100,y=Math.min(top,view.y)-120,width=Math.max(right,view.x+view.width)-x+100,height=Math.max(bottom,view.y+view.height)-y+100;
  const ratio=170/106;if(width/height<ratio){const next=height*ratio;x-=(next-width)/2;width=next}else{const next=width/ratio;y-=(next-height)/2;height=next}
  const box=`${x} ${y} ${width} ${height}`,value=`${view.x} ${view.y} ${view.width} ${view.height}`;
  if(box!==lastBox){map.setAttribute('viewBox',box);lastBox=box}
  if(value!==lastView){for(const key of ['x','y','width','height'])viewport.setAttribute(key,view[key]);lastView=value}
 }
 function rebuild(view){
  const machine=getMachine();bounds=null;
  function include(x,y){if(!bounds)bounds={left:x,right:x,top:y,bottom:y};else{bounds.left=Math.min(bounds.left,x);bounds.right=Math.max(bounds.right,x);bounds.top=Math.min(bounds.top,y);bounds.bottom=Math.max(bounds.bottom,y)}}
  for(const state of machine.states)include(state.x,state.y);
  const comments=(machine.comments??[]).map(comment=>{const size=commentLayout(comment);include(comment.x,comment.y);include(comment.x+size.w,comment.y+size.h);return `<rect class="map-comment" x="${comment.x}" y="${comment.y}" width="${size.w}" height="${size.h}"/>`}).join('');
  map.innerHTML=comments+routeEdges(machine).map(route=>`<path d="${route.d}"/>`).join('')+machine.states.map(state=>`<circle cx="${state.x}" cy="${state.y}" r="24"/>`).join('')+'<rect class="map-viewport"/>';
  viewport=map.querySelector('.map-viewport');lastBox='';lastView='';update(view);
 }
 return {rebuild,update};
}
