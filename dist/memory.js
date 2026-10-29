export const stackCell=cell=>cell?.type==='stack';
export const guardOps=cell=>stackCell(cell)?['empty','notEmpty','==','!=','>','>=','<','<=']:['==','!=','>','>=','<','<=','odd','even'];
export const effectOps=cell=>stackCell(cell)?['push','pop','clear']:['add','set'];
export const needsValue=op=>!['empty','notEmpty','odd','even','pop','clear'].includes(op);
export function validCell(cell){return (cell.type===undefined||['counter','stack'].includes(cell.type))&&(stackCell(cell)?Array.isArray(cell.initial??[])&&(cell.initial??[]).every(Number.isSafeInteger):Number.isSafeInteger(cell.initial??0))}
export function guardAllows(guard,value){
 if(!guard)return true;
 if(Array.isArray(value)){if(guard.op==='empty')return value.length===0;if(guard.op==='notEmpty')return value.length>0;if(!value.length)return false;value=value.at(-1)}
 switch(guard.op){case'==':return value===guard.value;case'!=':return value!==guard.value;case'>':return value>guard.value;case'>=':return value>=guard.value;case'<':return value<guard.value;case'<=':return value<=guard.value;case'odd':return Math.abs(value%2)===1;case'even':return value%2===0;default:return false}
}
export function memoryEffect(effect,value){switch(effect.op){case'push':return [...value,effect.value];case'pop':return value.slice(0,-1);case'clear':return [];case'set':return effect.value;case'add':return value+effect.value}}
export function memoryRuleLabel(rule){return rule.cell+' '+({add:'+=',set:':=',empty:'is empty',notEmpty:'is not empty'}[rule.op]??rule.op)+(needsValue(rule.op)?' '+rule.value:'')}
