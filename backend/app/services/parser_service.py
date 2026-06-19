import csv
import io
import re
import logging
from typing import List, Dict, Any, Optional

import pypdf
import docx

logger = logging.getLogger(__name__)

# Heuristics regex to match valid ticker symbols (2-8 uppercase letters, or crypto symbol format like BTC-USD)
TICKER_REGEX = re.compile(r'\b([A-Z]{2,6}|[A-Z]{2,5}-[A-Z]{3})\b')
# Regex to match numeric values (including floats and comma-separated integers)
NUMERIC_REGEX = re.compile(r'^\$?([\d,]+(?:\.\d+)?)$')

def clean_numeric(val_str: str) -> Optional[float]:
    """Clean dollar signs, commas, and parse as float."""
    if not val_str:
        return None
    val_clean = val_str.replace('$', '').replace(',', '').strip()
    try:
        return float(val_clean)
    except ValueError:
        return None

def parse_csv(text: str) -> List[Dict[str, Any]]:
    """Parse CSV text, heuristically mapping columns."""
    holdings = []
    lines = text.splitlines()
    if not lines:
        return holdings

    reader = csv.reader(io.StringIO(text))
    rows = list(reader)
    if not rows:
        return holdings

    # Find headers row (usually first row, let's scan first 3 rows just in case)
    headers = []
    header_row_idx = 0
    for idx, row in enumerate(rows[:3]):
        row_lower = [c.lower().strip() for c in row]
        if any(h in c for c in row_lower for h in ['symbol', 'ticker', 'shares', 'qty', 'quantity']):
            headers = row_lower
            header_row_idx = idx
            break
    
    if not headers:
        # Default header mapping by index if headers not explicitly found
        headers = ['symbol', 'shares', 'avg_cost']

    # Map column indexes
    sym_idx = next((i for i, h in enumerate(headers) if 'symbol' in h or 'ticker' in h or 'asset' in h), 0)
    shares_idx = next((i for i, h in enumerate(headers) if 'shares' in h or 'qty' in h or 'quantity' in h), 1)
    cost_idx = next((i for i, h in enumerate(headers) if 'cost' in h or 'price' in h or 'avg' in h), -1)

    for row in rows[header_row_idx + 1:]:
        if not row or len(row) <= max(sym_idx, shares_idx):
            continue
        
        symbol = row[sym_idx].strip().upper()
        shares_val = clean_numeric(row[shares_idx])
        avg_cost_val = clean_numeric(row[cost_idx]) if cost_idx != -1 and cost_idx < len(row) else None

        if not symbol or shares_val is None or shares_val <= 0:
            continue

        asset_type = "crypto" if (symbol.endswith("-USD") or symbol in ["BTC", "ETH", "SOL", "XRP"]) else "stock"
        holdings.append({
            "symbol": symbol,
            "shares": shares_val,
            "avg_cost": avg_cost_val,
            "asset_type": asset_type
        })
    
    return holdings

