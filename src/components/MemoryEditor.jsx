import { Button, IconButton, Field, Select } from './ui.jsx';
import { Copy, ClipboardPaste, Plus, Trash2 } from 'lucide-react';
import { useStudio } from '../state/studio.js';
import { stackDefinition, copyStackRules, pasteStackRules } from '../core/memory.js';
let ruleClipboard = '';
export function StackAlphabet({ heading = true }) {
  const machine = useStudio((s) => s.scene.machine),
    controller = useStudio((s) => s.controller);
  const stack = stackDefinition(machine);
  return (
    <>
      {heading && <h2 className="property-name">Stack alphabet</h2>}
      <p className="prop-note">
        One stack, with values from this enum (Γ). Names use ASCII letters, digits and underscores.
      </p>
      <Field
        label="Enum values"
        value={stack.alphabet.join(', ')}
        spellCheck={false}
        onCommit={(text) =>
          controller.update((next) => {
            const alphabet = text.split(',').map((s) => s.trim());
            next.stack = {
              alphabet,
              initial: alphabet.includes(stack.initial) ? stack.initial : alphabet[0],
            };
          })
        }
      />
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
      <p className="prop-note">
        The stack starts with the selected symbol. Sequences are written bottom to top; the
        rightmost symbol is on top. Remove a symbol from transition rules before removing it here.
      </p>
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
  const Container = simple ? 'details' : 'section';
  return (
    <Container id="memory-rules" className={`simple-memory ${simple ? 'compact-memory' : ''}`}>
      {simple ? <summary>Stack rules</summary> : <h3>Stack rules</h3>}
      <div className="simple-memory-content">
        <p className="prop-note">
          Match the top symbol and replace it atomically. An empty replacement (ε) pops it. The last
          replacement symbol becomes the top.
        </p>
        {!rules.length && (
          <p className="prop-note">
            No explicit rules: preserve any top symbol. An empty stack blocks the transition.
          </p>
        )}
        {rules.map((rule, i) => (
          <section className="memory-rule-section" key={i}>
            {i > 0 && <p className="stack-rule-or">OR</p>}
            <Select
              label={`Top symbol ${i + 1}`}
              value={rule.top}
              onChange={(top) =>
                edit((e) => {
                  e.stackRules[i].top = top;
                })
              }
            >
              {alphabet.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
            <div className="stack-replacement">
              <span>Replace with {rule.replace.length ? '(bottom → top)' : 'ε (pop)'}</span>
              {rule.replace.map((symbol, j) => (
                <div className="stack-symbol-row" key={j}>
                  <Select
                    label={`Replacement ${i + 1}, symbol ${j + 1}`}
                    value={symbol}
                    onChange={(value) =>
                      edit((e) => {
                        e.stackRules[i].replace[j] = value;
                      })
                    }
                  >
                    {alphabet.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Select>
                  <IconButton
                    icon={Trash2}
                    label={`Remove replacement ${i + 1}, symbol ${j + 1}`}
                    onClick={() =>
                      edit((e) => {
                        e.stackRules[i].replace.splice(j, 1);
                      })
                    }
                  />
                </div>
              ))}
              <Button
                onClick={() =>
                  edit((e) => {
                    e.stackRules[i].replace.push(initial);
                  })
                }
              >
                Add replacement symbol
              </Button>
            </div>
            <Button
              className="danger"
              onClick={() =>
                edit((e) => {
                  e.stackRules.splice(i, 1);
                })
              }
            >
              Remove rule {i + 1}
            </Button>
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
