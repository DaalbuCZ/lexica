export function errorSpans(tokens){
 const spans=[];
 for(const token of tokens){if(token.token!=='ERROR')continue;const end=token.offset+token.value.length,last=spans.at(-1);if(last?.end===token.offset)last.end=end;else spans.push({start:token.offset,end})}
 return spans;
}

export function underlineSegments(rectangles,bounds){
 return rectangles.filter(rect=>rect.right>rect.left&&rect.bottom>=bounds.top&&rect.top<=bounds.bottom).map(rect=>({
  left:rect.left-bounds.left,top:rect.bottom-bounds.top-1,width:rect.right-rect.left,phase:-((rect.left-bounds.left)%6)
 }));
}
