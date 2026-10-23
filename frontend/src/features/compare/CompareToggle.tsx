import { useFeatureFlag } from '@/app/featureFlags'
import { useToast } from '@/components/feedback/toastContext'
import { compareStore, MAX_COMPARE, useCompareList } from './store'
import styles from './compare.module.css'

/** Casilla "Comparar" de la tarjeta de producto (flag "cmp"). */
export function CompareToggle({ sku, name }: { sku: string; name: string }) {
  const enabled = useFeatureFlag('cmp')
  const list = useCompareList()
  const { toast } = useToast()
  if (!enabled) return null
  const checked = list.some((i) => i.sku === sku)

  return (
    <label className={styles.toggle}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => {
          if (!e.target.checked) return compareStore.remove(sku)
          if (!compareStore.add({ sku, name })) {
            toast(`Puedes comparar hasta ${MAX_COMPARE} productos. Quita uno para agregar otro.`, 'aviso')
          }
        }}
      />
      Comparar<span className="sr-only">{` ${name}`}</span>
    </label>
  )
}
