import { QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { RouterProvider } from 'react-router-dom'
import { AuthProvider } from '@/app/providers/AuthProvider'
import { StoreProvider } from '@/app/providers/StoreProvider'
import { createQueryClient } from '@/app/queryClient'
import { createRouter } from '@/app/router'
import { ToastProvider } from '@/components/feedback/ToastProvider'

export default function App() {
  const [queryClient] = useState(createQueryClient)
  const [router] = useState(createRouter)

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <StoreProvider>
            <RouterProvider router={router} />
          </StoreProvider>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  )
}
