export function placeInspector(anchor,size,viewport,{margin=12,gap=16}={}){
 const left=(viewport.left??0)+margin,top=(viewport.top??0)+margin,right=(viewport.left??0)+viewport.width-margin,bottom=(viewport.top??0)+viewport.height-margin;
 const clamp=(value,min,max)=>Math.max(min,Math.min(value,Math.max(min,max)));
 if(anchor.placement==='bottom-end')return {x:clamp(anchor.x-size.width,left,right-size.width),y:clamp(anchor.y+8,top,bottom-size.height)};
 // Flip beside the anchor before shifting to an edge. Retaining this anchor
 // lets a panel return to its preferred position when its content shrinks.
 const x=anchor.x+gap+size.width<=right?anchor.x+gap:anchor.x-gap-size.width>=left?anchor.x-gap-size.width:clamp(anchor.x+gap,left,right-size.width);
 const preferredY=anchor.y-15,y=preferredY+size.height<=bottom?preferredY:anchor.y+15-size.height>=top?anchor.y+15-size.height:clamp(preferredY,top,bottom-size.height);
 return {x:clamp(x,left,right-size.width),y:clamp(y,top,bottom-size.height)};
}
