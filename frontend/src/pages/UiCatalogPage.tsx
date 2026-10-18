import { useState } from 'react'
import { ErrorState, EmptyState, ProductCardSkeleton, QueueState } from '@/components/feedback/States'
import { useToast } from '@/components/feedback/toastContext'
import { AccordionItem } from '@/components/ui/Accordion'
import { Badge, ProductStatusBadge, StatusBadge, StockLabel } from '@/components/ui/Badge'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'
import { Button } from '@/components/ui/Button'
import { RemovableChip, ToggleChips } from '@/components/ui/Chip'
import { DataTable } from '@/components/ui/DataTable'
import { Dialog } from '@/components/ui/Dialog'
import { Checkbox, FormErrorSummary, RadioGroup, Select, TextField, Textarea } from '@/components/ui/Field'
import { InlineConfirm } from '@/components/ui/InlineConfirm'
import { Pagination } from '@/components/ui/Pagination'
import { Price } from '@/components/ui/Price'
import { QuantityStepper } from '@/components/ui/QuantityStepper'
import { StarRatingDisplay, StarRatingInput } from '@/components/ui/StarRating'
import { Stepper } from '@/components/ui/Stepper'
import { Switch } from '@/components/ui/Switch'
import { Tabs } from '@/components/ui/Tabs'
import { usePageTitle } from '@/hooks/usePageTitle'
import { ORDER_STATUSES } from '@/lib/orderStatus'
import styles from './UiCatalogPage.module.css'

