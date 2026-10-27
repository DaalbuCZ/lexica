export function machineWithTester(machine,input,showSkipped){
 return {...machine,tester:{input:input.value,showSkipped:showSkipped.checked}};
}
export function restoreTester(machine,input,showSkipped){
 if(!machine.tester)return;
 input.value=machine.tester.input;showSkipped.checked=machine.tester.showSkipped??false;
}
