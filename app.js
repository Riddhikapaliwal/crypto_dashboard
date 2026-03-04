import express from "express";
import axios from "axios";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const port = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// --- CACHE SETUP ---
let cachedCoinList = null;
let lastCoinListFetch = 0;
const CACHE_DURATION = 10 * 60 * 1000; 
const cryptoCache = new Map();

// --- HELPER FUNCTIONS ---
async function getCoinList() {
  const now = Date.now();
  if (cachedCoinList && (now - lastCoinListFetch < 5 * 60 * 1000)) return cachedCoinList;
  try {
    const response = await axios.get("https://api.coingecko.com/api/v3/coins/list", { timeout: 8000 });
    cachedCoinList = response.data;
    lastCoinListFetch = now;
    return cachedCoinList;
  } catch (err) {
    console.error("DNS/API Error:", err.message);
    return cachedCoinList || [];
  }
}

// --- ROUTES ---

// 1. Permanent Fix: Handle accidental GET requests to /crypto (prevents "Cannot GET /crypto")
app.get("/crypto", (req, res) => res.redirect("/"));

// 2. Root route: Default to Bitcoin
app.get("/", async (req, res) => {
  const coinId = "bitcoin";
  const now = Date.now();
  const fullList = await getCoinList();
  const cachedData = cryptoCache.get(coinId);

  if (cachedData && (now - cachedData.timestamp < CACHE_DURATION)) {
    return res.render("index", {
      coinName: "Bitcoin", price: cachedData.price, chartData: cachedData.history,
      fullList, error: null, updatedAt: new Date(cachedData.timestamp).toLocaleTimeString()
    });
  }

  try {
    const [priceRes, chartRes] = await Promise.all([
      axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`, { timeout: 10000 }),
      axios.get(`https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=7`, { timeout: 10000 })
    ]);
    const price = priceRes.data[coinId].usd;
    const history = chartRes.data.prices;
    cryptoCache.set(coinId, { price, history, timestamp: now });
    res.render("index", { coinName: "Bitcoin", price, chartData: history, fullList, error: null });
  } catch (err) {
    res.render("index", { coinName: "Bitcoin", price: null, chartData: [], fullList, error: "Server busy. Auto-rescue triggered." });
  }
});

// 3. Search route
app.post("/crypto", async (req, res) => {
  const query = req.body.crypto?.toLowerCase().trim();
  const now = Date.now();
  const list = await getCoinList();

  try {
    const coin = list.find(c => c.id === query || c.symbol.toLowerCase() === query || c.name.toLowerCase() === query);
    if (!coin) throw new Error("Coin not found");

    const cachedData = cryptoCache.get(coin.id);
    if (cachedData && (now - cachedData.timestamp < CACHE_DURATION)) {
      return res.render("index", { coinName: coin.name, price: cachedData.price, chartData: cachedData.history, fullList: list, error: null });
    }

    const [priceRes, chartRes] = await Promise.all([
      axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${coin.id}&vs_currencies=usd`, { timeout: 10000 }),
      axios.get(`https://api.coingecko.com/api/v3/coins/${coin.id}/market_chart?vs_currency=usd&days=7`, { timeout: 10000 })
    ]);
    const price = priceRes.data[coin.id].usd;
    const history = chartRes.data.prices;
    cryptoCache.set(coin.id, { price, history, timestamp: now });
    res.render("index", { coinName: coin.name, price, chartData: history, fullList: list, error: null });
  } catch (err) {
    res.render("index", { coinName: query || "Crypto", price: null, chartData: [], fullList: list, error: "Network busy. Browser rescue active." });
  }
});

app.listen(port, () => console.log(`🚀 Crypted running at http://localhost:${port}`));