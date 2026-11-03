import {Graph} from '@khalidsaidi/topoloom/graph';
import {testPlanarity} from '@khalidsaidi/topoloom/planarity';

function faces(order){
 const seen=new Set(),result=[];
 for(let u=0;u<order.length;u++)for(const v of order[u]){
  if(seen.has(`${u}:${v}`))continue;const face=[];let a=u,b=v;
  do{const key=`${a}:${b}`;if(seen.has(key))throw Error('Invalid face traversal');seen.add(key);face.push(a);const ring=order[b],next=ring[(ring.indexOf(a)+ring.length-1)%ring.length];a=b;b=next}while(a!==u||b!==v);
  result.push(face);
 }
 return result;
}

// Canonical ordering followed by the de Fraysseix–Pach–Pollack shift method.
// Work on an augmented graph only: auxiliary triangulation edges are discarded.
// The result is an integer grid drawing, without a floating-point force solve.
export function planarGrid(input,embedding,preferred=0){
 const n=input.vertexCount();if(n<4)return new Map(Array.from({length:n},(_,i)=>[i,[{x:0,y:0},{x:2,y:0},{x:1,y:1}][i]]));
 let graph=input,result=embedding,order,faceList;
 while(true){
  order=result.embedding.order.map(ring=>ring.map(e=>e.to));faceList=faces(order);
  let diagonal=null;
  for(const face of faceList){if(face.length===3)continue;
   for(let offset=2;offset<face.length&&!diagonal;offset++)for(let i=0;i<face.length;i++){const a=face[i],b=face[(i+offset)%face.length];if(a!==b&&!order[a].includes(b)){diagonal=[a,b];break}}
   if(diagonal)break;
  }
  if(!diagonal)break;
  const json=graph.toJSON();json.edges.push({u:diagonal[0],v:diagonal[1],directed:false});graph=Graph.fromJSON(json);result=testPlanarity(graph,{backend:'wasm'});
  if(!result.planar)throw Error('Triangulation must preserve planarity');
 }
 const outer=faceList.find(face=>face.length===3&&face.includes(preferred))??faceList.find(face=>face.length===3);
 if(!outer||graph.edgeCount()!==3*n-6)throw Error('Incomplete triangulation');
 const v1=outer.includes(preferred)?preferred:outer[0],index=outer.indexOf(v1),v2=outer[(index+1)%3],vn=outer[(index+2)%3];
 let boundary=[v1,vn,v2];const remaining=new Set(graph.vertices()),removed=[];
 while(remaining.size>2){
  const onBoundary=new Set(boundary);let pick=-1;
  for(let i=1;i<boundary.length-1;i++)if(order[boundary[i]].filter(v=>remaining.has(v)&&onBoundary.has(v)).length===2){pick=i;break}
  if(pick<0)throw Error('No canonical boundary vertex');
  const v=boundary[pick],left=boundary[pick-1],right=boundary[pick+1],ring=order[v].filter(u=>remaining.has(u)),start=ring.indexOf(left);
  const arc=direction=>{const path=[left];let cursor=start;while(path.at(-1)!==right){cursor=(cursor+direction+ring.length)%ring.length;path.push(ring[cursor]);if(path.length>ring.length)throw Error('Invalid boundary arc')}return path};
  const a=arc(1),b=arc(-1),path=a.length>b.length?a:b;
  removed.push({v,path});boundary.splice(pick,1,...path.slice(1,-1));remaining.delete(v);
 }
 const canonical=removed.reverse(),v3=canonical[0].v,positions=new Map([[v1,{x:0,y:0}],[v2,{x:2,y:0}],[v3,{x:1,y:1}]]),shift=new Map([[v1,new Set([v1])],[v2,new Set([v2])],[v3,new Set([v3])]]);
 boundary=[v1,v3,v2];
 for(const {v,path} of canonical.slice(1)){
  const p=boundary.indexOf(path[0]),q=boundary.indexOf(path.at(-1));if(p<0||q<=p)throw Error('Invalid canonical contour');
  for(let i=p+1;i<boundary.length;i++)for(const id of shift.get(boundary[i]))positions.get(id).x++;
  for(let i=q;i<boundary.length;i++)for(const id of shift.get(boundary[i]))positions.get(id).x++;
  const left=positions.get(boundary[p]),right=positions.get(boundary[q]);positions.set(v,{x:(left.x+right.x+right.y-left.y)/2,y:(right.x-left.x+left.y+right.y)/2});
  const absorbed=new Set([v]);for(let i=p+1;i<q;i++)for(const id of shift.get(boundary[i]))absorbed.add(id);shift.set(v,absorbed);boundary.splice(p+1,q-p-1,v);
 }
 return positions;
}
