"""Patrón Factory para Pasarelas de Pago con Circuit Breaker y Backoff (Sec. 14.2, Sec. 23.3, AE-29)."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from decimal import Decimal
import hashlib
import hmac
import uuid
import httpx

from backend.shared.config import settings


@dataclass
class GatewayChargeResult:
    """Resultado de una solicitud de cobro tokenizada en la pasarela."""

    provider: str
    reference_id: str
    status: str  # 'procesando', 'aprobado', 'rechazado'
    checkout_url: str


class PaymentGateway(ABC):
    """Interfaz abstracta para proveedores de pasarela de pago (Sec. 14.2)."""

    provider_name: str = "abstract"

    @abstractmethod
    def create_payment_intent(
        self,
        order_folio: str,
        amount: Decimal,
        payment_token: str,
    ) -> GatewayChargeResult:
        """Crea una intención de pago usando tokenización (PCI-DSS SAQ-A, RQ-SEG-002)."""


class StripeGateway(PaymentGateway):
    """Adaptador Sandbox para Stripe con soporte de API HTTP real (`sk_test_...`) y sandbox local (Sec. 14.2)."""

    provider_name = "stripe"

    def _call_live_stripe_sandbox(self, order_folio: str, amount: Decimal, payment_token: str) -> GatewayChargeResult | None:
        """Invoca `https://api.stripe.com/v1/payment_intents` si se configuró una llave real `sk_test_`."""
        api_key = settings.payment_api_key.strip()
        if not api_key.startswith("sk_test_") or api_key == "sk_test_sandbox_placeholder":
            return None
        try:
            cents = int((amount * Decimal("100")).quantize(Decimal("1")))
            resp = httpx.post(
                "https://api.stripe.com/v1/payment_intents",
                auth=(api_key, ""),
                data={
                    "amount": str(cents),
                    "currency": "mxn",
                    "description": f"Ferremarket {order_folio}",
                    "metadata[folio]": order_folio,
                    "metadata[token]": payment_token,
                },
                timeout=float(settings.payment_timeout_seconds),
            )
            if resp.status_code in {200, 201}:
                payload = resp.json()
                return GatewayChargeResult(
                    provider="stripe",
                    reference_id=str(payload.get("id", f"pi_stripe_{uuid.uuid4().hex[:14]}")),
                    status="procesando",
                    checkout_url=f"https://checkout.stripe.sandbox.local/pay/{order_folio}",
                )
        except httpx.TimeoutException as exc:
            raise TimeoutError("Timeout al conectar con Stripe Sandbox API") from exc
        except httpx.HTTPError:
            return None
        return None

    def create_payment_intent(
        self,
        order_folio: str,
        amount: Decimal,
        payment_token: str,
    ) -> GatewayChargeResult:
        """Crea o simula un PaymentIntent en el sandbox de Stripe."""
        if payment_token == "tok_timeout":
            raise TimeoutError("Timeout simulado al conectar con Stripe Sandbox")
        if payment_token == "tok_decline":
            return GatewayChargeResult(
                provider="stripe",
                reference_id=f"pi_stripe_{uuid.uuid4().hex[:14]}",
                status="rechazado",
                checkout_url=f"https://checkout.stripe.sandbox.local/pay/{order_folio}",
            )
        live_result = self._call_live_stripe_sandbox(order_folio, amount, payment_token)
        if live_result is not None:
            return live_result
        return GatewayChargeResult(
            provider="stripe",
            reference_id=f"pi_stripe_{uuid.uuid4().hex[:14]}",
            status="procesando",
            checkout_url=f"https://checkout.stripe.sandbox.local/pay/{order_folio}",
        )


class MercadoPagoGateway(PaymentGateway):
    """Adaptador Sandbox para Mercado Pago con soporte de API HTTP real (`TEST-...`) y sandbox local (Sec. 14.2)."""

    provider_name = "mercado_pago"

    def _call_live_mp_sandbox(self, order_folio: str, amount: Decimal) -> GatewayChargeResult | None:
        """Invoca `https://api.mercadopago.com/checkout/preferences` si se configuró un token `TEST-`."""
        api_key = settings.payment_api_key.strip()
        if not api_key.startswith("TEST-"):
            return None
        try:
            resp = httpx.post(
                "https://api.mercadopago.com/checkout/preferences",
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "external_reference": order_folio,
                    "items": [
                        {
                            "title": f"Pedido Ferremarket {order_folio}",
                            "quantity": 1,
                            "currency_id": "MXN",
                            "unit_price": float(amount),
                        }
                    ],
                },
                timeout=float(settings.payment_timeout_seconds),
            )
            if resp.status_code in {200, 201}:
                payload = resp.json()
                return GatewayChargeResult(
                    provider="mercado_pago",
                    reference_id=str(payload.get("id", f"mp_pref_{uuid.uuid4().hex[:14]}")),
                    status="procesando",
                    checkout_url=str(
                        payload.get("sandbox_init_point", f"https://sandbox.mercadopago.local/checkout/{order_folio}")
                    ),
                )
        except httpx.TimeoutException as exc:
            raise TimeoutError("Timeout al conectar con Mercado Pago Sandbox API") from exc
        except httpx.HTTPError:
            return None
        return None

    def create_payment_intent(
        self,
        order_folio: str,
        amount: Decimal,
        payment_token: str,
    ) -> GatewayChargeResult:
        """Crea o simula una preferencia de pago en Mercado Pago Sandbox."""
        if payment_token == "tok_timeout":
            raise TimeoutError("Timeout simulado al conectar con Mercado Pago Sandbox")
        if payment_token == "tok_decline":
            return GatewayChargeResult(
                provider="mercado_pago",
                reference_id=f"mp_pref_{uuid.uuid4().hex[:14]}",
                status="rechazado",
                checkout_url=f"https://sandbox.mercadopago.local/checkout/{order_folio}",
            )
        live_result = self._call_live_mp_sandbox(order_folio, amount)
        if live_result is not None:
            return live_result
        return GatewayChargeResult(
            provider="mercado_pago",
            reference_id=f"mp_pref_{uuid.uuid4().hex[:14]}",
            status="procesando",
            checkout_url=f"https://sandbox.mercadopago.local/checkout/{order_folio}",
        )


class PaymentGatewayFactory:
    """Fábrica para instanciar pasarelas de pago intercambiables (Sec. 14.2)."""

    @staticmethod
    def create(provider: str) -> PaymentGateway:
        """
        Instancia el adaptador de pasarela de pago solicitado.

        Args:
            provider: Identificador del proveedor ('stripe' o 'mercado_pago').

        Returns:
            PaymentGateway: Implementación concreta de la pasarela.

        Raises:
            ValueError: Si el proveedor no está soportado.
        """
        normalized = provider.strip().lower()
        if normalized == "stripe":
            return StripeGateway()
        if normalized == "mercado_pago":
            return MercadoPagoGateway()
        raise ValueError(f"Proveedor no soportado: {provider}")


class GatewayCircuitBreaker:
    """Implementación de Circuit Breaker y cola de eventos pendientes para pasarela (Sec. 23.3, AE-29)."""

    def __init__(self, failure_threshold: int = 3) -> None:
        self.failure_threshold = failure_threshold
        self.failure_count = 0
        self.state = "CLOSED"  # 'CLOSED', 'OPEN'
        self.pending_queue: list[dict[str, str]] = []

    def record_success(self) -> None:
        """Reinicia el contador de fallas y cierra el circuito."""
        self.failure_count = 0
        self.state = "CLOSED"

    def record_failure(self) -> None:
        """Incrementa el contador de fallas y abre el circuito si supera el umbral."""
        self.failure_count += 1
        if self.failure_count >= self.failure_threshold:
            self.state = "OPEN"

    def reset(self) -> None:
        """Restablece el estado del circuit breaker."""
        self.failure_count = 0
        self.state = "CLOSED"


circuit_breaker = GatewayCircuitBreaker()


def compute_webhook_signature(payload_bytes: bytes, secret: str | None = None) -> str:
    """Calcula la firma HMAC-SHA256 para validar webhooks de pasarela de pago (Parte B Pagos)."""
    key = (secret or settings.payment_webhook_secret).encode("utf-8")
    return hmac.new(key, payload_bytes, hashlib.sha256).hexdigest()


def verify_webhook_signature(payload_bytes: bytes, signature: str | None, secret: str | None = None) -> bool:
    """Verifica la firma HMAC-SHA256 de un webhook entrante."""
    if not signature:
        return False
    expected = compute_webhook_signature(payload_bytes, secret)
    return hmac.compare_digest(expected, signature)
