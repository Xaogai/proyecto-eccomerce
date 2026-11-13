// Rutas de /api/v1 en un solo lugar. El comentario es el ID del contrato de API (EP-xx).
export const endpoints = {
  categories: '/categories', // EP-01
  products: '/products', // EP-02
  product: (sku: string) => `/products/${encodeURIComponent(sku)}`, // EP-03
  searchSuggest: '/search/suggest', // EP-04
  reviews: (sku: string) => `/products/${encodeURIComponent(sku)}/reviews`, // EP-05, EP-06
  compare: '/products/compare', // EP-07
  stores: '/stores', // EP-08
  shippingQuote: '/shipping/quote', // EP-09
  cart: '/cart', // EP-10
  cartItems: '/cart/items', // EP-11
  cartItem: (id: string) => `/cart/items/${id}`, // EP-12, EP-13
  cartMerge: '/cart/merge', // EP-14
  checkout: '/checkout', // EP-15
  order: (id: string) => `/orders/${id}`, // EP-16
  orderPaymentRetry: (id: string) => `/orders/${id}/payment/retry`, // EP-17
  orders: '/orders', // EP-18
  paymentWebhook: '/webhooks/payment', // Doc 13.1 (lo llama la pasarela; aquí solo la pasarela simulada)
  orderReturns: (id: string) => `/orders/${id}/returns`, // EP-19
  register: '/auth/register', // EP-20
  login: '/auth/login', // EP-21
  refresh: '/auth/refresh', // EP-22
  logout: '/auth/logout', // EP-23
  passwordForgot: '/auth/password/forgot', // EP-24
  passwordReset: '/auth/password/reset', // EP-25
  me: '/me', // EP-26
  addresses: '/me/addresses', // EP-27
  address: (id: string) => `/me/addresses/${id}`, // EP-27
  profile: '/me/profile', // EP-29
  consents: '/me/consents', // EP-30
  arco: '/me/arco', // EP-31
  password: '/me/password', // EP-53
  wishlist: '/me/wishlist', // EP-28
  wishlistItem: (sku: string) => `/me/wishlist/${encodeURIComponent(sku)}`, // EP-28
  featureFlags: '/feature-flags', // EP-33
  adminDashboard: '/admin/dashboard', // EP-34
  adminProducts: '/admin/products', // EP-35, EP-36
  adminProduct: (id: string) => `/admin/products/${encodeURIComponent(id)}`, // EP-36
  adminProductPublish: (id: string) => `/admin/products/${encodeURIComponent(id)}/publish`, // EP-37
  adminProductUnpublish: (id: string) => `/admin/products/${encodeURIComponent(id)}/unpublish`, // EP-37
  adminProductImages: (id: string) => `/admin/products/${encodeURIComponent(id)}/images`, // EP-39
  adminCategories: '/admin/categories', // EP-40
  adminCategory: (id: string) => `/admin/categories/${encodeURIComponent(id)}`, // EP-40
  adminOrders: '/admin/orders', // EP-41
  adminOrder: (id: string) => `/admin/orders/${id}`, // EP-42
  adminOrderStatus: (id: string) => `/admin/orders/${id}/status`, // EP-43
  adminUsers: '/admin/users', // EP-44
  adminUser: (id: string) => `/admin/users/${id}`, // EP-44
  adminUserUnlock: (id: string) => `/admin/users/${id}/unlock`, // EP-45
  adminUserDisable: (id: string) => `/admin/users/${id}/disable`,
  adminUserEnable: (id: string) => `/admin/users/${id}/enable`,
  adminUserTemporaryPassword: (id: string) => `/admin/users/${id}/temporary-password`,
  adminReports: '/admin/reports', // EP-46
  adminReportsCsv: '/admin/reports/export.csv', // EP-46
  adminSettings: '/admin/settings', // EP-47
  branchInventory: '/branch/inventory', // EP-48
  branchAdjust: (sku: string) => `/branch/inventory/${encodeURIComponent(sku)}/adjust`, // EP-49
  branchPickups: '/branch/pickups', // EP-50
  branchPickupStatus: (id: string) => `/branch/pickups/${id}/status`, // EP-51
  branchVerify: '/branch/pickups/verify', // EP-52
  branchHandover: (id: string) => `/branch/pickups/${id}/handover`, // EP-52
} as const
