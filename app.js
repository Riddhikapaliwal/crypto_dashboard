import express from "express";
import axios from "axios";

const app = express();
const port = process.env.PORT || 3000;

// Global Caches
// Set cache duration to 10 minutes (600,000 milliseconds)
let cachedCoinList = null;     // Add this
let lastCoinListFetch = 0;    // Add this
const CACHE_DURATION = 10 * 60 * 1000; 
const cryptoCache = new Map();

app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.set("view engine", "ejs");

// --- HELPER FUNCTIONS ---

/**
 * Fetches the full list of coins from CoinGecko with a 5-minute cache.
 */
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
        return cachedCoinList || []; // Return old cache if API is down
    }
}

// --- ROUTES ---

// ROOT ROUTE: Default to Bitcoin
// ROOT ROUTE (Bitcoin)
app.get("/", async (req, res) => {
    const coinId = "bitcoin"; // This is already defined
    const now = Date.now();
    const cachedData = cryptoCache.get(coinId);
    const fullList = await getCoinList(); // Get this once for the render

    if (cachedData && (now - cachedData.timestamp < CACHE_DURATION)) {
        console.log(`Serving ${coinId} from CACHE`);
        return res.render("index", {
            coinName: "Bitcoin",
            price: cachedData.price,
            chartData: cachedData.history,
            error: null,
            fullList: fullList, // Pass the list
            updatedAt: new Date(cachedData.timestamp).toLocaleTimeString()
        });
    }

    try {
        // FIXED: Using 'coinId' instead of 'coin.id'
        const [priceRes, chartRes] = await Promise.all([
            axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`, { timeout: 8000 }),
            axios.get(`https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=7`, { timeout: 8000 })
        ]);

        const price = priceRes.data[coinId].usd;
        const history = chartRes.data.prices;

        cryptoCache.set(coinId, { price, history, timestamp: now });

        res.render("index", { 
            coinName: "Bitcoin", 
            price, 
            chartData: history, 
            error: null,
            fullList: fullList, // Pass the list
            updatedAt: new Date(now).toLocaleTimeString()
        });
    } catch (err) {
        res.render("index", { 
            coinName: "Bitcoin", 
            price: null, 
            chartData: [], 
            fullList: fullList, 
            error: "API Busy. Try again later." 
        });
    }
});
// SEARCH ROUTE
app.post("/crypto", async (req, res) => {
    const query = req.body.crypto?.toLowerCase().trim();
    const now = Date.now();

    try {
        // 1. We NEED the list for the search AND for the frontend datalist
        const list = await getCoinList(); 

        const coin = list.find(c => 
            c.id === query || 
            c.symbol.toLowerCase() === query || 
            c.name.toLowerCase() === query
        );

        if (!coin) {
            // ERROR: Pass fullList here so the search bar still works
            return res.render("index", {
                coinName: null, price: null, chartData: [],
                fullList: list, 
                error: "Coin not found!",
                updatedAt: new Date().toLocaleTimeString()
            });
        }

        // 2. Check Cache
        const cachedData = cryptoCache.get(coin.id);
        if (cachedData && (now - cachedData.timestamp < CACHE_DURATION)) {
            return res.render("index", {
                coinName: coin.name,
                price: cachedData.price,
                chartData: cachedData.history,
                fullList: list, // CRITICAL: Pass the list here
                error: null,
                updatedAt: new Date(cachedData.timestamp).toLocaleTimeString()
            });
        }

        // 3. Fetch New Data
        const [priceRes, chartRes] = await Promise.all([
            axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${coin.id}&vs_currencies=usd`),
            axios.get(`https://api.coingecko.com/api/v3/coins/${coin.id}/market_chart?vs_currency=usd&days=7`)
        ]);

        const price = priceRes.data[coin.id].usd;
        const history = chartRes.data.prices;

        cryptoCache.set(coin.id, { price, history, timestamp: now });

        res.render("index", {
            coinName: coin.name,
            price: price,
            chartData: history,
            fullList: list, // CRITICAL: Pass the list here
            error: null,
            updatedAt: new Date(now).toLocaleTimeString()
        });

    } catch (err) {
        const list = await getCoinList(); // Fallback to get list for error page
        res.render("index", {
            coinName: null, price: null, chartData: [],
            fullList: list, // CRITICAL: Pass the list here
            error: "Rate limit hit or API error."
        });
    }
});

app.listen(port, () => {
    console.log(`🚀 Crypto Dashboard running at http://localhost:${port}`);
});