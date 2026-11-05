import { useEffect, useRef } from 'react';
import { Trash2, X, ArrowRight, ExternalLink } from 'lucide-react';
import { Badge } from '@radix-ui/themes';
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
import { StackAlphabet, MemoryRules } from './MemoryEditor.jsx';
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
  }, [open, selection.type, selection.id, selection.index, controller]);
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
          <StackAlphabet heading={false} />
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
        ) : null}
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
  if (!edge) return null;
  const edit = (change) => controller.update((next) => change(next.edges[index], next));
  const characters = simpleCharacterClass(edge.label, edge.invert);
  const issue = transitionError(machine, edge) || singleCharacterError(edge.label, edge.invert);
  const options = machine.states.map((state) => (
    <option key={state.id} value={state.id}>
      {state.name}
    </option>
  ));
  const setCharacters = (body, inverted = characters?.inverted ?? !!edge.invert) =>
    edit((e) => {
      if (!body) throw Error('Enter a character or range.');
      if (body.startsWith('^')) throw Error('Use the invert switch instead of a leading ^.');
      e.label = characterClassExpression(body);
      e.invert = inverted;
      matcher(e.label, e.invert);
    });
  const renameLinkedPortal = (name) =>
    edit((e, next) => {
      name = name.trim();
      if (!name) throw Error('Portal name cannot be empty.');
      const target = destination(next, e);
      if (next.states.some((state) => state !== target && state.portal === name))
        throw Error('That portal name is already in use.');
      renamePortal(next, target, name);
    });
  const warning = issue && (
    <p className="transition-rule-error" role="alert">
      {issue}
    </p>
  );
  if (simple)
    return (
      <>
        {characters ? (
          <>
            <Field
              id="simple-characters"
              label="Characters"
              aria-label="Characters and ranges"
              value={characters.characters}
              spellCheck={false}
              placeholder="a-zA-Z0-9_"
              onCommit={(body) => setCharacters(body)}
            />
            <Check
              id="invert-match"
              label="Invert set"
              checked={characters.inverted}
              onChange={(value) => setCharacters(characters.characters, value)}
            />
          </>
        ) : (
          <Button
            onClick={() =>
              useStudio.setState((state) => ({
                settings: { ...state.settings, simplified: false },
              }))
            }
          >
            Edit expression in normal view
          </Button>
        )}
        {edge.portal != null && (
          <Field
            id="portal-rename"
            label="Portal name"
            value={edge.portal}
            onCommit={renameLinkedPortal}
          />
        )}
        {warning}
        {machineType(machine) === 'extended' && (
          <MemoryRules edge={edge} index={index} edit={edit} machine={machine} simple />
        )}
      </>
    );
  return (
    <>
      {warning}
      <Select
        id="from"
        label="From"
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
        label="Connect via portal"
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
          label="To"
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
          <Field
            id="portal-rename"
            label="Rename linked portal"
            value={edge.portal}
            onCommit={renameLinkedPortal}
          />
          <Button
            id="goto-portal"
            onClick={() => {
              try {
                controller.select('state', destination(machine, edge).id);
              } catch (error) {
                useStudio.getState().notify(error.message);
              }
            }}
          >
            <ExternalLink className="tool-icon" />
            Go to destination
          </Button>
        </>
      )}
      <Field
        id="edge-label"
        label="Match expression"
        value={edge.label}
        spellCheck={false}
        onCommit={(label) =>
          edit((e) => {
            if (label) matcher(label, e.invert);
            e.label = label;
          })
        }
      />
      <Check
        id="invert-match"
        label="Invert match"
        checked={edge.invert}
        onChange={(value) =>
          edit((e) => {
            e.invert = value;
          })
        }
      />
      {machineType(machine) === 'extended' && (
        <MemoryRules edge={edge} index={index} edit={edit} machine={machine} />
      )}
      <p className="prop-note">
        One ASCII character per transition. Examples: [a-z], [0-9], \s, \+
        <br />
        Overlapping transitions are reported when testing.
      </p>
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
