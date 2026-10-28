export function createDebouncedTask(callback,{delay=120,setTimer=setTimeout,clearTimer=clearTimeout}={}){
 let timer=null;
 function cancel(){if(timer!==null){clearTimer(timer);timer=null}}
 function run(){timer=null;callback()}
 function schedule(){cancel();timer=setTimer(run,typeof delay==='function'?delay():delay)}
 function flush(){if(timer===null)return;cancel();callback()}
 return {schedule,cancel,flush,pending:()=>timer!==null};
}
