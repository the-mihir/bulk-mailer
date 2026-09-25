import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { cn } from '@/lib/utils'

export interface Column<T> {
  key: string
  header: string
  className?: string
  cell: (row: T) => React.ReactNode
}

const ROW_HEIGHT = 40

/** Renders only visible rows, so 10,000 recipients stay smooth. */
export function VirtualTable<T>({
  rows,
  columns,
  rowKey,
  height = 420,
  empty = 'Nothing here.'
}: {
  rows: T[]
  columns: Column<T>[]
  rowKey: (row: T, index: number) => string
  height?: number
  empty?: string
}): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12
  })
  const items = virtualizer.getVirtualItems()
  const padTop = items[0]?.start ?? 0
  const padBottom = items.length ? virtualizer.getTotalSize() - items[items.length - 1].end : 0

  return (
    <div ref={scrollRef} className="overflow-auto rounded-md border" style={{ height }}>
      <table className="w-full caption-bottom text-sm">
        <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
          <tr className="border-b">
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn('h-10 px-3 text-left align-middle font-medium whitespace-nowrap text-muted-foreground', c.className)}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                {empty}
              </td>
            </tr>
          ) : null}
          {padTop > 0 ? <tr style={{ height: padTop }} /> : null}
          {items.map((vi) => {
            const row = rows[vi.index]
            return (
              <tr key={rowKey(row, vi.index)} className="border-b hover:bg-muted/50" style={{ height: ROW_HEIGHT }}>
                {columns.map((c) => (
                  <td key={c.key} className={cn('max-w-72 truncate px-3 align-middle', c.className)}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            )
          })}
          {padBottom > 0 ? <tr style={{ height: padBottom }} /> : null}
        </tbody>
      </table>
    </div>
  )
}
