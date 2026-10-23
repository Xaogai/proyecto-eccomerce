import { type ReactNode, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useFeatureFlag } from '@/app/featureFlags'
import { EmptyState } from '@/components/feedback/States'
import { Button, ButtonLink } from '@/components/ui/Button'
import { FormField, Select } from '@/components/ui/Field'
import { Tabs } from '@/components/ui/Tabs'
import { useAddToCart } from '@/features/cart/api'
import {
  anchors,
  type FieldDef,
  fieldError,
  floor,
  format1,
  paint,
  parseNumber,
} from '@/features/calculator/calc'
import { useProducts } from '@/features/catalog/api'
import { usePageTitle } from '@/hooks/usePageTitle'
import { plural } from '@/lib/format'
import styles from './tools.module.css'

type Kind = 'pintura' | 'piso' | 'taquetes'
const KINDS: Kind[] = ['pintura', 'piso', 'taquetes']

/** Calculadora de materiales (pantallas 19 y 26; A10). La pestaña vive en la URL: /calculadora/piso. */
export function CalculatorPage() {
  usePageTitle('Calculadora de materiales')
  const enabled = useFeatureFlag('calc')
  const { tipo } = useParams()
  const navigate = useNavigate()
  const kind: Kind = KINDS.includes(tipo as Kind) ? (tipo as Kind) : 'pintura'

  if (!enabled) {
    return (
      <EmptyState
        headingLevel={1}
        title="La calculadora no está disponible por ahora"
        actions={<ButtonLink to="/">Ir al inicio</ButtonLink>}
      />
    )
  }

  return (
    <>
      <h1>Calculadora de materiales</h1>
      <Tabs
        label="Tipo de cálculo"
        value={kind}
        onChange={(k) => navigate(`/calculadora/${k}`, { replace: true })}
        tabs={[
          { value: 'pintura', label: 'Pintura', panel: <PaintCalculator /> },
          { value: 'piso', label: 'Piso y azulejo', panel: <FloorCalculator /> },
          { value: 'taquetes', label: 'Taquetes y tornillos', panel: <AnchorCalculator /> },
        ]}
      />
    </>
  )
}

/** Campos numéricos con error en vivo enlazado al campo (28.3: etiquetas y errores accesibles). */
function useNumberFields(defs: FieldDef[], initial: Record<string, string>) {
  const [values, setValues] = useState(initial)
  const errors = Object.fromEntries(defs.map((d) => [d.id, fieldError(values[d.id] ?? '', d)]))
  const valid = Object.values(errors).every((e) => e === null)
  const n = (id: string) => parseNumber(values[id]) ?? 0
  const fields = defs.map((d) => (
    <FormField
      key={d.id}
      label={d.label}
      hint={errors[d.id] ? undefined : d.help}
      error={errors[d.id] ?? undefined}
    >
      {(control) => (
        <input
          {...control}
          inputMode="decimal"
          value={values[d.id]}
          onChange={(e) => setValues((v) => ({ ...v, [d.id]: e.target.value }))}
        />
      )}
    </FormField>
  ))
  return { fields, valid, n }
}

function Layout({ title, form, result }: { title: string; form: ReactNode; result: ReactNode }) {
  return (
    <div className={styles.calc}>
      <form className={styles.card} noValidate onSubmit={(e) => e.preventDefault()}>
        <h2>{title}</h2>
        {form}
      </form>
      <section aria-labelledby="resultado" aria-live="polite" className={`${styles.card} ${styles.result}`}>
        <h2 id="resultado">Resultado</h2>
        {result}
      </section>
    </div>
  )
}

const INVALID = <p>Corrige los campos marcados para ver el resultado.</p>

function PaintCalculator() {
  const [coats, setCoats] = useState(2)
  const { fields, valid, n } = useNumberFields(
    [
      { id: 'ancho', label: 'Ancho de cada muro (m)', help: 'Ejemplo: 4', min: 0.1 },
      { id: 'alto', label: 'Alto de cada muro (m)', help: 'Ejemplo: 2.5', min: 0.1 },
      {
        id: 'muros',
        label: 'Número de muros',
        help: 'Cuenta solo los que vas a pintar',
        min: 1,
        integer: true,
      },
      {
        id: 'desc',
        label: 'Puertas y ventanas (m²)',
        help: 'Se descuentan del total. Escribe 0 si no hay',
        min: 0,
      },
    ],
    { ancho: '4', alto: '2.5', muros: '4', desc: '3' },
  )
  const r = paint({ width: n('ancho'), height: n('alto'), walls: n('muros'), openings: n('desc'), coats })

  return (
    <Layout
      title="Medidas de tus muros"
      form={
        <>
          <div className={styles.grid2}>{fields}</div>
          <Select label="Manos de pintura" value={coats} onChange={(e) => setCoats(Number(e.target.value))}>
            <option value={1}>1 mano</option>
            <option value={2}>2 manos (recomendado)</option>
            <option value={3}>3 manos</option>
          </Select>
          <p className={styles.muted}>
            Calculamos con un rendimiento de 10 m² por litro por mano. Revisa la etiqueta de la pintura que
            elijas: puede variar.
          </p>
        </>
      }
      result={
        valid ? (
          <>
            <dl className={styles.figures}>
              <div>
                <dt>Superficie a pintar</dt>
                <dd>{format1(r.area)} m²</dd>
              </div>
              <div>
                <dt>Pintura necesaria</dt>
                <dd>{format1(r.liters)} L</dd>
              </div>
              <div className={styles.highlight}>
                <dt>Te sugerimos comprar</dt>
                <dd>{r.suggestion}</dd>
              </div>
            </dl>
            <PaintToCart buckets={r.buckets} gallons={r.gallons} />
            <Link to="/categoria/vinilica" className={styles.link}>
              Ver pinturas vinílicas
            </Link>
          </>
        ) : (
          INVALID
        )
      }
    />
  )
}

