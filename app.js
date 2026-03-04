import express from "express";
import axios from "axios";

const app = express();
const port = 3000;

app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));

// Safe GET wrapper for 429
async function safeGet(url, params = {}) {
  try {
    return await axios.get(url, { params });
  } catch (err) {
    if (err.response && err.response.status === 429) {
      return { data: null, rateLimitError: true };
    }
    throw err;
  }
}

// ROOT ROUTE (Bitcoin default)
app.get("/", async (req, res) => {
  try {
    const chartRes = await safeGet(
      "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart",
      { vs_currency: "usd", days: 7 }
    );

    if (chartRes.rateLimitError) {
      return res.render("index.ejs", {
        coinName: "Bitcoin",
        price: null,
        chartData: [],
        error: "Too many requests! Try again in a few seconds."
      });
    }

    res.render("index.ejs", {
      coinName: "Bitcoin",
      price: null,
      chartData: chartRes.data.prices,
      error: null
    });

  } catch (err) {
    res.render("index.ejs", {
      coinName: "Bitcoin",
      price: null,
      chartData: [],
      error: "Could not load data"
    });
  }
});

// SEARCH ROUTE
app.post("/crypto", async (req, res) => {
  const query = req.body.crypto.toLowerCase().trim();

  try {
    // 1. Fetch full coin list
    const listRes = await safeGet("https://api.coingecko.com/api/v3/coins/list");
    if (listRes.rateLimitError) {
      return res.render("index.ejs", {
        coinName: null,
        price: null,
        chartData: [],
        error: "Too many requests! Try again shortly."
      });
    }

    const list = listRes.data;

    // 2. Find coin by name or symbol
    const coin = list.find(c =>
      c.name.toLowerCase() === query ||
      c.symbol.toLowerCase() === query ||
      c.name.toLowerCase().includes(query)
    );

    if (!coin) {
      return res.render("index.ejs", {
        coinName: null,
        price: null,
        chartData: [],
        error: "Token not found! Please try again."
      });
    }

    // 3. Fetch price
    const priceRes = await safeGet(
      `https://api.coingecko.com/api/v3/simple/price`,
      { ids: coin.id, vs_currencies: "usd" }
    );

    if (priceRes.rateLimitError) {
      return res.render("index.ejs", {
        coinName: coin.name,
        price: null,
        chartData: [],
        error: "Too many requests! Please wait a few seconds."
      });
    }

    // 4. Fetch chart
    const chartRes = await safeGet(
      `https://api.coingecko.com/api/v3/coins/${coin.id}/market_chart`,
      { vs_currency: "usd", days: 7 }
    );

    if (chartRes.rateLimitError) {
      return res.render("index.ejs", {
        coinName: coin.name,
        price: priceRes.data[coin.id].usd,
        chartData: [],
        error: "Rate limit reached. Chart unavailable temporarily."
      });
    }

    // 5. SUCCESS — render page
    res.render("index.ejs", {
      coinName: coin.name,
      price: priceRes.data[coin.id].usd,
      chartData: chartRes.data.prices,
      error: null
    });

  } catch (error) {
    res.render("index.ejs", {
      coinName: null,
      price: null,
      chartData: [],
      error: "API Error: " + error.message
    });
  }
});

app.listen(port, () => {
  console.log("server is running on port 3000");
});