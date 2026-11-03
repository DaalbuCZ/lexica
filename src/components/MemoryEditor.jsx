import { Button } from './ui.jsx';
import { useState } from 'react';
import { useStudio } from '../state/studio.js';
import {
  stackCell,
  guardOps,
  effectOps,
  needsValue,
  copyConditions,
  pasteConditions,
} from '../core/memory.js';
import { Check, Field, Select } from './ui.jsx';
const labels = {
  '==': 'equals',
  '!=': 'not equal',
  '>': 'greater than',
  '>=': 'at least',
  '<': 'less than',
  '<=': 'at most',
  odd: 'is odd',
  even: 'is even',
  empty: 'Stack is empty',
  notEmpty: 'Stack is not empty',
  add: '+= add',
  set: ':= set',
  push: 'Push value',
  pop: 'Pop top',
  clear: 'Clear stack',
};
let conditionClipboard = '';
export function MemoryCells() {
  const machine = useStudio((s) => s.scene.machine),
    controller = useStudio((s) => s.controller);
  const cells = machine.cells ?? [];
  const edit = (change) => controller.update(change);
  const rename = (index, name) =>
    edit((next) => {
      name = name.trim();
      if (
        !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ||
        cells.some((c, i) => i !== index && c.name === name)
      )
        throw Error('Use a unique cell name starting with a letter or underscore.');
      const old = next.cells[index].name;
      next.cells[index].name = name;
      for (const edge of next.edges)
        for (const rule of [
          edge.guard,
          edge.effect,
          ...(edge.guards ?? []),
          ...(edge.effects ?? []),
        ])
          if (rule?.cell === old) rule.cell = name;
    });
  const remove = (index) =>
    edit((next) => {
      const name = next.cells[index].name;
      for (const edge of next.edges)
        for (const kind of ['guard', 'effect']) {
          const list = kind === 'guard' ? 'guards' : 'effects',
            disabled = kind + 'Disabled';
          const uses = edge[kind]?.cell === name || edge[list]?.some((rule) => rule.cell === name);
          if (uses && !edge[disabled])
            throw Error('Remove this cell from transition guards and side effects first.');
          if (edge[disabled]) {
            if (edge[kind]?.cell === name) delete edge[kind];
            if (edge[list]) {
              edge[list] = edge[list].filter((rule) => rule.cell !== name);
              if (!edge[list].length) delete edge[list];
            }
            if (!edge[kind] && !edge[list]?.length) {
              delete edge[disabled];
              if (kind === 'guard') delete edge.guardMode;
            }
          }
        }
      next.cells.splice(index, 1);
    });
  return (
    <>
      <h2 className="property-name">Memory cells</h2>
      <p className="prop-note">
        Stack values are ordered bottom to top. Existing counters are retained for compatibility.
      </p>
      {cells.map((cell, index) => (
        <div key={index} className="memory-cell">
          <Field
            label="Name"
            value={cell.name}
            spellCheck={false}
            onCommit={(name) => rename(index, name)}
          />
          <Field
            label={stackCell(cell) ? 'Initial stack' : 'Initial value'}
            value={stackCell(cell) ? JSON.stringify(cell.initial ?? []) : (cell.initial ?? 0)}
            onCommit={(text) =>
              edit((next) => {
                const value = stackCell(cell) ? JSON.parse(text) : Number(text);
                if (
                  stackCell(cell)
                    ? !Array.isArray(value) || !value.every(Number.isSafeInteger)
                    : !Number.isSafeInteger(value)
                )
                  throw Error(
                    'Use safe integers; a stack starts with a numeric array, such as [1, 2].',
                  );
                next.cells[index].initial = value;
              })
            }
          />
          <Button className="danger" onClick={() => remove(index)}>
            Delete cell
          </Button>
        </div>
      ))}
      <Button
        data-add-stack
        onClick={() =>
          edit((next) => {
            let name = 'stack',
              n = 2;
            while (cells.some((c) => c.name === name)) name = 'stack' + n++;
            (next.cells ??= []).push({
              name,
              type: 'stack',
              initial: [],
            });
          })
        }
      >
        ＋ Add stack
      </Button>
    </>
  );
}
export function MemoryRules({ edge, index, edit, machine }) {
  const [open, setOpen] = useState(
    !!(edge.guard || edge.guards?.length || edge.effect || edge.effects?.length),
  );
  const cells = machine.cells ?? [];
  const notify = useStudio((s) => s.notify);
  const copy = async () => {
    conditionClipboard = copyConditions(edge);
    try {
      await navigator.clipboard.writeText(conditionClipboard);
      notify('Conditions copied.');
    } catch {
      notify('Conditions copied inside this editor.');
    }
  };
  const paste = async () => {
    let text = conditionClipboard;
    try {
      text = await navigator.clipboard.readText();
    } catch {}
    const state = useStudio.getState();
    if (state.scene.selection.type !== 'edge' || state.scene.selection.index !== index) {
      notify('Select the transition again and paste.');
      return;
    }
    state.controller.update((next) => pasteConditions(next.edges[index], text));
  };
  return (
    <details
      id="memory-rules"
      className="simple-memory"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>Memory rules</summary>
      <div className="simple-memory-content">
        {['guard', 'effect'].map((kind) => {
          const list = kind === 'guard' ? 'guards' : 'effects',
            disabled = kind + 'Disabled';
          const exists = !!(edge[kind] || edge[list]?.length),
            enabled = exists && !edge[disabled];
          const firstStack = cells.find(stackCell);
          const add = () =>
            edit((e) => {
              (e[list] ??= []).push({
                cell: firstStack.name,
                op: kind === 'guard' ? 'empty' : 'push',
                ...(kind === 'effect'
                  ? {
                      value: 1,
                    }
                  : {}),
              });
            });
          return (
            <section className="memory-rule-section" key={kind}>
              <h3>{kind === 'guard' ? 'Stack condition' : 'Stack action'}</h3>
              <Check
                id={kind + '-enabled'}
                label={kind === 'guard' ? 'Use a condition' : 'Update stack'}
                checked={enabled}
                disabled={!firstStack && !exists}
                onChange={(value) =>
                  edit((e) => {
                    if (value) {
                      delete e[disabled];
                      if (!exists)
                        e[kind] = {
                          cell: firstStack.name,
                          op: kind === 'guard' ? 'empty' : 'push',
                          value: kind === 'guard' ? 0 : 1,
                        };
                    } else e[disabled] = true;
                  })
                }
              />
              {kind === 'guard' && (
                <div className="condition-clipboard">
                  <Button type="button" disabled={!exists} onClick={copy}>
                    Copy conditions
                  </Button>
                  <Button type="button" onClick={paste}>
                    Paste conditions
                  </Button>
                </div>
              )}
              {enabled && (
                <>
                  <Rule
                    kind={kind}
                    rule={edge[kind]}
                    cells={cells}
                    onChange={(change) => edit((e) => change(e[kind]))}
                  />
                  {kind === 'guard' && (
                    <Select
                      label="Combine conditions"
                      value={edge.guardMode ?? 'all'}
                      onChange={(mode) =>
                        edit((e) => {
                          if (mode === 'any') e.guardMode = 'any';
                          else delete e.guardMode;
                        })
                      }
                    >
                      <option value="all">All conditions (AND)</option>
                      <option value="any">Any condition (OR)</option>
                    </Select>
                  )}
                  {(edge[list] ?? []).map((rule, i) => (
                    <div className="extra-memory-rule" key={i}>
                      <Rule
                        kind={kind}
                        rule={rule}
                        cells={cells}
                        onChange={(change) => edit((e) => change(e[list][i]))}
                      />
                      <Button
                        type="button"
                        onClick={() =>
                          edit((e) => {
                            e[list].splice(i, 1);
                            if (!e[list].length) delete e[list];
                          })
                        }
                      >
                        Remove {kind === 'guard' ? 'condition' : 'action'}
                      </Button>
                    </div>
                  ))}
                  <Button type="button" disabled={!firstStack} onClick={add}>
                    ＋ Add {kind === 'guard' ? 'condition' : 'action'}
                  </Button>
                </>
              )}
            </section>
          );
        })}
      </div>
    </details>
  );
}
function Rule({ kind, rule, cells, onChange }) {
  if (!rule) return null;
  const cell = cells.find((c) => c.name === rule.cell),
    ops = kind === 'guard' ? guardOps : effectOps;
  return (
    <div className="memory-rule-fields">
      <Select
        label="Memory"
        value={rule.cell}
        onChange={(name) =>
          onChange((next) => {
            next.cell = name;
            const choices = ops(cells.find((c) => c.name === name));
            if (!choices.includes(next.op)) next.op = choices[0];
            if (needsValue(next.op) && !Number.isSafeInteger(next.value)) next.value = 0;
          })
        }
      >
        {cells
          .filter((c) => stackCell(c) || c.name === rule.cell)
          .map((c) => (
            <option value={c.name} key={c.name}>
              {c.name}
            </option>
          ))}
      </Select>
      <Select
        label="Operation"
        value={rule.op}
        onChange={(op) =>
          onChange((next) => {
            next.op = op;
            if (needsValue(op) && !Number.isSafeInteger(next.value)) next.value = 0;
          })
        }
      >
        {ops(cell).map((op) => (
          <option key={op} value={op}>
            {kind === 'guard' && stackCell(cell) && ['==', '!=', '>', '>=', '<', '<='].includes(op)
              ? 'Top ' + labels[op]
              : (labels[op] ?? op)}
          </option>
        ))}
      </Select>
      {needsValue(rule.op) && (
        <Field
          label="Value"
          type="number"
          step="1"
          value={rule.value ?? 0}
          onCommit={(text) =>
            onChange((next) => {
              const value = Number(text);
              if (!Number.isSafeInteger(value)) throw Error('Use a safe integer.');
              next.value = value;
            })
          }
        />
      )}
      {kind === 'guard' && stackCell(cell) && needsValue(rule.op) && (
        <p className="prop-note">
          Compares the top value. An empty stack does not satisfy this condition.
        </p>
      )}
    </div>
  );
}
