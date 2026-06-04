from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import resend

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def _configure_resend() -> None:
    """Configure the Resend SDK with the API key from settings."""
    resend.api_key = settings.RESEND_API_KEY


# ─────────────────────────────────────────────────────────────────────────────
# HTML template builder
# ─────────────────────────────────────────────────────────────────────────────
def build_email_html(
    user_name: str,
    portfolio_name: str,
    risk_data: Dict[str, Any],
) -> str:
    """Build a professional HTML email body for the portfolio risk report."""
    timestamp = datetime.now(timezone.utc).strftime("%B %d, %Y at %H:%M UTC")
    portfolio_value = risk_data.get("portfolio_value", 0)
    sharpe = risk_data.get("sharpe", 0)
    volatility = risk_data.get("volatility", 0)
    var_95 = risk_data.get("var_95", 0)
    var_95_dollar = risk_data.get("var_95_dollar", 0)
    max_drawdown = risk_data.get("max_drawdown", 0)
    daily_return = risk_data.get("daily_return", 0)
    beta = risk_data.get("beta", 0)
    sortino = risk_data.get("sortino", 0)

    # Determine color for daily return
    return_color = "#16a34a" if daily_return >= 0 else "#dc2626"
    drawdown_color = "#dc2626" if max_drawdown < 0 else "#16a34a"
    return_sign = "+" if daily_return >= 0 else ""

    html = f"""
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Portfolio Risk Report – {portfolio_name}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#f3f4f6">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table width="620" cellpadding="0" cellspacing="0" bgcolor="#ffffff"
               style="border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td bgcolor="#1a3c5e" style="padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">
                📊 Portfolio Risk Report
              </h1>
              <p style="margin:8px 0 0;color:#93c5fd;font-size:14px;">{timestamp}</p>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding:32px 40px 16px;">
              <p style="margin:0;font-size:16px;color:#374151;">
                Hello <strong>{user_name}</strong>,
              </p>
              <p style="margin:8px 0 0;font-size:15px;color:#6b7280;line-height:1.6;">
                Here is your scheduled risk report for the portfolio
                <strong style="color:#1a3c5e;">{portfolio_name}</strong>.
              </p>
            </td>
          </tr>

          <!-- Portfolio Value Card -->
          <tr>
            <td style="padding:0 40px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0"
                     style="background:#eff6ff;border-radius:10px;border:1px solid #bfdbfe;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 4px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Total Portfolio Value</p>
                    <p style="margin:0;font-size:32px;font-weight:700;color:#1a3c5e;">${portfolio_value:,.2f}</p>
                    <p style="margin:6px 0 0;font-size:14px;color:{return_color};font-weight:600;">
                      {return_sign}{daily_return:.2f}% daily return
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Risk Metrics Grid -->
          <tr>
            <td style="padding:0 40px 24px;">
              <p style="margin:0 0 16px;font-size:16px;font-weight:700;color:#1a3c5e;">Risk Metrics</p>
              <table width="100%" cellpadding="0" cellspacing="8">
                <tr>
                  {_metric_cell("Sharpe Ratio", f"{sharpe:.2f}", "Higher is better")}
                  {_metric_cell("Sortino Ratio", f"{sortino:.2f}", "Downside risk adjusted")}
                </tr>
                <tr>
                  {_metric_cell("Volatility", f"{volatility:.2f}%", "Annualised")}
                  {_metric_cell("Beta", f"{beta:.2f}", "vs Benchmark")}
                </tr>
                <tr>
                  {_metric_cell("VaR 95% (1-day)", f"{var_95:.2f}%", f"≈ ${var_95_dollar:,.0f}")}
                  {_metric_cell("Max Drawdown", f"{max_drawdown:.2f}%", "Peak to trough", color=drawdown_color)}
                </tr>
              </table>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:0 40px 32px;text-align:center;">
              <a href="{settings.FRONTEND_URL}"
                 style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;
                        padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;">
                View Full Dashboard →
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td bgcolor="#f9fafb" style="padding:20px 40px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;line-height:1.6;">
                You are receiving this email because you have enabled scheduled reports in<br/>
                Portfolio Risk Monitor Pro. Past performance is not indicative of future results.<br/>
                <a href="{settings.FRONTEND_URL}/settings" style="color:#6b7280;">Manage email preferences</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""
    return html


def _metric_cell(
    label: str,
    value: str,
    sub: str = "",
    color: str = "#1a3c5e",
) -> str:
    return f"""
<td width="50%" style="padding:4px;">
  <table width="100%" cellpadding="0" cellspacing="0"
         style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;">
    <tr>
      <td style="padding:12px 14px;">
        <p style="margin:0 0 2px;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.04em;">{label}</p>
        <p style="margin:0;font-size:20px;font-weight:700;color:{color};">{value}</p>
        <p style="margin:2px 0 0;font-size:11px;color:#6b7280;">{sub}</p>
      </td>
    </tr>
  </table>
</td>
"""


# ─────────────────────────────────────────────────────────────────────────────
# Send email
# ─────────────────────────────────────────────────────────────────────────────
async def send_portfolio_report(
    user_email: str,
    user_name: str,
    portfolio_name: str,
    risk_data: Dict[str, Any],
) -> bool:
    """Send an HTML portfolio risk report via Resend.

    Returns True on success, False on failure.
    """
    if not settings.RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not configured – skipping email send.")
        return False

    _configure_resend()
    html_body = build_email_html(user_name, portfolio_name, risk_data)

    try:
        params: resend.Emails.SendParams = {
            "from": "Portfolio Risk Monitor <reports@resend.dev>",
            "to": [user_email],
            "subject": f"📊 Risk Report: {portfolio_name}",
            "html": html_body,
        }
        response = await asyncio.to_thread(resend.Emails.send, params)
        logger.info("Email sent to %s | id=%s", user_email, response.get("id"))
        return True
    except Exception as exc:
        logger.error("Failed to send report email to %s: %s", user_email, exc)
        return False
