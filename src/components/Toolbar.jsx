import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  ArrowUpFromLine,
  ArrowDownToLine,
  Clipboard,
  Copy,
  GripVertical,
  Hand,
  Menu,
  MousePointer2,
  PlusCircle,
  Redo2,
  Undo2,
  StickyNote,
  Settings,
  PanelRight,
  Workflow,
  Layers,
  Group,
} from 'lucide-react';
import { useStudio, machineType } from '../state/studio.js';
import { useDockGrip } from '../hooks/useDocking.js';
import { IconButton } from './ui.jsx';
export function Toolbar() {
  const controller = useStudio((s) => s.controller),
    scene = useStudio((s) => s.scene),
    propertiesOpen = useStudio((s) => s.propertiesOpen),
    grip = useDockGrip('toolbar');
  const dialog = (type) =>
    useStudio.setState({
      dialog: {
        type,
      },
    });
  return (
    <nav className="toolbar" aria-label="Diagram tools">
      <IconButton
        id="toolbar-grip"
        className="dock-grip"
        icon={GripVertical}
        label="Move toolbar (drag or use arrow keys)"
        {...grip}
      />
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <IconButton id="app-menu-toggle" icon={Menu} label="Menu" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className="layout-popover app-menu react-menu"
            sideOffset={8}
            collisionPadding={12}
          >
            <MenuItem icon={ArrowUpFromLine} onSelect={() => dialog('import')}>
              Import
            </MenuItem>
            <MenuItem icon={ArrowDownToLine} onSelect={() => dialog('export')}>
              Export
            </MenuItem>
            <MenuItem icon={Settings} onSelect={() => dialog('settings')}>
              Settings
            </MenuItem>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <span className="separator" />
      <IconButton
        id="select-mode"
        icon={MousePointer2}
        label="Select mode"
        title="Select · V"
        aria-pressed={scene.tool === 'select'}
        onClick={() => controller?.setTool('select')}
      />
      <IconButton
        id="pan-mode"
        icon={Hand}
        label="Pan mode"
        title="Pan · H"
        aria-pressed={scene.tool === 'pan'}
        onClick={() => controller?.setTool('pan')}
      />
      <span className="separator" />
      <IconButton
        id="add"
        icon={PlusCircle}
        label="Add state"
        onClick={() => controller?.place('state')}
      />
      <IconButton
        id="add-comment"
        icon={StickyNote}
        label="Add comment"
        title="Add comment · C"
        onClick={() => controller?.place('comment')}
      />
      <IconButton
        id="group-selection"
        icon={Group}
        label="Group selected states"
        disabled={!scene.selectedStates.size}
        onClick={() => controller?.makeGroup()}
      />
      <span className="separator" />
      <IconButton
        id="copy-selection"
        icon={Copy}
        label="Copy selection"
        hidden
        disabled={scene.selection.type === 'none'}
        onClick={() => controller?.copy()}
      />
      <IconButton
        id="paste-selection"
        icon={Clipboard}
        label="Paste selection"
        hidden
        onClick={() => controller?.paste()}
      />
      <IconButton
        id="undo"
        icon={Undo2}
        label="Undo"
        disabled={!scene.canUndo}
        onClick={() => controller?.undo()}
      />
      <IconButton
        id="redo"
        icon={Redo2}
        label="Redo"
        disabled={!scene.canRedo}
        onClick={() => controller?.redo()}
      />
      <span className="separator" />
      <IconButton
        id="layout-toggle"
        icon={Workflow}
        label="Auto layout"
        title="Arrange graph"
        onClick={() => dialog('layout')}
      />
      <IconButton
        id="memory-cells"
        icon={Layers}
        label="Manage memory cells"
        hidden={machineType(scene.machine) !== 'extended'}
        onClick={() => dialog('memory')}
      />
      <IconButton
        id="toggle-properties"
        icon={PanelRight}
        label="Toggle properties"
        aria-expanded={propertiesOpen}
        onClick={() => controller?.showProperties(!propertiesOpen)}
      />
    </nav>
  );
}
function MenuItem({ icon: Icon, children, ...props }) {
  return (
    <DropdownMenu.Item className="react-menu-item" {...props}>
      <Icon className="tool-icon" aria-hidden="true" />
      <span>{children}</span>
    </DropdownMenu.Item>
  );
}
