from flask import Flask, request, jsonify, render_template
import sqlite3
import requests
from datetime import datetime, timedelta
import json
import os

app = Flask(__name__)
TIINGO_KEY = os.getenv("TIINGO_KEY", "5c9496ddac7c518d41aeab016bb203fe6bb1a462")
DB_PATH = "search_history.db"

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db_connection() as conn:
        conn.execute("""CREATE TABLE IF NOT EXISTS SearchHistory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticker TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )""")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS CachedStockData (
                     ticker TEXT PRIMARY KEY,
                     company_json TEXT,
                     stock_json TEXT,
                     last_updated DATETIME
                     )
        
""")
        conn.commit()

@app.route("/")
def index():
    """Render the main page."""
    return render_template("index.html")

@app.route("/search")
def search_stock():
    ticker = request.args.get("ticker", "").strip().upper()
    if not ticker:
        return jsonify({"error": "Ticker is required"}), 400

    cache_status = "MISS"
    company_data = None
    stock_data = None
    with get_db_connection() as conn:
        cur = conn.execute(
            "SELECT company_json, stock_json, last_updated "
            "FROM CachedStockData WHERE ticker = ?",
            (ticker,)
        )
        row = cur.fetchone()

    if row is not None and row["last_updated"]:
        try:
            last_updated = datetime.fromisoformat(row["last_updated"])
            if datetime.utcnow() - last_updated < timedelta(minutes=15):
                company_data = json.loads(row["company_json"])
                stock_data = json.loads(row["stock_json"]) if row["stock_json"] else None
                cache_status = "HIT"
        except ValueError:
            pass

    if company_data is None or stock_data is None:
        # Company outlook
        meta_url = f"https://api.tiingo.com/tiingo/daily/{ticker}?token={TIINGO_KEY}"
        meta_resp = requests.get(meta_url)

        if meta_resp.status_code != 200:
            # Invalid ticker or API error
            resp = jsonify({
                "error": "Error: No record has been found, please enter a valid symbol."
            })
            resp.headers["X-Cache"] = cache_status 
            return resp

        company_data = meta_resp.json()

        # Stock summary
        iex_url = f"https://api.tiingo.com/iex/{ticker}?token={TIINGO_KEY}"
        iex_resp = requests.get(iex_url)

        if iex_resp.status_code == 200:
            stock_list = iex_resp.json()
            if isinstance(stock_list, list) and stock_list:
                stock_data = stock_list[0]
            else:
                stock_data = {}
        else:
            stock_data = {}

        # Update cache 
        with get_db_connection() as conn:
            conn.execute("""
                INSERT INTO CachedStockData (ticker, company_json, stock_json, last_updated)
                VALUES (:ticker, :company_json, :stock_json, :last_updated)
                ON CONFLICT(ticker) DO UPDATE SET
                    company_json = excluded.company_json,
                    stock_json   = excluded.stock_json,
                    last_updated = excluded.last_updated
            """, {
                "ticker": ticker,
                "company_json": json.dumps(company_data),
                "stock_json": json.dumps(stock_data),
                "last_updated": datetime.utcnow().isoformat()
            })
            conn.commit()

    # Record search in history (successful search only)
    with get_db_connection() as conn:
        conn.execute(
            "INSERT INTO SearchHistory (ticker) VALUES (?)",
            (ticker,)
        )
        conn.commit()

    # response
    resp = jsonify({
        "company": company_data,
        "stock": stock_data
    })
    resp.headers["X-Cache"] = cache_status
    return resp


@app.route("/history")
def history():
    """
    Returns last 10 searches as JSON:
    [
      {"ticker": "AAPL", "timestamp": "2025-04-22 12:34:56"},
      ...
    ]
    """
    with get_db_connection() as conn:
        cur = conn.execute("""
            SELECT ticker, timestamp
            FROM SearchHistory
            ORDER BY timestamp DESC
            LIMIT 10
        """)
        rows = cur.fetchall()

    history_list = [
        {"ticker": row["ticker"], "timestamp": row["timestamp"]}
        for row in rows
    ]
    return jsonify(history_list)


if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=5000)