export const SPRING_DEFAULTS={center:.12,repel:5,link:.4,distance:320};
export const SPRING_LIMITS={center:[0,1],repel:[0,20],link:[0,1],distance:[40,800]};
export function springSettings(value={}){
 return Object.fromEntries(Object.entries(SPRING_DEFAULTS).map(([key,fallback])=>{const [min,max]=SPRING_LIMITS[key],n=value?.[key];return [key,Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback]}));
}
