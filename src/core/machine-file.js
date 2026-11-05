import { convertLegacyStack } from './legacy-stack.js';
import { validate } from './lexer.js';
import { isStackMachine, stackDefinition } from './memory.js';

export const MACHINE_FILE_VERSION = 2;
// Keep graph records intact: layout, portals, annotations and future record fields belong together.
const graphFields = [
  'start',
  'states',
  'edges',
  'groups',
  'comments',
  'startViews',
  'labelBoxes',
  'routingPolicy',
  'drawingRoutes',
];
export function machineDocument(machine) {
  machine = decodeMachineDocument(machine);
  validate(machine);
  const document = {
    format: 'lexica',
    version: MACHINE_FILE_VERSION,
    type: isStackMachine(machine) ? 'stack' : 'standard',
    ...Object.fromEntries(
      graphFields
        .filter((key) => machine[key] !== undefined)
        .map((key) => [key, structuredClone(machine[key])]),
    ),
    tester: structuredClone(machine.tester ?? { input: '', showSkipped: false }),
  };
  if (machine.stack || isStackMachine(machine))
    document.stack = structuredClone(stackDefinition(machine));
  return document;
}
export function serializeMachine(machine) {
  return JSON.stringify(machineDocument(machine), null, 2);
}
export function decodeMachineDocument(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw Error('Invalid machine document.');
  if (data.format === undefined && data.version === undefined) {
    if (
      data.cells?.length ||
      data.edges?.some(
        (edge) => edge.guard || edge.guards?.length || edge.effect || edge.effects?.length,
      )
    )
      return convertLegacyStack(data);
    return data;
  }
  if (data.format !== 'lexica') throw Error('Not a Lexica machine document.');
  if (data.version !== MACHINE_FILE_VERSION)
    throw Error('Unsupported Lexica file version: ' + data.version);
  if (!['standard', 'stack'].includes(data.type))
    throw Error('Choose a standard or stack automaton type.');
  if (!data.tester || typeof data.tester.input !== 'string')
    throw Error('A saved machine needs lexer tester input.');
  if (data.type === 'stack' && !data.stack)
    throw Error('A stack automaton needs its stack alphabet and initial symbol.');
  return {
    ...Object.fromEntries(
      graphFields.filter((key) => data[key] !== undefined).map((key) => [key, data[key]]),
    ),
    machineType: data.type === 'stack' ? 'extended' : 'fsm',
    ...(data.stack ? { stack: data.stack } : {}),
    tester: data.tester,
  };
}
