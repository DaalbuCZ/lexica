// Bounds count Unicode characters consumed, rather than UTF-16 code units.
export function characterBounds(source) {
 let i=0;
 function expression(){const alternatives=[sequence()];while(source[i]==='|'){i++;alternatives.push(sequence())}return {min:Math.min(...alternatives.map(x=>x.min)),max:Math.max(...alternatives.map(x=>x.max))}}
 function sequence(){let min=0,max=0;while(i<source.length&&source[i]!==')'&&source[i]!=='|'){let atom=readAtom();const q=source[i];if(q==='*'||q==='?'||q==='+'){i++;atom={min:q==='+'?atom.min:0,max:q==='?'?atom.max:Infinity}}else if(q==='{'){const m=source.slice(i).match(/^\{(\d+)(?:,(\d*))?\}/);if(m){i+=m[0].length;atom={min:atom.min*Number(m[1]),max:atom.max*(m[2]===undefined?Number(m[1]):m[2]===''?Infinity:Number(m[2]))}}}if(source[i]==='?')i++;min+=atom.min;max+=atom.max}return {min,max}}
 function readAtom(){const c=source[i++];if(c==='^'||c==='$')return {min:0,max:0};if(c==='['){while(i<source.length){const n=source[i++];if(n==='\\')i++;else if(n===']')break}return {min:1,max:1}}if(c==='\\'){const n=source[i++];if(n==='b'||n==='B')return {min:0,max:0};if(/[1-9k]/.test(n??'')){if(n==='k'&&source[i]==='<'){while(i<source.length&&source[i++]!=='>'){}}return {min:0,max:Infinity}}if((n==='p'||n==='P'||n==='u')&&source[i]==='{'){while(i<source.length&&source[i++]!=='}'){}}else if(n==='u'){const high=parseInt(source.slice(i,i+4),16);i+=4;if(high>=0xd800&&high<=0xdbff&&source.slice(i,i+2)==='\\u'){const low=parseInt(source.slice(i+2,i+6),16);if(low>=0xdc00&&low<=0xdfff)i+=6}}else if(n==='x')i+=2;else if(n==='c')i++;return {min:1,max:1}}if(c==='('){let assertion=false;if(source[i]==='?'){i++;if(source[i]===':')i++;else if(source[i]==='='||source[i]==='!'){assertion=true;i++}else if(source[i]==='<'){i++;if(source[i]==='='||source[i]==='!'){assertion=true;i++}else while(i<source.length&&source[i++]!=='>'){}}}const inner=expression();if(source[i]===')')i++;return assertion?{min:0,max:0}:inner}if(c&&c.charCodeAt(0)>=0xd800&&c.charCodeAt(0)<=0xdbff&&source.charCodeAt(i)>=0xdc00&&source.charCodeAt(i)<=0xdfff)i++;return {min:1,max:1}}
 return expression();
}

export function singleCharacterError(source,inverted=false){
 if(inverted)return '';
 const bounds=characterBounds(source);
 return bounds.min>1||bounds.max<1?'This expression cannot match one character. Use a character set such as [abc], or connect several transitions.':'';
}
