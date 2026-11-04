"""Pasarela de pruebas del backend (`settings.pasarela_sandbox`): pagar o rechazar sin campos de tarjeta.

El resultado se procesa igual que un webhook firmado.
"""

from decimal import Decimal
from html import escape
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session

from backend.services.checkout.app.order_repository import OrderRepository
from backend.shared.config import settings
from backend.shared.database import get_db
from backend.shared.models import Pago, Pedido

router = APIRouter(prefix="/api/v1/pagos/sandbox", tags=["Pagos"], include_in_schema=False)


def _pending_payment(db: Session, referencia: str) -> tuple[Pago, Pedido]:
    """Pago de la referencia y su pedido; 404 si la pasarela de pruebas está apagada o no existe."""
    if not settings.pasarela_sandbox:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pasarela de pruebas desactivada")
    pago = db.query(Pago).filter(Pago.referencia_pasarela == referencia).first()
    pedido = db.get(Pedido, pago.pedido_id) if pago else None
    if pago is None or pedido is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pago no encontrado")
    return pago, pedido


@router.get("/{referencia}", response_class=HTMLResponse)
def sandbox_page(referencia: str, db: Session = Depends(get_db)) -> HTMLResponse:
    """Página de pago de prueba con el folio y el monto."""
    pago, pedido = _pending_payment(db, referencia)
    monto = f"${Decimal(str(pago.monto)):,.2f} MXN"
    accion = f"/api/v1/pagos/sandbox/{escape(referencia)}"
    ya_procesado = pago.estado in {"aprobado", "rechazado", "reembolsado"}
    botones = (
        f'<p>Este pago ya está {escape(pago.estado)}.</p>'
        f'<a class="btn" href="/pedido/{pedido.id}/confirmacion">Volver a la tienda</a>'
        if ya_procesado
        else f'<form method="post" action="{accion}?resultado=aprobado"><button class="btn">Pagar {monto}</button></form>'
        f'<form method="post" action="{accion}?resultado=rechazado">'
        f'<button class="btn secundario">Simular pago rechazado</button></form>'
    )
    html = f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pasarela de pruebas</title>
<style>
body{{font-family:system-ui,sans-serif;margin:0;background:#f4f4f2;color:#1b1b1b}}
main{{max-width:28rem;margin:3rem auto;padding:2rem;background:#fff;border-radius:8px}}
h1{{font-size:1.4rem;margin-top:0}} .btn{{display:block;width:100%;padding:.9rem;margin-top:1rem;font-size:1rem;
border:2px solid #1b1b1b;border-radius:6px;background:#1b1b1b;color:#fff;cursor:pointer;text-align:center;
text-decoration:none}} .secundario{{background:#fff;color:#1b1b1b}} :focus-visible{{outline:3px solid #0a58ca;
outline-offset:2px}} p{{line-height:1.5}}
</style></head>
<body><main>
<h1>Pasarela de pruebas</h1>
<p>Pedido <strong>{escape(pedido.folio)}</strong><br>Total: <strong>{monto}</strong></p>
<p>Esta página sustituye a la pasarela de pago real en desarrollo. No se cobra nada.</p>
{botones}
</main></body></html>"""
    return HTMLResponse(html)


@router.post("/{referencia}")
def sandbox_result(
    referencia: str,
    resultado: str = Query(..., pattern="^(aprobado|rechazado)$"),
    db: Session = Depends(get_db),
) -> RedirectResponse:
    """Procesa el resultado como lo haría el webhook de la pasarela y regresa a la confirmación del pedido."""
    pago, pedido = _pending_payment(db, referencia)
    if pago.estado not in {"aprobado", "rechazado", "reembolsado"}:
        OrderRepository(db).handle_payment_webhook(
            event_id=f"sandbox_{uuid.uuid4().hex}", referencia_pasarela=referencia, payment_status=resultado
        )
    return RedirectResponse(f"/pedido/{pedido.id}/confirmacion", status_code=status.HTTP_303_SEE_OTHER)