/** Catálogo visual de los componentes base (solo en desarrollo, ruta /_ui). */
export function UiCatalogPage() {
  usePageTitle('Componentes')
  const { toast } = useToast()
  const [qty, setQty] = useState(1)
  const [on, setOn] = useState(true)
  const [tab, setTab] = useState<'pintura' | 'piso' | 'taquetes'>('pintura')
  const [chip, setChip] = useState<'todos' | 'curso' | 'fin'>('todos')
  const [radio, setRadio] = useState<'envio' | 'recoger'>('recoger')
  const [stars, setStars] = useState(4)
  const [dialog, setDialog] = useState(false)
  const [confirm, setConfirm] = useState(false)

  return (
    <>
      <h1>Componentes</h1>

      <Section title="Botones">
        <div className={styles.row}>
          <Button>Agregar al carrito</Button>
          <Button variant="secondary">Elegir variante</Button>
          <Button variant="ghost">Ver envío a domicilio</Button>
          <Button variant="outline">Ver detalle</Button>
          <Button variant="danger">Eliminar</Button>
          <Button loading>Guardando</Button>
          <Button disabled>Deshabilitado</Button>
          <Button size="lg">Pagar</Button>
        </div>
        <div className={styles.dark}>
          <Button variant="outlineDark">Quitar todos</Button>
        </div>
      </Section>

      <Section title="Campos">
        <FormErrorSummary>Revisa 1 campo antes de continuar.</FormErrorSummary>
        <div className={styles.grid}>
          <TextField label="Correo electrónico" type="email" autoComplete="email" />
          <TextField label="Contraseña" type="password" error="Tu contraseña tiene 7 caracteres. Usa al menos 8." />
          <TextField label="Teléfono" optional hint="10 dígitos" />
          <Select label="Ordenar por" defaultValue="rel">
            <option value="rel">Más relevantes</option>
            <option value="asc">Menor precio</option>
          </Select>
        </div>
        <Textarea label="Comentario" />
        <Checkbox label="He leído y acepto el aviso de privacidad." />
        <RadioGroup
          legend="Disponibilidad"
          name="disp"
          value={radio}
          onChange={setRadio}
          options={[
            { value: 'recoger', label: 'Recoger hoy en Toluca Centro' },
            { value: 'envio', label: 'Envío o recolección' },
          ]}
        />
        <Switch label="Vista 360° de producto" description="En prueba en Android de gama baja" checked={on} onChange={setOn} />
        <QuantityStepper value={qty} onChange={setQty} max={12} itemName="Taladro percutor" />
        <StarRatingInput value={stars} onChange={setStars} />
      </Section>

      <Section title="Estados y precios">
        <div className={styles.row}>
          {ORDER_STATUSES.map((s) => (
            <StatusBadge key={s} status={s} />
          ))}
        </div>
        <div className={styles.row}>
          <ProductStatusBadge status="publicado" />
          <ProductStatusBadge status="borrador" />
          <ProductStatusBadge status="agotado" />
          <Badge tone="info">Info</Badge>
        </div>
        <div className={styles.row}>
          <StockLabel status="ok">12 en Toluca Centro</StockLabel>
          <StockLabel status="low">Quedan 3 en Toluca Centro</StockLabel>
          <StockLabel status="out">Agotado en tu sucursal</StockLabel>
          <StockLabel status="ship_only">Solo envío a domicilio</StockLabel>
        </div>
        <div className={styles.row}>
          <Price amount={214900} />
          <Price amount={214900} size="ficha" before={249900} />
          <Price amount={129950} size="linea" from />
          <StarRatingDisplay value={4.6} count={128} />
        </div>
      </Section>

      <Section title="Navegación">
        <Breadcrumbs
          items={[
            { label: 'Inicio', to: '/' },
            { label: 'Herramientas', to: '/categoria/herramientas' },
            { label: 'Herramientas eléctricas', to: '/categoria/herramientas-electricas' },
            { label: 'Taladros' },
          ]}
        />
        <Pagination page={2} totalPages={9} />
        <ToggleChips
          label="Filtrar por estado"
          value={chip}
          onChange={setChip}
          options={[
            { value: 'todos', label: 'Todos' },
            { value: 'curso', label: 'En curso' },
            { value: 'fin', label: 'Terminados' },
          ]}
        />
        <div className={styles.row}>
          <RemovableChip onRemove={() => toast('Filtro quitado')}>Hasta $5,000</RemovableChip>
          <RemovableChip onRemove={() => toast('Filtro quitado')}>Mandril 3/8 a 1/2 pulg</RemovableChip>
        </div>
        <Stepper steps={['Productos', 'Motivo', 'Entrega', 'Confirmar']} current={1} />
        <Tabs
          label="Tipo de cálculo"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'pintura', label: 'Pintura', panel: <p>Panel de pintura</p> },
            { value: 'piso', label: 'Piso', panel: <p>Panel de piso</p> },
            { value: 'taquetes', label: 'Taquetes', panel: <p>Panel de taquetes</p> },
          ]}
        />
        <AccordionItem title="Especificaciones" headingLevel={3}>
          <p>Contenido del acordeón.</p>
        </AccordionItem>
      </Section>

      <Section title="Tabla">
        <DataTable
          caption="Pedidos de ejemplo"
          rowKey={(r) => r.id}
          columns={[
            { key: 'id', header: 'Pedido', cell: (r) => r.id, rowHeader: true },
            { key: 'cliente', header: 'Cliente', cell: (r) => r.cliente },
            { key: 'estado', header: 'Estado', cell: (r) => <StatusBadge status={r.estado} /> },
            { key: 'total', header: 'Total', cell: (r) => <Price amount={r.total} size="linea" />, align: 'end', sortable: true },
          ]}
          rows={[
            { id: '10483', cliente: 'Jorge M.', estado: 'pendiente_pago' as const, total: 189000 },
            { id: '10482', cliente: 'Ana L.', estado: 'listo_para_recoger' as const, total: 333700 },
          ]}
          sort={{ key: 'total', dir: 'desc' }}
          onSortChange={() => toast('Orden cambiado')}
        />
      </Section>

      <Section title="Diálogos y avisos">
        <div className={styles.row}>
          <Button variant="outline" onClick={() => setDialog(true)}>
            Abrir diálogo
          </Button>
          <Button variant="outline" onClick={() => toast('Agregado al carrito', 'ok')}>
            Mostrar aviso
          </Button>
          <Button variant="outline" onClick={() => setConfirm(true)}>
            Eliminar dirección
          </Button>
        </div>
        {confirm && (
          <InlineConfirm question="¿Eliminar la dirección Casa?" onConfirm={() => setConfirm(false)} onCancel={() => setConfirm(false)} />
        )}
        <Dialog open={dialog} onClose={() => setDialog(false)} title="Filtros" variant="sheet" footer={<Button onClick={() => setDialog(false)}>Ver resultados</Button>}>
          <p>Contenido del panel.</p>
        </Dialog>
      </Section>

      <Section title="Estados de página">
        <EmptyState title='No encontramos "taladro inalambico rojo 36v"'>Revisa la ortografía o usa menos palabras.</EmptyState>
        <ErrorState title="No pudimos cargar los productos" onRetry={() => toast('Reintentando')} />
        <div className={styles.cards}>
          <ProductCardSkeleton />
          <ProductCardSkeleton />
        </div>
        <QueueState position={42} progress={65} />
      </Section>
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={styles.section}>
      <h2>{title}</h2>
      {children}
    </section>
  )
}
