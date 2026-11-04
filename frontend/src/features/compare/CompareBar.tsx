import { useFeatureFlag } from '@/app/featureFlags'
import { Button, ButtonLink } from '@/components/ui/Button'
import { compareStore, MAX_COMPARE, useCompareList } from './store'
import styles from './compare.module.css'

/** Barra "Comparar 2 de 4" del listado (prototipo Escritorio-1-Listado). */
export function CompareBar() {
  const enabled = useFeatureFlag('cmp')
  const list = useCompareList()
  if (!enabled || list.length === 0) return null

  return (
    <div role="region" aria-label="Productos para comparar" className={styles.bar}>
      <span className={styles.barTitle}>
        Comparar {list.length} de {MAX_COMPARE}
      </span>
      <span className={styles.barNames}>{list.map((i) => i.name).join(' · ')}</span>
      <div className={styles.barActions}>
        <Button variant="outlineDark" size="sm" onClick={() => compareStore.clear()}>
          Quitar todos
        </Button>
        {list.length >= 2 ? (
          <ButtonLink to={`/comparar?skus=${list.map((i) => i.sku).join(',')}`} size="sm">
            Comparar ahora
          </ButtonLink>
        ) : (
          <span className={styles.barHint}>Elige al menos 2</span>
        )}
      </div>
    </div>
  )
}
