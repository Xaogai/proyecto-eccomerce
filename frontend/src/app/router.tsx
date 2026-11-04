import type { ComponentType } from 'react'
import { Navigate, Outlet, type RouteObject, createBrowserRouter } from 'react-router-dom'
import { AccountLayout } from '@/layouts/AccountLayout'
import { InternalLayout } from '@/layouts/InternalLayout'
import { Root } from '@/layouts/Root'
import { ShopLayout } from '@/layouts/ShopLayout'
import { SimpleLayout } from '@/layouts/SimpleLayout'
import { CategoryPage } from '@/pages/catalog/CategoryPage'
import { DepartmentsPage } from '@/pages/catalog/DepartmentsPage'
import { HomePage } from '@/pages/catalog/HomePage'
import { ProductPage } from '@/pages/catalog/ProductPage'
import { SearchPage } from '@/pages/catalog/SearchPage'
import { CartPage } from '@/pages/checkout/CartPage'
import { HelpPage } from '@/pages/HelpPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { RouteErrorPage } from '@/pages/RouteErrorPage'
import { GuestOnly, RequireAuth } from './guards'

// Mapa de rutas de docs/diseno/plan-frontend.md (sec. 2). Mi cuenta, acceso, herramientas,
// admin y sucursal se cargan bajo demanda (lazy).

const MOCKS =
  import.meta.env.MODE === 'mock' || import.meta.env.MODE === 'test' || import.meta.env.VITE_MOCKS === 'true'

/** Ruta cargada bajo demanda: su código se descarga al entrar (divide el paquete por sección). */
const page =
  <M extends Record<string, unknown>>(load: () => Promise<M>, name: keyof M) =>
  async () => ({ Component: (await load())[name] as ComponentType })

/** Envuelve las rutas hijas de un layout: si una página falla, el layout (encabezado, menú) sigue en pie. */
const withError = (children: RouteObject[]): RouteObject[] => [{ errorElement: <RouteErrorPage />, children }]

const shopRoutes: RouteObject[] = [
  { index: true, element: <HomePage /> },
  { path: 'departamentos', element: <DepartmentsPage /> },
  { path: 'categoria/:slug', element: <CategoryPage /> },
  { path: 'buscar', element: <SearchPage /> },
  { path: 'producto/:sku', element: <ProductPage /> },
  {
    path: 'producto/:sku/resena',
    element: (
      <RequireAuth>
        <Outlet />
      </RequireAuth>
    ),
    children: [{ index: true, lazy: page(() => import('@/pages/account/ReviewPage'), 'ReviewPage') }],
  },
  { path: 'comparar', lazy: page(() => import('@/pages/tools/ComparePage'), 'ComparePage') },
  { path: 'calculadora/:tipo?', lazy: page(() => import('@/pages/tools/CalculatorPage'), 'CalculatorPage') },
  { path: 'sucursales', lazy: page(() => import('@/pages/tools/StoresPage'), 'StoresPage') },
  { path: 'carrito', element: <CartPage /> },
  { path: 'ayuda/:tema', element: <HelpPage /> },
  {
    path: 'cuenta',
    element: (
      <RequireAuth>
        <AccountLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, lazy: page(() => import('@/pages/account/AccountHomePage'), 'AccountHomePage') },
      { path: 'pedidos', lazy: page(() => import('@/pages/account/OrdersPage'), 'OrdersPage') },
      { path: 'pedidos/:id', lazy: page(() => import('@/pages/account/OrderDetailPage'), 'OrderDetailPage') },
      {
        path: 'pedidos/:id/devolucion',
        lazy: page(() => import('@/pages/account/ReturnPage'), 'ReturnPage'),
      },
      { path: 'direcciones', lazy: page(() => import('@/pages/account/AddressesPage'), 'AddressesPage') },
      { path: 'deseos', lazy: page(() => import('@/pages/account/WishlistPage'), 'WishlistPage') },
      { path: 'datos', lazy: page(() => import('@/pages/account/PrivacyPage'), 'PrivacyPage') },
    ],
  },
  ...(import.meta.env.DEV
    ? [
        {
          path: '_ui',
          lazy: () => import('@/pages/UiCatalogPage').then((m) => ({ Component: m.UiCatalogPage })),
        },
      ]
    : []),
  { path: '*', element: <NotFoundPage /> },
]

