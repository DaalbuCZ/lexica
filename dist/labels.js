export function stateLabel(name){
 const words=name.trim().split(/\s+/),lines=[];let line='';
 for(const word of words){if(line&&line.length+word.length+1>10){lines.push(line);line=word}else line+=(line?' ':'')+word}
 lines.push(line);
 const fontSize=Math.min(12,44/lines.length),lineHeight=fontSize*1.1;
 return {lines,fontSize,lineHeight,y:fontSize/3-(lines.length-1)*lineHeight/2,width:lines.length>1?52:60};
}

export function transitionLabel(edge){let label=edge.invert?'not ('+edge.label+')':edge.label;if(edge.guard)label+=' ['+edge.guard.cell+' '+edge.guard.op+' '+edge.guard.value+']';if(edge.effect)label+=' / '+edge.effect.cell+(edge.effect.op==='add'?' += ':' := ')+edge.effect.value;return label}
