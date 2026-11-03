import { useEffect } from 'react';
import { useStudio } from '../state/studio.js';
export function useShortcuts(debuggerRef) {
  useEffect(() => {
    const keydown = (event) => {
      const { controller, dialog, contextMenu, scene, propertiesOpen } = useStudio.getState();
      if (!controller || dialog || contextMenu || event.defaultPrevented) return;
      const typing = event.target.closest('input,textarea,select,[contenteditable="true"]');
      const control = event.ctrlKey || event.metaKey,
        key = event.key.toLowerCase();
      if (event.altKey && !control && ['arrowright', 'arrowleft', 's'].includes(key)) {
        event.preventDefault();
        const debug = debuggerRef.current;
        if (key === 's') debug?.toggle();
        else
          debug?.move(
            key === 'arrowright'
              ? event.shiftKey
                ? 'nextToken'
                : 'next'
              : event.shiftKey
                ? 'previousToken'
                : 'previous',
          );
        return;
      }
      if (typing) return;
      if (key === 'escape') {
        event.preventDefault();
        if (scene.openGroup && !propertiesOpen) controller.closeGroup();
        else controller.cancel();
        return;
      }
      if (control) {
        const action = {
          c: () => controller.copy(),
          x: () => controller.copy(true),
          v: () => controller.paste(),
          a: () => controller.selectAll(),
          z: () => (event.shiftKey ? controller.redo() : controller.undo()),
          y: () => controller.redo(),
        }[key];
        if (action) {
          event.preventDefault();
          action();
        }
        return;
      }
      if (event.repeat) return;
      const action = {
        v: () => controller.setTool('select'),
        h: () => controller.setTool('pan'),
        c: () => controller.place('comment'),
        a: () => controller.toggleAccepting(),
        delete: () => controller.remove(),
        '?': () =>
          useStudio.setState({
            dialog: {
              type: 'shortcuts',
            },
          }),
        ' ': () => controller.space(true),
      }[key];
      if (action) {
        event.preventDefault();
        action();
      }
    };
    const keyup = (event) => {
      if (event.code === 'Space') useStudio.getState().controller?.space(false);
    };
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    return () => {
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
    };
  }, [debuggerRef]);
}
