import asyncio
import time
import sys
import os
import uuid
import httpx
from datetime import datetime, timezone

# Add parent directory to path so app is importable
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.auth import create_access_token
from app.config import get_settings
from app.database import AsyncSessionLocal
from app.models import User, Portfolio, Holding
from sqlalchemy import select

settings = get_settings()

async def get_test_credentials():
    """Ensure a test user and portfolio exist, and return owner's token + portfolio_id."""
    async with AsyncSessionLocal() as session:
        # 1. Get or create test user
        result = await session.execute(select(User).limit(1))
        user = result.scalar_one_or_none()
        if not user:
            user = User(
                id=uuid.uuid4(),
                email="loadtest@example.com",
                google_id="loadtest_google_id",
                full_name="Load Test User",
            )
            session.add(user)
            await session.commit()
            await session.refresh(user)

        # 2. Get or create a test portfolio
        result = await session.execute(
            select(Portfolio).where(Portfolio.user_id == user.id).limit(1)
        )
        portfolio = result.scalar_one_or_none()
        if not portfolio:
            portfolio = Portfolio(
                id=uuid.uuid4(),
                user_id=user.id,
                name="Load Test Portfolio",
                benchmark="SPY",
                currency="USD",
            )
            session.add(portfolio)
            await session.flush()

            # Seed holdings
            holdings = [
                Holding(portfolio_id=portfolio.id, symbol="AAPL", asset_type="stock", shares=100, avg_cost=150.0),
                Holding(portfolio_id=portfolio.id, symbol="MSFT", asset_type="stock", shares=50, avg_cost=300.0),
                Holding(portfolio_id=portfolio.id, symbol="BTC-USD", asset_type="crypto", shares=1.5, avg_cost=40000.0),
            ]
            for h in holdings:
                session.add(h)
            await session.commit()
            await session.refresh(portfolio)

        # 3. Generate token
        token = create_access_token(user.id, user.email)
        return token, str(portfolio.id)

async def fire_request(client, url, headers, sem):
    """Fire a single request inside a concurrency semaphore."""
    async with sem:
        start_time = time.perf_counter()
        try:
            resp = await client.get(url, headers=headers, timeout=10.0)
            elapsed = time.perf_counter() - start_time
            return resp.status_code, elapsed
        except Exception as e:
            elapsed = time.perf_counter() - start_time
            return 500, elapsed

async def main():
    print("==================================================")
    print("     Portfolio Risk Monitor Pro - Load Tester")
    print("==================================================")
    
    # 1. Fetch credentials
    print("Preparing test user and portfolio in database...")
    try:
        token, portfolio_id = await get_test_credentials()
        print(f"Credentials ready. Portfolio ID: {portfolio_id}")
    except Exception as e:
        print(f"Failed to prepare database test records: {e}")
        return

    # 2. Setup stress test parameters
    base_url = "http://localhost:8000"  # Local server URL
    url = f"{base_url}/portfolios/{portfolio_id}/holdings"  # We can also hit /risk/{portfolio_id}
    url_risk = f"{base_url}/risk/{portfolio_id}"
    
    headers = {"Authorization": f"Bearer {token}"}
    
    total_requests = 1000
    concurrency_limit = 100
    print(f"Targeting Endpoint: {url_risk}")
    print(f"Simulating {total_requests} concurrent requests (Concurrency limit: {concurrency_limit})...")
    
    sem = asyncio.Semaphore(concurrency_limit)
    
    # Check if local server is running
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(f"{base_url}/health")
            if resp.status_code != 200:
                print(f"Warning: Health check returned status {resp.status_code}")
        except Exception:
            print("\n❌ Error: Local FastAPI server is not running on http://localhost:8000.")
            print("Please run the backend server first (e.g. uvicorn app.main:app --reload) to test.")
            return

        print("\nStarting load test...")
        start_test = time.perf_counter()
        
        # Fire requests concurrently
        tasks = [fire_request(client, url_risk, headers, sem) for _ in range(total_requests)]
        results = await asyncio.gather(*tasks)
        
        end_test = time.perf_counter()
        total_duration = end_test - start_test
        
        # 3. Analyze results
        status_codes = {}
        latencies = []
        
        for code, latency in results:
            status_codes[code] = status_codes.get(code, 0) + 1
            latencies.append(latency)
            
        latencies.sort()
        avg_latency = sum(latencies) / len(latencies)
        p95_latency = latencies[int(len(latencies) * 0.95)]
        p99_latency = latencies[int(len(latencies) * 0.99)]
        
        success_rate = (status_codes.get(200, 0) / total_requests) * 100
        req_per_sec = total_requests / total_duration
        
        print("\n=================== RESULTS ===================")
        print(f"Total Test Duration : {total_duration:.2f} seconds")
        print(f"Requests per Second : {req_per_sec:.2f} req/s")
        print(f"Success Rate        : {success_rate:.2f}%")
        print(f"Status Codes        : {status_codes}")
        print("\nLatency Percentiles:")
        print(f"  Average           : {avg_latency * 1000:.1f} ms")
        print(f"  95th Percentile   : {p95_latency * 1000:.1f} ms")
        print(f"  99th Percentile   : {p99_latency * 1000:.1f} ms")
        print("===============================================")
        
        # Benchmarks check
        if avg_latency < 0.200 and success_rate >= 99.0:
            print("\n🎉 PERFORMANCE BENCHMARKS MET!")
            print("Average response time < 200ms and Success rate >= 99%")
        else:
            print("\n⚠️ PERFORMANCE WARNING: Latency or success rate fell below targets.")

if __name__ == "__main__":
    asyncio.run(main())
