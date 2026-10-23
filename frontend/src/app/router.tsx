import type { ComponentType } from 'react'
import { Outlet, type RouteObject, createBrowserRouter } from 'react-router-dom'
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
import { CheckoutPage } from '@/pages/checkout/CheckoutPage'
import { ConfirmationPage } from '@/pages/checkout/ConfirmationPage'
import { HelpPage } from '@/pages/HelpPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { PlaceholderPage } from '@/pages/PlaceholderPage'
import { RouteErrorPage } from '@/pages/RouteErrorPage'
import { GuestOnly, RequireAuth } from './guards'

// Mapa de rutas de docs/diseno/plan-frontend.md (sec. 2). Cada PlaceholderPage se cambia
// por la página real en su fase. Mi cuenta y acceso se cargan bajo demanda (lazy).

const MOCKS =
  import.meta.env.MODE === 'mock' || import.meta.env.MODE === 'test' || import.meta.env.VITE_MOCKS === 'true'

/** Ruta cargada bajo demanda: su código se descarga al entrar (divide el paquete por sección). */
const page =
  <M extends Record<string, unknown>>(load: () => Promise<M>, name: keyof M) =>
  async () => ({ Component: (await load())[name] as ComponentType })

const todo = (title: string, screens: string, phase: number) => (
  <PlaceholderPage title={title} screens={screens} phase={phase} />
)

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
  { path: 'comparar', element: todo('Comparar productos', '17, 24', 4) },
  { path: 'calculadora/:tipo?', element: todo('Calculadora de materiales', '19, 26', 4) },
  { path: 'sucursales', element: todo('Sucursales', '20, 27', 4) },
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
  { path: 'checkout', element: <CheckoutPage /> },
  { path: 'pedido/:id/confirmacion', element: <ConfirmationPage /> },
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

const adminRoutes: RouteObject[] = [
  { index: true, element: todo('Resumen', '48', 5) },
  { path: 'productos', element: todo('Productos', '49', 5) },
  { path: 'productos/:id', element: todo('Editar producto', '50', 5) },
  { path: 'categorias', element: todo('Categorías', '51', 5) },
  { path: 'pedidos', element: todo('Pedidos', '52', 5) },
  { path: 'pedidos/:id', element: todo('Detalle de pedido', '53', 5) },
  { path: 'usuarios', element: todo('Usuarios y roles', '54', 5) },
  { path: 'reportes', element: todo('Reportes', '55', 5) },
  { path: 'configuracion', element: todo('Configuración', '56', 5) },
]

const branchRoutes: RouteObject[] = [
  { path: 'inventario', element: todo('Inventario', '57', 6) },
  { path: 'recoleccion', element: todo('Pedidos para recolección', '58', 6) },
  { path: 'entrega/:id?', element: todo('Entregar pedido', '59', 6) },
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
