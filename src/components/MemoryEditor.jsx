import { IconButton, Field, Select } from './ui.jsx';
import { Copy, ClipboardPaste, Plus, Trash2, ArrowRight } from 'lucide-react';
import { useStudio } from '../state/studio.js';
import {
  stackDefinition,
  copyStackRules,
  pasteStackRules,
  renameStackSymbol,
  removeStackSymbol,
  stackAction,
  setStackAction,
} from '../core/memory.js';
let ruleClipboard = '';
export function StackAlphabet({ heading = true }) {
  const machine = useStudio((s) => s.scene.machine),
    controller = useStudio((s) => s.controller);
  const stack = stackDefinition(machine);
  return (
    <>
      {heading && <h2 className="property-name">Stack alphabet</h2>}
      <div className="stack-enum-heading">
        <span>Enum values</span>
        <IconButton
          icon={Plus}
          label="Add enum value"
          onClick={() =>
            controller.update((next) => {
              const definition = (next.stack ??= structuredClone(stack));
              let name = 'VALUE',
                n = 2;
              while (definition.alphabet.includes(name)) name = 'VALUE_' + n++;
              definition.alphabet.push(name);
            })
          }
        />
      </div>
      <div className="stack-enum-values">
        {stack.alphabet.map((value, i) => (
          <div className="stack-enum-row" key={i}>
            <Field
              label={null}
              aria-label={`Enum value ${i + 1}`}
              value={value}
              spellCheck={false}
              onCommit={(name) => controller.update((next) => renameStackSymbol(next, i, name))}
            />
            <IconButton
              icon={Trash2}
              label={`Delete enum value ${value}`}
              className="danger"
              disabled={stack.alphabet.length === 1}
              onClick={() => controller.update((next) => removeStackSymbol(next, i))}
            />
          </div>
        ))}
      </div>
      <Select
        label="Initial stack symbol (S)"
        value={stack.initial}
        onChange={(initial) =>
          controller.update((next) => {
            next.stack = { ...stack, initial };
          })
        }
      >
        {stack.alphabet.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </Select>
    </>
  );
}
export function MemoryRules({ edge, index, edit, machine, simple = false }) {
  const { alphabet, initial } = stackDefinition(machine);
  const rules = edge.stackRules ?? [];
  const notify = useStudio((s) => s.notify);
  const copy = async () => {
    ruleClipboard = copyStackRules(edge);
    try {
      await navigator.clipboard.writeText(ruleClipboard);
    } catch {}
    notify('Stack rules copied.');
  };
  const paste = async () => {
    let text = ruleClipboard;
    try {
      text = await navigator.clipboard.readText();
    } catch {}
    const state = useStudio.getState();
    if (state.scene.selection.type !== 'edge' || state.scene.selection.index !== index) return;
    state.controller.update((next) => pasteStackRules(next.edges[index], text));
  };
  const open = useStudio((s) => s.settings.stackRulesOpen);
  const Container = 'details';
  return (
    <Container
      id="memory-rules"
      open={!!open}
      onToggle={(event) => {
        const value = event.currentTarget.open;
        if (useStudio.getState().settings.stackRulesOpen !== value)
          useStudio.setState((s) => ({ settings: { ...s.settings, stackRulesOpen: value } }));
      }}
      className={`simple-memory ${simple ? 'compact-memory' : ''}`}
    >
      <summary>Stack rules</summary>
      <div className="simple-memory-content">
        {!rules.length && <p className="prop-note">Any top → (keep)</p>}
        {rules.map((rule, i) => (
          <section className="memory-rule-section" key={i}>
            {i > 0 && <p className="stack-rule-or">OR</p>}
            <div className="stack-rule-row">
              <Select
                label={`Top symbol ${i + 1}`}
                title={rule.top}
                value={rule.top}
                onChange={(top) =>
                  edit((e) => {
                    const rule = e.stackRules[i],
                      action = stackAction(rule);
                    rule.top = top;
                    if (action === 'keep' || action.startsWith('push:'))
                      setStackAction(rule, action);
                  })
                }
              >
                {alphabet.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
              <ArrowRight size={14} aria-hidden="true" />
              <Select
                label={`Stack action ${i + 1}`}
                value={stackAction(rule)}
                title={
                  stackAction(rule) === 'sequence' ? rule.replace.join(' ') : stackAction(rule)
                }
                onChange={(action) => edit((e) => setStackAction(e.stackRules[i], action))}
              >
                <option value="keep">(keep)</option>
                <option value="pop">(pop)</option>
                {alphabet
                  .filter((symbol) => symbol !== rule.top)
                  .map((symbol) => (
                    <option key={'replace:' + symbol} value={'replace:' + symbol}>
                      {symbol}
                    </option>
                  ))}
                {alphabet.map((symbol) => (
                  <option key={'push:' + symbol} value={'push:' + symbol}>
                    push {symbol}
                  </option>
                ))}
                {stackAction(rule) === 'sequence' && (
                  <option value="sequence">{rule.replace.join(' ')}</option>
                )}
              </Select>
              <IconButton
                icon={Trash2}
                label={`Remove rule ${i + 1}`}
                className="danger"
                onClick={() =>
                  edit((e) => {
                    e.stackRules.splice(i, 1);
                  })
                }
              />
            </div>
          </section>
        ))}
        <div className="memory-rule-tools">
          <IconButton icon={Copy} label="Copy stack rules" onClick={copy} />
          <IconButton icon={ClipboardPaste} label="Paste stack rules" onClick={paste} />
          <IconButton
            icon={Plus}
            label="Add stack rule"
            onClick={() =>
              edit((e) => {
                const top = alphabet.find((s) => !rules.some((r) => r.top === s)) ?? initial;
                (e.stackRules ??= []).push({ top, replace: [top] });
              })
            }
          />
        </div>
      </div>
    </Container>
  );
}
