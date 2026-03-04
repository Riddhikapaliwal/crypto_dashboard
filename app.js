// app.js
import express from "express";
import axios from "axios";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const port = process.env.PORT || 3000;

// --- VIEW ENGINE SETUP ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// --- MIDDLEWARE ---
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// --- CACHE SETUP ---
let cachedCoinList = null;
let lastCoinListFetch = 0;
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
const cryptoCache = new Map();

// --- HELPER FUNCTIONS ---
async function getCoinList() {
  const now = Date.now();
  if (cachedCoinList && (now - lastCoinListFetch < 5 * 60 * 1000)) {
    return cachedCoinList;
  }
  try {
    const response = await axios.get("https://api.coingecko.com/api/v3/coins/list", { timeout: 5000 });
    cachedCoinList = response.data;
    lastCoinListFetch = now;
    return cachedCoinList;
  } catch (err) {
    console.error("Error fetching coin list:", err.message);
    return cachedCoinList || [];
  }
}

// --- ROUTES ---
// Root route: default to Bitcoin
app.get("/", async (req, res) => {
  const coinId = "bitcoin";
  const now = Date.now();
  const cachedData = cryptoCache.get(coinId);
  const fullList = await getCoinList();

  if (cachedData && (now - cachedData.timestamp < CACHE_DURATION)) {
    return res.render("index.ejs", {
      coinName: "Bitcoin",
      price: cachedData.price,
      chartData: cachedData.history,
      error: null,
      fullList,
      updatedAt: new Date(cachedData.timestamp).toLocaleTimeString()
    });
  }

  try {
    const [priceRes, chartRes] = await Promise.all([
      axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`, { timeout: 8000 }),
      axios.get(`https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=7`, { timeout: 8000 })
    ]);

    const price = priceRes.data[coinId].usd;
    const history = chartRes.data.prices;

    cryptoCache.set(coinId, { price, history, timestamp: now });

    res.render("index.ejs", {
      coinName: "Bitcoin",
      price,
      chartData: history,
      error: null,
      fullList,
      updatedAt: new Date(now).toLocaleTimeString()
    });
  } catch (err) {
    res.render("index.ejs", {
      coinName: "Bitcoin",
      price: null,
      chartData: [],
      fullList,
      error: "API Busy. Try again later."
    });
  }
});

// Search route
app.post("/crypto", async (req, res) => {
  const query = req.body.crypto?.toLowerCase().trim();
  const now = Date.now();

  try {
    const list = await getCoinList();
    const coin = list.find(c =>
      c.id === query ||
      c.symbol.toLowerCase() === query ||
      c.name.toLowerCase() === query
    );

    if (!coin) {
      return res.render("index.ejs", {
        coinName: null,
        price: null,
        chartData: [],
        fullList: list,
        error: "Coin not found!",
        updatedAt: new Date().toLocaleTimeString()
      });
    }

    const cachedData = cryptoCache.get(coin.id);
    if (cachedData && (now - cachedData.timestamp < CACHE_DURATION)) {
      return res.render("index.ejs", {
        coinName: coin.name,
        price: cachedData.price,
        chartData: cachedData.history,
        fullList: list,
        error: null,
        updatedAt: new Date(cachedData.timestamp).toLocaleTimeString()
      });
    }

    const [priceRes, chartRes] = await Promise.all([
      axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${coin.id}&vs_currencies=usd`, { timeout: 8000 }),
      axios.get(`https://api.coingecko.com/api/v3/coins/${coin.id}/market_chart?vs_currency=usd&days=7`, { timeout: 8000 })
    ]);

    const price = priceRes.data[coin.id].usd;
    const history = chartRes.data.prices;

    cryptoCache.set(coin.id, { price, history, timestamp: now });

    res.render("index.ejs", {
      coinName: coin.name,
      price,
      chartData: history,
      fullList: list,
      error: null,
      updatedAt: new Date(now).toLocaleTimeString()
    });
  } catch (err) {
    const list = await getCoinList();
    res.render("index.ejs", {
      coinName: null,
      price: null,
      chartData: [],
      fullList: list,
      error: "Rate limit hit or API error."
    });
  }
});

// --- START SERVER ---
app.listen(port, () => {
  console.log(`🚀 Crypto Dashboard running at http://localhost:${port}`);
});