# Pruebas de usabilidad (H1, H2 y H3)

Requisitos del checklist (Documento de Calidad, sec. 26):

- **H1:** evaluación con las 10 heurísticas de Nielsen.
- **H2:** prueba con 5 a 8 usuarios; deben completar una compra sin guía en menos de 5 minutos (RQ-USA-001).
- **H3:** puntaje SUS de 68 o más.

Se hacen sobre el sitio construido con datos simulados: en `frontend/`, `npm run dev:mock` y abrir `http://localhost:5173`. Antes de cada participante, usar "Reiniciar datos de prueba" en el panel "Mock" (esquina inferior izquierda).

## H1 · Evaluación heurística

La hacen 2 o 3 integrantes por separado y luego juntan los hallazgos. Cada quien recorre: inicio, búsqueda, listado, ficha, carrito, checkout, confirmación y Mi cuenta.

Severidad: 0 no es problema · 1 cosmético · 2 menor · 3 mayor · 4 catastrófico (impide la tarea).

| # | Heurística | Pantalla | Hallazgo | Severidad | Evaluador |
|---|---|---|---|---|---|
| 1 | Visibilidad del estado del sistema | | | | |
| 2 | Relación entre el sistema y el mundo real | | | | |
| 3 | Control y libertad del usuario | | | | |
| 4 | Consistencia y estándares | | | | |
| 5 | Prevención de errores | | | | |
| 6 | Reconocer antes que recordar | | | | |
| 7 | Flexibilidad y eficiencia de uso | | | | |
| 8 | Diseño estético y minimalista | | | | |
| 9 | Ayudar a reconocer, diagnosticar y recuperarse de errores | | | | |
| 10 | Ayuda y documentación | | | | |

H1 se cumple cuando la tabla está completa y los hallazgos de severidad 3 o 4 tienen issue abierto.

## H2 · Prueba con usuarios

**Participantes:** 5 a 8 personas que no hayan visto el sitio. Mezclen edades y que al menos 2 lo hagan en celular.

**Roles:** una persona modera (lee las tareas y no ayuda) y otra toma tiempo y notas.

**Antes de empezar, leer en voz alta:**

> Gracias por ayudarnos. Vamos a probar el sitio, no a ti: si algo es difícil, es culpa del sitio. Te voy a dar unas tareas; por favor piensa en voz alta mientras las haces. No puedo ayudarte durante la tarea. Los datos son de prueba: no se cobra nada.

**Tareas** (una por una, en este orden):

| # | Tarea que se le lee | Se completa cuando | Tiempo límite |
|---|---|---|---|
| T1 | "Necesitas un taladro inalámbrico para colgar repisas. Encuentra uno que puedas recoger hoy en la sucursal Toluca Centro." | Abre la ficha de un taladro inalámbrico con stock en Toluca Centro | 3 min |
| T2 | "Cómpralo y recógelo en la tienda. Usa tus datos o unos inventados." | Llega a "Gracias, tu pedido está pagado" (en la pasarela simulada, "Aprobar pago") | **5 min (RQ-USA-001)** |
| T3 | "Inicia sesión con cliente@ejemplo.com y contraseña Taller123, y busca el código para recoger tu pedido 10482." | Lee el código 4821 | 3 min |

**Registro por participante:**

| Participante | Equipo | T1 tiempo | T1 ¿completó? | T2 tiempo | T2 ¿completó? | T3 tiempo | T3 ¿completó? | Dónde se atoró |
|---|---|---|---|---|---|---|---|---|
| P1 | | | | | | | | |
| P2 | | | | | | | | |
| P3 | | | | | | | | |
| P4 | | | | | | | | |
| P5 | | | | | | | | |

H2 se cumple si al menos el 80 % de los participantes completa T2 sin ayuda en menos de 5 minutos.

## H3 · Cuestionario SUS

Al terminar las tareas, cada participante contesta las 10 frases del 1 (totalmente en desacuerdo) al 5 (totalmente de acuerdo):

| # | Frase | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| 1 | Creo que me gustaría usar este sitio con frecuencia. | | | | | |
| 2 | El sitio me pareció innecesariamente complicado. | | | | | |
| 3 | El sitio me pareció fácil de usar. | | | | | |
| 4 | Creo que necesitaría ayuda de alguien con conocimientos técnicos para usarlo. | | | | | |
| 5 | Las funciones del sitio están bien integradas. | | | | | |
| 6 | El sitio tiene demasiadas inconsistencias. | | | | | |
| 7 | Creo que la mayoría de la gente aprendería a usarlo muy rápido. | | | | | |
| 8 | El sitio me pareció muy difícil de usar. | | | | | |
| 9 | Me sentí con confianza al usar el sitio. | | | | | |
| 10 | Tuve que aprender muchas cosas antes de poder usarlo. | | | | | |

**Cómo se calcula** (por participante):

1. Frases impares (1, 3, 5, 7, 9): respuesta − 1.
2. Frases pares (2, 4, 6, 8, 10): 5 − respuesta.
3. Sumar los 10 resultados y multiplicar por 2.5. El puntaje va de 0 a 100.

Ejemplo: si alguien contesta 4 en todas las impares y 2 en todas las pares → (3 × 5) + (3 × 5) = 30 → 30 × 2.5 = **75**.

H3 se cumple si el **promedio** de todos los participantes es 68 o más.

| Participante | Puntaje SUS |
|---|---|
| P1 | |
| P2 | |
| P3 | |
| P4 | |
| P5 | |
| **Promedio** | |

## Al terminar

- Abrir un issue por cada problema que se repita en 2 o más participantes, o que impida terminar una tarea.
- Marcar H1, H2 y H3 en `docs/diseno/checklist.md` con el resultado y la fecha.
