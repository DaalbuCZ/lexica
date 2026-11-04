import { RadioCards, Slider } from '@radix-ui/themes';
import { Moon, Sun } from 'lucide-react';
import { useStudio, machineType } from '../state/studio.js';
import { toggleTheme } from '../hooks/useTheme.js';
import { Modal, Check, Select, Button } from './ui.jsx';

export function SettingsPanel({ dialog, onClose }) {
  const settings = useStudio((s) => s.settings),
    showSkipped = useStudio((s) => s.showSkipped),
    machine = useStudio((s) => s.scene.machine),
    controller = useStudio((s) => s.controller);
  const change = (changes) => useStudio.setState({ settings: { ...settings, ...changes } });
  return (
    <Modal title="Settings" onClose={onClose} anchorId={dialog.anchorId} className="settings-panel">
      <div className="settings-grid">
        <section className="settings-section settings-wide">
          <h3>Machine</h3>
          <RadioCards.Root
            size="1"
            columns="2"
            gap="2"
            value={machineType(machine)}
            onValueChange={(type) =>
              controller.update((next) => {
                next.machineType = type;
              })
            }
          >
            <RadioCards.Item value="fsm">
              <span>
                <strong>Standard FSM</strong>
                <small>Character transitions</small>
              </span>
            </RadioCards.Item>
            <RadioCards.Item value="extended">
              <span>
                <strong>Extended FSM</strong>
                <small>Stacks and memory rules</small>
              </span>
            </RadioCards.Item>
          </RadioCards.Root>
        </section>
        <section className="settings-section">
          <h3>Editor</h3>
          <Check
            id="simplified-setting"
            label="Simplified view"
            checked={settings.simplified}
            onChange={(simplified) => change({ simplified })}
          />
          <Check
            id="label-boxes"
            label="Label backgrounds"
            checked={machine.labelBoxes}
            onChange={(value) =>
              controller.update((next) => {
                next.labelBoxes = value;
              })
            }
          />
        </section>
        <section className="settings-section">
          <h3>Lexer output</h3>
          <Check
            id="show-skipped"
            label="Show skipped tokens"
            checked={showSkipped}
            onChange={(showSkipped) => useStudio.setState({ showSkipped })}
          />
        </section>
        <section className="settings-section settings-wide">
          <h3>Navigation</h3>
          <Check
            id="follow-debug-state"
            label="Follow current state while debugging"
            checked={settings.followDebugState}
            onChange={(followDebugState) => change({ followDebugState })}
          />
          <Select
            id="group-presentation"
            label="Open groups in"
            value={settings.groupPresentation}
            onChange={(groupPresentation) => change({ groupPresentation })}
          >
            <option value="canvas">Full canvas</option>
            <option value="overlay">Floating window</option>
          </Select>
          <div className="settings-slider-label">
            <label htmlFor="pinch-sensitivity">Pinch sensitivity</label>
            <output>{settings.pinchSensitivity.toFixed(1)}×</output>
          </div>
          <Slider
            id="pinch-sensitivity"
            aria-label="Pinch sensitivity"
            min={0.2}
            max={2}
            step={0.1}
            value={[settings.pinchSensitivity]}
            onValueChange={([pinchSensitivity]) => change({ pinchSensitivity })}
          />
        </section>
        <section className="settings-section settings-wide settings-theme">
          <h3>Appearance</h3>
          <Button id="theme-toggle" onClick={toggleTheme}>
            <Moon className="tool-icon theme-moon" />
            <Sun className="tool-icon theme-sun" />
            Switch theme
          </Button>
        </section>
      </div>
    </Modal>
  );
}
