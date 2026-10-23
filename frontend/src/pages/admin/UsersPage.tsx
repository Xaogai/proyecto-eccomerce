import { useState } from 'react'
import { ApiError } from '@/api/errors'
import type { AdminUser } from '@/api/schemas/admin'
import { ErrorState } from '@/components/feedback/States'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ToggleChips } from '@/components/ui/Chip'
import { DataTable } from '@/components/ui/DataTable'
import { TextField } from '@/components/ui/Field'
import { Pagination } from '@/components/ui/Pagination'
import { useAdminUsers, useAllStores, useUserActions } from '@/features/admin/api'
import { useUrlFilters } from '@/features/admin/useUrlFilters'
import { usePageTitle } from '@/hooks/usePageTitle'
import { formatDateTime, plural } from '@/lib/format'
import styles from './admin.module.css'

const ROLES = { cliente: 'Cliente', staff: 'Staff de sucursal', admin: 'Administrador' } as const
type Role = keyof typeof ROLES

const FILTERS = [
  { value: 'todos', label: 'Todos' },
  { value: 'cliente', label: 'Clientes' },
  { value: 'staff', label: 'Staff' },
  { value: 'admin', label: 'Administradores' },
] as const

/** Usuarios y roles (pantalla 54): cambiar rol y sucursal (no el propio) y desbloquear cuentas. */
export function UsersPage() {
  usePageTitle('Usuarios y roles · Administración')
  const filters = useUrlFilters()
  const role = (FILTERS.find((r) => r.value === filters.get('rol'))?.value ??
    'todos') as (typeof FILTERS)[number]['value']
  const users = useAdminUsers({
    q: filters.get('q'),
    role: role === 'todos' ? undefined : role,
    page: filters.page,
  })
  const stores = useAllStores()
  const { update, unlock } = useUserActions()
  const [message, setMessage] = useState('')

  const changeRole = async (u: AdminUser, next: Role, branch?: string) => {
    const branch_id = next === 'staff' ? (branch ?? u.branch_id ?? stores.data?.[0]?.id ?? null) : null
    try {
      await update.mutateAsync({ id: u.id, role: next, branch_id })
      const store = stores.data?.find((s) => s.id === branch_id)?.name
      setMessage(
        `${u.name} ahora es ${ROLES[next]}${store ? ` en ${store}` : ''}. El cambio queda en el registro de auditoría.`,
      )
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : 'No pudimos guardar el cambio.')
    }
  }

  return (
    <>
      <h1>Usuarios y roles</h1>
      <ul role="list" className={styles.roles}>
        <li className={styles.role}>
          <strong>Cliente</strong>
          <br />
          <span className={styles.muted}>Compra, sigue pedidos, guarda direcciones y deseos.</span>
        </li>
        <li className={styles.role}>
          <strong>Staff de sucursal</strong>
          <br />
          <span className={styles.muted}>Inventario y pedidos de recolección de su sucursal.</span>
        </li>
        <li className={styles.role}>
          <strong>Administrador</strong>
          <br />
          <span className={styles.muted}>Todo el catálogo, pedidos, usuarios, reportes y configuración.</span>
        </li>
      </ul>

      <div className={styles.filters}>
        <TextField
          label="Buscar"
          type="search"
          placeholder="Nombre o correo"
          value={filters.text}
          onChange={(e) => filters.setText(e.target.value)}
        />
      </div>
      <ToggleChips
        label="Rol"
        value={role}
        options={[...FILTERS]}
        onChange={(v) => filters.set('rol', v === 'todos' ? null : v)}
      />
      <p className={styles.count} aria-live="polite">
        {message || (users.data ? plural(users.data.total, 'usuario') : '')}
      </p>

      {users.isError ? (
        <ErrorState title="No pudimos cargar los usuarios" onRetry={() => users.refetch()} />
      ) : (
        <>
          <DataTable<AdminUser>
            caption="Usuarios"
            loading={users.isPending}
            rows={users.data?.items ?? []}
            rowKey={(u) => u.id}
            empty="No hay usuarios con estos filtros."
            columns={[
              {
                key: 'name',
                header: 'Usuario',
                rowHeader: true,
                cell: (u) => (
                  <span className={styles.cellMain}>
                    <strong>{u.name}</strong>
                    <span className={styles.sku}>{u.email}</span>
                  </span>
                ),
              },
              {
                key: 'role',
                header: 'Rol',
                cell: (u) => (
                  <select
                    className={styles.tableSelect}
                    aria-label={`Rol de ${u.name}`}
                    value={u.role}
                    disabled={u.is_self || update.isPending}
                    onChange={(e) => changeRole(u, e.target.value as Role)}
                  >
                    {Object.entries(ROLES).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                ),
              },
              {
                key: 'branch',
                header: 'Sucursal',
                cell: (u) =>
                  u.role === 'staff' && !u.is_self ? (
                    <select
                      className={styles.tableSelect}
                      aria-label={`Sucursal de ${u.name}`}
                      value={u.branch_id ?? ''}
                      disabled={update.isPending}
                      onChange={(e) => changeRole(u, 'staff', e.target.value)}
                    >
                      {stores.data?.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    (u.branch_name ?? <span className={styles.muted}>Todas</span>)
                  ),
              },
              {
                key: 'last',
                header: 'Último acceso',
                cell: (u) =>
                  u.last_login ? formatDateTime(u.last_login) : <span className={styles.muted}>Nunca</span>,
              },
              {
                key: 'state',
                header: 'Estado',
                cell: (u) =>
                  u.locked ? <Badge tone="aviso">Bloqueada</Badge> : <Badge tone="ok">Activa</Badge>,
              },
              {
                key: 'actions',
                header: <span className="sr-only">Acciones</span>,
                cell: (u) =>
                  u.is_self ? (
                    <span className={styles.muted}>Eres tú</span>
                  ) : u.locked ? (
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={`Desbloquear a ${u.name}`}
                      loading={unlock.isPending && unlock.variables === u.id}
                      onClick={async () => {
                        await unlock.mutateAsync(u.id)
                        setMessage(`Desbloqueamos la cuenta de ${u.name}.`)
                      }}
                    >
                      Desbloquear
                    </Button>
                  ) : null,
              },
            ]}
          />
          {users.data && (
            <Pagination
              page={users.data.page}
              totalPages={Math.ceil(users.data.total / users.data.page_size)}
            />
          )}
        </>
      )}
      <p className={styles.muted}>
        Las cuentas se bloquean 15 minutos tras 5 intentos fallidos. Cada cambio de rol queda en el registro
        de auditoría.
      </p>
    </>
  )
}
