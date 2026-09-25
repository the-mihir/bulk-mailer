import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Download, FileSpreadsheet, Loader2, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import type { DuplicateRow, InvalidRow, ParseResult, Recipient } from '@shared/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { VirtualTable, type Column } from '@/components/common/VirtualTable'
import { Page, PageHeader } from '@/components/layout/PageHeader'
import { api, call, errorMessage } from '@/lib/api'
import { nf } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useCampaign } from '@/store/campaign'

const NONE = '__none__'

export default function ImportPage(): React.JSX.Element {
  const navigate = useNavigate()
  const { imported, setImported } = useCampaign()
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [mapping, setMapping] = useState<{ path: string; result: Extract<ParseResult, { kind: 'needsMapping' }> } | null>(null)

  const parse = async (path: string, map?: { name: string | null; email: string }): Promise<void> => {
    setBusy(true)
    try {
      const res = await call(api.excel.parse({ path, mapping: map }))
      if (res.kind === 'needsMapping') {
        setMapping({ path, result: res })
        return
      }
      setMapping(null)
      setImported(res)
      if (res.truncated) toast.warning('Only the first 10,000 rows were imported.')
      toast.success(`${nf.format(res.valid.length)} valid recipient(s) from ${res.fileName}`)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const pick = async (): Promise<void> => {
    const path = await call(api.file.open()).catch((e) => {
      toast.error(errorMessage(e))
      return null
    })
    if (path) await parse(path)
  }

  const onDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      toast.error('Drop a .xlsx, .xls or .csv file.')
      return
    }
    void parse(api.file.pathFor(file))
  }

  const saveSample = async (): Promise<void> => {
    try {
      const p = await call(api.excel.saveSample())
      if (p) toast.success('Sample saved')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <Page>
      <PageHeader
        title="Import recipients"
        description="First row is the header. Needs an email column; name and any other columns are optional."
        actions={
          <Button variant="outline" onClick={() => void saveSample()}>
            <Download /> Sample file
          </Button>
        }
      />

      <Card
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn('mb-6 border-2 border-dashed transition-colors', dragging && 'border-primary bg-accent')}
      >
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          {busy ? <Loader2 className="size-8 animate-spin text-muted-foreground" /> : <Upload className="size-8 text-muted-foreground" />}
          <div>
            <p className="font-medium">Drag and drop a spreadsheet here</p>
            <p className="text-sm text-muted-foreground">.xlsx, .xls or .csv · up to 10,000 rows</p>
          </div>
          <Button onClick={() => void pick()} disabled={busy}>
            <FileSpreadsheet /> Choose file
          </Button>
        </CardContent>
      </Card>

      {imported ? (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="size-4" /> {imported.fileName}
              </CardTitle>
              <CardDescription className="mt-1">
                Variables:{' '}
                {imported.variables.map((v) => (
                  <code key={v} className="mr-1 rounded bg-muted px-1 py-0.5 text-xs">{`{{${v}}}`}</code>
                ))}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="icon" onClick={() => setImported(null)} aria-label="Clear">
                <X />
              </Button>
              <Button onClick={() => navigate('/compose')} disabled={imported.valid.length === 0}>
                Compose <ArrowRight />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {imported.truncated ? (
              <p className="mb-3 flex items-center gap-2 text-sm text-warning">
                <AlertTriangle className="size-4" /> File had more than 10,000 rows. Extra rows were skipped.
              </p>
            ) : null}
            <Tabs defaultValue="valid">
              <TabsList>
                <TabsTrigger value="valid">
                  Valid <Badge variant="success">{nf.format(imported.valid.length)}</Badge>
                </TabsTrigger>
                <TabsTrigger value="invalid">
                  Invalid <Badge variant={imported.invalid.length ? 'destructive' : 'secondary'}>{nf.format(imported.invalid.length)}</Badge>
                </TabsTrigger>
                <TabsTrigger value="duplicates">
                  Duplicate <Badge variant={imported.duplicates.length ? 'warning' : 'secondary'}>{nf.format(imported.duplicates.length)}</Badge>
                </TabsTrigger>
              </TabsList>
              <TabsContent value="valid" className="mt-3">
                <VirtualTable rows={imported.valid} columns={validColumns(imported.variables)} rowKey={(r) => String(r.row)} empty="No valid recipients." />
              </TabsContent>
              <TabsContent value="invalid" className="mt-3">
                <VirtualTable rows={imported.invalid} columns={invalidColumns} rowKey={(r) => String(r.row)} empty="No invalid rows." />
              </TabsContent>
              <TabsContent value="duplicates" className="mt-3">
                <VirtualTable rows={imported.duplicates} columns={duplicateColumns} rowKey={(r) => String(r.row)} empty="No duplicates." />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      ) : null}

      {mapping ? (
        <MappingDialog
          result={mapping.result}
          busy={busy}
          onCancel={() => setMapping(null)}
          onConfirm={(m) => void parse(mapping.path, m)}
        />
      ) : null}
    </Page>
  )
}

/** Row, name, email, then up to 3 extra spreadsheet columns. */
function validColumns(variables: string[]): Column<Recipient>[] {
  const extra = variables.filter((v) => v !== 'name' && v !== 'email').slice(0, 3)
  return [
    { key: 'row', header: 'Row', className: 'w-16 text-muted-foreground', cell: (r) => r.row },
    { key: 'name', header: 'Name', cell: (r) => r.name || <span className="text-muted-foreground italic">empty</span> },
    { key: 'email', header: 'Email', cell: (r) => r.email },
    ...extra.map((k) => ({ key: `f:${k}`, header: k, cell: (r: Recipient) => r.fields[k] ?? '' }))
  ]
}

const invalidColumns: Column<InvalidRow>[] = [
  { key: 'row', header: 'Row', className: 'w-16 text-muted-foreground', cell: (r) => r.row },
  { key: 'name', header: 'Name', cell: (r) => r.name },
  { key: 'email', header: 'Email', cell: (r) => r.email || <span className="text-muted-foreground italic">empty</span> },
  { key: 'reason', header: 'Reason', cell: (r) => <span className="text-destructive">{r.reason}</span> }
]

const duplicateColumns: Column<DuplicateRow>[] = [
  { key: 'row', header: 'Row', className: 'w-16 text-muted-foreground', cell: (r) => r.row },
  { key: 'name', header: 'Name', cell: (r) => r.name },
  { key: 'email', header: 'Email', cell: (r) => r.email },
  { key: 'first', header: 'First seen', cell: (r) => `row ${r.firstRow}` }
]

function MappingDialog({
  result,
  busy,
  onCancel,
  onConfirm
}: {
  result: Extract<ParseResult, { kind: 'needsMapping' }>
  busy: boolean
  onCancel: () => void
  onConfirm: (m: { name: string | null; email: string }) => void
}): React.JSX.Element {
  const [email, setEmail] = useState(result.guess.email ?? '')
  const [name, setName] = useState(result.guess.name ?? NONE)

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Map columns</DialogTitle>
          <DialogDescription>
            No column named “email” was found in {result.fileName}. Pick which columns hold the email and name.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Email column</Label>
            <Select value={email} onValueChange={setEmail}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose column" />
              </SelectTrigger>
              <SelectContent>
                {result.headers.map((h) => (
                  <SelectItem key={h} value={h}>
                    {h}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Name column</Label>
            <Select value={name} onValueChange={setName}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No name column</SelectItem>
                {result.headers.map((h) => (
                  <SelectItem key={h} value={h}>
                    {h}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button disabled={!email || busy} onClick={() => onConfirm({ email, name: name === NONE ? null : name })}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
