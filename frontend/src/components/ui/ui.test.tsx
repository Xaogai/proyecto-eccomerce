import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Button } from './Button'
import { TextField } from './Field'
import { QuantityStepper } from './QuantityStepper'
import { Switch } from './Switch'
import { Tabs } from './Tabs'

describe('Button', () => {
  it('es type="button" por defecto y queda ocupado con loading', () => {
    render(<Button loading>Guardar</Button>)
    const btn = screen.getByRole('button', { name: 'Guardar' })
    expect(btn).toHaveAttribute('type', 'button')
    expect(btn).toHaveAttribute('aria-busy', 'true')
  })
})

describe('TextField', () => {
  it('enlaza etiqueta, pista y error con el campo (sec. 28)', () => {
    render(<TextField label="Contraseña" hint="Al menos 8 caracteres" error="Usa al menos 8." />)
    const input = screen.getByLabelText('Contraseña')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Usa al menos 8. Al menos 8 caracteres')
  })
  it('sin error no marca el campo como inválido', () => {
    render(<TextField label="Correo" />)
    expect(screen.getByLabelText('Correo')).not.toHaveAttribute('aria-invalid')
  })
})

describe('QuantityStepper', () => {
  function Harness() {
    const [n, setN] = useState(1)
    return <QuantityStepper value={n} onChange={setN} max={2} itemName="Taladro" />
  }
  it('respeta mínimo y máximo', () => {
    render(<Harness />)
    const quitar = screen.getByRole('button', { name: 'Quitar uno' })
    const agregar = screen.getByRole('button', { name: 'Agregar uno' })
    expect(quitar).toBeDisabled()
    fireEvent.click(agregar)
    expect(screen.getByRole('spinbutton', { name: 'Cantidad de Taladro' })).toHaveValue(2)
    expect(agregar).toBeDisabled()
  })
})

describe('Switch', () => {
  it('es un role="switch" con estado', () => {
    const onChange = vi.fn()
    render(<Switch label="Vista 360°" checked={false} onChange={onChange} />)
    const sw = screen.getByRole('switch', { name: 'Vista 360°' })
    expect(sw).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(sw)
    expect(onChange).toHaveBeenCalledWith(true)
  })
})

describe('Tabs', () => {
  function Harness() {
    const [v, setV] = useState<'a' | 'b' | 'c'>('a')
    return (
      <Tabs
        label="Cálculo"
        value={v}
        onChange={setV}
        tabs={[
          { value: 'a', label: 'Pintura', panel: 'Panel A' },
          { value: 'b', label: 'Piso', panel: 'Panel B' },
          { value: 'c', label: 'Taquetes', panel: 'Panel C' },
        ]}
      />
    )
  }
  it('cambia con flechas y da la vuelta', () => {
    render(<Harness />)
    const first = screen.getByRole('tab', { name: 'Pintura' })
    fireEvent.keyDown(first, { key: 'ArrowLeft' })
    expect(screen.getByRole('tab', { name: 'Taquetes' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Panel C')
    expect(screen.getByRole('tab', { name: 'Taquetes' })).toHaveFocus()
  })
})
