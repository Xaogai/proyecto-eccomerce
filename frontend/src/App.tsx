import { useEffect, useState } from 'react'
import './App.css'

const API_BASE = 'http://localhost:8000/api/v1'
const STORAGE_TOKEN_KEY = 'ferremarket_jwt_token'
const STORAGE_CART_KEY = 'ferremarket_cart_id'

interface CategoryNode {
  id: string
  nombre: string
  categoria_padre_id: string | null
  subcategorias: CategoryNode[]
}

interface Variant {
  sku: string
  producto_id: string
  atributos: Record<string, string>
  precio: string
  imagen_url: string | null
  stock_disponible: number
}

interface Product {
  id: string
  categoria_id: string
  nombre: string
  descripcion: string | null
  marca: string | null
  variantes: Variant[]
}

interface CartItem {
  variante_sku: string
  nombre_producto: string
  cantidad: number
  precio_unitario_vigente: string
  subtotal: string
  imagen_url?: string | null
  atributos?: Record<string, string>
}

interface Cart {
  id: string
  estado: string
  items: CartItem[]
  total: string
}

interface Branch {
  id: string
  nombre: string
}

interface OrderRecord {
  id: string
  folio: string
  fecha: string
  estado: string
  total: string
  referencia_pasarela?: string
  tipo_envio: string
  costo_envio: string
  estado_envio: string
  numero_guia: string | null
  items: Array<{
    variante_sku: string
    cantidad: number
    precio_unitario_venta: string
    subtotal: string
  }>
}

interface NotificationRecord {
  id: string
  timestamp: string
  subject: string
  body: string
  template_type: string
  delivery_mode: string
}

interface AddressRecord {
  id: string
  calle: string
  ciudad: string
  codigo_postal: string
  es_predeterminada: boolean
}

interface ShipmentRecord {
  id: string
  pedido_id: string
  tipo: string
  costo: string
  estado: string
  numero_guia: string | null
}

function formatMXN(val: string | number): string {
  const num = Number(val)
  if (Number.isNaN(num)) return '$0.00'
  return num.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
}

