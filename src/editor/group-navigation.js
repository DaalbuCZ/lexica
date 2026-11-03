import { editorSettings } from '../core/editor-settings.js';
import { groupFor } from '../core/groups.js';
export function createGroupNavigation(context) {
  function syncGroupPresentation() {
    const group = context.machine.groups?.find((g) => g.id === context.openGroup),
      active = editorSettings.groupPresentation === 'overlay' && !!group;
    context.groupBar.hidden = editorSettings.groupPresentation === 'overlay';
    if (active && !context.overviewView) context.overviewView = context.view();
    if (active && context.elements.canvas.parentElement !== context.groupPanel) {
      context.groupPanel.hidden = false;
      context.groupPanel.append(context.elements.canvas);
      context.canvasSize = {
        width: context.elements.canvas.clientWidth,
        height: context.elements.canvas.clientHeight,
      };
    } else if (!active && context.overviewView) {
      context.elements.surface.append(context.elements.canvas);
      context.graph.setView(context.overviewView);
      context.overviewView = null;
      context.canvasSize = {
        width: context.elements.canvas.clientWidth,
        height: context.elements.canvas.clientHeight,
      };
    }
    context.groupPanel.hidden = !active;
    context.overviewCanvas.hidden = !active;
  }
  function closeGroup(fromHistory = false) {
    if (!context.openGroup) return;
    if (!fromHistory && window.history.state?.lexicaGroup === context.openGroup)
      window.history.back();
    context.cancelConnect();
    context.openGroup = null;
    context.groupPanelBounds = null;
    context.groupPanelBoundsId = null;
    context.groupPanelViewInitialized = false;
    context.clearSelection();
    context.showProperties(false);
    context.render();
    context.fit();
  }
  function openGroupById(id) {
    if (!context.machine.groups?.some((g) => g.id === id)) return;
    if (!context.openGroup)
      window.history.pushState(
        {
          ...window.history.state,
          lexicaGroup: id,
        },
        '',
      );
    else
      window.history.replaceState(
        {
          ...window.history.state,
          lexicaGroup: id,
        },
        '',
      );
    context.cancelConnect();
    context.openGroup = id;
    context.clearSelection();
    context.showProperties(false);
    context.render();
    if (!context.overviewView) context.fit();
  }
  function renameGroup(group) {
    context.onDialog({
      type: 'group',
      groupId: group.id,
      name: group.name,
    });
  }
  function makeGroup() {
    if (!context.selectedStates.size) {
      context.toast('Select states first, then choose Group.');
      return;
    }
    if ([...context.selectedStates].some((id) => groupFor(context.machine, id))) {
      context.toast('A state can belong to one group. Ungroup it first.');
      return;
    }
    context.onDialog({
      type: 'group',
      name:
        [...context.selectedStates]
          .map((id) => context.machine.states.find((s) => s.id === id)?.name)
          .filter(Boolean)
          .slice(0, 2)
          .join(' + ') || 'New group',
    });
  }
  function showGroupSelectionMenu(event, action = makeGroup, includeMove = false) {
    event.preventDefault();
    event.stopPropagation();
    context.onUI({
      contextMenu: {
        x: event.clientX,
        y: event.clientY,
        items: [
          {
            label: 'Group states',
            action,
          },
          ...(includeMove && context.selectedStates.size
            ? [
                {
                  label: 'Move to group…',
                  action: moveSelectedStateToGroup,
                },
              ]
            : []),
        ],
      },
    });
  }
  function moveSelectedStateToGroup() {
    if (context.selectedStates.size)
      context.onDialog({
        type: 'move-group',
        stateIds: [...context.selectedStates],
      });
  }
  function connectToGroup(id) {
    if (!context.source) return;
    const from = context.source;
    context.cancelConnect();
    context.onDialog({
      type: 'group-target',
      groupId: id,
      from,
    });
  }
  function chooseCombinedTransition(edge) {
    context.onDialog({
      type: 'combined-transition',
      indices: edge.originalIndices,
    });
  }
  return {
    syncGroupPresentation,
    closeGroup,
    openGroupById,
    renameGroup,
    makeGroup,
    showGroupSelectionMenu,
    moveSelectedStateToGroup,
    connectToGroup,
    chooseCombinedTransition,
  };
}
