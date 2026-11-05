import { useId, type ReactNode } from 'react'
import { MAX_LENGTH, MAX_SIZE, MIN_LENGTH, MIN_SIZE, type Board, type Vehicle } from '../model'
import type { EditError } from '../usePuzzleEditor'
import { Icon } from './Icons'

type Placement = Pick<Vehicle, 'axis' | 'length'>

type EditorProps = {
  board: Board
  selected: string | null
  onSelect: (id: string) => void
  onChange: (board: Board, location?: EditError['location']) => boolean
  error: EditError | null
  onUndo: () => void
  canUndo: boolean
  onDone: () => void
  onCancel: () => void
  onChooseCell: () => void
  onPlacementChange: (placement: Placement | null) => void
  placement: Placement | null
}

const boardSizes = Array.from({ length: MAX_SIZE - MIN_SIZE + 1 }, (_, index) => index + MIN_SIZE)
const lengths = Array.from({ length: MAX_LENGTH - MIN_LENGTH + 1 }, (_, index) => index + MIN_LENGTH)

function NumberField({ label, value, values, format = String, onValue }: { label: string; value: number;
  values: number[]; format?: (value: number) => ReactNode; onValue: (value: number) => void }) {
  const id = useId()
  return <div className="editor-field">
    <label htmlFor={id}>{label}</label>
    <select id={id} value={value} onChange={(event) => onValue(Number(event.target.value))}>
      {values.map((option) => <option key={option} value={option}>{format(option)}</option>)}
    </select>
  </div>
}

function OrientationField({ value, disabled, onValue }: { value: Vehicle['axis']; disabled?: boolean;
  onValue: (value: Vehicle['axis']) => void }) {
  const id = useId()
  return <div className="editor-field">
    <label htmlFor={id}>Orientation</label>
    <select id={id} value={value} disabled={disabled} onChange={(event) => onValue(event.target.value as Vehicle['axis'])}>
      <option value="H">Horizontal</option>
      <option value="V">Vertical</option>
    </select>
  </div>
}

function formatRow(row: number) {
  return String.fromCharCode(65 + row)
}

export function Editor({ board, selected, onSelect, onChange, error, onUndo, canUndo, onDone, onCancel,
  onChooseCell, onPlacementChange, placement }: EditorProps) {
  const vehicleSelectId = useId()
  const vehicle = board.vehicles.find(({ id }) => id === selected)
  const rows = Array.from({ length: board.rows }, (_, index) => index)
  const columns = Array.from({ length: board.cols }, (_, index) => index)
  const hasEmptyCell = board.vehicles.reduce((occupied, piece) => occupied + piece.length, 0) < board.rows * board.cols

  function updateVehicle(update: Partial<Vehicle>) {
    if (!vehicle) return
    onChange({ ...board, vehicles: board.vehicles.map((piece) => piece.id === vehicle.id ? { ...piece, ...update } : piece) })
  }

  return <div className="editor-controls">
    <fieldset className="editor-section">
      <legend>Board size</legend>
      <div className="editor-fields">
        <NumberField label="Rows" value={board.rows} values={boardSizes} onValue={(rows) => onChange({ ...board, rows }, 'size')} />
        <NumberField label="Columns" value={board.cols} values={boardSizes} onValue={(cols) => onChange({ ...board, cols }, 'size')} />
      </div>
      <p role="status" className={error?.location === 'size' ? 'field-feedback status status--error' : 'field-hint'}>
        {error?.location === 'size' ? error.message : 'Move edge pieces inward before shrinking the board.'}
      </p>
    </fieldset>

    <fieldset className="editor-section">
      <legend>Vehicles</legend>
      <button className={`button ${placement ? 'button--secondary' : 'button--quiet'} editor-add`} type="button"
        aria-expanded={Boolean(placement)} disabled={!placement && !hasEmptyCell}
        onClick={() => onPlacementChange(placement ? null : { axis: 'H', length: MIN_LENGTH })}>
        <Icon name={placement ? 'x' : 'add'} size={18} />{placement ? 'Cancel placement' : 'Add vehicle'}
      </button>

      {placement ? <div className="editor-placement">
        <div className="editor-fields">
          <OrientationField value={placement.axis} onValue={(axis) => onPlacementChange({ ...placement, axis })} />
          <NumberField label="Length" value={placement.length} values={lengths} format={(length) => `${length} cells`}
            onValue={(length) => onPlacementChange({ ...placement, length })} />
        </div>
        <p className="field-hint" role="status">{hasEmptyCell ? 'Choose an empty cell for the vehicle’s top or left end.' : 'Make room by resizing the board or removing a vehicle.'}</p>
        <button type="button" className="button button--quiet placement-jump" disabled={!hasEmptyCell} onClick={onChooseCell}>Choose a cell</button>
      </div> : <div className="editor-vehicle">
        <div className="editor-field">
          <label htmlFor={vehicleSelectId}>Selected vehicle</label>
          <select id={vehicleSelectId} value={vehicle?.id ?? ''} onChange={(event) => onSelect(event.target.value)}>
            <option value="" disabled>Choose a vehicle</option>
            {board.vehicles.map(({ id }) => <option key={id} value={id}>{id === 'X' ? 'X · Target vehicle' : `${id} · Vehicle`}</option>)}
          </select>
        </div>

        {vehicle ? <>
          <div className="editor-fields">
            <OrientationField value={vehicle.axis} disabled={vehicle.id === 'X'} onValue={(axis) => updateVehicle({ axis })} />
            <NumberField label="Length" value={vehicle.length} values={lengths} format={(length) => `${length} cells`}
              onValue={(length) => updateVehicle({ length })} />
            <NumberField label="Anchor row" value={vehicle.row} values={rows} format={formatRow} onValue={(row) => updateVehicle({ row })} />
            <NumberField label="Anchor column" value={vehicle.col} values={columns} format={(col) => col + 1}
              onValue={(col) => updateVehicle({ col })} />
          </div>
          <p role="status" className={error?.location === 'vehicle' ? 'status status--error' : 'field-hint editor-vehicle-hint'}>
            {error?.location === 'vehicle' ? error.message : vehicle.id === 'X' ? 'The exit follows the target’s row.' : null}
          </p>
          {vehicle.id !== 'X' &&
            <button type="button" className="button button--quiet button--danger editor-remove" onClick={() => {
              onChange({ ...board, vehicles: board.vehicles.filter(({ id }) => id !== vehicle.id) })
            }}><Icon name="minus" size={16} />Remove vehicle {vehicle.id}</button>}
        </> : <p className="field-hint">Select a vehicle on the board or in the list to edit it.</p>}
      </div>}
    </fieldset>

    <div className="editor-actions">
      <button className="button button--quiet" type="button" onClick={onUndo} disabled={!canUndo}><Icon name="undo" size={18} />Undo</button>
      <button className="button button--quiet" type="button" onClick={onCancel}>Cancel</button>
      <button className="button button--primary" type="button" onClick={onDone}><Icon name="check" size={18} />Done</button>
    </div>
  </div>
}