def extract_holdings_from_text(text: str) -> List[Dict[str, Any]]:
    """Scan raw text lines and extract holdings matching symbol + quantity + cost patterns."""
    holdings = []
    lines = text.split('\n')
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        # Look for words in line (split by space/semicolon/pipe, strip commas and colons from ends)
        tokens = [t.strip(' ,;:|') for t in re.split(r'[\s;|]+', line) if t.strip(' ,;:|')]
        if len(tokens) < 2:
            continue

        # Look for a ticker symbol token
        symbol = None
        symbol_idx = -1
        for idx, token in enumerate(tokens):
            clean_token = token.upper().replace(':', '')
            if TICKER_REGEX.match(clean_token) and not clean_token in ["SHARES", "COST", "PRICE", "TOTAL", "VALUE", "USD", "EUR", "DATE"]:
                symbol = clean_token
                symbol_idx = idx
                break
        
        if symbol is None or symbol_idx == -1:
            continue

        # Look for a shares quantity after the symbol (or before)
        shares_val = None
        shares_idx = -1
        # Check tokens following the symbol first
        for idx in range(symbol_idx + 1, len(tokens)):
            match = NUMERIC_REGEX.match(tokens[idx])
            if match:
                val = clean_numeric(match.group(1))
                if val and val > 0:
                    shares_val = val
                    shares_idx = idx
                    break
        
        if shares_val is None:
            continue

        # Look for average cost following the shares token (scan up to 3 tokens ahead)
        avg_cost_val = None
        if shares_idx != -1:
            for offset in range(1, 4):
                next_idx = shares_idx + offset
                if next_idx < len(tokens):
                    match = NUMERIC_REGEX.match(tokens[next_idx])
                    if match:
                        avg_cost_val = clean_numeric(match.group(1))
                        break

        asset_type = "crypto" if (symbol.endswith("-USD") or symbol in ["BTC", "ETH", "SOL", "XRP"]) else "stock"
        holdings.append({
            "symbol": symbol,
            "shares": shares_val,
            "avg_cost": avg_cost_val,
            "asset_type": asset_type
        })

    # Remove duplicates by merging shares if the same symbol is extracted multiple times
    merged = {}
    for h in holdings:
        sym = h["symbol"]
        if sym in merged:
            merged[sym]["shares"] += h["shares"]
            if h["avg_cost"] is not None:
                merged[sym]["avg_cost"] = h["avg_cost"]
        else:
            merged[sym] = h
            
    return list(merged.values())

def parse_pdf(file_content: bytes) -> List[Dict[str, Any]]:
    """Parse PDF file using pypdf to extract pages text."""
    pdf_file = io.BytesIO(file_content)
    try:
        reader = pypdf.PdfReader(pdf_file)
        full_text = []
        for page in reader.pages:
            text = page.extract_text()
            if text:
                full_text.append(text)
        
        return extract_holdings_from_text("\n".join(full_text))
    except Exception as e:
        logger.error("Failed parsing PDF: %s", e)
        raise ValueError("Invalid PDF format or unreadable text content.") from e

def parse_docx(file_content: bytes) -> List[Dict[str, Any]]:
    """Parse Microsoft Word DOCX file using python-docx."""
    docx_file = io.BytesIO(file_content)
    try:
        doc = docx.Document(docx_file)
        full_text = []
        
        # Read paragraphs
        for para in doc.paragraphs:
            if para.text.strip():
                full_text.append(para.text)
                
        # Read table cells
        for table in doc.tables:
            for row in table.rows:
                row_cells_text = [cell.text.strip() for cell in row.cells if cell.text.strip()]
                if row_cells_text:
                    full_text.append(" ".join(row_cells_text))
                    
        return extract_holdings_from_text("\n".join(full_text))
    except Exception as e:
        logger.error("Failed parsing DOCX: %s", e)
        raise ValueError("Invalid DOCX format or unreadable Word content.") from e

def parse_portfolio_file(file_content: bytes, filename: str) -> List[Dict[str, Any]]:
    """Parse portfolio files based on the file extension (case-insensitive)."""
    ext = filename.split('.')[-1].lower()
    
    # 1. Enforce file size limit (10MB)
    if len(file_content) > 10 * 1024 * 1024:
        raise ValueError("File size exceeds the maximum limit of 10MB.")

    if ext == 'csv':
        try:
            # Decode CSV bytes as text
            text = file_content.decode('utf-8')
        except UnicodeDecodeError:
            try:
                text = file_content.decode('latin-1')
            except Exception as e:
                raise ValueError("Could not decode CSV text content.") from e
        return parse_csv(text)
        
    elif ext == 'pdf':
        return parse_pdf(file_content)
        
    elif ext in ['docx', 'doc']:
        return parse_docx(file_content)
        
    else:
        raise ValueError(f"Unsupported file type '.{ext}'. Supported formats: CSV, PDF, DOCX.")
