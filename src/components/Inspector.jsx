import { useEffect, useRef } from 'react';
import { Trash2, X } from 'lucide-react';
import { useStudio, machineType } from '../state/studio.js';
import {
  destination,
  enablePortal,
  isAccepting,
  setAccepting,
  renamePortal,
  matcher,
  transitionError,
} from '../core/lexer.js';
import { simpleCharacterClass, characterClassExpression } from '../core/editor-settings.js';
import { singleCharacterError } from '../core/regex-analysis.js';
import { transitionLabel } from '../core/labels.js';
import { MemoryCells, MemoryRules } from './MemoryEditor.jsx';
import { Check, Field, IconButton, Select } from './ui.jsx';
export function Inspector() {
  const scene = useStudio((s) => s.scene),
    controller = useStudio((s) => s.controller),
    settings = useStudio((s) => s.settings),
    open = useStudio((s) => s.propertiesOpen);
  const ref = useRef(null);
  const {
    machine,
    selection,
    selectedStates,
    selectedEdges,
    selectedComments,
    selectedCommentLinks,
  } = scene;
  const total =
    selectedStates.size + selectedEdges.size + selectedComments.size + selectedCommentLinks.size;
  useEffect(() => {
    if (open) controller?.showProperties(true);
  }, [open, scene, settings, controller]);
  return (
    <aside
      ref={ref}
      className="inspector"
      role="dialog"
      aria-label="Properties"
      aria-hidden={!open}
    >
      <div className="inspector-title">
        <span id="inspector-heading">Properties</span>
        <div className="inspector-actions">
          {total > 0 && (
            <IconButton
              id="delete-selection"
              className="icon-button"
              icon={Trash2}
              label="Delete selection"
              onClick={() => controller.remove()}
            />
          )}
          <IconButton
            id="close-properties"
            className="icon-button"
            icon={X}
            label="Close properties"
            onClick={() => controller.showProperties(false)}
          />
        </div>
      </div>
      <div id="properties" className={settings.simplified ? 'simple-editor' : undefined}>
        {total > 1 ? (
          <>
            <p className="selection-summary">{total} items selected</p>
            <button onClick={() => controller.copy()}>Copy selection</button>
            <button className="danger" onClick={() => controller.remove()}>
              Delete selection
            </button>
          </>
        ) : selection.type === 'state' ? (
          <StateProperties
            key={selection.id}
            state={machine.states.find((s) => s.id === selection.id)}
            machine={machine}
            controller={controller}
            simple={settings.simplified}
          />
        ) : selection.type === 'edge' ? (
          <EdgeProperties
            key={selection.index}
            edge={machine.edges[selection.index]}
            index={selection.index}
            machine={machine}
            controller={controller}
            simple={settings.simplified}
          />
        ) : selection.type === 'comment' ? (
          <CommentProperties
            key={selection.id}
            comment={machine.comments?.find((c) => c.id === selection.id)}
            controller={controller}
          />
        ) : selection.type === 'comment-link' ? (
          <>
            <p className="selection-summary">Comment connection</p>
            <button className="danger" onClick={() => controller.remove()}>
              Delete connection
            </button>
          </>
        ) : machineType(machine) === 'extended' ? (
          <MemoryCells />
        ) : (
          <>
            <h2 className="property-name">Standard FSM</h2>
            <p className="prop-note">
              Switch to Extended FSM in Settings to use stacks, guards, and side effects.
            </p>
          </>
        )}
      </div>
    </aside>
  );
}
function StateProperties({ state: s, machine, controller, simple }) {
  if (!s) return null;
  const edit = (change) =>
    controller.update((next) =>
      change(
        next.states.find((item) => item.id === s.id),
        next,
      ),
    );
  const portal = (name) =>
    edit((state, next) => {
      name = name.trim();
      if (name && next.states.some((other) => other.id !== state.id && other.portal === name))
        throw Error('Choose a unique portal name.');
      if (simple && !name) throw Error('Portal name cannot be empty.');
      renamePortal(next, state, name);
    });
  return (
    <>
      {!simple && (
        <>
          <div className="selection-label">SELECTED STATE</div>
          <h2 className="property-name">{s.name}</h2>
        </>
      )}
      <Field
        id="state-name"
        label={simple ? 'Name' : 'State name'}
        value={s.name}
        onCommit={(name) =>
          edit((state) => {
            if (!name.trim()) throw Error('State name cannot be empty.');
            state.name = name.trim();
          })
        }
      />
      {(!simple || s.portal) && (
        <Field
          id="state-portal"
          label={simple ? 'Portal name' : 'Portal label (optional)'}
          value={s.portal ?? ''}
          onCommit={portal}
        />
      )}
      {!simple && (
        <button
          id="new-portal"
          onClick={() => {
            controller.update((next) =>
              next.edges.push({
                from: s.id,
                to: s.id,
                label: '',
                portal: '',
              }),
            );
            controller.select('edge', controller.getMachine().edges.length - 1);
          }}
        >
          ↗ New portal transition
        </button>
      )}
      {(machine.start == null || machine.start === s.id) && (
        <Check
          id="initial"
          label="Initial state"
          checked={machine.start === s.id}
          onChange={(checked) =>
            controller.update((next) => {
              next.start = checked ? s.id : null;
            })
          }
        />
      )}
      <Check
        id="accepting"
        label="Accepting state"
        checked={isAccepting(s)}
        onChange={(value) => edit((state) => setAccepting(state, value))}
      />
      {(!simple || isAccepting(s)) && (
        <>
          <Field
            id="token-name"
            label="Token name"
            value={s.token}
            placeholder="TOKEN"
            onCommit={(token) =>
              edit((state) => {
                state.token = token.trim();
              })
            }
          />
          <Check
            id="skip"
            label="Skip this token"
            checked={s.skip}
            onChange={(skip) =>
              edit((state) => {
                state.skip = skip;
              })
            }
          />
        </>
      )}
      {!simple && (
        <>
          <p className="prop-note">
            An accepting state emits a token.
            <br />
            Use skip for whitespace or comments.
          </p>
          <div className="transitions-title">OUTGOING TRANSITIONS</div>
          {machine.edges.map(
            (edge, index) =>
              edge.from === s.id && (
                <button
                  key={index}
                  className="transition-item"
                  onClick={() => controller.select('edge', index)}
                >
                  {transitionLabel(edge)} → {destinationName(machine, edge)}
                </button>
              ),
          )}
          <button id="delete" className="danger" onClick={() => controller.remove()}>
            Delete state
          </button>
        </>
      )}
    </>
  );
}
export function destinationName(machine, edge) {
  try {
    return edge.portal != null
      ? '↗ ' + (edge.portal || '?')
      : (destination(machine, edge)?.name ?? '?');
  } catch {
    return edge.portal != null ? '↗ ' + (edge.portal || '?') : '?';
  }
}
function EdgeProperties({ edge: e, index, machine, controller, simple }) {
  if (!e) return null;
  const edit = (change) => controller.update((next) => change(next.edges[index], next));
  const characters = simpleCharacterClass(e.label, e.invert);
  const issue = transitionError(machine, e) || singleCharacterError(e.label, e.invert);
  const changeCharacters = (body, inverted = e.invert) => {
    if (!body) useStudio.getState().notify('Enter at least one character or range.');
    else
      edit((edge) => {
        if (body.startsWith('^')) throw Error('Use “Invert set” instead of a leading ^.');
        edge.label = characterClassExpression(body);
        edge.invert = !!inverted;
        matcher(edge.label, edge.invert);
      });
  };
  const options = machine.states.map((s) => (
    <option key={s.id} value={s.id}>
      {s.name}
    </option>
  ));
  return (
    <>
      {issue && (
        <p className="transition-rule-error" role="alert">
          {issue}
        </p>
      )}
      {simple ? (
        <>
          <div className="simple-route">
            <span>{machine.states.find((s) => s.id === e.from)?.name}</span>
            <b>→</b>
            <span>{destinationName(machine, e)}</span>
          </div>
          {characters ? (
            <>
              <Field
                id="simple-characters"
                label="Characters"
                aria-label="Characters and ranges"
                value={characters.characters}
                spellCheck={false}
                onCommit={(body) => changeCharacters(body)}
              />
              <Check
                id="simple-invert"
                label="Invert set"
                checked={characters.inverted}
                onChange={(value) => changeCharacters(characters.characters, value)}
              />
            </>
          ) : (
            <div className="advanced-expression">
              <strong>Advanced expression</strong>
              <p>This regex cannot be shown as a character set.</p>
              <button
                onClick={() => {
                  useStudio.setState({
                    settings: {
                      ...useStudio.getState().settings,
                      simplified: false,
                    },
                  });
                }}
              >
                Edit in Classic view
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="selection-label">TRANSITION</div>
          <h2 className="property-name">Character expression</h2>
          <Select
            id="from"
            label="From"
            value={e.from}
            onChange={(from) =>
              edit((edge) => {
                edge.from = from;
              })
            }
          >
            {options}
          </Select>
          <Check
            id="via-portal"
            label="Connect via portal"
            checked={e.portal != null}
            onChange={(value) =>
              edit((edge, next) => {
                if (value) enablePortal(next, edge);
                else {
                  edge.to = destination(next, edge).id;
                  delete edge.portal;
                }
              })
            }
          />
          {e.portal == null && (
            <Select
              id="to"
              label="To"
              value={e.to}
              onChange={(to) =>
                edit((edge) => {
                  edge.to = to;
                })
              }
            >
              {options}
            </Select>
          )}
          <Field
            id="edge-label"
            label="Match expression"
            value={e.label}
            spellCheck={false}
            onCommit={(label) =>
              edit((edge) => {
                if (label) matcher(label, edge.invert);
                edge.label = label;
              })
            }
          />
          <Check
            id="invert-match"
            label="Invert match"
            checked={e.invert}
            onChange={(value) =>
              edit((edge) => {
                edge.invert = value;
              })
            }
          />
        </>
      )}
      {e.portal != null && (
        <>
          <Field
            id="portal-target"
            label="Destination portal"
            value={e.portal}
            onCommit={(name) =>
              edit((edge) => {
                edge.portal = name.trim();
              })
            }
          />
          <Field
            id="portal-rename"
            label="Rename linked portal"
            value={e.portal}
            onCommit={(name) =>
              edit((edge, next) => {
                name = name.trim();
                if (!name) throw Error('Portal name cannot be empty.');
                const target = destination(next, edge);
                if (next.states.some((s) => s !== target && s.portal === name))
                  throw Error('That portal name is already in use.');
                renamePortal(next, target, name);
              })
            }
          />
          <button
            onClick={() => {
              try {
                controller.select('state', destination(machine, e).id);
                controller.fit();
              } catch (error) {
                useStudio.getState().notify(error.message);
              }
            }}
          >
            ↗ Go to destination
          </button>
        </>
      )}
      {machineType(machine) === 'extended' && (
        <MemoryRules edge={e} index={index} edit={edit} machine={machine} />
      )}
      {!simple && (
        <>
          <p className="prop-note">
            One character per transition. Examples: [a-z], [0-9], {'\\s'}, {'\\+'}. Overlapping
            transitions are reported when testing.
          </p>
          <button className="danger" onClick={() => controller.remove()}>
            Delete transition
          </button>
        </>
      )}
    </>
  );
}
function CommentProperties({ comment, controller }) {
  const editGroup = useRef(null);
  if (!comment) return null;
  return (
    <>
      <Field
        id="comment-text"
        label="Comment"
        multiline
        live
        onFocus={() => {
          editGroup.current = {};
        }}
        rows={5}
        maxLength={10000}
        value={comment.text}
        onCommit={(text) =>
          controller.update(
            (next) => {
              next.comments.find((c) => c.id === comment.id).text = text;
            },
            { historyKey: editGroup.current },
          )
        }
      />
      <button className="danger" onClick={() => controller.remove()}>
        Delete comment
      </button>
    </>
  );
}
