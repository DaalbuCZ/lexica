export function stateLabel(name){
 const words=name.trim().split(/\s+/),lines=[];let line='';
 for(const word of words){if(line&&line.length+word.length+1>10){lines.push(line);line=word}else line+=(line?' ':'')+word}
 lines.push(line);
 const fontSize=Math.min(12,44/lines.length),lineHeight=fontSize*1.1;
 return {lines,fontSize,lineHeight,y:fontSize/3-(lines.length-1)*lineHeight/2,width:lines.length>1?52:60};
}

export function transitionLabel(edge){const label=edge.invert?'not ('+edge.label+')':edge.label,r=edge.memory;if(!r)return label;const guard=r.guard?`${r.counter} ${({eq:'=',ne:'≠',lt:'<',lte:'≤',gt:'>',gte:'≥'})[r.guard.op]} ${r.guard.value}`:'',effect=r.effect?`${r.counter}${r.effect==='increment'?'++':'--'}`:'';return label+' ['+[guard,effect].filter(Boolean).join(' / ')+']'}
