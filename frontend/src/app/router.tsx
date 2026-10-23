import { type RouteObject, createBrowserRouter } from 'react-router-dom'
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
import { HelpPage } from '@/pages/HelpPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { PlaceholderPage } from '@/pages/PlaceholderPage'
import { RouteErrorPage } from '@/pages/RouteErrorPage'
import { GuestOnly, RequireAuth } from './guards'

// Mapa de rutas de docs/diseno/plan-frontend.md (sec. 2). Cada PlaceholderPage se cambia
// por la página real en su fase; las secciones grandes se cargarán con lazy().

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
    element: <RequireAuth>{todo('Escribir reseña', '37, 47', 3)}</RequireAuth>,
  },
  { path: 'comparar', element: todo('Comparar productos', '17, 24', 4) },
  { path: 'calculadora/:tipo?', element: todo('Calculadora de materiales', '19, 26', 4) },
  { path: 'sucursales', element: todo('Sucursales', '20, 27', 4) },
  { path: 'carrito', element: todo('Carrito', '04, 11', 2) },
  { path: 'ayuda/:tema', element: <HelpPage /> },
  {
    path: 'cuenta',
    element: (
      <RequireAuth>
        <AccountLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: todo('Mi cuenta', '30, 40', 3) },
      { path: 'pedidos', element: todo('Mis pedidos', '31, 41', 3) },
      { path: 'pedidos/:id', element: todo('Seguimiento de pedido', '32, 42', 3) },
      { path: 'pedidos/:id/devolucion', element: todo('Solicitar devolución', '36, 46', 3) },
      { path: 'direcciones', element: todo('Direcciones', '33, 43', 3) },
      { path: 'deseos', element: todo('Lista de deseos', '34, 44', 3) },
      { path: 'datos', element: todo('Datos y privacidad', '35, 45', 3) },
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
  { path: 'cuenta/login', element: <GuestOnly>{todo('Iniciar sesión', '28, 39', 3)}</GuestOnly> },
  { path: 'cuenta/registro', element: <GuestOnly>{todo('Crear cuenta', '14, 29', 3)}</GuestOnly> },
  { path: 'cuenta/restablecer/:token?', element: todo('Restablecer contraseña', 'sin diseño (B6)', 3) },
]

const checkoutRoutes: RouteObject[] = [
  { path: 'checkout', element: todo('Checkout', '05, 12', 2) },
  { path: 'pedido/:id/confirmacion', element: todo('Confirmación de pedido', '06, 13', 2) },
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
