import { useEffect, useRef, useState } from 'react';
import { Trash2, X, ArrowRight, ExternalLink } from 'lucide-react';
import { SegmentedControl, Badge } from '@radix-ui/themes';
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
import { Button, Check, Field, IconButton, Select } from './ui.jsx';
import { usePresence } from '../hooks/usePresence.js';

export function Inspector() {
  const currentScene = useStudio((s) => s.scene),
    controller = useStudio((s) => s.controller),
    settings = useStudio((s) => s.settings),
    open = useStudio((s) => s.propertiesOpen);
  const present = usePresence(open);
  const retainedScene = useRef(currentScene);
  if (open) retainedScene.current = currentScene;
  const scene = open ? currentScene : retainedScene.current;
  const { machine, selection } = scene;
  const total =
    scene.selectedStates.size +
    scene.selectedEdges.size +
    scene.selectedComments.size +
    scene.selectedCommentLinks.size;
  const outside =
    selection.type === 'state' &&
    scene.openGroup &&
    !machine.groups?.find((g) => g.id === scene.openGroup)?.stateIds.includes(selection.id);
  const title =
    total > 1
      ? 'Selection'
      : outside
        ? 'Outside reference'
        : selection.type === 'state'
          ? 'State'
          : selection.type === 'edge'
            ? 'Transition'
            : selection.type === 'comment'
              ? 'Comment'
              : 'Machine';
  useEffect(() => {
    if (open) controller?.showProperties(true);
  }, [open, scene, settings, controller]);
  return (
    <aside
      className="inspector animated-window"
      data-state={open ? 'open' : 'closed'}
      hidden={!present}
      role="dialog"
      aria-label="Properties"
      aria-hidden={!open}
    >
      <div className="inspector-title">
        <h2 id="inspector-heading">{title}</h2>
        <div className="inspector-actions">
          {total > 0 && !outside && (
            <IconButton
              id="delete-selection"
              icon={Trash2}
              label="Delete selection"
              onClick={() => controller.remove()}
            />
          )}
          <IconButton
            id="close-properties"
            icon={X}
            label="Close properties"
            onClick={() => controller.showProperties(false)}
          />
        </div>
      </div>
      <div id="properties" className="property-editor">
        {outside ? (
          <p className="prop-note">
            This is an image of a state outside the group. Drag it to change its position here. Its
            original position and properties stay unchanged.
          </p>
        ) : total > 1 ? (
          <>
            <Badge>{total} items</Badge>
            <Button onClick={() => controller.copy()}>Copy selection</Button>
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
            key={`${selection.index}-${settings.simplified}`}
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
          <p className="prop-note">Comment connection. Use the trash button to remove this link.</p>
        ) : machineType(machine) === 'extended' ? (
          <MemoryCells heading={false} />
        ) : (
          <p className="prop-note">
            Select a state or connection to edit it. Double-click empty canvas to add a state.
          </p>
        )}
      </div>
    </aside>
  );
}
function Section({ title, children }) {
  return (
    <section className="property-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function StateProperties({ state, machine, controller, simple }) {
  if (!state) return null;
  const edit = (change) =>
    controller.update((next) =>
      change(
        next.states.find((s) => s.id === state.id),
        next,
      ),
    );
  const outgoing = machine.edges.flatMap((edge, index) =>
    edge.from === state.id ? [{ edge, index }] : [],
  );
  return (
    <>
      <Field
        id="state-name"
        label="State name"
        value={state.name}
        onCommit={(name) =>
          edit((s) => {
            if (!name.trim()) throw Error('State name cannot be empty.');
            s.name = name.trim();
          })
        }
      />
      {!simple && (
        <Check
          id="initial"
          label="Initial state"
          checked={machine.start === state.id}
          onChange={(checked) =>
            controller.update((next) => {
              next.start = checked ? state.id : null;
            })
          }
        />
      )}
      <Section title="Token output">
        <Check
          id="accepting"
          label="Emits a token (accepting)"
          checked={isAccepting(state)}
          onChange={(value) => edit((s) => setAccepting(s, value))}
        />
        {isAccepting(state) || !simple ? (
          <>
            <Field
              id="token-name"
              label="Token name"
              placeholder="e.g. IDENT"
              value={state.token}
              onCommit={(token) =>
                edit((s) => {
                  s.token = token.trim();
                })
              }
            />
            <Check
              id="skip"
              label="Skip this token in output"
              checked={state.skip}
              onChange={(skip) =>
                edit((s) => {
                  s.skip = skip;
                })
              }
            />
          </>
        ) : (
          <p className="prop-note">Enable token output when this state completes a match.</p>
        )}
      </Section>
      {!simple && (
        <Section title={`Connections · ${outgoing.length}`}>
          {outgoing.length ? (
            outgoing.map(({ edge, index }) => (
              <Button
                key={index}
                className="connection-row"
                onClick={() => controller.select('edge', index)}
              >
                <span className="connection-expression">
                  {transitionLabel(edge) || 'Empty rule'}
                </span>
                <ArrowRight className="tool-icon" />
                <span>{destinationName(machine, edge)}</span>
              </Button>
            ))
          ) : (
            <p className="prop-note">Right-drag from this state to create a connection.</p>
          )}
        </Section>
      )}
      {simple && state.portal && (
        <Field
          id="state-portal"
          label="Portal name"
          value={state.portal}
          onCommit={(name) => edit((s, next) => renamePortal(next, s, name.trim()))}
        />
      )}
      {!simple && (
        <details className="property-details">
          <summary>Portal</summary>
          <Field
            id="state-portal"
            label="Portal name (optional)"
            value={state.portal ?? ''}
            onCommit={(name) =>
              edit((s, next) => {
                name = name.trim();
                if (name && next.states.some((other) => other.id !== s.id && other.portal === name))
                  throw Error('Choose a unique portal name.');
                renamePortal(next, s, name);
              })
            }
          />
          <Button
            id="new-portal"
            onClick={() => {
              if (
                controller.update((next) =>
                  next.edges.push({ from: state.id, to: state.id, label: '', portal: '' }),
                )
              )
                controller.select('edge', controller.getMachine().edges.length - 1);
            }}
          >
            New portal connection
          </Button>
        </details>
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
function EdgeProperties({ edge, index, machine, controller, simple }) {
  const [mode, setMode] = useState(() =>
    simple && simpleCharacterClass(edge?.label ?? '', edge?.invert) ? 'set' : 'regex',
  );
  if (!edge) return null;
  const edit = (change) => controller.update((next) => change(next.edges[index], next));
  const characters = simpleCharacterClass(edge.label, edge.invert);
  const issue = transitionError(machine, edge) || singleCharacterError(edge.label, edge.invert);
  const sourceName = machine.states.find((s) => s.id === edge.from)?.name ?? '?';
  const options = machine.states.map((s) => (
    <option key={s.id} value={s.id}>
      {s.name}
    </option>
  ));
  const setCharacters = (body, inverted = !!edge.invert) =>
    edit((e) => {
      if (!body) throw Error('Enter a character or range.');
      if (body.startsWith('^')) throw Error('Use the invert switch instead of a leading ^.');
      e.label = characterClassExpression(body);
      e.invert = inverted;
      matcher(e.label, e.invert);
    });
  if (simple)
    return (
      <>
        <div className="property-route">
          <span>{sourceName}</span>
          <ArrowRight className="tool-icon" />
          <span>{destinationName(machine, edge)}</span>
        </div>
        {characters ? (
          <>
            <Field
              id="simple-characters"
              label="Characters and ranges"
              value={characters.characters}
              spellCheck={false}
              placeholder="a-zA-Z0-9_"
              onCommit={(body) => setCharacters(body, characters.inverted)}
            />
            <Check
              id="invert-match"
              label="Invert set"
              checked={characters.inverted}
              onChange={(value) => setCharacters(characters.characters, value)}
            />
          </>
        ) : (
          <div className="advanced-expression">
            <strong>Advanced expression</strong>
            <p className="prop-note">This expression cannot be represented as a character set.</p>
            <Button
              onClick={() =>
                useStudio.setState((s) => ({ settings: { ...s.settings, simplified: false } }))
              }
            >
              Edit in normal view
            </Button>
          </div>
        )}
        {edge.portal != null && (
          <Field
            id="portal-rename"
            label="Portal name"
            value={edge.portal}
            onCommit={(name) =>
              edit((e, next) => renamePortal(next, destination(next, e), name.trim()))
            }
          />
        )}
        {issue && (
          <p className="transition-rule-error" role="alert">
            {issue}
          </p>
        )}
        {machineType(machine) === 'extended' && (
          <MemoryRules edge={edge} index={index} edit={edit} machine={machine} simple />
        )}
      </>
    );
  return (
    <>
      <div className="property-route">
        <span>{sourceName}</span>
        <ArrowRight className="tool-icon" />
        <span>{destinationName(machine, edge)}</span>
      </div>
      <Section title="Match one character">
        <SegmentedControl.Root
          size="1"
          value={mode}
          onValueChange={(value) => {
            if (value === 'set' && !characters) {
              useStudio
                .getState()
                .notify('This expression uses advanced regex syntax. Edit it in Regex mode.');
              return;
            }
            setMode(value);
          }}
        >
          <SegmentedControl.Item value="set">Character set</SegmentedControl.Item>
          <SegmentedControl.Item value="regex">Regex</SegmentedControl.Item>
        </SegmentedControl.Root>
        {mode === 'set' ? (
          <Field
            id="simple-characters"
            label="Characters and ranges"
            aria-label="Characters and ranges"
            value={characters?.characters ?? ''}
            spellCheck={false}
            placeholder="a-zA-Z0-9_"
            onCommit={(body) => setCharacters(body)}
          />
        ) : (
          <Field
            id="edge-label"
            label="Character expression"
            value={edge.label}
            spellCheck={false}
            placeholder="[a-z] or \\s"
            onCommit={(label) =>
              edit((e) => {
                if (label) matcher(label, e.invert);
                e.label = label;
              })
            }
          />
        )}
        <Check
          id="invert-match"
          label="Match everything except this rule"
          checked={mode === 'set' ? (characters?.inverted ?? edge.invert) : edge.invert}
          onChange={(value) =>
            mode === 'set' && characters
              ? setCharacters(characters.characters, value)
              : edit((e) => {
                  e.invert = value;
                })
          }
        />
        {issue ? (
          <p className="transition-rule-error" role="alert">
            {issue}
          </p>
        ) : (
          <p className="prop-note">One character is consumed per transition.</p>
        )}
        <div className="rule-presets">
          {[
            ['Letters', '[a-zA-Z_]'],
            ['Digits', '[0-9]'],
            ['Space', '\\s'],
          ].map(([title, label]) => (
            <Button
              key={title}
              onClick={() => {
                edit((e) => {
                  e.label = label;
                  e.invert = false;
                });
                if (label === '\\s') setMode('regex');
              }}
            >
              {title}
            </Button>
          ))}
        </div>
      </Section>
      <details className="property-details" open={!simple}>
        <summary>Connection</summary>
        <Select
          id="from"
          label="From state"
          value={edge.from}
          onChange={(from) =>
            edit((e) => {
              e.from = from;
            })
          }
        >
          {options}
        </Select>
        <Check
          id="via-portal"
          label="Connect through a portal"
          checked={edge.portal != null}
          onChange={(enabled) =>
            edit((e, next) => {
              if (enabled) enablePortal(next, e);
              else {
                e.to = destination(next, e).id;
                delete e.portal;
              }
            })
          }
        />
        {edge.portal == null ? (
          <Select
            id="to"
            label="To state"
            value={edge.to}
            onChange={(to) =>
              edit((e) => {
                e.to = to;
              })
            }
          >
            {options}
          </Select>
        ) : (
          <>
            <Field
              id="portal-target"
              label="Destination portal"
              value={edge.portal}
              onCommit={(name) =>
                edit((e) => {
                  e.portal = name.trim();
                })
              }
            />
            <Button
              onClick={() => {
                try {
                  controller.select('state', destination(machine, edge).id);
                } catch (error) {
                  useStudio.getState().notify(error.message);
                }
              }}
            >
              <ExternalLink className="tool-icon" />
              View destination
            </Button>
            <Field
              id="portal-rename"
              label="Rename linked portal"
              value={edge.portal}
              onCommit={(name) =>
                edit((e, next) => {
                  name = name.trim();
                  if (!name) throw Error('Portal name cannot be empty.');
                  const target = destination(next, e);
                  if (next.states.some((s) => s !== target && s.portal === name))
                    throw Error('That portal name is already in use.');
                  renamePortal(next, target, name);
                })
              }
            />
          </>
        )}
      </details>
      {machineType(machine) === 'extended' && (
        <MemoryRules edge={edge} index={index} edit={edit} machine={machine} />
      )}
    </>
  );
}
function CommentProperties({ comment, controller }) {
  const editGroup = useRef(null);
  if (!comment) return null;
  return (
    <Field
      id="comment-text"
      label="Comment"
      multiline
      live
      rows={5}
      maxLength={10000}
      value={comment.text}
      onFocus={() => {
        editGroup.current = {};
      }}
      onCommit={(text) =>
        controller.update(
          (next) => {
            next.comments.find((c) => c.id === comment.id).text = text;
          },
          { historyKey: editGroup.current },
        )
      }
    />
  );
}
