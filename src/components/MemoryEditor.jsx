import { IconButton, Field, Select } from './ui.jsx';
import { Copy, ClipboardPaste, Plus, Trash2, ArrowRight, X } from 'lucide-react';
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
        {!rules.length && <p className="prop-note">Any top → same top</p>}
        {rules.map((rule, i) => (
          <section className="memory-rule-section" key={i}>
            {i > 0 && <p className="stack-rule-or">OR</p>}
            <div className="stack-rule-row">
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
              <ArrowRight size={14} aria-hidden="true" />
              <div className="stack-replacement" title="Replacement: bottom to top">
                {!rule.replace.length && <span title="Pop top">ε</span>}
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
                      icon={X}
                      label={`Remove replacement ${i + 1}, symbol ${j + 1}`}
                      onClick={() =>
                        edit((e) => {
                          e.stackRules[i].replace.splice(j, 1);
                        })
                      }
                    />
                  </div>
                ))}
                <IconButton
                  icon={Plus}
                  label={`Add replacement symbol ${i + 1}`}
                  onClick={() =>
                    edit((e) => {
                      e.stackRules[i].replace.push(initial);
                    })
                  }
                />
              </div>
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
