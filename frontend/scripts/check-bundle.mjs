// Presupuesto del paquete público (E6): lo que baja el visitante al abrir cualquier página de la
// tienda, es decir, el JS y el CSS que pide dist/index.html. Las secciones bajo demanda (cuenta,
// herramientas, admin, sucursal) no cuentan. Se corre después de npm run build.
import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const BUDGET_KB = 200
const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8')
const files = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1])

let total = 0
for (const file of files) {
  const kb = gzipSync(readFileSync(new URL(`../dist/${file}`, import.meta.url))).length / 1024
  total += kb
  console.log(`${kb.toFixed(1).padStart(7)} KB  ${file}`)
}
console.log(`${total.toFixed(1).padStart(7)} KB  total gzip (presupuesto ${BUDGET_KB} KB)`)

if (total > BUDGET_KB) {
  console.error(`El paquete público pasa del presupuesto por ${(total - BUDGET_KB).toFixed(1)} KB.`)
  process.exit(1)
}
