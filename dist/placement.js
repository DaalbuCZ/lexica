import {makeComment} from './comments.js?v=16';

export function placementPreview(machine,type,point){
 if(!type||!point)return null;
 return {type,item:type==='comment'?makeComment(machine,point,'placement-preview'):{id:'placement-preview',name:'q'+machine.states.length,token:'',x:point.x,y:point.y}};
}
