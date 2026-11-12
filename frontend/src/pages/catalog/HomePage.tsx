import { Link } from 'react-router-dom'
import { useFeatureFlag, useFeatureFlagsLoading } from '@/app/featureFlags'
import { useSelectedStore } from '@/app/providers/storeContext'
import { ErrorState } from '@/components/feedback/States'
import { Button, ButtonLink } from '@/components/ui/Button'
import { useCategories, useProducts } from '@/features/catalog/api'
import { ProductGrid } from '@/features/catalog/components/ProductGrid'
import { usePageTitle } from '@/hooks/usePageTitle'
import styles from './HomePage.module.css'

/** Inicio (pantallas 15 y 21). */
export function HomePage() {
  usePageTitle()
  const { store, openPicker } = useSelectedStore()
  const calcOn = useFeatureFlag('calc')
  const cmpOn = useFeatureFlag('cmp')
  const flagsLoading = useFeatureFlagsLoading()
  const categories = useCategories()
  const featured = useProducts({
    page: 1,
    page_size: 6,
    sort: 'calificacion',
    ...(store ? { store_id: store.id, pickup_today: 'true' } : {}),
  })
  const todayLink = '/buscar?disponible=hoy'

  return (
    <>
      <section aria-labelledby="inicio-titulo" className={styles.heroRow}>
        <div className={styles.hero}>
          <span className={styles.kicker}>{store ? `${store.name} · recoge hoy` : 'Compra en línea'}</span>
          <h1 id="inicio-titulo" className={styles.heroTitle}>
            Compra en línea y recoge en tu sucursal en 2 horas
          </h1>
          <p className={styles.heroText}>
            Ve el stock de tu sucursal antes de salir de casa. Recoger no tiene costo.
          </p>
          <div className={styles.heroActions}>
            {store ? (
              <ButtonLink to={todayLink} size="lg">
                Ver disponibles hoy
              </ButtonLink>
            ) : (
              <ButtonLink to="/departamentos" size="lg">
                Ver departamentos
              </ButtonLink>
            )}
            <Button variant="outlineDark" size="lg" onClick={openPicker} aria-haspopup="dialog">
              {store ? 'Cambiar sucursal' : 'Elegir sucursal'}
            </Button>
          </div>
        </div>

        {flagsLoading && (
          <div className={styles.tools} aria-hidden="true">
            <span className={`${styles.tool} ${styles.toolSkeleton}`} />
            <span className={`${styles.tool} ${styles.toolSkeleton}`} />
          </div>
        )}
        {!flagsLoading && (calcOn || cmpOn) && (
          <div className={styles.tools}>
            {calcOn && (
              <Link to="/calculadora" className={`${styles.tool} ${styles.toolAccent}`}>
                <span className={styles.toolTitle}>Calculadora de materiales</span>
                <span className={styles.toolText}>
                  Cuánta pintura, piso o taquetes necesitas para tu proyecto.
                </span>
                <span className={styles.toolCta}>Calcular</span>
              </Link>
            )}
            {cmpOn && (
              <Link to="/comparar" className={styles.tool}>
                <span className={styles.toolTitle}>Compara antes de comprar</span>
                <span className={styles.toolText}>
                  Hasta 4 productos lado a lado con sus especificaciones.
                </span>
                <span className={styles.toolCta}>Ir al comparador</span>
              </Link>
            )}
          </div>
        )}
      </section>

      <section aria-labelledby="inicio-departamentos" className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 id="inicio-departamentos">Departamentos</h2>
          <Link to="/departamentos" className={styles.soloMovil}>
            Ver todos
          </Link>
        </div>
        {categories.isError ? (
          <ErrorState title="No pudimos cargar los departamentos" onRetry={() => categories.refetch()} />
        ) : categories.isPending ? (
          <div className={styles.departments} aria-hidden="true">
            {Array.from({ length: 8 }, (_, i) => (
              <span key={i} className={`${styles.department} ${styles.departmentSkeleton}`} />
            ))}
          </div>
        ) : (
          <ul role="list" className={styles.departments}>
            {(categories.data ?? []).map((c) => (
              <li key={c.slug}>
                <Link to={`/categoria/${c.slug}`} className={styles.department}>
                  <span className={styles.departmentName}>{c.name}</span>
                  <span className={styles.departmentSub}>
                    {c.children
                      .slice(0, 3)
                      .map((s) => s.name)
                      .join(', ')}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="inicio-hoy" className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 id="inicio-hoy">{store ? `Disponibles hoy en ${store.name}` : 'Los mejor calificados'}</h2>
          {store && <Link to={todayLink}>Ver todos</Link>}
        </div>
        {featured.isError ? (
          <ErrorState title="No pudimos cargar los productos" onRetry={() => featured.refetch()} />
        ) : (
          <ProductGrid
            products={featured.data?.items}
            loading={featured.isPending}
            skeletons={6}
            cardVariant="simple"
            layout="inicio"
          />
        )}
      </section>

      <section aria-label="Servicios" className={styles.services}>
        <div className={styles.service}>
          <span className={styles.serviceTitle}>Recoger en tienda</span>
          <span className={styles.toolText}>Gratis. Te avisamos cuando esté listo.</span>
        </div>
        <div className={styles.service}>
          <span className={styles.serviceTitle}>Envío a domicilio</span>
          <span className={styles.toolText}>
            Costo y plazo según tu código postal. <Link to="/ayuda/envios">Envíos y plazos</Link>
          </span>
        </div>
        <div className={styles.service}>
          <span className={styles.serviceTitle}>Devoluciones</span>
          <span className={styles.toolText}>
            <Link to="/ayuda/devoluciones">Consulta la política</Link> antes de comprar.
          </span>
        </div>
      </section>
    </>
  )
}
