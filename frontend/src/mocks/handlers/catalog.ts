// EP-01 (fase 0). Listado, ficha, búsqueda y reseñas se agregan en la fase 1.
import { http, HttpResponse } from 'msw'
import { db } from '../db/store'
import { applyScenario } from '../scenarios'
import { API } from './utils'

export const catalogHandlers = [
  http.get(`${API}/categories`, async () => {
    const hijack = await applyScenario()
    if (hijack) return hijack
    return HttpResponse.json(db.categories)
  }),
]
