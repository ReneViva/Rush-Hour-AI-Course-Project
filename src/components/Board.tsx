import { useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react'
import { cellOf, legalMoves, validateBoard } from '../model'
import type { Board as Puzzle, Move, Vehicle } from '../model'
import { Icon } from './Icons'

type Mode = 'play' | 'edit' | 'read'
type Position = { row: number; col: number }

type BoardProps = {
  board: Puzzle
  label: string
  mode?: Mode
  selected?: string | null
  onSelect?: (id: string) => void
  onMove?: (move: Move) => void
  onCell?: (row: number, col: number) => void
  onRelocate?: (id: string, row: number, col: number) => void
  blockers?: string[]
  highlight?: string | null
  animate?: boolean
}

type Drag = {
  id: string
  pointerId: number
  startX: number
  startY: number
  moved: boolean
  cellWidth: number
  cellHeight: number
  min: number
  max: number
}

type Preview = Position & { id: string; invalid: boolean }

const arrows: Record<string, Position> = {
  ArrowLeft: { row: 0, col: -1 },
  ArrowRight: { row: 0, col: 1 },
  ArrowUp: { row: -1, col: 0 },
  ArrowDown: { row: 1, col: 0 },
}

const vehicleTones = ['sage', 'ochre', 'blue', 'orchid', 'clay', 'petrol']
const noBlockers: string[] = []

function tone(id: string) {
  if (id === 'X') return 'target'
  let index = 0
  for (const character of id) index += character.codePointAt(0) ?? 0
  return vehicleTones[(index + 1) % vehicleTones.length]
}

function vehicleLabel(vehicle: Vehicle) {
  const name = vehicle.id === 'X' ? 'Target vehicle X' : `Vehicle ${vehicle.id}`
  const orientation = vehicle.axis === 'H' ? 'horizontal' : 'vertical'
  return `${name}, ${orientation}, ${vehicle.length} cells, row ${String.fromCharCode(65 + vehicle.row)}, column ${vehicle.col + 1}`
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function projectedPosition(drag: Drag, event: PointerEvent<HTMLButtonElement>, vehicle: Vehicle, board: Puzzle, mode: Mode) {
  const rowOffset = Math.round((event.clientY - drag.startY) / drag.cellHeight)
  const colOffset = Math.round((event.clientX - drag.startX) / drag.cellWidth)

  if (mode === 'play') {
    return {
      row: vehicle.row + (vehicle.axis === 'V' ? clamp(rowOffset, drag.min, drag.max) : 0),
      col: vehicle.col + (vehicle.axis === 'H' ? clamp(colOffset, drag.min, drag.max) : 0),
    }
  }

  return {
    row: clamp(vehicle.row + rowOffset, 0, board.rows - (vehicle.axis === 'V' ? vehicle.length : 1)),
    col: clamp(vehicle.col + colOffset, 0, board.cols - (vehicle.axis === 'H' ? vehicle.length : 1)),
  }
}

function VehicleArtwork({ id }: { id: string }) {
  return <span className="vehicle-body" aria-hidden="true">
    <span className="vehicle-cabin" />
    <span className="vehicle-id">{id}</span>
    <span className="vehicle-lights" />
  </span>
}

export function Board({ board, label, mode = 'play', selected, onSelect, onMove, onCell, onRelocate,
  blockers = noBlockers, highlight, animate = true }: BoardProps) {
  const grid = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const suppressClick = useRef(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [cursor, setCursor] = useState(0)

  const occupied = useMemo(() => {
    const cells = new Set<number>()
    for (const vehicle of board.vehicles) {
      for (let offset = 0; offset < vehicle.length; offset++) {
        const [row, col] = cellOf(vehicle, offset)
        cells.add(row * board.cols + col)
      }
    }
    return cells
  }, [board.cols, board.vehicles])

  const cells = useMemo(() => Array.from({ length: board.rows * board.cols }, (_, index) => ({
    index,
    row: Math.floor(index / board.cols),
    col: index % board.cols,
  })), [board.rows, board.cols])

  const editableCells = mode === 'edit' && Boolean(onCell)
  const firstOpenCell = editableCells ? cells.find(({ index }) => !occupied.has(index))?.index ?? -1 : -1
  const focusCell = cells[cursor] && !occupied.has(cursor) ? cursor : firstOpenCell
  const exitRow = board.vehicles.find(({ id }) => id === 'X')?.row ?? -1
  const summary = mode === 'read'
    ? `${label}, ${board.cols} columns by ${board.rows} rows. ${board.vehicles.map(vehicleLabel).join('. ')}.${exitRow >= 0 ? ` Exit on the right of row ${String.fromCharCode(65 + exitRow)}.` : ''}`
    : label
  const dimensions = {
    '--board-cols': board.cols,
    '--board-rows': board.rows,
    '--exit-y': `${(exitRow + .5) / board.rows * 100}%`,
    '--id-size': `${clamp(105 / board.cols, 10, 18)}px`,
  } as CSSProperties

  function startDrag(event: PointerEvent<HTMLButtonElement>, vehicle: Vehicle) {
    if (event.button !== 0 || !event.isPrimary) return
    suppressClick.current = false
    if ((mode === 'play' && !onMove) || (mode === 'edit' && !onRelocate) || !grid.current) return

    const bounds = grid.current.getBoundingClientRect()
    const available = mode === 'play' ? legalMoves(board, vehicle.id).map(({ delta }) => delta) : []
    drag.current = {
      id: vehicle.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      cellWidth: bounds.width / board.cols,
      cellHeight: bounds.height / board.rows,
      min: Math.min(0, ...available),
      max: Math.max(0, ...available),
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function updateDrag(event: PointerEvent<HTMLButtonElement>, vehicle: Vehicle) {
    const active = drag.current
    if (!active || active.id !== vehicle.id || active.pointerId !== event.pointerId) return
    if (!active.moved) {
      if (Math.hypot(event.clientX - active.startX, event.clientY - active.startY) < 5) return
      active.moved = true
      onSelect?.(vehicle.id)
    }

    const position = projectedPosition(active, event, vehicle, board, mode)
    const invalid = mode === 'edit' && Boolean(validateBoard({
      ...board,
      vehicles: board.vehicles.map((piece) => piece.id === vehicle.id ? { ...piece, ...position } : piece),
    }))
    setPreview((current) => current?.id === vehicle.id && current.row === position.row && current.col === position.col
      && current.invalid === invalid ? current : { ...position, id: vehicle.id, invalid })
  }

  function cancelDrag(pointerId: number) {
    if (drag.current?.pointerId !== pointerId) return
    suppressClick.current = drag.current.moved
    drag.current = null
    setPreview(null)
  }

  function endDrag(event: PointerEvent<HTMLButtonElement>, vehicle: Vehicle) {
    const active = drag.current
    if (!active || active.id !== vehicle.id || active.pointerId !== event.pointerId) return
    cancelDrag(event.pointerId)
    if (!active.moved) return

    const { row, col } = projectedPosition(active, event, vehicle, board, mode)
    if (row === vehicle.row && col === vehicle.col) return
    if (mode === 'edit') onRelocate?.(vehicle.id, row, col)
    if (mode === 'play') onMove?.({ id: vehicle.id, delta: vehicle.axis === 'H' ? col - vehicle.col : row - vehicle.row })
  }

  function moveFromKey(event: KeyboardEvent<HTMLButtonElement>, vehicle: Vehicle) {
    const direction = arrows[event.key]
    if (!direction) return
    event.preventDefault()
    event.stopPropagation()
    onSelect?.(vehicle.id)
    if (mode === 'edit') {
      onRelocate?.(vehicle.id, vehicle.row + direction.row, vehicle.col + direction.col)
    } else if (mode === 'play') {
      const delta = vehicle.axis === 'H' ? direction.col : direction.row
      const move = legalMoves(board, vehicle.id).find((candidate) => candidate.delta === delta)
      if (move) onMove?.(move)
    }
  }

  function focusFromKey(event: KeyboardEvent<HTMLButtonElement>, position: Position) {
    const direction = arrows[event.key]
    if (!direction) return
    event.preventDefault()
    event.stopPropagation()
    let row = position.row + direction.row
    let col = position.col + direction.col
    while (row >= 0 && row < board.rows && col >= 0 && col < board.cols) {
      const index = row * board.cols + col
      if (!occupied.has(index)) {
        setCursor(index)
        grid.current?.querySelector<HTMLButtonElement>(`[data-cell="${index}"]`)?.focus()
        return
      }
      row += direction.row
      col += direction.col
    }
  }

  return (
    <div className={`puzzle-board puzzle-board--${mode}${animate ? ' puzzle-board--animate' : ''}`} style={dimensions}
      role={mode === 'read' ? 'img' : 'group'} aria-label={summary}>
      <div className="board-x-labels" aria-hidden="true">
        {Array.from({ length: board.cols }, (_, index) => <span key={index}>{index + 1}</span>)}
      </div>
      <div className="board-y-labels" aria-hidden="true">
        {Array.from({ length: board.rows }, (_, index) => <span key={index}>{String.fromCharCode(65 + index)}</span>)}
      </div>
      <div className="puzzle-grid" ref={grid}>
        <div className="puzzle-tiles" aria-hidden={editableCells ? undefined : true}>
          {cells.map(({ index, row, col }) => {
            if (!editableCells || occupied.has(index)) return <span key={index} className="puzzle-tile" />
            return <button type="button" className="puzzle-tile puzzle-tile--open" key={index}
              aria-label={`Place at row ${String.fromCharCode(65 + row)}, column ${col + 1}`} data-cell={index}
              tabIndex={index === focusCell ? 0 : -1} onFocus={() => setCursor(index)}
              onKeyDown={(event) => focusFromKey(event, { row, col })} onClick={(event) => {
                const activeCell = event.currentTarget
                onCell?.(row, col)
                if (event.detail === 0) requestAnimationFrame(() => {
                  if (!activeCell.isConnected) grid.current?.querySelector<HTMLButtonElement>('[data-vehicle][aria-pressed="true"]')?.focus()
                })
              }} />
          })}
        </div>
        {exitRow >= 0 ? <div className="puzzle-exit" aria-hidden="true"><Icon name="arrow" size={16} /><span>EXIT</span></div> : null}
        {board.vehicles.map((vehicle) => {
          const currentPreview = preview?.id === vehicle.id ? preview : null
          const { row, col } = currentPreview ?? vehicle
          const width = vehicle.axis === 'H' ? vehicle.length : 1
          const height = vehicle.axis === 'V' ? vehicle.length : 1
          const style = {
            '--vehicle-width': `${width / board.cols * 100}%`,
            '--vehicle-height': `${height / board.rows * 100}%`,
            '--vehicle-x': `${col / width * 100}%`,
            '--vehicle-y': `${row / height * 100}%`,
          } as CSSProperties
          const classes = ['puzzle-vehicle', `puzzle-vehicle--${tone(vehicle.id)}`, `puzzle-vehicle--${vehicle.axis.toLowerCase()}`]
          if (selected === vehicle.id) classes.push('puzzle-vehicle--selected')
          if (highlight === vehicle.id) classes.push('puzzle-vehicle--highlight')
          if (blockers.includes(vehicle.id)) classes.push('puzzle-vehicle--blocker')
          if (currentPreview) classes.push('puzzle-vehicle--dragging')
          if (currentPreview?.invalid) classes.push('puzzle-vehicle--invalid')

          if (mode === 'read') return <span className={classes.join(' ')} key={vehicle.id} style={style} aria-hidden="true">
            <VehicleArtwork id={vehicle.id} />
          </span>

          return <button type="button" className={classes.join(' ')} key={vehicle.id} style={style}
            aria-label={vehicleLabel(vehicle)} aria-pressed={selected === vehicle.id} data-vehicle={vehicle.id}
            onPointerDown={(event) => startDrag(event, vehicle)} onPointerMove={(event) => updateDrag(event, vehicle)}
            onPointerUp={(event) => endDrag(event, vehicle)} onPointerCancel={(event) => cancelDrag(event.pointerId)}
            onLostPointerCapture={(event) => cancelDrag(event.pointerId)} onKeyDown={(event) => moveFromKey(event, vehicle)}
            onClick={(event) => {
              if (!suppressClick.current || event.detail === 0) onSelect?.(vehicle.id)
              suppressClick.current = false
            }}>
            <VehicleArtwork id={vehicle.id} />
          </button>
        })}
      </div>
    </div>
  )
}
