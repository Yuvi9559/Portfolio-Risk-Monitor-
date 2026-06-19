import sys
import os

# Add parent directory to path so app is importable
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.parser_service import extract_holdings_from_text, parse_portfolio_file

def test_symbol_extraction_rules():
    sample_text = """
    We have 150 shares of BTC which cost 40000.
    Also we have 20 shares of BRK.B.
    This is an AND or OR sector which has 100 level.
    """
    results = extract_holdings_from_text(sample_text)
    print("Parsed holdings:", results)
    
    symbols = {r["symbol"]: r for r in results}
    
    # 1. BTC should be mapped to BTC-USD
    assert "BTC-USD" in symbols, "BTC was not auto-corrected to BTC-USD"
    assert symbols["BTC-USD"]["shares"] == 150.0
    
    # 2. BRK.B should be mapped to BRK-B
    assert "BRK-B" in symbols, "BRK.B was not auto-corrected to BRK-B"
    assert symbols["BRK-B"]["shares"] == 20.0
    
    # 3. Stop words should not be captured
    assert "AND" not in symbols, "Stop word 'AND' was mistakenly parsed as ticker"
    assert "OR" not in symbols, "Stop word 'OR' was mistakenly parsed as ticker"
    assert "LEVEL" not in symbols, "Stop word 'LEVEL' was mistakenly parsed as ticker"
    
    print("All symbol cleanup and auto-correction tests passed successfully!")

def test_pdf_report_parser():
    pdf_path = r"C:\Users\yuvra\OneDrive\Desktop\7 Sem Project\portfolio-risk-monitor\portfolio_risk_assessment_report.pdf"
    if not os.path.exists(pdf_path):
        print("Skipping PDF report parsing test as file is not found at standard path.")
        return
        
    with open(pdf_path, "rb") as f:
        content = f.read()
        
    results = parse_portfolio_file(content, "portfolio_risk_assessment_report.pdf")
    print(f"Extracted {len(results)} holdings from PDF report.")
    
    assert len(results) == 21, f"Expected 21 holdings, but got {len(results)}"
    
    symbols = {r["symbol"] for r in results}
    expected_symbols = {
        "BTC-USD", "ETH-USD", "SOL-USD", "BNB-USD", "LINK-USD",
        "AAPL", "MSFT", "NVDA", "GOOGL", "JPM", "JNJ", "TSLA", "BRK-B",
        "RELIANCE.NS", "HDFCBANK.NS", "INFY.NS", "TCS.NS", "ICICIBANK.NS",
        "BAJFINANCE.NS", "BHARTIARTL.NS", "SUNPHARMA.NS"
    }
    
    missing = expected_symbols - symbols
    assert not missing, f"Missing expected symbols in parsed output: {missing}"
    
    print("PDF report table parser test passed successfully!")

if __name__ == "__main__":
    test_symbol_extraction_rules()
    test_pdf_report_parser()
