import { Button } from './ui.jsx';
import { useLayoutEffect, useRef } from 'react';
import { Trash2, X, GripHorizontal } from 'lucide-react';
import { createEditorController } from '../editor/editor-controller.js';
import { useStudio } from '../state/studio.js';
import { IconButton, Field } from './ui.jsx';
export function GraphEditor({ children }) {
  const wrap = useRef(null),
    surface = useRef(null),
    canvas = useRef(null),
    overview = useRef(null),
    groupPanel = useRef(null),
    breadcrumbs = useRef(null),
    portalPreview = useRef(null);
  const scene = useStudio((s) => s.scene),
    controller = useStudio((s) => s.controller);
  const group = scene.machine.groups?.find((g) => g.id === scene.openGroup);
  useLayoutEffect(() => {
    const state = useStudio.getState();
    const engine = createEditorController(
      {
        wrap: wrap.current,
        surface: surface.current,
        canvas: canvas.current,
        overview: overview.current,
        groupPanel: groupPanel.current,
        breadcrumbs: breadcrumbs.current,
        portalPreview: portalPreview.current,
        minimap: document.getElementById('minimap'),
      },
      {
        initialMachine: state.scene.machine,
        onChange: (scene) =>
          useStudio.setState({
            scene,
          }),
        onUI: (changes) => useStudio.setState(changes),
        onDialog: (dialog) =>
          useStudio.setState({
            dialog,
          }),
        notify: (message) => useStudio.getState().notify(message),
        getTester: () => {
          const { input, showSkipped } = useStudio.getState();
          return {
            input,
            showSkipped,
          };
        },
        onRestoreTester: (tester) => {
          if (tester)
            useStudio.setState({
              input: tester.input,
              showSkipped: tester.showSkipped ?? false,
            });
        },
      },
    );
    useStudio.setState({
      controller: engine,
    });
    return () => {
      engine.dispose();
      useStudio.setState({
        controller: null,
      });
    };
  }, []);
  return (
    <div className="canvas-wrap" ref={wrap}>
      <canvas className="group-overview-backdrop" ref={overview} aria-hidden="true" hidden />
      <div className="canvas-surface" ref={surface}>
        <canvas
          id="canvas"
          ref={canvas}
          role="img"
          tabIndex={0}
          aria-label="Finite state machine editor"
        />
      </div>
      <section className="group-overlay" ref={groupPanel} hidden aria-label="Group editor">
        <div className="group-overlay-heading">
          <IconButton
            icon={GripHorizontal}
            data-group-grip
            label="Move group window"
            title="Move group window · Arrow keys adjust position"
          />
          <Field
            id="group-overlay-title"
            label=""
            aria-label="Group name"
            value={group?.name ?? ''}
            maxLength={60}
            onCommit={(name) => controller.group(name, group.id)}
          />
          <div className="group-overlay-actions">
            <IconButton
              icon={Trash2}
              label="Ungroup states"
              data-delete-group
              onClick={() => controller.ungroup(group.id)}
            />
            <IconButton icon={X} label="Close group" onClick={() => controller.closeGroup()} />
          </div>
        </div>
      </section>
      <nav className="group-navigation" ref={breadcrumbs} aria-label="Graph groups">
        <Button
          data-overview
          aria-current={!group ? 'page' : undefined}
          onClick={() => controller?.closeGroup()}
        >
          Overview
        </Button>
        {group && (
          <>
            <span aria-hidden="true">›</span>
            <Button
              data-current
              aria-current="page"
              onClick={() => controller.openGroup(group.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                useStudio.setState({
                  contextMenu: {
                    x: e.clientX,
                    y: e.clientY,
                    items: [
                      {
                        label: 'Rename group',
                        action: () => controller.renameGroup(group),
                      },
                      {
                        label: 'Ungroup',
                        action: () => controller.ungroup(group.id),
                      },
                    ],
                  },
                });
              }}
            >
              {group.name}
            </Button>
          </>
        )}
      </nav>
      {children}
      <div className="portal-preview" ref={portalPreview} role="tooltip" hidden />
    </div>
  );
}