const authRoutes: RouteObject[] = [
  {
    element: (
      <GuestOnly>
        <Outlet />
      </GuestOnly>
    ),
    children: [
      { path: 'cuenta/login', lazy: page(() => import('@/pages/account/LoginPage'), 'LoginPage') },
      { path: 'cuenta/registro', lazy: page(() => import('@/pages/account/RegisterPage'), 'RegisterPage') },
    ],
  },
  {
    path: 'cuenta/restablecer/:token?',
    lazy: page(() => import('@/pages/account/ResetPasswordPage'), 'ResetPasswordPage'),
  },
]

const checkoutRoutes: RouteObject[] = [
  // Bajo demanda: los formularios (react-hook-form) no entran al paquete que baja cualquier visitante.
  { path: 'checkout', lazy: page(() => import('@/pages/checkout/CheckoutPage'), 'CheckoutPage') },
  {
    path: 'pedido/:id/confirmacion',
    lazy: page(() => import('@/pages/checkout/ConfirmationPage'), 'ConfirmationPage'),
  },
  // Pasarela simulada: solo con datos de prueba (lazy: no entra al build de producción).
  ...(MOCKS
    ? [
        {
          path: '_pasarela/:id',
          lazy: () =>
            import('@/mocks/PaymentSimulatorPage').then((m) => ({ Component: m.PaymentSimulatorPage })),
        },
      ]
    : []),
]

// Panel de administración (fase 5): todo bajo demanda, el cliente nunca descarga este código.
const adminRoutes: RouteObject[] = [
  { index: true, lazy: page(() => import('@/pages/admin/DashboardPage'), 'DashboardPage') },
  { path: 'productos', lazy: page(() => import('@/pages/admin/ProductsPage'), 'ProductsPage') },
  { path: 'productos/:id', lazy: page(() => import('@/pages/admin/ProductEditPage'), 'ProductEditPage') },
  { path: 'categorias', lazy: page(() => import('@/pages/admin/CategoriesPage'), 'CategoriesPage') },
  { path: 'pedidos', lazy: page(() => import('@/pages/admin/OrdersPage'), 'OrdersPage') },
  { path: 'pedidos/:id', lazy: page(() => import('@/pages/admin/OrderDetailPage'), 'OrderDetailPage') },
  { path: 'usuarios', lazy: page(() => import('@/pages/admin/UsersPage'), 'UsersPage') },
  { path: 'reportes', lazy: page(() => import('@/pages/admin/ReportsPage'), 'ReportsPage') },
  { path: 'configuracion', lazy: page(() => import('@/pages/admin/SettingsPage'), 'SettingsPage') },
]

// Sucursal (fase 6): bajo demanda, como el admin.
const branchRoutes: RouteObject[] = [
  { index: true, element: <Navigate to="recoleccion" replace /> },
  { path: 'inventario', lazy: page(() => import('@/pages/branch/InventoryPage'), 'InventoryPage') },
  { path: 'recoleccion', lazy: page(() => import('@/pages/branch/PickupsPage'), 'PickupsPage') },
  { path: 'entrega/:id?', lazy: page(() => import('@/pages/branch/HandoverPage'), 'HandoverPage') },
]

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Root />,
    errorElement: <RouteErrorPage standalone />,
    children: [
      { element: <ShopLayout />, children: withError(shopRoutes) },
      { element: <SimpleLayout variant="auth" />, children: withError(authRoutes) },
      { element: <SimpleLayout variant="checkout" />, children: withError(checkoutRoutes) },
      {
        path: 'admin',
        element: (
          <RequireAuth roles={['admin']}>
            <InternalLayout section="admin" />
          </RequireAuth>
        ),
        children: withError(adminRoutes),
      },
      {
        path: 'sucursal',
        element: (
          <RequireAuth roles={['staff', 'admin']}>
            <InternalLayout section="sucursal" />
          </RequireAuth>
        ),
        children: withError(branchRoutes),
      },
    ],
  },
]

export const createRouter = () => createBrowserRouter(routes)
