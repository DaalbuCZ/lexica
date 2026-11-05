import { Button } from './components/ui.jsx';
import { Component, lazy, Suspense, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Expand, Minus, Plus } from 'lucide-react';
import { useStudio, writeStorage } from './state/studio.js';
import { editorSettings } from './core/editor-settings.js';
import { usePersistence } from './hooks/usePersistence.js';
import { useTheme } from './hooks/useTheme.js';
import { useShortcuts } from './hooks/useShortcuts.js';
import { useChromeLayout } from './hooks/useChromeLayout.js';
import { GraphEditor } from './components/GraphEditor.jsx';
import { Inspector } from './components/Inspector.jsx';
import { Toolbar } from './components/Toolbar.jsx';
import { Tester } from './components/Tester.jsx';
import { IconButton } from './components/ui.jsx';
import { StatePaletteHost } from './components/StatePalette.jsx';
import { ContextMenu } from './components/ContextMenu.jsx';
import { Toaster, toast } from 'sonner';
const Dialogs = lazy(() =>
  import('./components/Dialogs.jsx').then((module) => ({
    default: module.Dialogs,
  })),
);
export default function App() {
  const controller = useStudio((s) => s.controller),
    settings = useStudio((s) => s.settings),
    propertiesOpen = useStudio((s) => s.propertiesOpen),
    notice = useStudio((s) => s.notice),
    contextMenu = useStudio((s) => s.contextMenu);
  const debuggerRef = useRef(null);
  usePersistence();
  useTheme();
  useShortcuts(debuggerRef);
  useChromeLayout();
  useEffect(() => {
    Object.assign(editorSettings, settings);
    writeStorage('lexica-editor-settings', settings);
    document.body.classList.toggle('simplified-view', settings.simplified);
    controller?.refresh();
  }, [settings, controller]);
  useEffect(() => {
    document.body.classList.toggle('properties-hidden', !propertiesOpen);
  }, [propertiesOpen]);
  useEffect(() => {
    if (!notice) return;
    toast(notice);
    useStudio.setState({ notice: '' });
  }, [notice]);
  useEffect(() => {
    if (!controller) return;
    return () => document.body.classList.remove('app-ready');
  }, [controller]);
  return (
    <>
      <header>
        <a className="brand" href="./">
          <svg className="brand-icon" viewBox="0 0 26 28" aria-hidden="true">
            <rect width="26" height="28" rx="6" />
            <text
              x="13"
              y="23"
              textAnchor="middle"
              fontFamily="Georgia,serif"
              fontSize="25"
              fontWeight="700"
            >
              λ
            </text>
          </svg>{' '}
          lexica
        </a>
        <div className="top-actions" />
      </header>
      <main>
        <GraphEditor>
          <Inspector />
        </GraphEditor>
        <Toolbar />
        <div className="minimap">
          <div className="map-controls" role="group" aria-label="View controls">
            <IconButton
              id="fit"
              icon={Expand}
              label="Fit diagram"
              onClick={() => controller?.fit()}
            />
            <IconButton
              id="zoom-out"
              icon={Minus}
              label="Zoom out"
              onClick={() => controller?.zoom(1.25)}
            />
            <IconButton
              id="zoom-in"
              icon={Plus}
              label="Zoom in"
              onClick={() => controller?.zoom(0.8)}
            />
          </div>
          <canvas id="minimap" role="img" aria-label="Minimap: click or drag to navigate" />
        </div>
        <span id="modehint" hidden />
        <Tester debuggerRef={debuggerRef} />
      </main>
      <StatePaletteHost />
      <Suspense fallback={null}>
        <Dialogs />
      </Suspense>
      {createPortal(
        <>
          <div id="dock-outlines" aria-hidden="true" />
          <div id="dock-preview" className="dock-preview" hidden aria-hidden="true" />
        </>,
        document.body,
      )}
      <Toaster
        position="bottom-center"
        duration={3500}
        toastOptions={{ className: 'lexica-toast' }}
      />
      {contextMenu && <ContextMenu menu={contextMenu} />}
    </>
  );
}
export class AppErrorBoundary extends Component {
  state = {
    error: null,
  };
  static getDerivedStateFromError(error) {
    return {
      error,
    };
  }
  componentDidCatch() {
    document.body.classList.add('app-ready');
  }
  render() {
    return this.state.error ? (
      <div className="app-error" role="alert">
        <h1>Lexica could not open this view</h1>
        <p>{this.state.error.message}</p>
        <p>Your saved machine is still in this browser.</p>
        <Button onClick={() => location.reload()}>Reload Lexica</Button>
        <Button
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob(
                [
                  JSON.stringify(
                    {
                      ...useStudio.getState().scene.machine,
                      tester: {
                        input: useStudio.getState().input,
                        showSkipped: useStudio.getState().showSkipped,
                      },
                    },
                    null,
                    2,
                  ),
                ],
                {
                  type: 'application/json',
                },
              ),
            );
            const a = document.createElement('a');
            a.href = url;
            a.download = 'lexer-recovery.json';
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          Download machine
        </Button>
      </div>
    ) : (
      this.props.children
    );
  }
}
