import { useAuth } from '@/app/providers/authContext'
import { Select } from '@/components/ui/Field'
import { useAllStores } from '@/features/admin/api'
import { setAdminBranch, useBranchParam } from './api'

/** Solo el admin ve este selector; el staff trabaja siempre en su sucursal. */
export function BranchPicker() {
  const { user } = useAuth()
  const stores = useAllStores()
  const { store_id } = useBranchParam()
  if (user?.role !== 'admin') return null
  return (
    <Select
      label="Sucursal"
      hint="Como administrador puedes ver cualquier sucursal."
      value={store_id ?? stores.data?.[0]?.id ?? ''}
      onChange={(e) => setAdminBranch(e.target.value)}
    >
      {stores.data?.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </Select>
  )
}
