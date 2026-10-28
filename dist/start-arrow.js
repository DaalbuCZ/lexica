export function startArrowGeometry(machine,preview){
 const state=machine.states.find(s=>s.id===machine.start),fallback=state??machine.states[0];
 const origin=machine.startArrow??{x:(fallback?.x??140)-100,y:fallback?.y??150};
 const end=preview??state??{x:origin.x+65,y:origin.y},dx=end.x-origin.x,dy=end.y-origin.y,length=Math.hypot(dx,dy)||1;
 const target=preview||!state?{x:end.x,y:end.y}:{x:end.x-dx/length*42,y:end.y-dy/length*42};
 return {origin,target,d:`M ${origin.x} ${origin.y} L ${target.x} ${target.y}`};
}
