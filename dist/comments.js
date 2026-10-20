export function commentLayout(comment){
 const lines=[];
 for(const paragraph of comment.text.split('\n')){
  if(!paragraph){lines.push('');continue}
  let rest=paragraph;
  while(rest.length>40){let cut=rest.lastIndexOf(' ',40);if(cut<1)cut=40;lines.push(rest.slice(0,cut));rest=rest.slice(cut).trimStart()}
  lines.push(rest);
 }
 return {lines,w:Math.max(110,Math.max(...lines.map(x=>x.length))*6.7+24),h:Math.max(42,lines.length*17+20)};
}