function App() {
  const [activeTab, setActiveTab] = useState<'catalogo' | 'pedidos' | 'cuenta' | 'admin'>('catalogo')
  const [statusMessage, setStatusMessage] = useState<string>('Bienvenido a Ferremarket Online — Tienda Oficial.')

  // Catálogo, variantes seleccionadas por producto y modal de detalle
  const [categories, setCategories] = useState<CategoryNode[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [selectedVariantByProduct, setSelectedVariantByProduct] = useState<Record<string, string>>({})
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('')
  const [searchQ, setSearchQ] = useState('')
  const [marcaFilter, setMarcaFilter] = useState('')
  const [colorFilter, setColorFilter] = useState('')

  // Carrito, Envío, Tokenizador de Tarjeta y Checkout
  const [cart, setCart] = useState<Cart | null>(null)
  const [branches, setBranches] = useState<Branch[]>([])
  const [selectedBranchId, setSelectedBranchId] = useState<string>('')
  const [zipCode, setZipCode] = useState('50000')
  const [shippingQuote, setShippingQuote] = useState<{
    costo_domicilio: string
    dias_estimados_entrega: number
  } | null>({ costo_domicilio: '99.00', dias_estimados_entrega: 2 })
  const [tipoEnvio, setTipoEnvio] = useState<'domicilio' | 'recoleccion_tienda'>('domicilio')
  const [paymentProvider, setPaymentProvider] = useState<'stripe' | 'mercado_pago'>('stripe')
  const [cardHolder, setCardHolder] = useState('ANA TORRES')
  const [cardLast4, setCardLast4] = useState('4242')
  const [cardExpiry, setCardExpiry] = useState('08/29')
  const [lastOrder, setLastOrder] = useState<OrderRecord | null>(null)

  // Autenticación, Registro, Recuperación, Direcciones, Pedidos, Notificaciones y ARCO
  const [token, setToken] = useState<string>(() => localStorage.getItem(STORAGE_TOKEN_KEY) || '')
  const [userProfile, setUserProfile] = useState<{
    id: string
    nombre: string
    email: string
    tipo_usuario: string
  } | null>(null)
  const [loginEmail, setLoginEmail] = useState('ana.torres.sintetica@ferremarket.local')
  const [loginPassword, setLoginPassword] = useState('Sintetico2026!')
  const [regNombre, setRegNombre] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPassword, setRegPassword] = useState('Ferremarket2026!')
  const [regPrivacy, setRegPrivacy] = useState(true)
  const [resetEmail, setResetEmail] = useState('ana.torres.sintetica@ferremarket.local')
  const [resetToken, setResetToken] = useState('')
  const [resetNewPass, setResetNewPass] = useState('NuevaClave2026!')
  const [addresses, setAddresses] = useState<AddressRecord[]>([])
  const [addrCalle, setAddrCalle] = useState('Av. Solidaridad Las Torres 1450')
  const [addrCiudad, setAddrCiudad] = useState('Toluca')
  const [addrCp, setAddrCp] = useState('50120')
  const [myOrders, setMyOrders] = useState<OrderRecord[]>([])
  const [notifications, setNotifications] = useState<NotificationRecord[]>([])
  const [arcoData, setArcoData] = useState<Record<string, unknown> | null>(null)

  // Centro Operativo (Staff / Admin) y Auditoría
  const [dqReport, setDqReport] = useState<Record<string, unknown> | null>(null)
  const [auditLogs, setAuditLogs] = useState<Array<Record<string, unknown>>>([])
  const [shipments, setShipments] = useState<ShipmentRecord[]>([])
  const [newProdName, setNewProdName] = useState('')
  const [newProdMarca, setNewProdMarca] = useState('DeWalt')
  const [newProdSku, setNewProdSku] = useState('SIERRA-DEW-20V')
  const [newProdPrecio, setNewProdPrecio] = useState('3299.00')
  const [stockSku, setStockSku] = useState('TAL-20V-ROJ')
  const [stockQty, setStockQty] = useState('25')
  const [trackingStatus, setTrackingStatus] = useState<'preparando' | 'enviado' | 'listo_recoleccion' | 'entregado'>(
    'enviado',
  )
  const [trackingGuide, setTrackingGuide] = useState('GUIA-DHL-988120')

  const applyProductsState = (items: Product[]) => {
    setProducts(items)
    const defaults: Record<string, string> = {}
    for (const p of items) {
      if (p.variantes.length > 0) {
        defaults[p.id] = p.variantes[0].sku
      }
    }
    setSelectedVariantByProduct((prev) => ({ ...defaults, ...prev }))
  }

  const fetchInitialData = async () => {
    try {
      const [catRes, prodRes, branchRes] = await Promise.all([
        fetch(`${API_BASE}/categories`),
        fetch(`${API_BASE}/products`),
        fetch(`${API_BASE}/branches`),
      ])
      if (catRes.ok) setCategories(await catRes.json())
      if (prodRes.ok) {
        const data = await prodRes.json()
        applyProductsState(data.items || [])
      }
      if (branchRes.ok) {
        const bList = await branchRes.json()
        setBranches(bList)
        if (bList.length > 0 && !selectedBranchId) setSelectedBranchId(bList[0].id)
      }
      const savedCartId = localStorage.getItem(STORAGE_CART_KEY)
      if (savedCartId) {
        const cartRes = await fetch(`${API_BASE}/cart?cart_id=${savedCartId}`)
        if (cartRes.ok) {
          const loadedCart: Cart = await cartRes.json()
          if (loadedCart.estado === 'activo') setCart(loadedCart)
        }
      }
    } catch {
      setStatusMessage('No se pudo conectar con el servidor de Ferremarket en localhost:8000.')
    }
  }

  const refreshAccountContext = async (jwtToken: string) => {
    const headers = { Authorization: `Bearer ${jwtToken}` }
    const [meRes, ordersRes, notifRes, addrRes] = await Promise.all([
      fetch(`${API_BASE}/users/me`, { headers }),
      fetch(`${API_BASE}/orders`, { headers }),
      fetch(`${API_BASE}/users/me/notifications`, { headers }),
      fetch(`${API_BASE}/users/me/addresses`, { headers }),
    ])
    if (meRes.ok) {
      setUserProfile(await meRes.json())
    } else {
      localStorage.removeItem(STORAGE_TOKEN_KEY)
      setToken('')
      setUserProfile(null)
      return
    }
    if (ordersRes.ok) setMyOrders(await ordersRes.json())
    if (notifRes.ok) setNotifications(await notifRes.json())
    if (addrRes.ok) setAddresses(await addrRes.json())
  }

  useEffect(() => {
    void fetchInitialData()
    if (token) {
      void refreshAccountContext(token)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSearchFilters = async (categoryOverride?: string, brandOverride?: string) => {
    const activeCat = categoryOverride !== undefined ? categoryOverride : selectedCategoryId
    const activeBrand = brandOverride !== undefined ? brandOverride : marcaFilter
    const params = new URLSearchParams()
    if (activeCat) params.set('categoria_id', activeCat)
    if (searchQ) params.set('q', searchQ)
    if (activeBrand) params.set('marca', activeBrand)
    if (colorFilter) {
      params.set('atributo_clave', 'color')
      params.set('atributo_valor', colorFilter)
    }
    const res = await fetch(`${API_BASE}/products?${params.toString()}`)
    if (res.ok) {
      const data = await res.json()
      applyProductsState(data.items || [])
      setActiveTab('catalogo')
      setStatusMessage(`Mostrando ${data.total} producto(s) disponibles en catálogo.`)
    }
  }

  const handleAddToCart = async (sku: string, qty = 1) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`
    const res = await fetch(`${API_BASE}/cart/items`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        carrito_id: cart?.id ?? null,
        variante_sku: sku,
        cantidad: qty,
      }),
    })
    if (res.ok) {
      const updated: Cart = await res.json()
      setCart(updated)
      localStorage.setItem(STORAGE_CART_KEY, updated.id)
      setStatusMessage(`¡Listo! Agregaste ${sku} a tu carrito de compras.`)
    }
  }

  const handleChangeCartQuantity = async (sku: string, newQty: number) => {
    if (!cart) return
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`
    const res = await fetch(`${API_BASE}/cart/items/${sku}?cart_id=${cart.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        carrito_id: cart.id,
        cantidad: newQty,
      }),
    })
    if (res.ok) {
      setCart(await res.json())
    }
  }

  const handleRemoveFromCart = async (sku: string) => {
    if (!cart) return
    const res = await fetch(`${API_BASE}/cart/items/${sku}?cart_id=${cart.id}`, {
      method: 'DELETE',
    })
    if (res.ok) {
      setCart(await res.json())
    }
  }

  const handleQuoteShipping = async () => {
    const res = await fetch(`${API_BASE}/shipping/quote?zip=${encodeURIComponent(zipCode)}`)
    if (res.ok) {
      const data = await res.json()
      setShippingQuote(data)
      setStatusMessage(
        `Envío a CP ${zipCode}: ${formatMXN(data.costo_domicilio)} (Entrega estimada en ${data.dias_estimados_entrega} días hábiles).`,
      )
    } else {
      const err = await res.json()
      setStatusMessage(`Código postal inválido: ${err.detail}`)
    }
  }

  const handleLogin = async (emailOverride?: string, passwordOverride?: string) => {
    const targetEmail = emailOverride ?? loginEmail
    const targetPass = passwordOverride ?? loginPassword
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: targetEmail, password: targetPass }),
    })
    if (!res.ok) {
      const err = await res.json()
      setStatusMessage(`No se pudo iniciar sesión: ${err.detail}`)
      return
    }
    const data = await res.json()
    localStorage.setItem(STORAGE_TOKEN_KEY, data.access_token)
    setToken(data.access_token)
    await refreshAccountContext(data.access_token)
    setStatusMessage(`Bienvenido(a) de nuevo, sesión iniciada con ${targetEmail}.`)
  }

  const handleLogout = async () => {
    if (token) {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
    }
    localStorage.removeItem(STORAGE_TOKEN_KEY)
    setToken('')
    setUserProfile(null)
    setMyOrders([])
    setNotifications([])
    setStatusMessage('Has cerrado sesión de forma segura.')
  }

  const handleRegisterCustomer = async () => {
    if (!regNombre || !regEmail) {
      setStatusMessage('Por favor ingresa tu nombre completo y correo electrónico.')
      return
    }
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: regNombre,
        email: regEmail,
        password: regPassword,
        acepta_aviso_privacidad: regPrivacy,
      }),
    })
    if (res.ok) {
      setLoginEmail(regEmail)
      setLoginPassword(regPassword)
      await handleLogin(regEmail, regPassword)
      setStatusMessage(`¡Bienvenido a Ferremarket, ${regNombre}! Enviamos la confirmación a tu correo.`)
    } else {
      const err = await res.json()
      setStatusMessage(`No se pudo completar el registro: ${err.detail}`)
    }
  }

  const handleRequestPasswordReset = async () => {
    const res = await fetch(`${API_BASE}/auth/password-reset/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: resetEmail }),
    })
    if (res.ok) {
      const data = await res.json()
      if (data.sandbox_reset_token) setResetToken(data.sandbox_reset_token)
      if (token) void refreshAccountContext(token)
      setStatusMessage(data.message)
    }
  }

  const handleConfirmPasswordReset = async () => {
    if (!resetToken) {
      setStatusMessage('Primero solicita el enlace/código de recuperación.')
      return
    }
    const res = await fetch(`${API_BASE}/auth/password-reset/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset_token: resetToken, new_password: resetNewPass }),
    })
    if (res.ok) {
      const data = await res.json()
      setLoginPassword(resetNewPass)
      setResetToken('')
      setStatusMessage(data.message)
    } else {
      const err = await res.json()
      setStatusMessage(`Error al restablecer contraseña: ${err.detail}`)
    }
  }

  const handleAddAddress = async () => {
    if (!token) return
    const res = await fetch(`${API_BASE}/users/me/addresses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        calle: addrCalle,
        ciudad: addrCiudad,
        codigo_postal: addrCp,
        es_predeterminada: true,
      }),
    })
    if (res.ok) {
      void refreshAccountContext(token)
      setStatusMessage('Dirección de entrega guardada en tu libreta.')
    }
  }

  const confirmOrderPaymentWebhook = async (order: OrderRecord, activeJwt: string) => {
    const payloadStr = JSON.stringify({
      event_id: `evt_${order.folio}`,
      referencia_pasarela: order.referencia_pasarela,
      status: 'aprobado',
    })
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    const signRes = await fetch(`${API_BASE}/payments/webhook-sign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${activeJwt}`,
      },
      body: payloadStr,
    })
    if (signRes.ok) {
      const { signature } = await signRes.json()
      headers['X-Webhook-Signature'] = signature
    }
    const whRes = await fetch(`${API_BASE}/webhooks/payment`, {
      method: 'POST',
      headers,
      body: payloadStr,
    })
    if (whRes.ok) {
      const wh = await whRes.json()
      setLastOrder({ ...order, estado: wh.order_status })
      await refreshAccountContext(activeJwt)
    }
  }

  const handleCheckout = async () => {
    if (!cart || cart.items.length === 0) {
      setStatusMessage('Tu carrito está vacío. Agrega productos para continuar con tu compra.')
      return
    }
    let activeJwt = token
    if (!activeJwt) {
      setStatusMessage('Iniciando sesión con tu cuenta de cliente para procesar el pedido...')
      const loginRes = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      })
      if (!loginRes.ok) {
        setActiveTab('cuenta')
        setStatusMessage('Inicia sesión o regístrate para finalizar tu compra.')
        return
      }
      const loginData = await loginRes.json()
      activeJwt = loginData.access_token
      localStorage.setItem(STORAGE_TOKEN_KEY, activeJwt)
      setToken(activeJwt)
    }

    const clientTokenizedCard = `tok_${paymentProvider}_${cardLast4 || '4242'}_sandbox`
    const res = await fetch(`${API_BASE}/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${activeJwt}`,
      },
      body: JSON.stringify({
        carrito_id: cart.id,
        sucursal_id: selectedBranchId,
        tipo_envio: tipoEnvio,
        codigo_postal: zipCode,
        payment_provider: paymentProvider,
        payment_method: 'tarjeta',
        payment_token: clientTokenizedCard,
      }),
    })
    if (res.ok) {
      const order: OrderRecord = await res.json()
      setLastOrder(order)
      setCart(null)
      localStorage.removeItem(STORAGE_CART_KEY)
      await confirmOrderPaymentWebhook(order, activeJwt)
      await fetchInitialData()
      setStatusMessage(
        `¡Gracias por tu compra! Pedido ${order.folio} confirmado y comprobante enviado a tu correo.`,
      )
    } else {
      const err = await res.json()
      setStatusMessage(`No se pudo procesar el pago: ${err.detail}`)
    }
  }

  const handleCancelOrder = async (orderId: string) => {
    if (!token) return
    const res = await fetch(`${API_BASE}/orders/${orderId}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      await refreshAccountContext(token)
      await fetchInitialData()
      setStatusMessage('Tu pedido ha sido cancelado y el stock fue liberado de inmediato.')
    } else {
      const err = await res.json()
      setStatusMessage(`No se pudo cancelar el pedido: ${err.detail}`)
    }
  }

  const handleLoadArco = async () => {
    if (!token) return
    const res = await fetch(`${API_BASE}/users/me/arco`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      setArcoData(await res.json())
    }
  }

  const handleLoadAdminAudit = async () => {
    if (!token) {
      setStatusMessage('Inicia sesión como Administrador o Staff para acceder al centro operativo.')
      return
    }
    const headers = { Authorization: `Bearer ${token}` }
    const [dqRes, logsRes, shipRes] = await Promise.all([
      fetch(`${API_BASE}/admin/data-quality-report`, { headers }),
      fetch(`${API_BASE}/admin/audit-logs`, { headers }),
      fetch(`${API_BASE}/shipments`, { headers }),
    ])
    if (shipRes.ok) setShipments(await shipRes.json())
    if (dqRes.ok && logsRes.ok) {
      setDqReport(await dqRes.json())
      setAuditLogs(await logsRes.json())
      setStatusMessage('Centro Operativo y Auditoría sincronizados con PostgreSQL 18.')
    } else if (shipRes.ok) {
      setStatusMessage('Envíos cargados para despacho de sucursal.')
    } else {
      setStatusMessage('Se requiere cuenta de Staff o Administrador para esta sección.')
    }
  }

  const handleCreateProduct = async () => {
    if (!token || categories.length === 0) return
    const leafCat = categories[0]?.subcategorias?.[0]?.subcategorias?.[0]?.id ?? categories[0].id
    const res = await fetch(`${API_BASE}/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        categoria_id: leafCat,
        nombre: newProdName || 'Sierra Circular Inalámbrica 7-1/4"',
        descripcion: 'Freno eléctrico de seguridad y zapata de magnesio de alta precisión.',
        marca: newProdMarca,
        variantes: [
          {
            sku: newProdSku,
            atributos: { color: 'amarillo', voltaje: '20V', disco: '7-1/4 pulg' },
            precio: newProdPrecio,
            stock_inicial: 20,
          },
        ],
      }),
    })
    if (res.ok) {
      setStatusMessage(`Producto '${newProdSku}' publicado en la tienda.`)
      void fetchInitialData()
    } else {
      const err = await res.json()
      setStatusMessage(`Error al publicar producto: ${err.detail}`)
    }
  }

  const handleUpdateStock = async () => {
    if (!token || !selectedBranchId) return
    const res = await fetch(`${API_BASE}/inventory/stock`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        variante_sku: stockSku,
        sucursal_id: selectedBranchId,
        cantidad_disponible: Number(stockQty),
      }),
    })
    if (res.ok) {
      void fetchInitialData()
      void handleLoadAdminAudit()
      setStatusMessage(`Inventario actualizado para ${stockSku}: ${stockQty} unidades disponibles.`)
    } else {
      const err = await res.json()
      setStatusMessage(`Error al actualizar stock: ${err.detail}`)
    }
  }

  const handleUpdateShipmentStatus = async (shipmentId: string) => {
    if (!token) return
    const res = await fetch(`${API_BASE}/shipments/${shipmentId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        estado: trackingStatus,
        numero_guia: trackingGuide || null,
      }),
    })
    if (res.ok) {
      void handleLoadAdminAudit()
      void refreshAccountContext(token)
      setStatusMessage(`Envío actualizado a '${trackingStatus}' (${trackingGuide}) y notificación enviada al cliente.`)
    } else {
      const err = await res.json()
      setStatusMessage(`Error al actualizar envío: ${err.detail}`)
    }
  }

  const cartItemsCount = cart ? cart.items.reduce((acc, it) => acc + it.cantidad, 0) : 0
  const cartSubtotalNum = cart ? Number(cart.total) : 0
  const shippingCostNum =
    tipoEnvio === 'recoleccion_tienda' || cartSubtotalNum >= 2999
      ? 0
      : Number(shippingQuote?.costo_domicilio ?? 99)
  const grandTotalNum = cartSubtotalNum > 0 ? cartSubtotalNum + shippingCostNum : 0

  return (
    <div>
      {/* Franja superior comercial */}
      <div className="promo-strip">
        <span>
          🚚 <strong>Envío GRATIS</strong> en pedidos mayores a $2,999 MXN o <strong>Click &amp; Collect $0.00</strong> en
          Sucursal Toluca y Metepec
        </span>
        <span>🔒 Pagos 100% protegidos (Tokenización PCI-DSS) • Facturación y Garantía Directa</span>
      </div>

      {/* Header Comercial Principal */}
      <header className="topbar">
        <div className="brand-title" onClick={() => setActiveTab('catalogo')}>
          <span className="brand-badge">FERREMARKET</span>
          <span style={{ fontSize: '1rem', fontWeight: 600 }}>PRO &amp; HOGAR</span>
        </div>

        <div className="header-search">
          <input
            type="text"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleSearchFilters()
            }}
            placeholder="Buscar taladros, esmeriladoras, multímetros, impermeabilizantes..."
            aria-label="Buscar productos en la tienda"
          />
          <button type="button" onClick={() => void handleSearchFilters()}>
            Buscar
          </button>
        </div>

        <nav className="nav-tabs" aria-label="Navegación principal">
          <button
            type="button"
            className={`nav-btn ${activeTab === 'catalogo' ? 'active' : ''}`}
            onClick={() => setActiveTab('catalogo')}
          >
            🛠️ Tienda ({products.length})
          </button>
          <button
            type="button"
            className={`nav-btn ${activeTab === 'pedidos' ? 'active' : ''}`}
            onClick={() => setActiveTab('pedidos')}
          >
            📦 Mis Pedidos y Rastreo ({myOrders.length})
          </button>
          <button
            type="button"
            className={`nav-btn ${activeTab === 'cuenta' ? 'active' : ''}`}
            onClick={() => setActiveTab('cuenta')}
          >
            👤 {userProfile ? userProfile.nombre.split(' ')[0] : 'Iniciar Sesión'}
            {notifications.length > 0 ? ` • 🔔 ${notifications.length}` : ''}
          </button>
          <button
            type="button"
            className={`nav-btn ${activeTab === 'admin' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('admin')
              if (token) void handleLoadAdminAudit()
            }}
          >
            ⚙️ Operaciones / Admin
          </button>
        </nav>
      </header>

      <main className="container">
        <div className="status-banner" role="status" aria-live="polite">
          <span>
            <strong>Ferremarket:</strong> {statusMessage}
          </span>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <span>
              📍 Sucursal activa:{' '}
              <strong>{branches.find((b) => b.id === selectedBranchId)?.nombre || 'Toluca Centro'}</strong>
            </span>
            <span>
              🛒 <strong>{cartItemsCount} art.</strong> ({formatMXN(cartSubtotalNum)})
            </span>
          </div>
        </div>

        {/* VISTA 1: TIENDA COMERCIAL Y CHECKOUT */}
        {activeTab === 'catalogo' && (
          <>
            <section className="hero-banner">
              <div>
                <h1>Temporada de Construcción e Industria 2026</h1>
                <p>
                  Herramienta eléctrica, medición industrial, plomería e impermeabilizantes con disponibilidad en tiempo
                  real por sucursal.
                </p>
                <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginTop: '0.85rem' }}>
                  {['', 'Milwaukee', 'DeWalt', 'Bosch', 'Urrea', 'Comex', 'Truper', 'Fluke'].map((brand) => (
                    <button
                      key={brand || 'all'}
                      type="button"
                      className={marcaFilter === brand ? 'btn-primary' : 'btn-secondary'}
                      onClick={() => {
                        setMarcaFilter(brand)
                        void handleSearchFilters(selectedCategoryId, brand)
                      }}
                    >
                      {brand || 'Todas las Marcas'}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <div className="grid-layout">
              {/* Columna Izquierda: Departamentos y Filtros */}
              <aside className="card" aria-label="Departamentos">
                <h3>Departamentos</h3>
                {selectedCategoryId && (
                  <button
                    type="button"
                    className="btn-outline"
                    style={{ marginBottom: '0.6rem', width: '100%' }}
                    onClick={() => {
                      setSelectedCategoryId('')
                      void handleSearchFilters('')
                    }}
                  >
                    ✕ Ver todos los departamentos
                  </button>
                )}
                <ul style={{ paddingLeft: '1rem', margin: 0, lineHeight: 1.7 }}>
                  {categories.map((c1) => (
                    <li key={c1.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCategoryId(c1.id)
                          void handleSearchFilters(c1.id)
                        }}
                        style={{ background: 'none', border: 'none', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                      >
                        {c1.nombre}
                      </button>
                      <ul style={{ paddingLeft: '0.9rem' }}>
                        {c1.subcategorias.map((c2) => (
                          <li key={c2.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedCategoryId(c2.id)
                                void handleSearchFilters(c2.id)
                              }}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                            >
                              {c2.nombre}
                            </button>
                            <ul style={{ paddingLeft: '0.9rem' }}>
                              {c2.subcategorias.map((c3) => (
                                <li key={c3.id}>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedCategoryId(c3.id)
                                      void handleSearchFilters(c3.id)
                                    }}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      color: '#d95300',
                                      cursor: 'pointer',
                                      padding: 0,
                                      textAlign: 'left',
                                    }}
                                  >
                                    {c3.nombre}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>

                <hr />
                <h3>Filtrar por Acabado / Color</h3>
                <div className="form-group">
                  <select
                    aria-label="Filtrar por color"
                    value={colorFilter}
                    onChange={(e) => setColorFilter(e.target.value)}
                  >
                    <option value="">Todos los colores</option>
                    <option value="rojo">Rojo</option>
                    <option value="amarillo">Amarillo</option>
                    <option value="azul">Azul</option>
                    <option value="naranja">Naranja</option>
                    <option value="blanco">Blanco</option>
                    <option value="terracota">Terracota</option>
                  </select>
                </div>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ width: '100%' }}
                  onClick={() => void handleSearchFilters()}
                >
                  Aplicar Filtros
                </button>
              </aside>

              {/* Columna Central: Grid Comercial de Productos */}
              <section aria-label="Catálogo de productos">
                <div className="catalog-grid">
                  {products.map((prod) => {
                    const activeSku = selectedVariantByProduct[prod.id] || prod.variantes[0]?.sku
                    const activeVar = prod.variantes.find((v) => v.sku === activeSku) || prod.variantes[0]
                    if (!activeVar) return null
                    const msi = (Number(activeVar.precio) / 6).toFixed(2)
                    return (
                      <article key={prod.id} className="product-card">
                        {activeVar.imagen_url && (
                          <img
                            src={activeVar.imagen_url}
                            alt={prod.nombre}
                            className="product-img"
                            onClick={() => setQuickViewProduct(prod)}
                            style={{ cursor: 'pointer' }}
                          />
                        )}
                        <div className="product-body">
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span className="badge">{prod.marca || 'Ferremarket'}</span>
                            <span className="badge badge-success">Disponible: {activeVar.stock_disponible} uds</span>
                          </div>
                          <h3 style={{ margin: '0.15rem 0', fontSize: '1.02rem' }}>{prod.nombre}</h3>
                          <p style={{ margin: 0, color: '#475569', fontSize: '0.83rem', lineHeight: 1.4 }}>
                            {prod.descripcion}
                          </p>

                          {/* Selector visual de variantes */}
                          <div style={{ marginTop: '0.3rem' }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '0.25rem' }}>
                              Selecciona modelo / presentación ({prod.variantes.length}):
                            </div>
                            <div className="variant-pills">
                              {prod.variantes.map((v) => {
                                const label = Object.values(v.atributos).slice(0, 2).join(' • ') || v.sku
                                return (
                                  <button
                                    key={v.sku}
                                    type="button"
                                    className={`variant-pill ${v.sku === activeVar.sku ? 'selected' : ''}`}
                                    onClick={() =>
                                      setSelectedVariantByProduct({ ...selectedVariantByProduct, [prod.id]: v.sku })
                                    }
                                  >
                                    {label}
                                  </button>
                                )
                              })}
                            </div>
                          </div>

                          <div style={{ marginTop: 'auto', paddingTop: '0.5rem' }}>
                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>SKU: {activeVar.sku}</div>
                            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a' }}>
                              {formatMXN(activeVar.precio)} <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>IVA incl.</span>
                            </div>
                            <div style={{ fontSize: '0.76rem', color: '#15803d', fontWeight: 600 }}>
                              Hasta 6 meses sin intereses de ${msi}
                            </div>
                            <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.6rem' }}>
                              <button
                                type="button"
                                className="btn-outline"
                                onClick={() => setQuickViewProduct(prod)}
                              >
                                Ficha Técnica
                              </button>
                              <button
                                type="button"
                                className="btn-primary"
                                style={{ flex: 1 }}
                                onClick={() => void handleAddToCart(activeVar.sku)}
                              >
                                + Agregar al Carrito
                              </button>
                            </div>
                          </div>
                        </div>
                      </article>
                    )
                  })}
                </div>
              </section>

              {/* Columna Derecha: Carrito Interactivo y Checkout Comercial */}
              <aside className="card" aria-label="Resumen de compra y pago">
                <h3>🛒 Tu Carrito de Compras</h3>
                {!cart || cart.items.length === 0 ? (
                  <p style={{ color: '#475569', fontSize: '0.88rem' }}>
                    Tu carrito está vacío. Selecciona cualquier herramienta o material del catálogo para comenzar.
                  </p>
                ) : (
                  <div>
                    {cartSubtotalNum < 2999 ? (
                      <div
                        style={{
                          background: '#eff6ff',
                          color: '#1e40af',
                          padding: '0.45rem 0.65rem',
                          borderRadius: '6px',
                          fontSize: '0.78rem',
                          marginBottom: '0.75rem',
                        }}
                      >
                        Agrega <strong>{formatMXN(2999 - cartSubtotalNum)}</strong> más para obtener{' '}
                        <strong>Envío a Domicilio GRATIS</strong>.
                      </div>
                    ) : (
                      <div
                        style={{
                          background: '#dcfce7',
                          color: '#15803d',
                          padding: '0.45rem 0.65rem',
                          borderRadius: '6px',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          marginBottom: '0.75rem',
                        }}
                      >
                        🎉 ¡Tu pedido califica para Envío a Domicilio GRATIS!
                      </div>
                    )}

                    {cart.items.map((item) => (
                      <div
                        key={item.variante_sku}
                        style={{
                          borderBottom: '1px solid #e2e8f0',
                          paddingBottom: '0.6rem',
                          marginBottom: '0.6rem',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '0.5rem',
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <strong style={{ fontSize: '0.88rem' }}>{item.nombre_producto}</strong>
                          <div style={{ fontSize: '0.76rem', color: '#64748b' }}>
                            SKU: {item.variante_sku} • {formatMXN(item.precio_unitario_vigente)} c/u
                          </div>
                          <div style={{ marginTop: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div className="qty-control">
                              <button
                                type="button"
                                onClick={() => void handleChangeCartQuantity(item.variante_sku, item.cantidad - 1)}
                              >
                                −
                              </button>
                              <span>{item.cantidad}</span>
                              <button
                                type="button"
                                onClick={() => void handleChangeCartQuantity(item.variante_sku, item.cantidad + 1)}
                              >
                                +
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={() => void handleRemoveFromCart(item.variante_sku)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#b91c1c',
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                              }}
                            >
                              Eliminar
                            </button>
                          </div>
                        </div>
                        <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>{formatMXN(item.subtotal)}</div>
                      </div>
                    ))}

                    <div style={{ fontSize: '0.85rem', color: '#475569', lineHeight: 1.6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Subtotal ({cartItemsCount} artículos):</span>
                        <strong>{formatMXN(cartSubtotalNum)}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Costo de entrega:</span>
                        <strong>{shippingCostNum === 0 ? 'GRATIS ($0.00)' : formatMXN(shippingCostNum)}</strong>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: '1.08rem',
                          color: '#0f172a',
                          borderTop: '1px solid #cbd5e1',
                          paddingTop: '0.4rem',
                          marginTop: '0.3rem',
                        }}
                      >
                        <strong>Total a Pagar:</strong>
                        <strong>{formatMXN(grandTotalNum)} MXN</strong>
                      </div>
                    </div>
                  </div>
                )}

                <hr />
                <h3>🚚 Entrega y Sucursal</h3>
                <div className="form-group">
                  <label htmlFor="shipping-type">Modalidad de Recepción</label>
                  <select
                    id="shipping-type"
                    value={tipoEnvio}
                    onChange={(e) => setTipoEnvio(e.target.value as 'domicilio' | 'recoleccion_tienda')}
                  >
                    <option value="domicilio">Envío a Domicilio (DHL / FedEx Express)</option>
                    <option value="recoleccion_tienda">Recoger en Tienda Click &amp; Collect ($0.00)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="branch-select">Sucursal de Despacho / Recolección</label>
                  <select
                    id="branch-select"
                    value={selectedBranchId}
                    onChange={(e) => setSelectedBranchId(e.target.value)}
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                {tipoEnvio === 'domicilio' && (
                  <div className="form-group">
                    <label htmlFor="zip-input">Código Postal de Entrega</label>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <input
                        id="zip-input"
                        type="text"
                        value={zipCode}
                        onChange={(e) => setZipCode(e.target.value)}
                      />
                      <button type="button" className="btn-secondary" onClick={() => void handleQuoteShipping()}>
                        Calcular
                      </button>
                    </div>
                  </div>
                )}

                <hr />
                <h3>💳 Método de Pago Seguro</h3>
                <div className="form-group">
                  <label htmlFor="gateway-select">Procesador de Pago</label>
                  <select
                    id="gateway-select"
                    value={paymentProvider}
                    onChange={(e) => setPaymentProvider(e.target.value as 'stripe' | 'mercado_pago')}
                  >
                    <option value="stripe">Tarjeta de Crédito / Débito (Visa, Mastercard, Amex)</option>
                    <option value="mercado_pago">Mercado Pago (Saldo, MSI o Transferencia SPEI)</option>
                  </select>
                </div>

                <div
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    padding: '0.75rem',
                    marginBottom: '0.85rem',
                  }}
                >
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#15803d', marginBottom: '0.4rem' }}>
                    🔒 Tokenización en Navegador (PCI-DSS SAQ-A)
                  </div>
                  <div className="form-group">
                    <label htmlFor="card-holder">Titular de la tarjeta</label>
                    <input
                      id="card-holder"
                      value={cardHolder}
                      onChange={(e) => setCardHolder(e.target.value)}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: '0.5rem' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label htmlFor="card-last4">Terminación (4 dígitos)</label>
                      <input
                        id="card-last4"
                        maxLength={4}
                        value={cardLast4}
                        onChange={(e) => setCardLast4(e.target.value)}
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label htmlFor="card-exp">Vigencia</label>
                      <input
                        id="card-exp"
                        value={cardExpiry}
                        onChange={(e) => setCardExpiry(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className="btn-primary"
                  style={{ width: '100%', padding: '0.75rem', fontSize: '0.98rem' }}
                  onClick={() => void handleCheckout()}
                >
                  Confirmar y Pagar {grandTotalNum > 0 ? formatMXN(grandTotalNum) : ''}
                </button>

                {lastOrder && (
                  <div
                    style={{
                      marginTop: '1rem',
                      padding: '0.85rem',
                      background: '#f0fdf4',
                      border: '1px solid #86efac',
                      borderRadius: '8px',
                      fontSize: '0.84rem',
                    }}
                  >
                    <div style={{ fontWeight: 800, color: '#15803d', marginBottom: '0.25rem' }}>
                      ✅ ¡Compra Confirmada!
                    </div>
                    <div>
                      <strong>Folio Oficial:</strong> {lastOrder.folio}
                    </div>
                    <div>
                      <strong>Estado del Pedido:</strong> {lastOrder.estado}
                    </div>
                    <div>
                      <strong>Total Pagado:</strong> {formatMXN(lastOrder.total)} MXN
                    </div>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ marginTop: '0.5rem', width: '100%' }}
                      onClick={() => setActiveTab('pedidos')}
                    >
                      Ver Rastreo de mi Pedido →
                    </button>
                  </div>
                )}
              </aside>
            </div>
          </>
        )}

        {/* VISTA 2: MIS PEDIDOS Y RASTREO CON LÍNEA DE TIEMPO */}
        {activeTab === 'pedidos' && (
          <div className="card">
            <h2>📦 Mis Pedidos, Comprobantes y Rastreo de Envío en Tiempo Real</h2>
            {!userProfile ? (
              <div>
                <p>Inicia sesión para consultar el historial y rastreo de tus compras.</p>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => void handleLogin('ana.torres.sintetica@ferremarket.local', 'Sintetico2026!')}
                >
                  Iniciar Sesión como Cliente (Ana Torres)
                </button>
              </div>
            ) : myOrders.length === 0 ? (
              <p>Aún no tienes pedidos registrados en tu cuenta.</p>
            ) : (
              myOrders.map((ord) => {
                const steps = ['pendiente', 'preparando', 'enviado', 'entregado']
                const currentStepIdx = steps.indexOf(ord.estado_envio)
                return (
                  <div
                    key={ord.id}
                    className="card"
                    style={{ background: '#f8fafc', marginBottom: '0.9rem', borderLeft: '4px solid #f96302' }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '0.5rem',
                        marginBottom: '0.5rem',
                      }}
                    >
                      <div>
                        <strong style={{ fontSize: '1.05rem' }}>Folio: {ord.folio}</strong>
                        <span style={{ marginLeft: '0.75rem', fontSize: '0.82rem', color: '#475569' }}>
                          Fecha: {new Date(ord.fecha).toLocaleString('es-MX')}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <span className="badge badge-success">Pedido: {ord.estado}</span>
                        <span className="badge">
                          {ord.tipo_envio === 'recoleccion_tienda' ? '🏪 Click & Collect' : '🚚 Envío a Domicilio'}
                        </span>
                        <strong style={{ fontSize: '1.05rem' }}>{formatMXN(ord.total)} MXN</strong>
                      </div>
                    </div>

                    <div style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                      <strong>Artículos adquiridos:</strong>{' '}
                      {ord.items
                        .map((it) => `${it.cantidad}x ${it.variante_sku} (${formatMXN(it.precio_unitario_venta)} c/u)`)
                        .join(' • ')}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div>
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155' }}>
                          Progreso Logístico {ord.numero_guia ? `• Guía: ${ord.numero_guia}` : ''}:
                        </div>
                        <div className="timeline">
                          {steps.map((st, idx) => (
                            <span
                              key={st}
                              className={`timeline-step ${
                                ord.estado !== 'cancelado' && idx <= Math.max(0, currentStepIdx) ? 'done' : ''
                              }`}
                            >
                              {idx + 1}. {st.toUpperCase()}
                            </span>
                          ))}
                        </div>
                      </div>

                      {ord.estado !== 'cancelado' && ord.estado_envio !== 'entregado' && (
                        <button
                          type="button"
                          className="btn-outline"
                          style={{ color: '#b91c1c', borderColor: '#fca5a5' }}
                          onClick={() => void handleCancelOrder(ord.id)}
                        >
                          Cancelar Pedido
                        </button>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}

        {/* VISTA 3: MI CUENTA, NOTIFICACIONES Y PRIVACIDAD ARCO */}
        {activeTab === 'cuenta' && (
          <div>
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
                <h2>👤 Mi Cuenta Ferremarket</h2>
                {userProfile && (
                  <button type="button" className="btn-outline" onClick={() => void handleLogout()}>
                    Cerrar Sesión
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => void handleLogin('ana.torres.sintetica@ferremarket.local', 'Sintetico2026!')}
                >
                  Acceso Rápido: Cliente (Ana Torres)
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => void handleLogin('staff.toluca.sintetico@ferremarket.local', 'Sintetico2026!')}
                >
                  Acceso Rápido: Staff Sucursal
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => void handleLogin('admin.sintetico@ferremarket.local', 'Sintetico2026!')}
                >
                  Acceso Rápido: Administrador
                </button>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: '1rem',
                }}
              >
                {/* Login con correo y contraseña */}
                <div className="card" style={{ background: '#f8fafc', marginBottom: 0 }}>
                  <h3>Iniciar Sesión</h3>
                  <div className="form-group">
                    <label htmlFor="login-email">Correo electrónico</label>
                    <input
                      id="login-email"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="login-pass">Contraseña</label>
                    <input
                      id="login-pass"
                      type="password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                    />
                  </div>
                  <button type="button" className="btn-primary" onClick={() => void handleLogin()}>
                    Entrar a mi Cuenta
                  </button>
                </div>

                {/* Registro de Nuevo Cliente */}
                <div className="card" style={{ background: '#f8fafc', marginBottom: 0 }}>
                  <h3>Crear Cuenta Nueva</h3>
                  <div className="form-group">
                    <label htmlFor="reg-name">Nombre y Apellidos</label>
                    <input
                      id="reg-name"
                      value={regNombre}
                      onChange={(e) => setRegNombre(e.target.value)}
                      placeholder="Ej. Roberto Gómez"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="reg-email">Correo electrónico</label>
                    <input
                      id="reg-email"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="roberto@correo.mx"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="reg-pass">Contraseña (mín. 8 caracteres)</label>
                    <input
                      id="reg-pass"
                      type="password"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                    />
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', marginBottom: '0.7rem' }}>
                    <input
                      type="checkbox"
                      checked={regPrivacy}
                      onChange={(e) => setRegPrivacy(e.target.checked)}
                    />
                    He leído y acepto el Aviso de Privacidad (LFPDPPP)
                  </label>
                  <button type="button" className="btn-primary" onClick={() => void handleRegisterCustomer()}>
                    Registrarme
                  </button>
                </div>

                {/* Recuperación de Contraseña */}
                <div className="card" style={{ background: '#f8fafc', marginBottom: 0 }}>
                  <h3>¿Olvidaste tu Contraseña?</h3>
                  <div className="form-group">
                    <label htmlFor="reset-email">Correo registrado</label>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <input
                        id="reset-email"
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                      />
                      <button type="button" className="btn-secondary" onClick={() => void handleRequestPasswordReset()}>
                        Enviar
                      </button>
                    </div>
                  </div>
                  <div className="form-group">
                    <label htmlFor="reset-token">Código de verificación recibido</label>
                    <input
                      id="reset-token"
                      value={resetToken}
                      onChange={(e) => setResetToken(e.target.value)}
                      placeholder="Se autocompleta al solicitar..."
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="reset-new-pass">Nueva contraseña</label>
                    <input
                      id="reset-new-pass"
                      type="password"
                      value={resetNewPass}
                      onChange={(e) => setResetNewPass(e.target.value)}
                    />
                  </div>
                  <button type="button" className="btn-primary" onClick={() => void handleConfirmPasswordReset()}>
                    Actualizar Contraseña
                  </button>
                </div>
              </div>
            </div>

            {userProfile && (
              <div className="card">
                <h3>
                  Hola, {userProfile.nombre} ({userProfile.email}) •{' '}
                  <span className="badge badge-success">Perfil: {userProfile.tipo_usuario}</span>
                </h3>

                {/* Bandeja de Notificaciones por Correo */}
                <h4>🔔 Bandeja de Correos y Avisos de Compra</h4>
                {notifications.length === 0 ? (
                  <p style={{ fontSize: '0.88rem', color: '#475569' }}>No tienes notificaciones pendientes.</p>
                ) : (
                  <table className="table-clean" style={{ marginBottom: '1.25rem' }}>
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Categoría</th>
                        <th>Asunto</th>
                        <th>Mensaje</th>
                      </tr>
                    </thead>
                    <tbody>
                      {notifications.map((n) => (
                        <tr key={n.id}>
                          <td>{new Date(n.timestamp).toLocaleString('es-MX')}</td>
                          <td>
                            <span className="badge">{n.template_type}</span>
                          </td>
                          <td>
                            <strong>{n.subject}</strong>
                          </td>
                          <td>{n.body}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {/* Libreta de Direcciones */}
                <h4>📍 Libreta de Direcciones de Envío</h4>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                  <input
                    value={addrCalle}
                    onChange={(e) => setAddrCalle(e.target.value)}
                    placeholder="Calle y número"
                    style={{ flex: 1 }}
                  />
                  <input value={addrCiudad} onChange={(e) => setAddrCiudad(e.target.value)} placeholder="Ciudad" />
                  <input value={addrCp} onChange={(e) => setAddrCp(e.target.value)} placeholder="CP" style={{ width: '95px' }} />
                  <button type="button" className="btn-secondary" onClick={() => void handleAddAddress()}>
                    + Agregar Dirección
                  </button>
                </div>
                {addresses.length > 0 && (
                  <ul style={{ marginBottom: '1rem' }}>
                    {addresses.map((a) => (
                      <li key={a.id}>
                        {a.calle}, {a.ciudad} (CP {a.codigo_postal})
                      </li>
                    ))}
                  </ul>
                )}

                <hr />
                <h4>🛡️ Privacidad y Derechos ARCO (LFPDPPP)</h4>
                <button type="button" className="btn-outline" onClick={() => void handleLoadArco()}>
                  Descargar / Consultar Expediente de Datos Personales (ARCO)
                </button>
                {arcoData && (
                  <pre
                    style={{
                      background: '#0f172a',
                      color: '#f8fafc',
                      padding: '0.85rem',
                      borderRadius: '8px',
                      marginTop: '0.75rem',
                      overflowX: 'auto',
                      fontSize: '0.8rem',
                    }}
                  >
                    {JSON.stringify(arcoData, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}

        {/* VISTA 4: CENTRO OPERATIVO (STAFF / ADMIN) Y AUDITORÍA */}
        {activeTab === 'admin' && (
          <div>
            <div className="card">
              <h2>⚙️ Centro de Operaciones de Tienda, Logística y Auditoría</h2>
              <p style={{ fontSize: '0.88rem', color: '#475569' }}>
                Desde aquí el personal de sucursal (<code>staff</code>) y los administradores (<code>admin</code>)
                gestionan inventario, despachan guías de envío, dan de alta productos y ejecutan la verificación de
                integridad financiera.
              </p>
              <button type="button" className="btn-primary" onClick={() => void handleLoadAdminAudit()}>
                Sincronizar Operaciones, Envíos y Reporte de Calidad de Datos
              </button>

              {dqReport && (
                <div style={{ marginTop: '1rem' }}>
                  <h3>Verificación de Integridad Financiera y Esquema (PostgreSQL 18)</h3>
                  <pre
                    style={{
                      background: '#0f172a',
                      color: '#a7f3d0',
                      padding: '0.85rem',
                      borderRadius: '8px',
                      overflowX: 'auto',
                      fontSize: '0.8rem',
                    }}
                  >
                    {JSON.stringify(dqReport, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
              <div className="card">
                <h3>Publicar Nuevo Producto en Tienda</h3>
                <div className="form-group">
                  <label htmlFor="prod-name">Nombre comercial</label>
                  <input
                    id="prod-name"
                    value={newProdName}
                    onChange={(e) => setNewProdName(e.target.value)}
                    placeholder='Sierra Circular Inalámbrica 7-1/4"'
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="prod-brand">Marca</label>
                  <input id="prod-brand" value={newProdMarca} onChange={(e) => setNewProdMarca(e.target.value)} />
                </div>
                <div className="form-group">
                  <label htmlFor="prod-sku">SKU</label>
                  <input id="prod-sku" value={newProdSku} onChange={(e) => setNewProdSku(e.target.value)} />
                </div>
                <div className="form-group">
                  <label htmlFor="prod-price">Precio de venta (MXN)</label>
                  <input id="prod-price" value={newProdPrecio} onChange={(e) => setNewProdPrecio(e.target.value)} />
                </div>
                <button type="button" className="btn-primary" onClick={() => void handleCreateProduct()}>
                  Publicar en Catálogo
                </button>
              </div>

              <div className="card">
                <h3>Abastecimiento de Inventario por Sucursal</h3>
                <div className="form-group">
                  <label htmlFor="stock-sku">SKU de Variante</label>
                  <input id="stock-sku" value={stockSku} onChange={(e) => setStockSku(e.target.value)} />
                </div>
                <div className="form-group">
                  <label htmlFor="stock-qty">Existencia Física Disponible</label>
                  <input id="stock-qty" type="number" value={stockQty} onChange={(e) => setStockQty(e.target.value)} />
                </div>
                <button type="button" className="btn-primary" onClick={() => void handleUpdateStock()}>
                  Actualizar Existencia en Sucursal
                </button>
              </div>
            </div>

            {shipments.length > 0 && (
              <div className="card">
                <h3>🚚 Despacho de Pedidos y Asignación de Guías de Paquetería</h3>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                  <select
                    aria-label="Nuevo estado de envío"
                    value={trackingStatus}
                    onChange={(e) =>
                      setTrackingStatus(
                        e.target.value as 'preparando' | 'enviado' | 'listo_recoleccion' | 'entregado',
                      )
                    }
                  >
                    <option value="preparando">En preparación de almacén</option>
                    <option value="enviado">Enviado con guía de paquetería</option>
                    <option value="listo_recoleccion">Listo para recolección en tienda</option>
                    <option value="entregado">Entregado al cliente</option>
                  </select>
                  <input
                    value={trackingGuide}
                    onChange={(e) => setTrackingGuide(e.target.value)}
                    placeholder="Número de guía (ej. GUIA-DHL-988120)"
                  />
                </div>
                <table className="table-clean">
                  <thead>
                    <tr>
                      <th>Envío</th>
                      <th>Pedido</th>
                      <th>Modalidad</th>
                      <th>Estado</th>
                      <th>Guía Asignada</th>
                      <th>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shipments.map((sh) => (
                      <tr key={sh.id}>
                        <td>{sh.id.slice(0, 8)}</td>
                        <td>{sh.pedido_id.slice(0, 8)}</td>
                        <td>{sh.tipo}</td>
                        <td>
                          <span className="badge badge-success">{sh.estado}</span>
                        </td>
                        <td>{sh.numero_guia || 'Pendiente'}</td>
                        <td>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => void handleUpdateShipmentStatus(sh.id)}
                          >
                            Aplicar Estado y Notificar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {auditLogs.length > 0 && (
              <div className="card">
                <h3>Bitácora de Operaciones y Seguridad</h3>
                <table className="table-clean">
                  <thead>
                    <tr>
                      <th>Fecha UTC</th>
                      <th>Evento</th>
                      <th>Recurso</th>
                      <th>Detalles</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.slice(0, 25).map((log) => (
                      <tr key={String(log.id)}>
                        <td>{String(log.timestamp)}</td>
                        <td>
                          <span className="badge">{String(log.event_type)}</span>
                        </td>
                        <td>{String(log.resource)}</td>
                        <td>
                          <code>{JSON.stringify(log.details)}</code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* MODAL DE FICHA TÉCNICA / VISTA RÁPIDA DE PRODUCTO */}
        {quickViewProduct && (
          <div className="modal-backdrop" onClick={() => setQuickViewProduct(null)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="badge">{quickViewProduct.marca || 'Ferremarket Pro'}</span>
                <button type="button" className="btn-outline" onClick={() => setQuickViewProduct(null)}>
                  ✕ Cerrar
                </button>
              </div>
              <h2 style={{ marginTop: '0.5rem' }}>{quickViewProduct.nombre}</h2>
              <p style={{ color: '#475569' }}>{quickViewProduct.descripcion}</p>
              <h4>Variantes y Especificaciones Técnicas Disponibles:</h4>
              {quickViewProduct.variantes.map((v) => (
                <div
                  key={v.sku}
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    padding: '0.75rem',
                    marginBottom: '0.6rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                  }}
                >
                  <div>
                    <strong>SKU: {v.sku}</strong>
                    <div style={{ fontSize: '0.82rem', color: '#475569' }}>
                      {Object.entries(v.atributos)
                        .map(([k, val]) => `${k.toUpperCase()}: ${val}`)
                        .join(' • ')}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>{formatMXN(v.precio)}</div>
                      <span className="badge badge-success">Stock: {v.stock_disponible}</span>
                    </div>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => {
                        void handleAddToCart(v.sku)
                        setQuickViewProduct(null)
                      }}
                    >
                      + Agregar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
