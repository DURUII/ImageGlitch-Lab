import { useMemo, useState } from 'react'
import { DndContext, DragOverlay, closestCenter, type DragEndEvent, type DragStartEvent, type DragOverEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { createPortal } from 'react-dom'
import styles from './AssetsTimeline.module.css'
import type { Subject } from '@/types'

interface AssetsTimelineProps {
  subjects: Subject[]
  isLocked?: boolean
  onReorder?: (fromIndex: number, toIndex: number) => void
  onDurationChange?: (id: number, delta: number) => void
  onNameChange?: (id: number, name: string) => void
  onColorChange?: (id: number, color: string) => void
  onPreviewSubject?: (id: number) => void
  onFocusPreview?: (id: number) => void
  onDelete?: (id: number) => void
  onDuplicate?: (id: number) => void
  currentPlayingIndex?: number | null
  newlyAddedId?: number | null
  deleteEffectId?: number | null
}

function SortableRow({
  subject,
  index,
  isLocked,
  isActive,
  isNew,
  isDelete,
  onDurationChange,
  onNameChange,
  onColorChange,
  onPreviewSubject,
  onFocusPreview,
  onDelete,
  onDuplicate
}: {
  subject: Subject
  index: number
  isLocked: boolean
  isActive: boolean
  isNew: boolean
  isDelete: boolean
  onDurationChange?: (id: number, delta: number) => void
  onNameChange?: (id: number, name: string) => void
  onColorChange?: (id: number, color: string) => void
  onPreviewSubject?: (id: number) => void
  onFocusPreview?: (id: number) => void
  onDelete?: (id: number) => void
  onDuplicate?: (id: number) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: subject.id, disabled: isLocked })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        styles.subjectRow,
        isActive ? styles.active : '',
        isNew ? styles.justAdded : '',
        isDelete ? styles.deleteBurst : '',
        !isLocked ? styles.draggable : '',
        isDragging ? styles.placeholder : ''
      ].join(' ')}
      {...attributes}
      {...listeners}
    >
      <div className={styles.index}>{String(index + 1).padStart(2, '0')}</div>
      
      <img 
        src={subject.previewUrl || subject.coloredMaskUrl} 
        className={styles.thumbnail}
        alt={subject.name}
        draggable={false}
      />
      
      <div className={styles.info}>
        <div className={styles.nameRow}>
          <input
            className={styles.nameInput}
            value={subject.name}
            onChange={(e) => onNameChange?.(subject.id, e.target.value)}
            onPointerDown={e => e.stopPropagation()}
            onFocus={() => onFocusPreview?.(subject.id)}
            disabled={isLocked}
            style={{ color: subject.color }}
          />
          <input
            className={styles.colorPicker}
            type="color"
            value={subject.color}
            onChange={(e) => onColorChange?.(subject.id, e.target.value)}
            onPointerDown={e => e.stopPropagation()}
            onFocus={() => onFocusPreview?.(subject.id)}
            disabled={isLocked}
            aria-label="Color"
          />
        </div>
        <div className={styles.durationControl}>
          <span>{(subject.duration ?? 0.1).toFixed(2)}s</span>
          {!isLocked && (
            <>
              <button className={styles.durationBtn} onPointerDown={e => e.stopPropagation()} onClick={() => onDurationChange?.(subject.id, -0.05)} onFocus={() => onFocusPreview?.(subject.id)}>-</button>
              <button className={styles.durationBtn} onPointerDown={e => e.stopPropagation()} onClick={() => onDurationChange?.(subject.id, 0.05)} onFocus={() => onFocusPreview?.(subject.id)}>+</button>
            </>
          )}
        </div>
      </div>

      {!isLocked && (
        <div className={styles.actions}>
          <button
            className={styles.actionIcon}
            onClick={() => onPreviewSubject?.(subject.id)}
            title="Preview"
            type="button"
            onPointerDown={e => e.stopPropagation()}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6-10-6-10-6z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
          <button
            className={styles.actionIcon}
            onClick={() => onDuplicate?.(subject.id)}
            title="Duplicate"
            type="button"
            onPointerDown={e => e.stopPropagation()}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          </button>
          <button
            className={styles.actionIcon}
            onClick={() => onDelete?.(subject.id)}
            title="Delete"
            type="button"
            onPointerDown={e => e.stopPropagation()}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18"/>
              <path d="M8 6V4h8v2"/>
              <path d="M19 6l-1 14H6L5 6"/>
              <path d="M10 11v6M14 11v6"/>
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}

export default function AssetsTimeline({
  subjects,
  isLocked = false,
  onReorder,
  onDurationChange,
  onNameChange,
  onColorChange,
  onPreviewSubject,
  onFocusPreview,
  onDelete,
  onDuplicate,
  currentPlayingIndex,
  newlyAddedId,
  deleteEffectId
}: AssetsTimelineProps) {
  const [activeId, setActiveId] = useState<number | null>(null)
  const ids = useMemo(() => subjects.map(subject => subject.id), [subjects])

  const handleDragStart = (event: DragStartEvent) => {
    if (isLocked) return
    const id = event.active.id as number
    setActiveId(id)
  }

  const handleDragOver = (event: DragOverEvent) => {
    if (isLocked) return
    const { active, over } = event
    if (!over) return
    if (over.id === 'trash') return
    const activeIndex = subjects.findIndex(s => s.id === active.id)
    const overIndex = subjects.findIndex(s => s.id === over.id)
    if (activeIndex === -1 || overIndex === -1) return
    if (activeIndex !== overIndex) {
      onReorder?.(activeIndex, overIndex)
    }
  }

  const handleDragEnd = (_event: DragEndEvent) => {
    setActiveId(null)
  }

  const handleDragCancel = () => {
    setActiveId(null)
  }

  const activeSubject = activeId ? subjects.find(s => s.id === activeId) : null

  return (
    <div className={styles.container}>
      <DndContext
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div className={`${styles.list} ${isLocked ? styles.listLocked : ''}`}>
            {subjects.length === 0 ? (
              <div className={styles.emptyState}>
                <p>NO SUBJECTS</p>
                <p>SELECT & ADD FROM CANVAS</p>
              </div>
            ) : (
              subjects.map((subject, index) => (
                <SortableRow
                  key={subject.id}
                  subject={subject}
                  index={index}
                  isLocked={isLocked}
                  isActive={currentPlayingIndex === index}
                  isNew={subject.id === newlyAddedId}
                  isDelete={subject.id === deleteEffectId}
                  onDurationChange={onDurationChange}
                  onNameChange={onNameChange}
                  onColorChange={onColorChange}
                  onPreviewSubject={onPreviewSubject}
                  onFocusPreview={onFocusPreview}
                  onDelete={onDelete}
                  onDuplicate={onDuplicate}
                />
              ))
            )}
          </div>
        </SortableContext>

        {typeof document !== 'undefined' && createPortal(
          <DragOverlay adjustScale={false}>
            {activeSubject ? (
              <div className={`${styles.subjectRow} ${styles.dragOverlay}`}>
                <div className={styles.index}>--</div>
                <img 
                  src={activeSubject.previewUrl || activeSubject.coloredMaskUrl} 
                  className={styles.thumbnail}
                  alt={activeSubject.name}
                  draggable={false}
                />
                <div className={styles.info}>
                  <span className={styles.nameText} style={{ color: activeSubject.color }}>{activeSubject.name}</span>
                  <div className={styles.durationControl}>
                    <span>{(activeSubject.duration ?? 0.1).toFixed(2)}s</span>
                  </div>
                </div>
              </div>
            ) : null}
          </DragOverlay>,
          document.body
        )}
      </DndContext>
    </div>
  )
}