/** Agrega la pintura sugerida: una vinílica de 19 L y otra de 4 L del catálogo. */
function PaintToCart({ buckets, gallons }: { buckets: number; gallons: number }) {
  const addToCart = useAddToCart()
  const bucket = useProducts(
    { page: 1, page_size: 1, sort: 'calificacion', category: 'vinilica', 'attr.presentacion': '19 L' },
    buckets > 0,
  )
  const gallon = useProducts(
    { page: 1, page_size: 1, sort: 'calificacion', category: 'vinilica', 'attr.presentacion': '4 L' },
    gallons > 0,
  )
  const picks = [
    buckets > 0 && bucket.data?.items[0] ? { product: bucket.data.items[0], qty: buckets } : null,
    gallons > 0 && gallon.data?.items[0] ? { product: gallon.data.items[0], qty: gallons } : null,
  ].filter((p) => p !== null)
  if (!picks.length) return null

  return (
    <Button
      fullWidth
      loading={addToCart.isPending}
      onClick={() =>
        picks.forEach((p) =>
          addToCart.mutate({ sku: p.product.variant_sku, qty: p.qty, name: p.product.name }),
        )
      }
    >
      Agregar pintura sugerida al carrito
    </Button>
  )
}

function FloorCalculator() {
  const [waste, setWaste] = useState(10)
  const { fields, valid, n } = useNumberFields(
    [
      { id: 'largo', label: 'Largo del cuarto (m)', help: 'Ejemplo: 4', min: 0.1 },
      { id: 'ancho', label: 'Ancho del cuarto (m)', help: 'Ejemplo: 3', min: 0.1 },
      { id: 'caja', label: 'm² por caja', help: 'Viene en la etiqueta de la caja. Ejemplo: 1.44', min: 0.1 },
    ],
    { largo: '4', ancho: '3', caja: '1.44' },
  )
  const r = floor({ length: n('largo'), width: n('ancho'), boxM2: n('caja'), wastePct: waste })

  return (
    <Layout
      title="Medidas del piso"
      form={
        <>
          <div className={styles.grid2}>{fields}</div>
          <Select
            label="Desperdicio por cortes"
            value={waste}
            onChange={(e) => setWaste(Number(e.target.value))}
          >
            <option value={5}>5 % (cuarto sencillo)</option>
            <option value={10}>10 % (recomendado)</option>
            <option value={15}>15 % (diagonal o muchos cortes)</option>
          </Select>
        </>
      }
      result={
        valid ? (
          <>
            <dl className={styles.figures}>
              <div>
                <dt>Superficie</dt>
                <dd>{format1(r.area)} m²</dd>
              </div>
              <div>
                <dt>Con desperdicio</dt>
                <dd>{format1(r.withWaste)} m²</dd>
              </div>
              <div className={styles.highlight}>
                <dt>Te sugerimos comprar</dt>
                <dd>
                  {plural(r.boxes, 'caja')} de piso y {plural(r.adhesiveBags, 'saco')} de pegazulejo de 20 kg
                </dd>
              </div>
            </dl>
            <div className={styles.links}>
              <Link to="/categoria/pisos" className={styles.link}>
                Ver pisos
              </Link>
              <Link to="/categoria/pegazulejo" className={styles.link}>
                Ver pegazulejo
              </Link>
            </div>
          </>
        ) : (
          INVALID
        )
      }
    />
  )
}

function AnchorCalculator() {
  const { fields, valid, n } = useNumberFields(
    [
      { id: 'piezas', label: 'Cosas a fijar', help: 'Repisas, cuadros, soportes…', min: 1, integer: true },
      {
        id: 'puntos',
        label: 'Puntos de fijación por cada una',
        help: 'Una repisa suele llevar 4',
        min: 1,
        integer: true,
      },
    ],
    { piezas: '6', puntos: '4' },
  )
  const r = anchors({ pieces: n('piezas'), perPiece: n('puntos'), extraPct: 10 })

  return (
    <Layout
      title="Qué vas a fijar"
      form={<div className={styles.grid2}>{fields}</div>}
      result={
        valid ? (
          <>
            <dl className={styles.figures}>
              <div>
                <dt>Taquetes y tornillos</dt>
                <dd>{r.needed} de cada uno</dd>
              </div>
              <div>
                <dt>Con 10 % extra</dt>
                <dd>{r.total}</dd>
              </div>
              <div className={styles.highlight}>
                <dt>Te sugerimos comprar</dt>
                <dd>
                  {plural(r.bags, 'bolsa')} de 25 taquetes y {plural(r.bags, 'bolsa')} de 25 tornillos
                </dd>
              </div>
            </dl>
            <div className={styles.links}>
              <Link to="/categoria/taquetes" className={styles.link}>
                Ver taquetes
              </Link>
              <Link to="/categoria/tornillos" className={styles.link}>
                Ver tornillos
              </Link>
            </div>
          </>
        ) : (
          INVALID
        )
      }
    />
  )
}
