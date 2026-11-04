import { useLayoutEffect, useRef } from 'react';
import { GripVertical, Trash2, X } from 'lucide-react';
import { useDockGrip } from '../hooks/useDocking.js';
import { createEditorController } from '../editor/editor-controller.js';
import { useStudio } from '../state/studio.js';
import { IconButton, Field } from './ui.jsx';
import { toast } from 'sonner';
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
  const grip = useDockGrip('breadcrumbs');
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
        startLayoutProgress: () => {
          const options = {
            duration: Infinity,
            closeButton: false,
            dismissible: false,
            className: 'lexica-toast arrange-progress-toast',
          };
          const content = (phase, fraction) => (
            <div className="arrange-progress">
              <div className="arrange-progress-heading">
                <strong>Arranging graph</strong>
                <span aria-hidden="true">{Math.round(fraction * 100)}%</span>
              </div>
              <div className="arrange-progress-phase">{phase}</div>
              <div
                className="arrange-progress-track"
                role="progressbar"
                aria-label="Arrange graph progress"
                aria-valuenow={Math.round(fraction * 100)}
                aria-valuetext={phase}
              >
                <div
                  className="arrange-progress-fill"
                  style={{ transform: `scaleX(${fraction})` }}
                />
              </div>
            </div>
          );
          const id = toast(content('Starting layout', 0), options);
          return {
            update: ({ phase, fraction }) => toast(content(phase, fraction), { ...options, id }),
            close: () => toast.dismiss(id),
          };
        },
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
        <IconButton
          id="breadcrumbs-grip"
          className="dock-grip"
          icon={GripVertical}
          label="Move breadcrumbs (drag or use arrow keys)"
          {...grip}
        />
        <button
          type="button"
          data-overview
          aria-current={!group ? 'page' : undefined}
          onClick={() => controller?.closeGroup()}
        >
          Overview
        </button>
        {group && (
          <>
            <span aria-hidden="true">&gt;</span>
            <button
              type="button"
              data-current
              aria-current="page"
              title={group.name}
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
            </button>
          </>
        )}
      </nav>
      {children}
      <div className="portal-preview" ref={portalPreview} role="tooltip" hidden />
    </div>
  );
}
